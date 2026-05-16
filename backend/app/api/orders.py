"""
Orders API endpoints
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.api.auth import get_current_user
from app.models import Material, Order, UploadedFile, User, VendorOrder, Vendor
from app.schemas import OrderCreate, OrderResponse, SamplePackOrderRequest

router = APIRouter()


# Optional auth — orders can be placed as guest; if a JWT is present we link the user
_optional_bearer = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def generate_order_number() -> str:
    """Generate unique order number"""
    timestamp = datetime.now().strftime("%Y%m%d")
    unique_id = str(uuid.uuid4())[:8].upper()
    return f"ORD-{timestamp}-{unique_id}"


@router.post("/", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new order
    """
    current_user_id = current_user.id

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
        user_id=current_user_id,
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

    # Create VendorOrder linkage if vendor_id was provided (e.g. from custom upload with vendor selection)
    if order_data.vendor_id:
        vendor_order = VendorOrder(
            order_id=order.id,
            vendor_id=order_data.vendor_id,
            status="pending"
        )
        db.add(vendor_order)
        await db.commit()
    
    # Check for linked vendor order (either newly created above or via other logic)
    vendor_order_result = await db.execute(
        select(VendorOrder).where(VendorOrder.order_id == order.id)
    )
    vendor_order = vendor_order_result.scalar_one_or_none()
    vendor = None
    if vendor_order:
        vendor_result = await db.execute(
            select(Vendor).where(Vendor.id == vendor_order.vendor_id)
        )
        vendor = vendor_result.scalar_one_or_none()
        if vendor:
            vendor.total_orders = (vendor.total_orders or 0) + 1
            await db.commit()

    # Notify the placing customer (if logged in) that their order was received
    if current_user_id:
        from app.api.notifications import send_push_notification_bg
        background_tasks.add_task(
            send_push_notification_bg,
            current_user_id,
            "Order Received",
            f"Your order {order.order_number} has been placed successfully!",
            "/profile",
        )

    # Notify the assigned vendor (if any) that a new order needs their attention
    if vendor_order and vendor and vendor.user_id:
        from app.api.notifications import send_push_notification_bg
        customer_label = order.customer_name or order.customer_email or "A customer"
        background_tasks.add_task(
            send_push_notification_bg,
            vendor.user_id,
            "New Order",
            f"{customer_label} placed order {order.order_number} ({material.name} · {order.thickness_mm}mm × {order.quantity}).",
            "/admin/orders",
        )

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
        guest_tracking_token=order.guest_tracking_token,
    )


@router.post("/sample-pack", response_model=OrderResponse)
async def create_sample_pack_order(
    order_data: SamplePackOrderRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a sample pack order.
    Creates placeholder material/file if missing.
    """
    # 1. Ensure "Sample Pack" material exists
    result = await db.execute(select(Material).where(Material.name == "Sample Pack"))
    material = result.scalar_one_or_none()
    if not material:
        material = Material(
            name="Sample Pack",
            type="acrylic", # dummy
            rate_per_cm2_mm=0,
            available_thicknesses_raw="[3]",
            description="Selection of material swatches",
            is_active=True
        )
        db.add(material)
        await db.flush()

    # 2. Ensure placeholder "Sample Pack" file exists
    result = await db.execute(select(UploadedFile).where(UploadedFile.filename == "sample_pack_placeholder"))
    uploaded_file = result.scalar_one_or_none()
    if not uploaded_file:
        uploaded_file = UploadedFile(
            file_id="sample-pack-id",
            filename="sample_pack_placeholder",
            file_path="n/a",
            file_size=0,
            file_type="placeholder",
            width_mm=0,
            height_mm=0,
            area_cm2=0,
            cut_length_mm=0,
        )
        db.add(uploaded_file)
        await db.flush()

    # 3. Create Order
    order = Order(
        order_number=generate_order_number(),
        user_id=current_user.id if current_user else None,
        file_id=uploaded_file.id,
        material_id=material.id,
        thickness_mm=3.0,
        quantity=1,
        material_cost=order_data.amount,
        laser_time_cost=0,
        energy_cost=0,
        setup_fee=0,
        total_amount=order_data.amount,
        customer_email=order_data.customer_email,
        customer_name=order_data.customer_name,
        shipping_address=order_data.shipping_address,
        status="paid", # Samples are usually auto-paid/demo-paid in this context
        payment_status="paid",
    )

    db.add(order)
    await db.commit()
    await db.refresh(order)

    # 4. Notify (Mock)
    if current_user:
        from app.api.notifications import send_push_notification_bg
        background_tasks.add_task(
            send_push_notification_bg,
            current_user.id,
            "Sample Pack Ordered",
            f"Your sample pack order {order.order_number} has been received!",
            "/dashboard",
        )

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=uploaded_file.file_id,
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



# ---------------------------------------------------------------------------
# One-click reorder — clones an existing order for the same user
# ---------------------------------------------------------------------------

@router.post("/{order_id}/reorder", response_model=OrderResponse)
async def reorder_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    token: str = Depends(_optional_bearer),
):
    """Clone an existing order (same file/material/thickness/qty) with fresh
    order_number + pending status. Requires auth.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_result = await db.execute(select(User).where(User.email == email))
    db_user = user_result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=401, detail="User not found")

    # Fetch original order
    result = await db.execute(select(Order).where(Order.id == order_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Order not found")
    if original.user_id != db_user.id:
        raise HTTPException(status_code=403, detail="Not your order")

    new_order = Order(
        order_number=generate_order_number(),
        user_id=db_user.id,
        file_id=original.file_id,
        material_id=original.material_id,
        thickness_mm=original.thickness_mm,
        quantity=original.quantity,
        material_cost=original.material_cost,
        laser_time_cost=original.laser_time_cost,
        energy_cost=original.energy_cost,
        setup_fee=original.setup_fee,
        total_amount=original.total_amount,
        customer_email=original.customer_email,
        customer_name=original.customer_name,
        shipping_address=original.shipping_address,
        status="pending",
        payment_status="pending",
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)

    # Resolve material + file for response
    mat_result = await db.execute(select(Material).where(Material.id == new_order.material_id))
    material = mat_result.scalar_one_or_none()
    file_result = await db.execute(select(UploadedFile).where(UploadedFile.id == new_order.file_id))
    uploaded_file = file_result.scalar_one_or_none()

    return OrderResponse(
        id=new_order.id,
        order_number=new_order.order_number,
        file_id=uploaded_file.file_id if uploaded_file else str(new_order.file_id),
        material_name=material.name if material else "Unknown",
        thickness_mm=new_order.thickness_mm,
        quantity=new_order.quantity,
        total_amount=new_order.total_amount,
        status=new_order.status,
        customer_email=new_order.customer_email,
        customer_name=new_order.customer_name,
        shipping_address=new_order.shipping_address,
        created_at=new_order.created_at,
        updated_at=new_order.updated_at,
        guest_tracking_token=None,
    )


# ---------------------------------------------------------------------------
# Guest order tracking — fetch order by UUID token without auth
# ---------------------------------------------------------------------------

@router.get("/guest/{tracking_token}", response_model=OrderResponse)
async def get_guest_order(tracking_token: str, db: AsyncSession = Depends(get_db)):
    """Fetch order by guest tracking token (no auth required)."""
    result = await db.execute(
        select(Order).where(Order.guest_tracking_token == tracking_token)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    mat_result = await db.execute(select(Material).where(Material.id == order.material_id))
    material = mat_result.scalar_one_or_none()
    file_result = await db.execute(select(UploadedFile).where(UploadedFile.id == order.file_id))
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
        guest_tracking_token=order.guest_tracking_token,
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


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List orders (paginated)"""
    # PERF-DB-01: eager-load material + uploaded_file to avoid N+1 per-row queries
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.material),
            selectinload(Order.uploaded_file),
        )
        .order_by(desc(Order.created_at))
        .offset(offset)
        .limit(limit)
    )
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
