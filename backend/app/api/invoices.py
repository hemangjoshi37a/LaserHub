"""
Invoice API — CRUD, PDF, and email delivery for GST tax invoices.

Endpoints
---------
POST   /api/invoices/from-order/{order_id}   Create invoice from an existing order
POST   /api/invoices/                        Manual invoice creation
GET    /api/invoices/{invoice_id}            Detail (with line items)
GET    /api/invoices/                        List invoices for current user
PUT    /api/invoices/{invoice_id}/status     Update status
GET    /api/invoices/{invoice_id}/pdf        Stream PDF download
POST   /api/invoices/{invoice_id}/email      Email PDF to buyer
GET    /api/invoices/stats/vendor            Vendor dashboard stats
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models import (
    AppSetting,
    BillingAddress,
    Invoice,
    InvoiceLineItem,
    Material,
    Order,
    User,
    Vendor,
    VendorOrder,
)
from app.services.invoice_email import send_invoice_email
from app.services.pdf_generator import amount_to_words_inr, generate_invoice_pdf

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Pydantic schemas (local — can move into app.schemas when Agent 1 lands them)
# =============================================================================
Q2 = Decimal("0.01")


def _q(v: Any) -> Decimal:
    if v is None:
        return Decimal("0.00")
    try:
        return Decimal(str(v)).quantize(Q2, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


class InvoiceLineItemIn(BaseModel):
    description: str
    hsn_sac_code: Optional[str] = "9987"
    quantity: Decimal = Decimal("1")
    unit: Optional[str] = "pcs"
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")
    taxable_value: Optional[Decimal] = None
    cgst_rate: Optional[Decimal] = Decimal("0")
    cgst_amount: Optional[Decimal] = Decimal("0")
    sgst_rate: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    igst_rate: Optional[Decimal] = Decimal("0")
    igst_amount: Optional[Decimal] = Decimal("0")
    total_amount: Optional[Decimal] = None


class InvoiceLineItemOut(BaseModel):
    id: int
    description: str
    hsn_sac_code: Optional[str] = None
    quantity: Decimal
    unit: Optional[str] = None
    unit_price: Decimal
    discount_percent: Decimal
    taxable_value: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_amount: Decimal

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    invoice_type: Optional[str] = "tax_invoice"
    order_id: Optional[int] = None
    vendor_id: Optional[int] = None
    customer_id: Optional[int] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None

    # Seller
    seller_name: Optional[str] = None
    seller_address: Optional[str] = None
    seller_gstin: Optional[str] = None
    seller_pan: Optional[str] = None
    seller_state: Optional[str] = None
    seller_state_code: Optional[str] = None
    seller_email: Optional[str] = None
    seller_phone: Optional[str] = None

    # Buyer
    buyer_name: str
    buyer_address: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_state: Optional[str] = None
    buyer_state_code: Optional[str] = None
    buyer_email: Optional[EmailStr] = None
    buyer_phone: Optional[str] = None

    # Tax meta
    place_of_supply: Optional[str] = None
    place_of_supply_code: Optional[str] = None
    reverse_charge: bool = False
    currency: str = "INR"
    notes: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    # Overrides
    discount_amount: Optional[Decimal] = Decimal("0")
    gst_rate: Decimal = Decimal("18.00")

    line_items: List[InvoiceLineItemIn] = Field(default_factory=list)


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    invoice_type: Optional[str]
    status: str

    order_id: Optional[int] = None
    vendor_id: Optional[int] = None
    customer_id: Optional[int] = None

    invoice_date: Optional[date] = None
    due_date: Optional[date] = None

    seller_name: Optional[str] = None
    seller_address: Optional[str] = None
    seller_gstin: Optional[str] = None
    seller_pan: Optional[str] = None
    seller_state: Optional[str] = None
    seller_state_code: Optional[str] = None
    seller_email: Optional[str] = None
    seller_phone: Optional[str] = None

    buyer_name: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_state: Optional[str] = None
    buyer_state_code: Optional[str] = None
    buyer_email: Optional[str] = None
    buyer_phone: Optional[str] = None

    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    round_off: Decimal
    total_amount: Decimal
    amount_in_words: Optional[str] = None

    place_of_supply: Optional[str] = None
    place_of_supply_code: Optional[str] = None
    reverse_charge: bool = False
    is_interstate: bool = False
    currency: str = "INR"

    notes: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    line_items: List[InvoiceLineItemOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class InvoiceStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(draft|issued|paid|cancelled)$")


class InvoiceEmailRequest(BaseModel):
    to: Optional[EmailStr] = None
    message: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================
_INVOICE_NUMBER_RE = re.compile(r"^INV-(\d{6})-(\d{5})$")


async def _next_invoice_number(db: AsyncSession) -> str:
    """Generate a fresh ``INV-YYYYMM-00001`` style number (monotonic per month)."""
    today = date.today()
    prefix = f"INV-{today.strftime('%Y%m')}-"
    result = await db.execute(
        select(Invoice.invoice_number)
        .where(Invoice.invoice_number.like(f"{prefix}%"))
        .order_by(Invoice.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    next_seq = 1
    if row:
        m = _INVOICE_NUMBER_RE.match(row)
        if m:
            try:
                next_seq = int(m.group(2)) + 1
            except ValueError:
                next_seq = 1
    return f"{prefix}{next_seq:05d}"


def calculate_gst_for_order(
    order_subtotal: Decimal,
    seller_state_code: Optional[str],
    buyer_state_code: Optional[str],
    gst_rate: Decimal = Decimal("18.00"),
    hsn_sac: str = "9987",
) -> dict:
    """Calculate GST split for a given taxable amount.

    Returns a dict with:
        taxable_amount, is_interstate,
        cgst_rate, cgst_amount, sgst_rate, sgst_amount,
        igst_rate, igst_amount, total_amount, hsn_sac
    """
    taxable = _q(order_subtotal)
    seller_sc = (seller_state_code or "").strip()
    buyer_sc = (buyer_state_code or "").strip()

    # If we don't know either side, treat as intrastate by default (no IGST)
    is_interstate = bool(seller_sc and buyer_sc and seller_sc != buyer_sc)

    cgst_rate = sgst_rate = igst_rate = Decimal("0")
    cgst_amt = sgst_amt = igst_amt = Decimal("0")

    if is_interstate:
        igst_rate = gst_rate
        igst_amt = _q(taxable * gst_rate / Decimal("100"))
    else:
        half = (gst_rate / Decimal("2"))
        cgst_rate = sgst_rate = half
        cgst_amt = _q(taxable * half / Decimal("100"))
        sgst_amt = cgst_amt

    total = _q(taxable + cgst_amt + sgst_amt + igst_amt)
    return {
        "taxable_amount": taxable,
        "is_interstate": is_interstate,
        "cgst_rate": cgst_rate,
        "cgst_amount": cgst_amt,
        "sgst_rate": sgst_rate,
        "sgst_amount": sgst_amt,
        "igst_rate": igst_rate,
        "igst_amount": igst_amt,
        "total_amount": total,
        "hsn_sac": hsn_sac,
    }


# Platform-level seller defaults used when an order has no associated vendor
# and no seller config rows exist in app_settings. ``seller_state`` /
# ``seller_state_code`` are NOT NULL on the invoices table, so these must never
# be blank — they also drive CGST/SGST-vs-IGST place-of-supply logic.
PLATFORM_SELLER_DEFAULTS: dict[str, Optional[str]] = {
    "seller_name": "LaserHub",
    "seller_address": "LaserHub Manufacturing, India",
    "seller_gstin": None,
    "seller_pan": None,
    "seller_state": "Karnataka",
    "seller_state_code": "29",  # Karnataka GST state code
    "seller_email": None,
    "seller_phone": None,
}

# app_settings keys an operator can populate to configure the platform seller
# (see admin Settings UI). All optional; missing keys fall back to the defaults.
_SELLER_SETTING_KEYS = (
    "seller_name",
    "seller_address",
    "seller_gstin",
    "seller_pan",
    "seller_state",
    "seller_state_code",
    "seller_email",
    "seller_phone",
)


async def _load_platform_seller(db: AsyncSession) -> dict[str, Optional[str]]:
    """Resolve platform seller details from app_settings, with safe defaults.

    Operators can store ``seller_*`` rows in the ``app_settings`` table to brand
    the platform's own invoices (orders not routed to a specific vendor). Any
    unset/blank key falls back to :data:`PLATFORM_SELLER_DEFAULTS` so the
    invoice's NOT NULL columns (seller_state / seller_state_code) are always
    satisfied.
    """
    seller = dict(PLATFORM_SELLER_DEFAULTS)
    try:
        result = await db.execute(
            select(AppSetting).where(AppSetting.key.in_(_SELLER_SETTING_KEYS))
        )
        for row in result.scalars().all():
            value = (row.value or "").strip()
            if value:
                seller[row.key] = value
    except Exception:  # pragma: no cover - settings table optional / best effort
        logger.warning("invoice.seller_settings_lookup_failed", exc_info=True)
    return seller


def _invoice_to_response(invoice: Invoice, items: List[InvoiceLineItem]) -> InvoiceResponse:
    return InvoiceResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_type=invoice.invoice_type,
        status=invoice.status or "draft",
        order_id=invoice.order_id,
        vendor_id=invoice.vendor_id,
        customer_id=invoice.customer_id,
        invoice_date=invoice.invoice_date,
        due_date=invoice.due_date,
        seller_name=invoice.seller_name,
        seller_address=invoice.seller_address,
        seller_gstin=invoice.seller_gstin,
        seller_pan=invoice.seller_pan,
        seller_state=invoice.seller_state,
        seller_state_code=invoice.seller_state_code,
        seller_email=invoice.seller_email,
        seller_phone=invoice.seller_phone,
        buyer_name=invoice.buyer_name,
        buyer_address=invoice.buyer_address,
        buyer_gstin=invoice.buyer_gstin,
        buyer_state=invoice.buyer_state,
        buyer_state_code=invoice.buyer_state_code,
        buyer_email=invoice.buyer_email,
        buyer_phone=invoice.buyer_phone,
        subtotal=_q(invoice.subtotal),
        discount_amount=_q(invoice.discount_amount),
        taxable_amount=_q(invoice.taxable_amount),
        cgst_amount=_q(invoice.cgst_amount),
        sgst_amount=_q(invoice.sgst_amount),
        igst_amount=_q(invoice.igst_amount),
        round_off=_q(invoice.round_off),
        total_amount=_q(invoice.total_amount),
        amount_in_words=invoice.amount_in_words,
        place_of_supply=invoice.place_of_supply,
        place_of_supply_code=invoice.place_of_supply_code,
        reverse_charge=bool(invoice.reverse_charge),
        is_interstate=bool(invoice.is_interstate),
        currency=invoice.currency or "INR",
        notes=invoice.notes,
        terms_and_conditions=invoice.terms_and_conditions,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        line_items=[InvoiceLineItemOut.model_validate(li) for li in items],
    )


def _is_super_admin(user: User) -> bool:
    return bool(getattr(user, "is_admin", False)) or (user.role or "") == "super_admin"


async def _get_vendor_for_user(db: AsyncSession, user: User) -> Optional[Vendor]:
    result = await db.execute(select(Vendor).where(Vendor.user_id == user.id))
    return result.scalar_one_or_none()


async def _authorize_view(db: AsyncSession, invoice: Invoice, user: User) -> None:
    if _is_super_admin(user):
        return
    # Customer on invoice
    if invoice.customer_id and invoice.customer_id == user.id:
        return
    # Email match on buyer (covers guest invoices linked post-hoc)
    if invoice.buyer_email and user.email and invoice.buyer_email.lower() == user.email.lower():
        return
    # Vendor ownership
    if invoice.vendor_id:
        vendor = await _get_vendor_for_user(db, user)
        if vendor and vendor.id == invoice.vendor_id:
            return
    raise HTTPException(status_code=403, detail="Not authorised to view this invoice")


async def _authorize_mutate(db: AsyncSession, invoice: Invoice, user: User) -> None:
    if _is_super_admin(user):
        return
    if invoice.vendor_id:
        vendor = await _get_vendor_for_user(db, user)
        if vendor and vendor.id == invoice.vendor_id:
            return
    raise HTTPException(status_code=403, detail="Only the issuing vendor or super admin can modify this invoice")


async def _load_invoice_with_items(db: AsyncSession, invoice_id: int) -> tuple[Invoice, List[InvoiceLineItem]]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.line_items))
        .where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = list(invoice.line_items or [])
    items.sort(key=lambda li: li.id)
    return invoice, items


# =============================================================================
# Endpoints
# =============================================================================
@router.post("/from-order/{order_id}", response_model=InvoiceResponse)
async def create_invoice_from_order(
    order_id: int,
    gst_rate: Decimal = Query(Decimal("18.00"), description="GST rate %"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a draft tax invoice from an existing order.

    - Looks up VendorOrder → Vendor for seller details; falls back to platform defaults.
    - Looks up buyer's default BillingAddress → else uses order.customer_* fields.
    - Allocates CGST/SGST intrastate or IGST interstate by state code.
    """
    order_result = await db.execute(
        select(Order)
        .options(selectinload(Order.material))
        .where(Order.id == order_id)
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Vendor context (if this order was routed to a specific vendor)
    vo_result = await db.execute(select(VendorOrder).where(VendorOrder.order_id == order.id))
    vendor_order = vo_result.scalar_one_or_none()
    vendor: Optional[Vendor] = None
    if vendor_order:
        vr = await db.execute(select(Vendor).where(Vendor.id == vendor_order.vendor_id))
        vendor = vr.scalar_one_or_none()

    # Authorization: only the owning vendor, the order's customer, or super admin may bill
    if not _is_super_admin(current_user):
        current_vendor = await _get_vendor_for_user(db, current_user)
        is_vendor_owner = vendor is not None and current_vendor is not None and current_vendor.id == vendor.id
        is_customer = order.user_id is not None and order.user_id == current_user.id
        is_customer_by_email = (
            order.customer_email and order.customer_email.lower() == (current_user.email or "").lower()
        )
        if not (is_vendor_owner or is_customer or is_customer_by_email):
            raise HTTPException(status_code=403, detail="Not authorised to invoice this order")

    # Prevent duplicate invoices per order unless explicitly cancelled
    existing_result = await db.execute(
        select(Invoice).where(
            and_(Invoice.order_id == order.id, Invoice.status != "cancelled")
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        items = await db.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == existing.id)
        )
        return _invoice_to_response(existing, list(items.scalars().all()))

    # Seller defaults (from vendor, else platform settings/defaults).
    # Platform defaults backfill any field the vendor record leaves blank so the
    # invoice's NOT NULL seller columns (seller_state / seller_state_code) are
    # always populated, even for legacy vendors without GST details on file.
    platform_seller = await _load_platform_seller(db)
    if vendor:
        vendor_phone = None
        if vendor.phone_number:
            vendor_phone = (
                f"{vendor.phone_country_code or ''}{vendor.phone_number}".strip()
            )
        seller_name = (
            vendor.registered_business_name or vendor.shop_name
            or platform_seller["seller_name"]
        )
        seller_address = (
            vendor.business_address or vendor.location
            or platform_seller["seller_address"]
        )
        seller_gstin = vendor.gstin or vendor.gst_number or platform_seller["seller_gstin"]
        seller_pan = vendor.pan or platform_seller["seller_pan"]
        seller_state = vendor.state or platform_seller["seller_state"]
        seller_state_code = vendor.state_code or platform_seller["seller_state_code"]
        seller_email = vendor.business_email or platform_seller["seller_email"]
        seller_phone = vendor_phone or platform_seller["seller_phone"]
    else:
        seller_name = platform_seller["seller_name"]
        seller_address = platform_seller["seller_address"]
        seller_gstin = platform_seller["seller_gstin"]
        seller_pan = platform_seller["seller_pan"]
        seller_state = platform_seller["seller_state"]
        seller_state_code = platform_seller["seller_state_code"]
        seller_email = platform_seller["seller_email"]
        seller_phone = platform_seller["seller_phone"]

    # Buyer defaults — try default BillingAddress, then user, then order fields
    buyer_name = order.customer_name or "Customer"
    buyer_address = order.shipping_address or "N/A"
    buyer_email = order.customer_email
    buyer_gstin = None
    buyer_state = None
    buyer_state_code = None
    buyer_phone = None
    customer_id = order.user_id

    if order.user_id:
        ba_result = await db.execute(
            select(BillingAddress)
            .where(BillingAddress.user_id == order.user_id)
            .order_by(BillingAddress.is_default.desc(), BillingAddress.id.desc())
        )
        billing = ba_result.scalars().first()
        if billing:
            buyer_name = billing.name or buyer_name
            buyer_gstin = billing.gstin
            buyer_state = billing.state
            buyer_state_code = billing.state_code
            buyer_email = billing.email or buyer_email
            buyer_phone = billing.phone
            # Build multi-line address
            parts = [
                billing.address_line_1,
                billing.address_line_2,
                ", ".join([p for p in [billing.city, billing.state, billing.postal_code] if p]),
                billing.country,
            ]
            rebuilt = "\n".join([p for p in parts if p])
            if rebuilt:
                buyer_address = rebuilt

    # buyer_state / buyer_state_code are NOT NULL on the invoices table. When the
    # buyer's state is unknown (guest checkout, no billing address on file), fall
    # back to the seller's state. GST treats this as an intrastate supply
    # (CGST/SGST) — the safe default when place of supply can't be determined.
    if not buyer_state:
        buyer_state = seller_state
    if not buyer_state_code:
        buyer_state_code = seller_state_code

    # Compute taxes — subtotal is the order's total_amount, or order material cost * qty
    subtotal = _q(order.total_amount)
    tax = calculate_gst_for_order(
        order_subtotal=subtotal,
        seller_state_code=seller_state_code,
        buyer_state_code=buyer_state_code,
        gst_rate=gst_rate,
    )

    # Build one line item per order (material × thickness × qty)
    material_name = order.material.name if order.material else f"Material #{order.material_id}"
    description = f"{material_name} — {order.thickness_mm}mm (Order {order.order_number})"

    qty = Decimal(str(order.quantity or 1))
    unit_price = _q(subtotal / qty) if qty > 0 else subtotal

    line_item_taxable = _q(unit_price * qty)
    per_line_cgst = _q(line_item_taxable * tax["cgst_rate"] / Decimal("100"))
    per_line_sgst = _q(line_item_taxable * tax["sgst_rate"] / Decimal("100"))
    per_line_igst = _q(line_item_taxable * tax["igst_rate"] / Decimal("100"))
    per_line_total = _q(line_item_taxable + per_line_cgst + per_line_sgst + per_line_igst)

    place_of_supply = buyer_state or seller_state
    place_of_supply_code = buyer_state_code or seller_state_code

    invoice_number = await _next_invoice_number(db)
    today = date.today()

    invoice = Invoice(
        invoice_number=invoice_number,
        invoice_type="tax_invoice",
        status="draft",
        order_id=order.id,
        vendor_id=vendor.id if vendor else None,
        customer_id=customer_id,
        invoice_date=today,
        due_date=today + timedelta(days=15),
        seller_name=seller_name,
        seller_address=seller_address,
        seller_gstin=seller_gstin,
        seller_pan=seller_pan,
        seller_state=seller_state,
        seller_state_code=seller_state_code,
        seller_email=seller_email,
        seller_phone=seller_phone,
        buyer_name=buyer_name,
        buyer_address=buyer_address,
        buyer_gstin=buyer_gstin,
        buyer_state=buyer_state,
        buyer_state_code=buyer_state_code,
        buyer_email=buyer_email,
        buyer_phone=buyer_phone,
        subtotal=subtotal,
        discount_amount=Decimal("0.00"),
        taxable_amount=tax["taxable_amount"],
        cgst_amount=tax["cgst_amount"],
        sgst_amount=tax["sgst_amount"],
        igst_amount=tax["igst_amount"],
        round_off=_q(tax["total_amount"] - (tax["taxable_amount"] + tax["cgst_amount"] + tax["sgst_amount"] + tax["igst_amount"])),
        total_amount=tax["total_amount"],
        amount_in_words=amount_to_words_inr(tax["total_amount"]),
        place_of_supply=place_of_supply,
        place_of_supply_code=place_of_supply_code,
        reverse_charge=False,
        is_interstate=tax["is_interstate"],
        currency="INR",
        notes=None,
        terms_and_conditions="Payment due within 15 days. Interest @18% p.a. charged on late payments.",
    )
    db.add(invoice)
    await db.flush()  # need invoice.id for FK

    line_item = InvoiceLineItem(
        invoice_id=invoice.id,
        description=description,
        hsn_sac_code=tax["hsn_sac"],
        quantity=qty,
        unit="pcs",
        unit_price=unit_price,
        discount_percent=Decimal("0"),
        taxable_value=line_item_taxable,
        cgst_rate=tax["cgst_rate"],
        cgst_amount=per_line_cgst,
        sgst_rate=tax["sgst_rate"],
        sgst_amount=per_line_sgst,
        igst_rate=tax["igst_rate"],
        igst_amount=per_line_igst,
        total_amount=per_line_total,
    )
    db.add(line_item)
    await db.commit()
    await db.refresh(invoice)

    return _invoice_to_response(invoice, [line_item])


@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an invoice manually (vendor or super admin)."""
    current_vendor = await _get_vendor_for_user(db, current_user)
    if not (_is_super_admin(current_user) or current_vendor is not None):
        raise HTTPException(status_code=403, detail="Only vendors or super admins may create invoices")

    # Resolve vendor context
    vendor_id = payload.vendor_id
    if vendor_id is None and current_vendor is not None:
        vendor_id = current_vendor.id

    vendor: Optional[Vendor] = None
    if vendor_id:
        vr = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
        vendor = vr.scalar_one_or_none()
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        # Non-super-admin vendors can only issue under their own vendor_id
        if not _is_super_admin(current_user) and current_vendor and current_vendor.id != vendor.id:
            raise HTTPException(status_code=403, detail="Cannot issue invoice under another vendor's account")

    # Seller defaults from vendor if not overridden
    seller_name = payload.seller_name or (vendor.registered_business_name if vendor else None) or \
        (vendor.shop_name if vendor else None) or "LaserHub"
    seller_address = payload.seller_address or (vendor.business_address if vendor else "") or ""
    seller_gstin = payload.seller_gstin or (vendor.gstin if vendor else None)
    seller_pan = payload.seller_pan or (vendor.pan if vendor else None)
    seller_state = payload.seller_state or (vendor.state if vendor else None)
    seller_state_code = payload.seller_state_code or (vendor.state_code if vendor else None)
    seller_email = payload.seller_email or (vendor.business_email if vendor else None)
    seller_phone = payload.seller_phone or (
        f"{vendor.phone_country_code or ''}{vendor.phone_number or ''}".strip() or None
        if vendor else None
    )

    # Compute totals from line items
    discount_amount = _q(payload.discount_amount or 0)
    subtotal = Decimal("0.00")
    taxable_amount = Decimal("0.00")
    cgst_amount = Decimal("0.00")
    sgst_amount = Decimal("0.00")
    igst_amount = Decimal("0.00")

    gst_rate = Decimal(str(payload.gst_rate or "18.00"))
    is_interstate = bool(
        (seller_state_code or "").strip()
        and (payload.buyer_state_code or "").strip()
        and (seller_state_code or "").strip() != (payload.buyer_state_code or "").strip()
    )

    computed_items: List[InvoiceLineItem] = []
    for li in payload.line_items:
        qty = Decimal(str(li.quantity or 0))
        unit_price = _q(li.unit_price or 0)
        disc_pct = Decimal(str(li.discount_percent or 0))

        gross = _q(qty * unit_price)
        disc_value = _q(gross * disc_pct / Decimal("100"))
        taxable = _q(li.taxable_value) if li.taxable_value is not None else _q(gross - disc_value)

        # If rates are provided, honour them; otherwise fall back to split/invoice-wide gst_rate
        if is_interstate:
            cgst_r = _q(li.cgst_rate or 0)
            sgst_r = _q(li.sgst_rate or 0)
            igst_r = _q(li.igst_rate or gst_rate)
        else:
            half = gst_rate / Decimal("2")
            cgst_r = _q(li.cgst_rate or half)
            sgst_r = _q(li.sgst_rate or half)
            igst_r = _q(li.igst_rate or 0)

        cgst_a = _q(taxable * cgst_r / Decimal("100"))
        sgst_a = _q(taxable * sgst_r / Decimal("100"))
        igst_a = _q(taxable * igst_r / Decimal("100"))
        line_total = _q(taxable + cgst_a + sgst_a + igst_a)

        subtotal += gross
        taxable_amount += taxable
        cgst_amount += cgst_a
        sgst_amount += sgst_a
        igst_amount += igst_a

        computed_items.append(InvoiceLineItem(
            description=li.description,
            hsn_sac_code=li.hsn_sac_code or "9987",
            quantity=qty,
            unit=li.unit or "pcs",
            unit_price=unit_price,
            discount_percent=disc_pct,
            taxable_value=taxable,
            cgst_rate=cgst_r,
            cgst_amount=cgst_a,
            sgst_rate=sgst_r,
            sgst_amount=sgst_a,
            igst_rate=igst_r,
            igst_amount=igst_a,
            total_amount=line_total,
        ))

    subtotal = _q(subtotal)
    taxable_amount = _q(taxable_amount)
    total_before_round = _q(taxable_amount + cgst_amount + sgst_amount + igst_amount)
    grand_total = total_before_round.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    round_off = _q(grand_total - total_before_round)

    invoice_number = await _next_invoice_number(db)
    inv_date = payload.invoice_date or date.today()

    invoice = Invoice(
        invoice_number=invoice_number,
        invoice_type=payload.invoice_type or "tax_invoice",
        status="draft",
        order_id=payload.order_id,
        vendor_id=vendor_id,
        customer_id=payload.customer_id,
        invoice_date=inv_date,
        due_date=payload.due_date or (inv_date + timedelta(days=15)),
        seller_name=seller_name,
        seller_address=seller_address,
        seller_gstin=seller_gstin,
        seller_pan=seller_pan,
        seller_state=seller_state,
        seller_state_code=seller_state_code,
        seller_email=seller_email,
        seller_phone=seller_phone,
        buyer_name=payload.buyer_name,
        buyer_address=payload.buyer_address,
        buyer_gstin=payload.buyer_gstin,
        buyer_state=payload.buyer_state,
        buyer_state_code=payload.buyer_state_code,
        buyer_email=str(payload.buyer_email) if payload.buyer_email else None,
        buyer_phone=payload.buyer_phone,
        subtotal=subtotal,
        discount_amount=discount_amount,
        taxable_amount=taxable_amount,
        cgst_amount=_q(cgst_amount),
        sgst_amount=_q(sgst_amount),
        igst_amount=_q(igst_amount),
        round_off=round_off,
        total_amount=_q(grand_total),
        amount_in_words=amount_to_words_inr(grand_total),
        place_of_supply=payload.place_of_supply or payload.buyer_state or seller_state,
        place_of_supply_code=payload.place_of_supply_code or payload.buyer_state_code or seller_state_code,
        reverse_charge=bool(payload.reverse_charge),
        is_interstate=is_interstate,
        currency=payload.currency or "INR",
        notes=payload.notes,
        terms_and_conditions=payload.terms_and_conditions,
    )
    db.add(invoice)
    await db.flush()

    for li in computed_items:
        li.invoice_id = invoice.id
        db.add(li)

    await db.commit()
    await db.refresh(invoice)

    return _invoice_to_response(invoice, computed_items)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice, items = await _load_invoice_with_items(db, invoice_id)
    await _authorize_view(db, invoice, current_user)
    return _invoice_to_response(invoice, items)


@router.get("/", response_model=List[InvoiceResponse])
async def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List invoices visible to the current user, newest first."""
    q = select(Invoice).options(selectinload(Invoice.line_items))

    if _is_super_admin(current_user):
        pass  # no scope filter
    else:
        vendor = await _get_vendor_for_user(db, current_user)
        clauses = [Invoice.customer_id == current_user.id]
        if current_user.email:
            clauses.append(Invoice.buyer_email == current_user.email)
        if vendor is not None:
            clauses.append(Invoice.vendor_id == vendor.id)
        from sqlalchemy import or_
        q = q.where(or_(*clauses))

    if status_filter:
        q = q.where(Invoice.status == status_filter)
    if from_date:
        q = q.where(Invoice.invoice_date >= from_date)
    if to_date:
        q = q.where(Invoice.invoice_date <= to_date)

    q = q.order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    invoices = list(result.scalars().all())

    return [_invoice_to_response(inv, sorted(inv.line_items or [], key=lambda li: li.id)) for inv in invoices]


@router.put("/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: int,
    payload: InvoiceStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice, items = await _load_invoice_with_items(db, invoice_id)
    await _authorize_mutate(db, invoice, current_user)

    # Enforce reasonable transitions
    current = (invoice.status or "draft").lower()
    target = payload.status.lower()
    allowed_transitions = {
        "draft": {"issued", "cancelled"},
        "issued": {"paid", "cancelled"},
        "paid": {"cancelled"},
        "cancelled": set(),
    }
    if target == current:
        return _invoice_to_response(invoice, items)
    if target not in allowed_transitions.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition invoice from '{current}' to '{target}'",
        )

    invoice.status = target
    invoice.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(invoice)
    return _invoice_to_response(invoice, items)


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice, items = await _load_invoice_with_items(db, invoice_id)
    await _authorize_view(db, invoice, current_user)

    try:
        pdf_bytes = generate_invoice_pdf(invoice, items)
    except Exception as e:
        logger.exception("pdf_generator.failed invoice=%s", invoice.invoice_number)
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice PDF: {e}")

    filename = f"{invoice.invoice_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{invoice_id}/email")
async def email_invoice(
    invoice_id: int,
    payload: InvoiceEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice, items = await _load_invoice_with_items(db, invoice_id)
    # Either the issuing vendor or super admin can email; customer viewing it is fine too
    try:
        await _authorize_mutate(db, invoice, current_user)
    except HTTPException:
        # Allow the buyer themselves to email a copy to another address
        await _authorize_view(db, invoice, current_user)

    recipient = payload.to or invoice.buyer_email
    if not recipient:
        raise HTTPException(status_code=400, detail="No recipient email available")

    try:
        pdf_bytes = generate_invoice_pdf(invoice, items)
    except Exception as e:
        logger.exception("pdf_generator.failed invoice=%s", invoice.invoice_number)
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice PDF: {e}")

    ok = await send_invoice_email(
        invoice=invoice,
        pdf_bytes=pdf_bytes,
        to=str(recipient),
        custom_message=payload.message,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to send invoice email")

    return {"status": "sent", "to": str(recipient), "invoice_number": invoice.invoice_number}


@router.get("/stats/vendor")
async def vendor_invoice_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate invoice metrics for the current vendor's dashboard."""
    vendor = await _get_vendor_for_user(db, current_user)
    if not vendor and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Vendor account required")

    scope = Invoice.vendor_id == vendor.id if vendor else Invoice.vendor_id.is_not(None)

    # Totals by status
    status_q = await db.execute(
        select(Invoice.status, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total_amount), 0))
        .where(scope)
        .group_by(Invoice.status)
    )
    by_status: dict[str, dict] = {}
    total_invoiced = Decimal("0")
    total_count = 0
    for st, count, amount in status_q.all():
        by_status[st or "draft"] = {"count": int(count), "amount": _q(amount)}
        total_invoiced += _q(amount)
        total_count += int(count)

    # This month
    today = date.today()
    month_start = today.replace(day=1)
    month_q = await db.execute(
        select(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total_amount), 0))
        .where(scope)
        .where(Invoice.invoice_date >= month_start)
    )
    mc, ma = month_q.one()

    paid = by_status.get("paid", {"count": 0, "amount": Decimal("0")})
    issued = by_status.get("issued", {"count": 0, "amount": Decimal("0")})
    draft = by_status.get("draft", {"count": 0, "amount": Decimal("0")})

    return {
        "vendor_id": vendor.id if vendor else None,
        "total_count": total_count,
        "total_invoiced": _q(total_invoiced),
        "paid_count": paid["count"],
        "paid_amount": _q(paid["amount"]),
        "pending_count": issued["count"] + draft["count"],
        "pending_amount": _q(issued["amount"]) + _q(draft["amount"]),
        "this_month_count": int(mc or 0),
        "this_month_amount": _q(ma or 0),
        "by_status": {k: {"count": v["count"], "amount": str(_q(v["amount"]))} for k, v in by_status.items()},
    }
