"""
Material inventory API — vendor back-office.

Manages per-vendor stock of material sheets with movement logging and
low-stock alerts.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import get_current_admin
from app.core.database import get_db
from app.models import (
    Material,
    MaterialStock,
    StockMovement,
    User,
    Vendor,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------- Schemas ----------


class StockCreate(BaseModel):
    material_id: int
    thickness_mm: float
    sheet_width_mm: float
    sheet_height_mm: float
    quantity_sheets: int = 0
    cost_per_sheet: float = 0
    low_threshold: int = 5
    supplier: str = ""
    supplier_url: str = ""
    notes: str = ""


class StockUpdate(BaseModel):
    quantity_sheets: Optional[int] = None
    cost_per_sheet: Optional[float] = None
    low_threshold: Optional[int] = None
    supplier: Optional[str] = None
    supplier_url: Optional[str] = None
    notes: Optional[str] = None
    sheet_width_mm: Optional[float] = None
    sheet_height_mm: Optional[float] = None


class MovementCreate(BaseModel):
    delta: int
    reason: str = ""
    order_id: Optional[int] = None


class MovementResponse(BaseModel):
    id: int
    delta: int
    reason: str
    order_id: Optional[int] = None
    created_at: str


class StockResponse(BaseModel):
    id: int
    vendor_id: int
    material_id: int
    material_name: str
    thickness_mm: float
    sheet_width_mm: float
    sheet_height_mm: float
    quantity_sheets: int
    cost_per_sheet: float
    low_threshold: int
    supplier: str
    supplier_url: str
    notes: str
    is_low: bool
    updated_at: str


# ---------- Helpers ----------


async def _resolve_vendor_id(admin: User, db: AsyncSession) -> int:
    """Return the vendor.id for the calling admin User.

    ``get_current_admin`` already resolves and returns the authenticated User
    ORM object, so we look up the linked Vendor directly by ``admin.id``.

    If the caller is the platform admin (no Vendor row), use vendor_id=0 as a
    platform-owned inventory bucket so the endpoints still function.
    """
    if admin is not None:
        v = await db.execute(select(Vendor).where(Vendor.user_id == admin.id))
        vendor = v.scalar_one_or_none()
        if vendor:
            return vendor.id
    return 0  # platform/admin bucket


async def _serialize(stock: MaterialStock, db: AsyncSession) -> StockResponse:
    mat = await db.execute(select(Material).where(Material.id == stock.material_id))
    material = mat.scalar_one_or_none()
    return StockResponse(
        id=stock.id,
        vendor_id=stock.vendor_id,
        material_id=stock.material_id,
        material_name=material.name if material else "Unknown",
        thickness_mm=stock.thickness_mm,
        sheet_width_mm=stock.sheet_width_mm,
        sheet_height_mm=stock.sheet_height_mm,
        quantity_sheets=stock.quantity_sheets or 0,
        cost_per_sheet=stock.cost_per_sheet or 0,
        low_threshold=stock.low_threshold or 0,
        supplier=stock.supplier or "",
        supplier_url=stock.supplier_url or "",
        notes=stock.notes or "",
        is_low=(stock.quantity_sheets or 0) <= (stock.low_threshold or 0),
        updated_at=(stock.updated_at or stock.created_at).isoformat() if (stock.updated_at or stock.created_at) else "",
    )


# ---------- Endpoints ----------


@router.get("/", response_model=List[StockResponse])
async def list_stock(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """List this vendor's inventory lines."""
    vendor_id = await _resolve_vendor_id(admin, db)
    result = await db.execute(
        select(MaterialStock)
        .where(MaterialStock.vendor_id == vendor_id)
        .order_by(desc(MaterialStock.updated_at))
    )
    items = result.scalars().all()
    return [await _serialize(s, db) for s in items]


@router.post("/", response_model=StockResponse)
async def create_stock(
    data: StockCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    vendor_id = await _resolve_vendor_id(admin, db)
    mat = await db.execute(select(Material).where(Material.id == data.material_id))
    if not mat.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Material not found")

    stock = MaterialStock(vendor_id=vendor_id, **data.model_dump())
    db.add(stock)
    await db.commit()
    await db.refresh(stock)

    # Initial stock movement
    if stock.quantity_sheets:
        db.add(StockMovement(stock_id=stock.id, delta=stock.quantity_sheets, reason="initial"))
        await db.commit()

    return await _serialize(stock, db)


@router.get("/alerts", response_model=List[StockResponse])
async def list_low_stock(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Return all inventory items at or below their low_threshold."""
    vendor_id = await _resolve_vendor_id(admin, db)
    result = await db.execute(
        select(MaterialStock).where(
            MaterialStock.vendor_id == vendor_id,
            MaterialStock.quantity_sheets <= MaterialStock.low_threshold,
        )
    )
    items = result.scalars().all()
    return [await _serialize(s, db) for s in items]


@router.put("/{stock_id}", response_model=StockResponse)
async def update_stock(
    stock_id: int,
    data: StockUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    vendor_id = await _resolve_vendor_id(admin, db)
    result = await db.execute(
        select(MaterialStock).where(
            MaterialStock.id == stock_id, MaterialStock.vendor_id == vendor_id
        )
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    patch = data.model_dump(exclude_unset=True)
    prev_qty = stock.quantity_sheets or 0
    for k, v in patch.items():
        setattr(stock, k, v)
    await db.commit()
    await db.refresh(stock)

    # Log movement if quantity_sheets was explicitly set
    if "quantity_sheets" in patch and (stock.quantity_sheets or 0) != prev_qty:
        db.add(
            StockMovement(
                stock_id=stock.id,
                delta=(stock.quantity_sheets or 0) - prev_qty,
                reason="manual adjustment",
            )
        )
        await db.commit()

    return await _serialize(stock, db)


@router.delete("/{stock_id}")
async def delete_stock(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    vendor_id = await _resolve_vendor_id(admin, db)
    result = await db.execute(
        select(MaterialStock).where(
            MaterialStock.id == stock_id, MaterialStock.vendor_id == vendor_id
        )
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    await db.delete(stock)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{stock_id}/movement", response_model=StockResponse)
async def create_movement(
    stock_id: int,
    data: MovementCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Adjust stock quantity and log a movement entry."""
    vendor_id = await _resolve_vendor_id(admin, db)
    result = await db.execute(
        select(MaterialStock).where(
            MaterialStock.id == stock_id, MaterialStock.vendor_id == vendor_id
        )
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    stock.quantity_sheets = max(0, (stock.quantity_sheets or 0) + data.delta)
    db.add(
        StockMovement(
            stock_id=stock.id,
            delta=data.delta,
            reason=data.reason,
            order_id=data.order_id,
        )
    )
    await db.commit()
    await db.refresh(stock)
    return await _serialize(stock, db)


@router.get("/{stock_id}/movements", response_model=List[MovementResponse])
async def list_movements(
    stock_id: int,
    limit: int = 25,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    vendor_id = await _resolve_vendor_id(admin, db)
    s_result = await db.execute(
        select(MaterialStock).where(
            MaterialStock.id == stock_id, MaterialStock.vendor_id == vendor_id
        )
    )
    if not s_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Stock not found")

    m_result = await db.execute(
        select(StockMovement)
        .where(StockMovement.stock_id == stock_id)
        .order_by(desc(StockMovement.created_at))
        .limit(limit)
    )
    movements = m_result.scalars().all()
    return [
        MovementResponse(
            id=m.id,
            delta=m.delta,
            reason=m.reason or "",
            order_id=m.order_id,
            created_at=m.created_at.isoformat() if m.created_at else "",
        )
        for m in movements
    ]
