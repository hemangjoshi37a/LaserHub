"""Order tracking API — timeline events, guest tracking, photo uploads."""

import json
import logging
import os
import uuid as _uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.notifications import send_push_notification_bg
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import Order, OrderEvent, UploadedFile, User, Vendor, VendorOrder

logger = logging.getLogger(__name__)
router = APIRouter()

_bearer = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Map event types -> order.status transitions
EVENT_STATUS_MAP = {
    "accepted": "accepted",
    "in_production": "in_production",
    "shipped": "shipped",
    "delivered": "completed",
    "cancelled": "cancelled",
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OrderEventOut(BaseModel):
    id: int
    event_type: str
    message: str = ""
    photo_url: Optional[str] = None
    tracking_number: Optional[str] = None
    courier: Optional[str] = None
    created_at: datetime
    created_by_name: Optional[str] = None


class OrderTimelineOut(BaseModel):
    order_id: int
    order_number: str
    status: str
    customer_name: str
    customer_email: str
    material_name: Optional[str] = None
    thickness_mm: Optional[float] = None
    quantity: int
    total_amount: float
    shipping_address: str
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    vendor_name: Optional[str] = None
    vendor_email: Optional[str] = None
    file_id: Optional[str] = None
    events: List[OrderEventOut] = []


class EventCreateIn(BaseModel):
    event_type: str
    message: str = ""
    photo_url: Optional[str] = None
    tracking_number: Optional[str] = None
    courier: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

async def _current_user(
    token: Optional[str] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            return None
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
    except Exception:
        return None


async def _require_user(
    user: Optional[User] = Depends(_current_user),
) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def _load_order(db: AsyncSession, order_id: int) -> Order:
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


async def _is_vendor_for_order(db: AsyncSession, user: User, order: Order) -> bool:
    if user.is_admin or (user.role or "") in ("super_admin", "admin"):
        return True
    if (user.role or "") != "vendor":
        return False
    # Find vendor linked to this user
    vres = await db.execute(select(Vendor).where(Vendor.user_id == user.id))
    vendor = vres.scalar_one_or_none()
    if not vendor:
        return False
    vo_res = await db.execute(
        select(VendorOrder).where(
            VendorOrder.order_id == order.id,
            VendorOrder.vendor_id == vendor.id,
        )
    )
    return vo_res.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

async def _serialize(order: Order, db: AsyncSession) -> OrderTimelineOut:
    # Events
    ev_res = await db.execute(
        select(OrderEvent)
        .where(OrderEvent.order_id == order.id)
        .options(selectinload(OrderEvent.created_by))
        .order_by(OrderEvent.created_at.asc())
    )
    events = ev_res.scalars().all()
    event_out = [
        OrderEventOut(
            id=e.id,
            event_type=e.event_type,
            message=e.message or "",
            photo_url=e.photo_url,
            tracking_number=e.tracking_number,
            courier=e.courier,
            created_at=e.created_at,
            created_by_name=(e.created_by.name if e.created_by else None),
        )
        for e in events
    ]

    # Material
    material_name = None
    thickness_mm = None
    if order.material_id:
        from app.models import Material
        m = await db.get(Material, order.material_id)
        if m:
            material_name = m.name
    thickness_mm = order.thickness_mm

    # Vendor info
    vendor_name: Optional[str] = None
    vendor_email: Optional[str] = None
    vo_res = await db.execute(
        select(VendorOrder).where(VendorOrder.order_id == order.id)
    )
    vo = vo_res.scalar_one_or_none()
    if vo:
        vendor = await db.get(Vendor, vo.vendor_id)
        if vendor:
            vendor_name = vendor.shop_name
            vuser = await db.get(User, vendor.user_id)
            if vuser:
                vendor_email = vuser.email

    # File UUID
    file_uuid: Optional[str] = None
    if order.file_id:
        f = await db.get(UploadedFile, order.file_id)
        if f:
            file_uuid = f.file_id

    return OrderTimelineOut(
        order_id=order.id,
        order_number=order.order_number,
        status=order.status,
        customer_name=order.customer_name,
        customer_email=order.customer_email,
        material_name=material_name,
        thickness_mm=thickness_mm,
        quantity=order.quantity or 1,
        total_amount=order.total_amount,
        shipping_address=order.shipping_address,
        courier=order.courier,
        tracking_number=order.tracking_number,
        estimated_delivery_date=order.estimated_delivery_date,
        created_at=order.created_at,
        updated_at=order.updated_at,
        vendor_name=vendor_name,
        vendor_email=vendor_email,
        file_id=file_uuid,
        events=event_out,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/order/{order_id}", response_model=OrderTimelineOut)
async def get_order_timeline(
    order_id: int,
    user: User = Depends(_require_user),
    db: AsyncSession = Depends(get_db),
) -> OrderTimelineOut:
    """Get timeline for an order.  Accessible by order's customer, vendor, or admin."""
    order = await _load_order(db, order_id)

    # Authorization
    allowed = False
    if order.user_id == user.id:
        allowed = True
    elif order.customer_email and order.customer_email.lower() == (user.email or "").lower():
        allowed = True
    elif await _is_vendor_for_order(db, user, order):
        allowed = True

    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized for this order")

    return await _serialize(order, db)


@router.get("/guest/{tracking_token}", response_model=OrderTimelineOut)
async def get_guest_tracking(
    tracking_token: str,
    db: AsyncSession = Depends(get_db),
) -> OrderTimelineOut:
    """Public endpoint using guest tracking token (UUID)."""
    result = await db.execute(
        select(Order).where(Order.guest_tracking_token == tracking_token)
    )
    order = result.scalar_one_or_none()
    if not order:
        # Fallback: order_number match (so users can paste order #)
        r2 = await db.execute(select(Order).where(Order.order_number == tracking_token))
        order = r2.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return await _serialize(order, db)


@router.post("/order/{order_id}/event", response_model=OrderEventOut)
async def add_order_event(
    order_id: int,
    body: EventCreateIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(_require_user),
    db: AsyncSession = Depends(get_db),
) -> OrderEventOut:
    """Vendor/admin adds an event to an order's timeline."""
    order = await _load_order(db, order_id)

    if not await _is_vendor_for_order(db, user, order):
        raise HTTPException(status_code=403, detail="Only vendor or admin can add events")

    event = OrderEvent(
        order_id=order.id,
        event_type=body.event_type,
        message=body.message or "",
        photo_url=body.photo_url,
        tracking_number=body.tracking_number,
        courier=body.courier,
        created_by_user_id=user.id,
    )
    db.add(event)

    # Propagate fields to order + status mapping
    if body.tracking_number:
        order.tracking_number = body.tracking_number
    if body.courier:
        order.courier = body.courier
    if body.estimated_delivery_date:
        order.estimated_delivery_date = body.estimated_delivery_date

    new_status = EVENT_STATUS_MAP.get(body.event_type)
    if new_status:
        order.status = new_status
    order.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(event)

    # Notify the buyer (persisted in-app notification + best-effort push)
    if order.user_id:
        from app.services.notification_service import notify_user, order_status_message
        mapped = order_status_message(new_status) if new_status else None
        if mapped:
            msg, ntype = mapped
        else:
            msg = body.message or body.event_type.replace("_", " ").title()
            ntype = "info"
        await notify_user(
            db,
            order.user_id,
            f"Order #{order.order_number}",
            msg,
            type=ntype,
            link="/dashboard/my-orders",
        )
        await db.commit()

    # Optional email notification
    try:
        from app.services.email_service import EmailService  # type: ignore
        email_svc: Any = EmailService() if hasattr(EmailService, "__init__") else None
        if email_svc and hasattr(email_svc, "send_order_status_update"):
            background_tasks.add_task(
                email_svc.send_order_status_update,
                order.customer_email,
                order.order_number,
                body.event_type,
                body.message or "",
            )
    except Exception:
        pass

    return OrderEventOut(
        id=event.id,
        event_type=event.event_type,
        message=event.message or "",
        photo_url=event.photo_url,
        tracking_number=event.tracking_number,
        courier=event.courier,
        created_at=event.created_at,
        created_by_name=user.name,
    )


@router.post("/order/{order_id}/upload-photo")
async def upload_order_photo(
    order_id: int,
    file: UploadFile = File(...),
    user: User = Depends(_require_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload a photo for the order — returns the public URL."""
    order = await _load_order(db, order_id)
    if not await _is_vendor_for_order(db, user, order):
        raise HTTPException(status_code=403, detail="Only vendor or admin can upload photos")

    # Destination: backend/app/static/order-photos/{order_id}/{uuid}.ext
    base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "order-photos", str(order_id))
    os.makedirs(base, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        ext = ".jpg"
    fname = f"{_uuid.uuid4().hex}{ext}"
    path = os.path.join(base, fname)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Photo exceeds 10MB limit")

    # SEC-10: validate the upload is a real image via magic bytes (not just extension)
    from io import BytesIO

    from PIL import Image

    try:
        img = Image.open(BytesIO(content))
        img.verify()
        if (img.format or "").upper() not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError(f"unsupported image format: {img.format}")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image. Allowed: JPEG, PNG, WEBP.",
        )

    with open(path, "wb") as f:
        f.write(content)

    url = f"/static/order-photos/{order_id}/{fname}"
    return {"url": url}


# ---------------------------------------------------------------------------
# Notification preferences (lives here to keep Phase 2.3 cohesive)
# ---------------------------------------------------------------------------

class NotificationPrefs(BaseModel):
    email: bool = True
    push: bool = True
    sms: bool = False


def _parse_prefs(raw: Optional[str]) -> NotificationPrefs:
    if not raw:
        return NotificationPrefs()
    try:
        data = json.loads(raw)
        return NotificationPrefs(**{k: bool(v) for k, v in data.items() if k in ("email", "push", "sms")})
    except Exception:
        return NotificationPrefs()


@router.get("/me/notification-prefs", response_model=NotificationPrefs)
async def get_notification_prefs(
    user: User = Depends(_require_user),
) -> NotificationPrefs:
    return _parse_prefs(user.notification_prefs)


@router.put("/me/notification-prefs", response_model=NotificationPrefs)
async def update_notification_prefs(
    prefs: NotificationPrefs,
    user: User = Depends(_require_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPrefs:
    user.notification_prefs = json.dumps(prefs.model_dump())
    db.add(user)
    await db.commit()
    return prefs
