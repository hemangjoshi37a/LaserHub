"""
Admin API endpoints
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import List

from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models import Order, User, Material
from app.schemas import (
    AdminLogin,
    AdminToken,
    OrderResponse,
    OrderUpdate,
    DashboardStats,
    OrderStatus,
)

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


async def get_current_admin(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """Get current admin user from token"""
    # For simplicity, we're using a basic token validation
    # In production, implement proper JWT validation
    from jose import jwt
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        
        if email != settings.ADMIN_EMAIL:
            raise HTTPException(status_code=401, detail="Not authorized")
        
        return email
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/login", response_model=AdminToken)
async def admin_login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Admin login endpoint
    """
    # Check credentials
    if form_data.username != settings.ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    # For initial setup, use plain password comparison
    # In production, use hashed passwords from database
    if form_data.password != settings.ADMIN_PASSWORD:
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
    
    # Total revenue
    revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(Order.payment_status == "paid")
    )
    total_revenue = revenue_result.scalar() or 0
    
    # Monthly revenue
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(
            Order.payment_status == "paid",
            Order.created_at >= month_start
        )
    )
    monthly_revenue = monthly_revenue_result.scalar() or 0
    
    # Recent orders
    recent_orders_result = await db.execute(
        select(Order).order_by(desc(Order.created_at)).limit(10)
    )
    recent_orders = recent_orders_result.scalars().all()
    
    recent_order_responses = []
    for order in recent_orders:
        material_result = await db.execute(
            select(Material).where(Material.id == order.material_id)
        )
        material = material_result.scalar_one_or_none()
        
        recent_order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=str(order.file_id),
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
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """List all orders (admin only)"""
    query = select(Order).order_by(desc(Order.created_at)).limit(limit)
    
    if status_filter:
        query = query.where(Order.status == status_filter)
    
    result = await db.execute(query)
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
            file_id=str(order.file_id),
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
    
    material_result = await db.execute(
        select(Material).where(Material.id == order.material_id)
    )
    material = material_result.scalar_one_or_none()
    
    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=str(order.file_id),
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


@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    update_data: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """Update order status (admin only)"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update fields
    if update_data.status:
        order.status = update_data.status.value
    if update_data.notes:
        order.notes = update_data.notes
    
    order.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(order)
    
    material_result = await db.execute(
        select(Material).where(Material.id == order.material_id)
    )
    material = material_result.scalar_one_or_none()
    
    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        file_id=str(order.file_id),
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
