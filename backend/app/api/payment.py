"""
Payment API endpoints with Stripe and Razorpay integration
"""

import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from sqlalchemy.exc import IntegrityError

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models import Order, User, WebhookEvent
from app.schemas import PaymentIntentCreate, PaymentIntentResponse

router = APIRouter()


@router.post("/intent", response_model=PaymentIntentResponse)
async def create_payment_intent(
    payment_data: PaymentIntentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create Stripe PaymentIntent and return client_secret for frontend.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        # Verify order exists
        result = await db.execute(
            select(Order).where(Order.id == payment_data.order_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Create payment intent
        intent = stripe.PaymentIntent.create(
            amount=int(payment_data.amount * 100),  # Convert to cents
            currency=payment_data.currency.lower(),
            metadata={
                "order_id": str(payment_data.order_id),
                "order_number": order.order_number,
            },
            automatic_payment_methods={"enabled": True},
        )

        # Update order with payment intent ID
        order.payment_intent_id = intent.id
        order.payment_status = "pending"
        await db.commit()

        return PaymentIntentResponse(
            client_secret=intent.client_secret,
            payment_intent_id=intent.id,
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "payment.create_intent_failed",
            extra={"order_id": payment_data.order_id},
        )
        raise HTTPException(
            status_code=502,
            detail="Payment provider error. Please try again.",
            headers={"X-Error-Code": "PAYMENT_PROVIDER_UNAVAILABLE"}
        )


@router.post("/razorpay/order")
async def create_razorpay_order(
    payment_data: PaymentIntentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a Razorpay order and return order_id + key_id for the frontend checkout modal.
    Amount is expected in the major currency unit (e.g. USD dollars or INR rupees).
    Razorpay requires the smallest unit (paise for INR, cents for USD), so we multiply by 100.
    """
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")

    try:
        import razorpay

        # Verify order exists
        result = await db.execute(
            select(Order).where(Order.id == payment_data.order_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

        rp_order = client.order.create({
            "amount": int(payment_data.amount * 100),  # smallest currency unit
            "currency": payment_data.currency.upper(),
            "receipt": order.order_number,
            "notes": {
                "order_id": str(payment_data.order_id),
                "order_number": order.order_number,
            },
        })

        # Store the Razorpay order id so the webhook can match it later
        order.payment_intent_id = rp_order["id"]
        order.payment_status = "pending"
        await db.commit()

        return {
            "razorpay_order_id": rp_order["id"],
            "key_id": settings.RAZORPAY_KEY_ID,
            "amount": int(payment_data.amount * 100),
            "currency": payment_data.currency.upper(),
            "order_number": order.order_number,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "payment.create_razorpay_order_failed",
            extra={"order_id": payment_data.order_id},
        )
        raise HTTPException(
            status_code=502,
            detail="Payment provider error. Please try again.",
            headers={"X-Error-Code": "PAYMENT_PROVIDER_UNAVAILABLE"}
        )


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Unified webhook handler for both Stripe and Razorpay.
    Stripe sends `stripe-signature`; Razorpay sends `x-razorpay-signature`.
    """
    payload = await request.body()

    # ---- Razorpay ----
    rp_signature = request.headers.get("x-razorpay-signature")
    if rp_signature:
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            raise HTTPException(status_code=503, detail="Razorpay webhook secret not configured")

        expected = hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, rp_signature):
            raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

        import json
        event = json.loads(payload)
        event_type = event.get("event")

        logger.info(
            "Razorpay webhook received",
            extra={"event_type": event_type, "request_id": request.headers.get("x-request-id", "")},
        )

        # SEC-09: replay protection. Razorpay webhook payloads carry a top-level
        # `id` (e.g. "evt_xxx"); fall back to the payment entity id if absent.
        rp_event_id = event.get("id")
        if not rp_event_id:
            try:
                rp_event_id = event["payload"]["payment"]["entity"]["id"]
            except (KeyError, TypeError):
                rp_event_id = None
        if rp_event_id:
            wev = WebhookEvent(provider='razorpay', event_id=rp_event_id)
            db.add(wev)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                logger.info(
                    "webhook.duplicate",
                    extra={"provider": "razorpay", "event_id": rp_event_id},
                )
                return {"status": "already_processed"}

        if event_type == "payment.captured":
            payment = event["payload"]["payment"]["entity"]
            rp_order_id = payment.get("order_id")
            if rp_order_id:
                result = await db.execute(
                    select(Order).where(Order.payment_intent_id == rp_order_id)
                )
                order = result.scalar_one_or_none()
                if order:
                    order.payment_status = "paid"
                    order.status = "paid"
                    await db.commit()
                    try:
                        from app.services.email_service import EmailService
                        await EmailService.send_order_confirmation(
                            to_email=order.customer_email,
                            name=order.customer_name,
                            order_id=order.order_number,
                            amount=order.total_amount,
                        )
                    except Exception:
                        pass  # Email failure should not break the webhook response

        elif event_type == "payment.failed":
            payment = event["payload"]["payment"]["entity"]
            rp_order_id = payment.get("order_id")
            if rp_order_id:
                result = await db.execute(
                    select(Order).where(Order.payment_intent_id == rp_order_id)
                )
                order = result.scalar_one_or_none()
                if order:
                    order.payment_status = "failed"
                    await db.commit()

        return {"received": True}

    # ---- Stripe ----
    sig_header = request.headers.get("stripe-signature")
    if sig_header:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise HTTPException(status_code=503, detail="Stripe webhook secret not configured")

        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid Stripe signature")

        logger.info(
            "Stripe webhook received",
            extra={"event_type": event["type"], "request_id": request.headers.get("stripe-request-id", "")},
        )

        # SEC-09: replay protection. Insert the Stripe event id; on duplicate
        # (unique constraint on (provider, event_id)), return early without
        # re-processing. Signature was already verified above.
        wev = WebhookEvent(provider='stripe', event_id=event['id'])
        db.add(wev)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            logger.info(
                "webhook.duplicate",
                extra={"provider": "stripe", "event_id": event['id']},
            )
            return {"status": "already_processed"}

        if event["type"] == "payment_intent.succeeded":
            payment_intent = event["data"]["object"]
            order_id = payment_intent.get("metadata", {}).get("order_id")
            if order_id:
                result = await db.execute(
                    select(Order).where(Order.id == int(order_id))
                )
                order = result.scalar_one_or_none()
                if order:
                    order.payment_status = "paid"
                    order.status = "paid"
                    await db.commit()
                    try:
                        from app.services.email_service import EmailService
                        await EmailService.send_order_confirmation(
                            to_email=order.customer_email,
                            name=order.customer_name,
                            order_id=order.order_number,
                            amount=order.total_amount,
                        )
                    except Exception:
                        pass

        elif event["type"] == "payment_intent.payment_failed":
            payment_intent = event["data"]["object"]
            order_id = payment_intent.get("metadata", {}).get("order_id")
            if order_id:
                result = await db.execute(
                    select(Order).where(Order.id == int(order_id))
                )
                order = result.scalar_one_or_none()
                if order:
                    order.payment_status = "failed"
                    await db.commit()

        return {"received": True}

    raise HTTPException(status_code=400, detail="Unknown webhook source — missing signature header")


class CredentialTestRequest(BaseModel):
    """Request body for credential testing — keys must never be sent as query params."""
    provider: str
    api_key: str
    api_secret: str = ""


@router.post("/test-credentials")
async def test_payment_credentials(
    body: CredentialTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test if payment credentials are valid without saving them.

    Credentials are accepted in the JSON request body (never query params) to
    prevent them appearing in server access logs or browser history.

    Gated to platform super-admin only (SEC-07): arbitrary callers must not be
    able to probe Stripe/Razorpay keys against our server.
    """
    # SEC-07: super-admin gate. The shared `require_platform_admin` dependency
    # from app.core.security is not yet available (added by a later SEC task),
    # so we inline the role check here against the User ORM returned by
    # app.api.auth.get_current_user.
    if getattr(current_user, "role", None) != "super_admin":
        raise HTTPException(status_code=403, detail="Platform admin only")

    provider = body.provider
    api_key = body.api_key
    api_secret = body.api_secret
    if provider == "stripe":
        try:
            import stripe as stripe_lib
            stripe_lib.api_key = api_key
            # Test by retrieving account info (read-only, no charge)
            stripe_lib.Account.retrieve()
            return {"valid": True, "message": "Stripe credentials are valid", "account": "connected"}
        except stripe_lib.error.AuthenticationError:
            return {"valid": False, "message": "Invalid Stripe secret key"}
        except stripe_lib.error.StripeError as e:
            return {"valid": False, "message": str(e)}
        except Exception as e:
            return {"valid": False, "message": f"Connection error: {str(e)}"}

    elif provider == "razorpay":
        try:
            import razorpay
            client = razorpay.Client(auth=(api_key, api_secret))
            # Test by fetching 1 payment — lightweight read-only call
            client.payment.all({"count": 1})
            return {"valid": True, "message": "Razorpay credentials are valid"}
        except razorpay.errors.BadRequestError as e:
            return {"valid": False, "message": f"Invalid Razorpay credentials: {str(e)}"}
        except razorpay.errors.ServerError as e:
            return {"valid": False, "message": f"Razorpay server error: {str(e)}"}
        except Exception as e:
            error_str = str(e)
            if "401" in error_str or "authentication" in error_str.lower() or "Unauthorized" in error_str:
                return {"valid": False, "message": "Invalid Razorpay Key ID or Key Secret"}
            return {"valid": False, "message": f"Connection error: {error_str}"}

    return {"valid": False, "message": f"Unknown provider: {provider}"}


@router.get("/status/{order_id}")
async def get_payment_status(order_id: int, db: AsyncSession = Depends(get_db)):
    """Get payment status for an order"""
    result = await db.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "payment_status": order.payment_status,
        "payment_intent_id": order.payment_intent_id,
        "total_amount": order.total_amount,
    }
