"""
Admin API endpoints
"""

import csv
import io
import logging
from datetime import datetime, timedelta
from typing import List

import fastapi
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, decode_access_token, verify_password
from app.middleware.rate_limiter import limiter
from app.models import AppSetting, Material, Order, UploadedFile, User, Vendor, VendorOrder
from app.schemas import (
    AdminToken,
    AnalyticsData,
    CustomerMetric,
    DashboardStats,
    MaterialMetric,
    OrderResponse,
    OrderUpdate,
    SalesData,
)

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


async def _build_order_response(order: Order, db: AsyncSession) -> OrderResponse:
    """Build OrderResponse from Order model, resolving material name and file UUID."""
    material_result = await db.execute(
        select(Material).where(Material.id == order.material_id)
    )
    material = material_result.scalar_one_or_none()

    # Get actual file UUID instead of the internal DB row ID
    file_result = await db.execute(
        select(UploadedFile).where(UploadedFile.id == order.file_id)
    )
    uploaded_file = file_result.scalar_one_or_none()

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=uploaded_file.file_id if uploaded_file else str(order.file_id),
        material_name=material.name if material else "Unknown",
        thickness_mm=order.thickness_mm,
        quantity=order.quantity,
        total_amount=order.total_amount,
        status=order.status,
        customer_email=order.customer_email,
        customer_name=order.customer_name,
        shipping_address=order.shipping_address,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


async def get_current_admin(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
):
    """Validate admin JWT token.
    Only allows users with 'admin' or 'super_admin' role.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise credentials_exception
        
    if user.role not in ("admin", "super_admin") and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access admin resources"
        )

    return user


async def get_admin_or_vendor(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate a JWT and return the User if they are an admin, super_admin, or vendor.

    Used by the order-status (Kanban) endpoint, which is reachable from both the
    admin board and the vendor fulfillment board. Per-order ownership for
    vendors is enforced separately in the endpoint itself.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_exception

    if user.role not in ("admin", "super_admin", "vendor") and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or vendor role required",
        )

    return user


@router.post("/login", response_model=AdminToken)
@limiter.limit("5 per minute")
async def admin_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin login endpoint — rate limited to 5 attempts per minute per IP.

    Verifies the submitted password against the bcrypt hash stored on the
    admin User row (bootstrapped at startup by init_admin_user). The plaintext
    ADMIN_PASSWORD env var is no longer compared at request time.
    """
    # Only the configured admin email can use this endpoint
    if form_data.username != settings.ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    result = await db.execute(select(User).where(User.email == form_data.username))
    admin_user = result.scalar_one_or_none()

    if (
        not admin_user
        or not admin_user.hashed_password
        or not verify_password(form_data.password, admin_user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Create access token
    access_token = create_access_token(
        data={"sub": form_data.username, "role": "admin"},
        expires_delta=timedelta(hours=24),
    )

    return AdminToken(access_token=access_token)


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Get admin dashboard statistics"""
    # Total orders
    total_orders_result = await db.execute(select(func.count(Order.id)))
    total_orders = total_orders_result.scalar() or 0

    # Pending orders
    pending_orders_result = await db.execute(
        select(func.count(Order.id)).where(Order.status == "pending")
    )
    pending_orders = pending_orders_result.scalar() or 0

    # Total revenue (sum of all non-cancelled orders)
    revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(Order.status != "cancelled")
    )
    total_revenue = revenue_result.scalar() or 0

    # Monthly revenue
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(
            Order.status != "cancelled",
            Order.created_at >= month_start
        )
    )
    monthly_revenue = monthly_revenue_result.scalar() or 0

    # Recent orders
    recent_orders_result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.material),
            selectinload(Order.uploaded_file),
        )
        .order_by(desc(Order.created_at))
        .limit(10)
    )
    recent_orders = recent_orders_result.scalars().all()

    recent_order_responses = []
    for order in recent_orders:
        material = order.material
        uploaded_file = order.uploaded_file
        recent_order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=uploaded_file.file_id if uploaded_file else str(order.file_id),
            material_name=material.name if material else "Unknown",
            thickness_mm=order.thickness_mm,
            quantity=order.quantity,
            total_amount=order.total_amount,
            status=order.status,
            customer_email=order.customer_email,
            customer_name=order.customer_name,
            shipping_address=order.shipping_address,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))

    return DashboardStats(
        total_orders=total_orders,
        pending_orders=pending_orders,
        total_revenue=total_revenue,
        monthly_revenue=monthly_revenue,
        recent_orders=recent_order_responses,
    )


@router.get("/orders", response_model=List[OrderResponse])
async def list_all_orders(
    status_filter: str = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """List all orders (admin only)"""
    # PERF-DB-01: eager-load material + uploaded_file to avoid N+1 per-row queries
    query = (
        select(Order)
        .options(
            selectinload(Order.material),
            selectinload(Order.uploaded_file),
        )
        .order_by(desc(Order.created_at))
        .limit(limit)
    )

    if status_filter:
        query = query.where(Order.status == status_filter)

    result = await db.execute(query)
    orders = result.scalars().all()

    order_responses = []
    for order in orders:
        material = order.material
        uploaded_file = order.uploaded_file
        order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=uploaded_file.file_id if uploaded_file else str(order.file_id),
            material_name=material.name if material else "Unknown",
            thickness_mm=order.thickness_mm,
            quantity=order.quantity,
            total_amount=order.total_amount,
            status=order.status,
            customer_email=order.customer_email,
            customer_name=order.customer_name,
            shipping_address=order.shipping_address,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))

    return order_responses


VALID_STATUSES = {"pending", "accepted", "paid", "in_production", "shipped", "completed", "cancelled"}

# Kanban columns map (we collapse "paid" under "accepted" for the board display)
KANBAN_COLUMNS = ["pending", "accepted", "in_production", "shipped", "completed", "cancelled"]


@router.get("/orders/kanban")
async def get_orders_kanban(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin),
):
    """Return all orders grouped by status for the Kanban board."""
    result = await db.execute(select(Order).order_by(desc(Order.created_at)))
    orders = result.scalars().all()

    # Prefetch materials / files
    mat_map = {}
    file_map = {}
    if orders:
        mat_ids = {o.material_id for o in orders}
        file_ids = {o.file_id for o in orders}
        mres = await db.execute(select(Material).where(Material.id.in_(mat_ids)))
        for m in mres.scalars().all():
            mat_map[m.id] = m
        fres = await db.execute(select(UploadedFile).where(UploadedFile.id.in_(file_ids)))
        for f in fres.scalars().all():
            file_map[f.id] = f

    columns = {col: [] for col in KANBAN_COLUMNS}

    for o in orders:
        # Collapse "paid" status into "accepted" bucket for kanban display
        bucket = o.status
        if bucket == "paid":
            bucket = "accepted"
        if bucket not in columns:
            # Unknown statuses fall into pending
            bucket = "pending"

        mat = mat_map.get(o.material_id)
        card = {
            "id": o.id,
            "order_number": o.order_number,
            "customer_name": o.customer_name,
            "customer_email": o.customer_email,
            "total_amount": o.total_amount,
            "material_name": mat.name if mat else "Unknown",
            "thickness_mm": o.thickness_mm,
            "quantity": o.quantity,
            "status": o.status,
            "deadline": None,  # reserved — order model has no deadline yet
            "notes": o.notes,
            "carrier": o.carrier,
            "tracking_number": o.tracking_number,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        }
        columns[bucket].append(card)

    return columns


@router.patch("/orders/{order_id}/status")
async def patch_order_status(
    order_id: int,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_admin_or_vendor),
):
    """Change an order's status (used by the admin AND vendor Kanban boards).

    The admin board passes an ``Order.id``; the vendor fulfillment board passes
    a ``VendorOrder.id`` (that's what ``GET /vendors/orders`` returns as ``id``).
    We resolve either form to the underlying :class:`Order` so the buyer
    (``Order.user_id``) is always notified on a status change.
    """
    new_status = (payload or {}).get("status")
    if not new_status or new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {sorted(VALID_STATUSES)}")

    is_admin = user.role in ("admin", "super_admin") or user.is_admin

    # Resolve the target Order. The path param is role-dependent because the two
    # Kanban boards send different ids and the numeric spaces collide:
    #   * admin board  -> order_id is an ``Order.id``
    #   * vendor board -> order_id is a ``VendorOrder.id`` (what GET /vendors/orders
    #     returns as each card's ``id``)
    # Resolving by role avoids mistaking a VendorOrder.id for an unrelated Order.id.
    vendor_order: VendorOrder | None = None

    if is_admin:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
    else:
        # Vendor caller: the id is a VendorOrder.id they must own.
        vendor = (
            await db.execute(select(Vendor).where(Vendor.user_id == user.id))
        ).scalar_one_or_none()
        if vendor is None:
            raise HTTPException(status_code=403, detail="No vendor profile for this user")

        vendor_order = (
            await db.execute(select(VendorOrder).where(VendorOrder.id == order_id))
        ).scalar_one_or_none()
        if vendor_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if vendor_order.vendor_id != vendor.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this order")

        order = await db.get(Order, vendor_order.order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    order.status = new_status
    # Keep the linked VendorOrder status in sync when we have one.
    if vendor_order is not None:
        vendor_order.status = new_status
    await db.commit()
    await db.refresh(order)

    # Notify the buyer about the status change (persisted + best-effort push)
    if new_status != old_status and order.user_id:
        from app.services.notification_service import notify_user, order_status_message
        mapped = order_status_message(new_status)
        if mapped:
            msg, ntype = mapped
        else:
            msg = f"Your order is now: {new_status.replace('_', ' ').title()}"
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

    return {"id": order.id, "status": order.status}


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Get order details (admin only)"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return await _build_order_response(order, db)


from app.services.email_service import EmailService

@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    update_data: OrderUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Update order status (admin only)"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    old_tracking = order.tracking_number

    # Update fields
    if update_data.status:
        order.status = update_data.status.value
    if update_data.notes:
        order.notes = update_data.notes
    if update_data.carrier:
        order.carrier = update_data.carrier
    if update_data.tracking_number:
        order.tracking_number = update_data.tracking_number

    await db.commit()
    await db.refresh(order)

    # Notify the buyer about the status change (persisted + best-effort push)
    if update_data.status and update_data.status.value != old_status and order.user_id:
        from app.services.notification_service import notify_user, order_status_message
        new_status = update_data.status.value
        mapped = order_status_message(new_status)
        if mapped:
            msg, ntype = mapped
        else:
            msg = f"Your order is now: {new_status.replace('_', ' ').title()}"
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

    # Send email notifications in background
    if update_data.status and update_data.status.value != old_status:
        if update_data.status.value in ["in_production", "completed", "cancelled"]:
            background_tasks.add_task(
                EmailService.send_production_update,
                order.customer_email,
                order.customer_name,
                order.order_number,
                update_data.status.value.replace("_", " ")
            )

    # Compare against old_tracking captured before the update/commit,
    # since order.tracking_number already reflects the new value at this point.
    if update_data.tracking_number and update_data.tracking_number != old_tracking:
        background_tasks.add_task(
            EmailService.send_shipping_notification,
            order.customer_email,
            order.customer_name,
            order.order_number,
            update_data.carrier or "Standard Shipping",
            update_data.tracking_number
        )

    return await _build_order_response(order, db)


@router.get("/analytics", response_model=AnalyticsData)
async def get_analytics(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Get advanced analytics data (admin only)"""
    # 1. Sales over time (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    # SQLite-compatible date grouping (using func.strftime)
    # Note: For Postgres, you would use func.date_trunc
    sales_query = (
        select(
            func.strftime("%Y-%m-%d", Order.created_at).label("date"),
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders")
        )
        .where(Order.created_at >= thirty_days_ago)
        .group_by("date")
        .order_by("date")
    )

    sales_result = await db.execute(sales_query)
    sales_over_time = [
        SalesData(date=row.date, revenue=row.revenue or 0, orders=row.orders)
        for row in sales_result.all()
    ]

    # 2. Popular materials
    material_query = (
        select(
            Material.name.label("material_name"),
            func.count(Order.id).label("count"),
            func.sum(Order.total_amount).label("revenue")
        )
        .join(Order, Material.id == Order.material_id)
        .group_by(Material.name)
        .order_by(desc("count"))
        .limit(10)
    )

    material_result = await db.execute(material_query)
    popular_materials = [
        MaterialMetric(material_name=row.material_name, count=row.count, revenue=row.revenue or 0)
        for row in material_result.all()
    ]

    # 3. Top customers
    customer_query = (
        select(
            Order.customer_email.label("email"),
            Order.customer_name.label("name"),
            func.count(Order.id).label("order_count"),
            func.sum(Order.total_amount).label("total_spent")
        )
        .group_by(Order.customer_email, Order.customer_name)
        .order_by(desc("total_spent"))
        .limit(10)
    )

    customer_result = await db.execute(customer_query)
    top_customers = [
        CustomerMetric(email=row.email, name=row.name, order_count=row.order_count, total_spent=row.total_spent or 0)
        for row in customer_result.all()
    ]

    # 4. Global metrics (exclude cancelled orders from revenue)
    total_metrics_query = select(
        func.count(Order.id).label("total_orders"),
        func.sum(Order.total_amount).label("total_revenue")
    ).where(Order.status != "cancelled")
    total_metrics_result = await db.execute(total_metrics_query)
    row = total_metrics_result.one()
    total_orders = row.total_orders or 0
    total_revenue = row.total_revenue or 0
    avg_order_value = total_revenue / total_orders if total_orders > 0 else 0

    return AnalyticsData(
        sales_over_time=sales_over_time,
        popular_materials=popular_materials,
        top_customers=top_customers,
        total_orders=total_orders,
        total_revenue=total_revenue,
        average_order_value=avg_order_value
    )


@router.get("/orders/export")
async def export_orders(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Export all orders as CSV (admin only)"""
    result = await db.execute(
        select(Order).order_by(desc(Order.created_at))
    )
    orders = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Order Number", "Date", "Customer Name", "Customer Email",
        "Material ID", "Thickness (mm)", "Quantity", "Total Amount",
        "Status", "Payment Status"
    ])

    for order in orders:
        writer.writerow([
            order.order_number,
            order.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            order.customer_name,
            order.customer_email,
            order.material_id,
            order.thickness_mm,
            order.quantity,
            order.total_amount,
            order.status,
            order.payment_status
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders_export.csv"}
    )


@router.get("/settings")
async def get_settings(
    category: str = None,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Get app settings (admin only). Secret values are masked."""
    query = select(AppSetting)
    if category:
        query = query.where(AppSetting.category == category)
    result = await db.execute(query)
    settings_list = result.scalars().all()

    return [
        {
            "id": s.id,
            "key": s.key,
            "value": "••••••••" if s.is_secret else s.value,
            "category": s.category,
            "is_secret": s.is_secret,
            "updated_at": s.updated_at,
        }
        for s in settings_list
    ]


@router.put("/settings")
async def update_settings(
    settings_data: list = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Update multiple settings at once (admin only)"""
    for item in settings_data:
        key = item.get("key")
        value = item.get("value")
        category = item.get("category", "payment")
        is_secret = item.get("is_secret", False)

        if not key:
            continue

        # Skip if value is the masked placeholder — secret wasn't changed
        if value == "••••••••":
            continue

        # Skip empty values for secret fields — don't overwrite with blank
        if is_secret and (value is None or value == ""):
            continue

        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        setting = result.scalar_one_or_none()

        if setting:
            setting.value = value
            setting.is_secret = is_secret
        else:
            setting = AppSetting(key=key, value=value, category=category, is_secret=is_secret)
            db.add(setting)

    await db.commit()
    return {"status": "updated"}


@router.get("/financials/summary")
async def financials_summary(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin),
):
    """Aggregate revenue/profit/cost metrics for the vendor back-office."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start.replace(day=1)
    year_start = today_start.replace(month=1, day=1)
    thirty_days_ago = today_start - timedelta(days=29)

    async def _sum_count(start):
        q = select(
            func.sum(Order.total_amount),
            func.count(Order.id),
        ).where(Order.status != "cancelled", Order.created_at >= start)
        r = (await db.execute(q)).one()
        return float(r[0] or 0), int(r[1] or 0)

    today_rev, today_count = await _sum_count(today_start)
    week_rev, week_count = await _sum_count(week_start)
    month_rev, month_count = await _sum_count(month_start)
    year_rev, year_count = await _sum_count(year_start)

    totals_q = select(
        func.sum(Order.total_amount),
        func.sum(Order.material_cost),
        func.sum(Order.laser_time_cost),
        func.sum(Order.energy_cost),
        func.count(Order.id),
    ).where(Order.status != "cancelled")
    trow = (await db.execute(totals_q)).one()
    total_rev = float(trow[0] or 0)
    total_mat = float(trow[1] or 0)
    total_laser = float(trow[2] or 0)
    total_energy = float(trow[3] or 0)
    total_orders = int(trow[4] or 0)
    total_cogs = total_mat + total_laser + total_energy
    profit = total_rev - total_cogs
    profit_margin_pct = (profit / total_rev * 100.0) if total_rev else 0.0
    avg_order_value = (total_rev / total_orders) if total_orders else 0.0

    by_mat_q = (
        select(
            Material.name.label("name"),
            func.sum(Order.material_cost).label("material_cost"),
            func.sum(Order.laser_time_cost).label("laser_cost"),
            func.sum(Order.energy_cost).label("energy_cost"),
        )
        .join(Order, Material.id == Order.material_id)
        .where(Order.status != "cancelled")
        .group_by(Material.name)
        .order_by(desc("material_cost"))
        .limit(10)
    )
    by_mat = [
        {
            "name": r.name,
            "total": float((r.material_cost or 0) + (r.laser_cost or 0) + (r.energy_cost or 0)),
        }
        for r in (await db.execute(by_mat_q)).all()
    ]

    cust_q = (
        select(
            Order.customer_email.label("email"),
            Order.customer_name.label("name"),
            func.count(Order.id).label("order_count"),
            func.sum(Order.total_amount).label("total_spent"),
        )
        .where(Order.status != "cancelled")
        .group_by(Order.customer_email, Order.customer_name)
        .order_by(desc("total_spent"))
        .limit(10)
    )
    top_customers = [
        {
            "name": r.name,
            "email": r.email,
            "order_count": int(r.order_count or 0),
            "total_spent": float(r.total_spent or 0),
        }
        for r in (await db.execute(cust_q)).all()
    ]

    tl_q = (
        select(
            func.strftime("%Y-%m-%d", Order.created_at).label("date"),
            func.sum(Order.total_amount).label("revenue"),
        )
        .where(Order.status != "cancelled", Order.created_at >= thirty_days_ago)
        .group_by("date")
        .order_by("date")
    )
    revenue_timeline = [
        {"date": r.date, "revenue": float(r.revenue or 0)}
        for r in (await db.execute(tl_q)).all()
    ]

    pm_q = (
        select(
            Order.payment_intent_id.label("pid"),
            func.sum(Order.total_amount).label("total"),
        )
        .where(Order.status != "cancelled")
        .group_by(Order.payment_intent_id)
    )
    buckets = {"stripe": 0.0, "razorpay": 0.0, "other": 0.0}
    for r in (await db.execute(pm_q)).all():
        pid = (r.pid or "").lower()
        total = float(r.total or 0)
        if pid.startswith("pi_"):
            buckets["stripe"] += total
        elif pid.startswith("pay_") or pid.startswith("order_"):
            buckets["razorpay"] += total
        else:
            buckets["other"] += total
    payment_methods = [{"method": k, "total": v} for k, v in buckets.items() if v > 0]

    return {
        "revenue": {
            "today": today_rev,
            "week": week_rev,
            "month": month_rev,
            "year": year_rev,
        },
        "profit": profit,
        "profit_margin_pct": round(profit_margin_pct, 2),
        "cogs": {
            "total": total_cogs,
            "material": total_mat,
            "laser": total_laser,
            "energy": total_energy,
            "by_material": by_mat,
        },
        "orders_count": {
            "today": today_count,
            "week": week_count,
            "month": month_count,
            "year": year_count,
            "total": total_orders,
        },
        "avg_order_value": avg_order_value,
        "top_customers": top_customers,
        "revenue_timeline": revenue_timeline,
        "payment_methods": payment_methods,
    }


@router.get("/financials/tax-report")
async def financials_tax_report(
    start_date: str | None = None,
    end_date: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin),
):
    """CSV download of orders within a date range, with tax breakdown.

    Tax is derived as total_amount - (subtotal + setup_fee) so it works
    even when tax isn't stored as its own column.
    """
    query = select(Order).where(Order.status != "cancelled")
    if start_date:
        try:
            query = query.where(Order.created_at >= datetime.fromisoformat(start_date))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date (use YYYY-MM-DD)")
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
            query = query.where(Order.created_at < end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date (use YYYY-MM-DD)")

    result = await db.execute(query.order_by(desc(Order.created_at)))
    orders = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order Number", "Date", "Customer", "Email", "Subtotal",
        "Material Cost", "Laser Cost", "Energy Cost", "Setup Fee",
        "Tax", "Total", "Status",
    ])
    for o in orders:
        subtotal = (o.material_cost or 0) + (o.laser_time_cost or 0) + (o.energy_cost or 0) + (o.setup_fee or 0)
        tax = max(0.0, (o.total_amount or 0) - subtotal)
        writer.writerow([
            o.order_number,
            o.created_at.strftime("%Y-%m-%d") if o.created_at else "",
            o.customer_name,
            o.customer_email,
            f"{subtotal:.2f}",
            f"{o.material_cost or 0:.2f}",
            f"{o.laser_time_cost or 0:.2f}",
            f"{o.energy_cost or 0:.2f}",
            f"{o.setup_fee or 0:.2f}",
            f"{tax:.2f}",
            f"{o.total_amount or 0:.2f}",
            o.status,
        ])

    output.seek(0)
    filename = f"tax_report_{start_date or 'all'}_{end_date or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/settings/initialize-payment-configs")
async def initialize_payment_configs(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Initialize default payment settings keys"""
    defaults = [
        {"key": "payment_gateway", "value": "stripe", "category": "payment", "is_secret": False},
        # Stripe
        {"key": "stripe_enabled", "value": "true", "category": "payment", "is_secret": False},
        {"key": "stripe_public_key", "value": "", "category": "payment", "is_secret": False},
        {"key": "stripe_secret_key", "value": "", "category": "payment", "is_secret": True},
        {"key": "stripe_webhook_secret", "value": "", "category": "payment", "is_secret": True},
        # Razorpay
        {"key": "razorpay_enabled", "value": "false", "category": "payment", "is_secret": False},
        {"key": "razorpay_key_id", "value": "", "category": "payment", "is_secret": False},
        {"key": "razorpay_key_secret", "value": "", "category": "payment", "is_secret": True},
        {"key": "razorpay_webhook_secret", "value": "", "category": "payment", "is_secret": True},
        # General
        {"key": "currency", "value": "usd", "category": "payment", "is_secret": False},
        {"key": "tax_rate", "value": "0.08", "category": "payment", "is_secret": False},
    ]

    for d in defaults:
        result = await db.execute(select(AppSetting).where(AppSetting.key == d["key"]))
        if not result.scalar_one_or_none():
            db.add(AppSetting(**d))

    await db.commit()
    return {"status": "seeded"}
