"""
Event-driven site notification service.

Provides a single best-effort helper, :func:`notify_user`, used across the
order and vendor lifecycle to persist an in-app :class:`Notification` row and
fire a best-effort web push to the user's subscriptions.

Design notes:
- ``notify_user`` NEVER raises into the caller. Any failure (DB or push) is
  caught and logged so a notification problem can't break the originating
  request (placing an order, changing a status, approving a vendor, ...).
- The web-push sender lives in ``app.api.notifications``; we import it lazily
  inside the function to avoid circular imports at module load time.
"""

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification

logger = logging.getLogger(__name__)


# Maps an order status -> (message, notification type) for buyer-facing
# status-change notifications. Covers the various status vocabularies used by
# admin/vendor/tracking endpoints (e.g. "completed", "made", "ready").
_ORDER_STATUS_MESSAGES = {
    "paid": ("Order confirmed", "success"),
    "confirmed": ("Order confirmed", "success"),
    "accepted": ("Order confirmed", "success"),
    "in_production": ("Your order is in production", "info"),
    "made": ("Your order is ready", "success"),
    "ready": ("Your order is ready", "success"),
    "completed": ("Your order is ready", "success"),
    "shipped": ("Your order has shipped", "info"),
    "delivered": ("Delivered", "success"),
    "cancelled": ("Order cancelled", "warning"),
    "canceled": ("Order cancelled", "warning"),
}


def order_status_message(status: str) -> Optional[tuple[str, str]]:
    """Return ``(message, type)`` for a buyer-facing order status, or None.

    Returns None for statuses with no meaningful buyer notification
    (e.g. ``pending``), so callers can skip notifying.
    """
    if not status:
        return None
    return _ORDER_STATUS_MESSAGES.get(status.lower())


async def notify_user(
    db: AsyncSession,
    user_id: int,
    title: str,
    message: str,
    *,
    type: str = "info",
    link: Optional[str] = None,
) -> None:
    """
    Persist an in-app notification for ``user_id`` and best-effort send a web push.

    This helper is intentionally fail-safe: it swallows and logs all errors so
    that a notification failure can never propagate into (and break) the
    request that triggered the event.

    Parameters
    ----------
    db:
        An open AsyncSession from the originating request.
    user_id:
        Recipient user id. If falsy (None/0), the call is a no-op.
    title, message:
        Notification content.
    type:
        One of ``info`` / ``success`` / ``warning`` / ``error``.
    link:
        Optional in-app link for the notification (e.g. ``/admin/my-orders``).
    """
    if not user_id:
        return

    # 1. Persist the in-app notification row.
    try:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            link=link,
            is_read=False,
        )
        db.add(notification)
        await db.flush()
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to persist notification for user %s", user_id)
        # Don't attempt push if we couldn't even persist; bail out cleanly.
        return

    # 2. Best-effort web push to the user's subscriptions.
    #    Lazy import avoids a circular import (notifications.py -> models, etc.).
    try:
        from app.api.notifications import send_push_notification

        await send_push_notification(
            user_id=user_id,
            title=title,
            body=message,
            url=link or "/",
            db=db,
        )
    except Exception:  # pragma: no cover - defensive
        logger.exception("Web push failed for user %s (notification still saved)", user_id)
