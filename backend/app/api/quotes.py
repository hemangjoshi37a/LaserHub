"""
Quote Builder API — custom quotes for off-platform inquiries.
"""
import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.vendor import get_current_vendor
from app.core.database import get_db
from app.models import Quote, Vendor

logger = logging.getLogger(__name__)

router = APIRouter()


# ===== Schemas =====

class QuoteLineItem(BaseModel):
    description: str = ""
    material: str = ""
    thickness: Optional[float] = None
    qty: float = 1
    unit_price: float = 0
    subtotal: float = 0


class QuoteCreate(BaseModel):
    customer_name: str
    customer_email: str
    items: List[QuoteLineItem] = Field(default_factory=list)
    setup_fee: float = 0
    tax: float = 0
    notes: str = ""
    valid_until: Optional[datetime] = None


class QuoteUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    items: Optional[List[QuoteLineItem]] = None
    setup_fee: Optional[float] = None
    tax: Optional[float] = None
    notes: Optional[str] = None
    valid_until: Optional[datetime] = None


class QuoteResponse(BaseModel):
    id: int
    quote_number: str
    vendor_id: int
    customer_name: str
    customer_email: str
    items: List[QuoteLineItem]
    subtotal: float
    setup_fee: float
    tax: float
    total: float
    notes: str
    status: str
    valid_until: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime] = None


# ===== Helpers =====

def _compute_totals(items: List[QuoteLineItem], setup_fee: float, tax: float):
    subtotal = sum((i.subtotal or (i.qty * i.unit_price)) for i in items)
    total = subtotal + (setup_fee or 0) + (tax or 0)
    return subtotal, total


def _to_response(q: Quote) -> QuoteResponse:
    try:
        items = json.loads(q.items or "[]")
    except Exception:
        items = []
    return QuoteResponse(
        id=q.id,
        quote_number=q.quote_number,
        vendor_id=q.vendor_id,
        customer_name=q.customer_name,
        customer_email=q.customer_email,
        items=[QuoteLineItem(**i) for i in items],
        subtotal=q.subtotal or 0,
        setup_fee=q.setup_fee or 0,
        tax=q.tax or 0,
        total=q.total or 0,
        notes=q.notes or "",
        status=q.status,
        valid_until=q.valid_until,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


async def _generate_quote_number(db: AsyncSession) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"QTE-{today}-"
    result = await db.execute(select(func.count(Quote.id)).where(Quote.quote_number.like(prefix + "%")))
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


# ===== Endpoints =====

@router.post("/", response_model=QuoteResponse)
async def create_quote(
    data: QuoteCreate,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    subtotal, total = _compute_totals(data.items, data.setup_fee, data.tax)
    quote_number = await _generate_quote_number(db)

    q = Quote(
        quote_number=quote_number,
        vendor_id=vendor.id,
        customer_name=data.customer_name,
        customer_email=data.customer_email,
        items=json.dumps([i.model_dump() for i in data.items]),
        subtotal=subtotal,
        setup_fee=data.setup_fee or 0,
        tax=data.tax or 0,
        total=total,
        notes=data.notes or "",
        status="draft",
        valid_until=data.valid_until,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return _to_response(q)


@router.get("/", response_model=List[QuoteResponse])
async def list_quotes(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    query = select(Quote).where(Quote.vendor_id == vendor.id).order_by(desc(Quote.created_at))
    if status_filter:
        query = query.where(Quote.status == status_filter)
    result = await db.execute(query)
    quotes = result.scalars().all()
    return [_to_response(q) for q in quotes]


@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    result = await db.execute(select(Quote).where(Quote.id == quote_id, Quote.vendor_id == vendor.id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return _to_response(q)


@router.put("/{quote_id}", response_model=QuoteResponse)
async def update_quote(
    quote_id: int,
    data: QuoteUpdate,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    result = await db.execute(select(Quote).where(Quote.id == quote_id, Quote.vendor_id == vendor.id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail="Cannot edit an accepted/rejected/expired quote")

    if data.customer_name is not None:
        q.customer_name = data.customer_name
    if data.customer_email is not None:
        q.customer_email = data.customer_email
    if data.notes is not None:
        q.notes = data.notes
    if data.valid_until is not None:
        q.valid_until = data.valid_until
    if data.setup_fee is not None:
        q.setup_fee = data.setup_fee
    if data.tax is not None:
        q.tax = data.tax
    if data.items is not None:
        q.items = json.dumps([i.model_dump() for i in data.items])

    # Recompute totals
    try:
        items_list = [QuoteLineItem(**i) for i in json.loads(q.items or "[]")]
    except Exception:
        items_list = []
    subtotal, total = _compute_totals(items_list, q.setup_fee or 0, q.tax or 0)
    q.subtotal = subtotal
    q.total = total

    await db.commit()
    await db.refresh(q)
    return _to_response(q)


@router.post("/{quote_id}/send", response_model=QuoteResponse)
async def send_quote(
    quote_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    result = await db.execute(select(Quote).where(Quote.id == quote_id, Quote.vendor_id == vendor.id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")

    q.status = "sent"
    await db.commit()
    await db.refresh(q)

    from app.services.email_service import EmailService
    from app.core.config import settings

    public_url = f"{settings.FRONTEND_URL}/q/{q.quote_number}"
    logger.info(
        "Quote %s sent to %s — public view: %s",
        q.quote_number, q.customer_email, public_url,
    )

    background_tasks.add_task(
        EmailService.send_quote_email,
        q.customer_email,
        q.customer_name,
        q.quote_number,
        public_url
    )

    return _to_response(q)


@router.delete("/{quote_id}")
async def delete_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    vendor: Vendor = Depends(get_current_vendor),
):
    result = await db.execute(select(Quote).where(Quote.id == quote_id, Quote.vendor_id == vendor.id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft quotes can be deleted")
    await db.delete(q)
    await db.commit()
    return {"status": "deleted"}


# ===== Public endpoints =====

@router.get("/public/{quote_number}", response_model=QuoteResponse)
async def get_public_quote(
    quote_number: str,
    db: AsyncSession = Depends(get_db),
):
    """Public view of a quote (no auth) — customers access this via the share link."""
    result = await db.execute(select(Quote).where(Quote.quote_number == quote_number))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status == "draft":
        raise HTTPException(status_code=404, detail="Quote not found")
    return _to_response(q)


@router.post("/public/{quote_number}/accept", response_model=QuoteResponse)
async def accept_public_quote(
    quote_number: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — customer accepts the quote."""
    result = await db.execute(select(Quote).where(Quote.quote_number == quote_number))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in ("sent",):
        raise HTTPException(status_code=400, detail=f"Quote cannot be accepted (status: {q.status})")
    if q.valid_until and q.valid_until < datetime.utcnow():
        q.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="Quote has expired")
    q.status = "accepted"
    await db.commit()
    await db.refresh(q)
    logger.info("Quote %s accepted by customer", q.quote_number)
    return _to_response(q)


@router.post("/public/{quote_number}/reject", response_model=QuoteResponse)
async def reject_public_quote(
    quote_number: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Quote).where(Quote.quote_number == quote_number))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in ("sent",):
        raise HTTPException(status_code=400, detail=f"Quote cannot be rejected (status: {q.status})")
    q.status = "rejected"
    await db.commit()
    await db.refresh(q)
    return _to_response(q)
