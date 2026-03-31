"""
Orders API endpoints
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Material, Order, UploadedFile
from app.schemas import OrderCreate, OrderResponse

router = APIRouter()


def generate_order_number() -> str:
    """Generate unique order number"""
    timestamp = datetime.now().strftime("%Y%m%d")
    unique_id = str(uuid.uuid4())[:8].upper()
    return f"ORD-{timestamp}-{unique_id}"


@router.post("/", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new order
    """
    # Verify file exists
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == order_data.file_id)
    )
    uploaded_file = result.scalar_one_or_none()

    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Verify material exists
    result = await db.execute(
        select(Material).where(Material.id == order_data.material_id)
    )
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Calculate costs
    from app.services.cost_calculator import calculate_total_cost

    cost_data = calculate_total_cost(
        area_cm2=uploaded_file.area_cm2 or 0,
        cut_length_mm=uploaded_file.cut_length_mm or 0,
        thickness_mm=order_data.thickness_mm,
        material_rate=material.rate_per_cm2_mm,
        quantity=order_data.quantity,
    )

    # Create order
    order = Order(
        order_number=generate_order_number(),
        file_id=uploaded_file.id,
        material_id=material.id,
        thickness_mm=order_data.thickness_mm,
        quantity=order_data.quantity,
        material_cost=cost_data["material_cost"],
        laser_time_cost=cost_data["laser_time_cost"],
        energy_cost=cost_data["energy_cost"],
        setup_fee=cost_data["setup_fee"],
        total_amount=order_data.total_amount,
        customer_email=order_data.customer_email,
        customer_name=order_data.customer_name,
        shipping_address=order_data.shipping_address,
        status="pending",
    )

    db.add(order)
    await db.commit()
    await db.refresh(order)

    # Return order with material name
    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=order_data.file_id,
        material_name=material.name,
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


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """Get order details"""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Get material name
    material_result = await db.execute(
        select(Material).where(Material.id == order.material_id)
    )
    material = material_result.scalar_one_or_none()

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=order.file_id,
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


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List orders (paginated)"""
    result = await db.execute(
        select(Order)
        .order_by(desc(Order.created_at))
        .offset(offset)
        .limit(limit)
    )
    orders = result.scalars().all()

    order_responses = []
    for order in orders:
        material_result = await db.execute(
            select(Material).where(Material.id == order.material_id)
        )
        material = material_result.scalar_one_or_none()

        order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=order.file_id,
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
