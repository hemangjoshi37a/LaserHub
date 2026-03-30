"""
Payment API endpoints with Stripe integration
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.models import Order
from app.schemas import PaymentIntentCreate, PaymentIntentResponse

router = APIRouter()


@router.post("/intent", response_model=PaymentIntentResponse)
async def create_payment_intent(
    payment_data: PaymentIntentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create Stripe payment intent
    """
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
            currency=payment_data.currency,
            metadata={
                "order_id": str(payment_data.order_id),
                "order_number": order.order_number,
            },
        )
        
        # Update order with payment intent ID
        order.payment_intent_id = intent.id
        order.payment_status = "pending"
        await db.commit()
        
        return PaymentIntentResponse(
            client_secret=intent.client_secret,
            payment_intent_id=intent.id,
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Stripe webhook events
    """
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Handle event types
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
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
