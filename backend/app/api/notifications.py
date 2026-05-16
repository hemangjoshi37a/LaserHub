"""
Web Push Notifications API endpoints.

Handles VAPID-based browser push subscriptions and sending push messages
to users when order events occur.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import PushSubscription, User

logger = logging.getLogger(__name__)

router = APIRouter()

# Reuse the same bearer scheme as the auth router
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---------------------------------------------------------------------------
# Pydantic schemas (local — only used by this module)
# ---------------------------------------------------------------------------

class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class VapidPublicKeyResponse(BaseModel):
    public_key: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve a JWT to a User row. Raises 401 on failure."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_access_token(token)
        user_id: Any = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.email == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def send_push_notification(
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
    db: AsyncSession | None = None,
) -> None:
    """
    Send a Web Push notification to all active subscriptions for a user.

    This is a best-effort operation — expired or invalid subscriptions are
    silently removed; send errors are logged but not re-raised so that the
    calling request is never blocked.

    ``db`` must be an open AsyncSession.  When called from BackgroundTasks
    the caller is responsible for providing a fresh session.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured — push notification skipped")
        return

    if db is None:
        logger.error("send_push_notification called without a db session")
        return

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()

    if not subscriptions:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})

    # Import here so startup is not slowed when pywebpush is not used
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error("pywebpush is not installed — cannot send push notifications")
        return

    vapid_claims = {"sub": f"mailto:{settings.VAPID_CLAIMS_EMAIL}"}

    stale_ids = []
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
            )
        except Exception as exc:
            # 404/410 means the subscription is gone; remove it
            is_gone = False
            if hasattr(exc, "response") and exc.response is not None:  # type: ignore[attr-defined]
                if exc.response.status_code in (404, 410):  # type: ignore[attr-defined]
                    is_gone = True
            if is_gone:
                stale_ids.append(sub.id)
            else:
                logger.warning("Push send error for subscription %s: %s", sub.id, exc)

    # Clean up expired subscriptions
    for sub_id in stale_ids:
        stale = await db.get(PushSubscription, sub_id)
        if stale:
            await db.delete(stale)
    if stale_ids:
        await db.commit()


# ---------------------------------------------------------------------------
# Background-task wrapper that opens its own DB session
# ---------------------------------------------------------------------------

async def send_push_notification_bg(
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
) -> None:
    """
    Wrapper suitable for use with FastAPI BackgroundTasks.

    Opens its own database session so the background task is independent of
    the request's session lifecycle.
    """
    from app.core.database import async_session_maker  # avoid circular at module level

    async with async_session_maker() as db:
        await send_push_notification(user_id=user_id, title=title, body=body, url=url, db=db)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def get_vapid_public_key() -> VapidPublicKeyResponse:
    """Return the VAPID public key so the browser can subscribe to push."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured on this server",
        )
    return VapidPublicKeyResponse(public_key=settings.VAPID_PUBLIC_KEY)


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """
    Save or update a browser PushSubscription for the authenticated user.

    Idempotent: if the endpoint already exists we just update auth/p256dh keys.
    """
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update keys in case they rotated
        existing.p256dh = body.p256dh
        existing.auth = body.auth
        existing.user_id = current_user.id
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
        )
        db.add(sub)

    await db.commit()
    return {"detail": "Subscribed successfully"}


@router.delete("/unsubscribe", status_code=status.HTTP_200_OK)
async def unsubscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """Remove the given push subscription for the authenticated user."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    sub = result.scalar_one_or_none()

    if sub:
        await db.delete(sub)
        await db.commit()

    return {"detail": "Unsubscribed successfully"}


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    """List recent notifications for the authenticated user."""
    from app.models import Notification
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    return result.scalars().all()


@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a specific notification as read."""
    from app.models import Notification
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    await db.commit()
    return {"status": "success"}

