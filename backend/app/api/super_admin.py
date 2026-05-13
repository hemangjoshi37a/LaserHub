"""
Super Admin API endpoints — platform-owner-only access.

Only the user whose email matches settings.SUPER_ADMIN_EMAIL can call
these endpoints. This is distinct from the shop/order admin panel.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models import Design, DesignLike, DesignListing, Material, Order, UploadedFile, User, Vendor, VendorOrder

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ---------------------------------------------------------------------------
# Dependency: super-admin gate
# ---------------------------------------------------------------------------

async def get_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Only the platform owner (SUPER_ADMIN_EMAIL) or users with super_admin role may proceed."""
    # Allow if email matches SUPER_ADMIN_EMAIL OR if user has super_admin role OR is_admin flag
    is_sa_email = current_user.email == settings.SUPER_ADMIN_EMAIL
    is_sa_role = current_user.role == "super_admin"
    is_admin_flag = getattr(current_user, "is_admin", False)

    if not (is_sa_email or is_sa_role or is_admin_flag):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access only",
        )
    return current_user


# ---------------------------------------------------------------------------
# Pydantic schemas (kept local — these are super-admin specific)
# ---------------------------------------------------------------------------

class SAUserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_verified: bool
    created_at: datetime
    order_count: int = 0

    model_config = {"from_attributes": True}


class RoleUpdate(BaseModel):
    role: str  # customer | vendor | admin


class VerifyUpdate(BaseModel):
    is_verified: bool


class SAVendorOut(BaseModel):
    id: int
    user_id: int
    shop_name: str
    slug: str
    description: Optional[str] = None
    location: Optional[str] = None
    rating: float = 0.0
    total_orders: int = 0
    is_verified: bool = False
    is_active: bool = True
    created_at: datetime
    owner_email: str = ""
    owner_name: str = ""

    model_config = {"from_attributes": True}


class VendorApproval(BaseModel):
    is_verified: bool


class SAStats(BaseModel):
    total_users: int
    total_vendors: int
    total_orders: int
    total_revenue: float
    users_this_month: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[SAUserOut])
async def list_users(
    role: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """List all users with order counts. Filterable by role and email/name search."""
    # Sub-query for order count per user
    order_count_sq = (
        select(
            Order.user_id,
            func.count(Order.id).label("order_count"),
        )
        .group_by(Order.user_id)
        .subquery()
    )

    query = (
        select(
            User,
            func.coalesce(order_count_sq.c.order_count, 0).label("order_count"),
        )
        .outerjoin(order_count_sq, User.id == order_count_sq.c.user_id)
        .order_by(desc(User.created_at))
    )

    if role:
        query = query.where(User.role == role)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            User.email.ilike(pattern) | User.name.ilike(pattern)
        )

    result = await db.execute(query)
    rows = result.all()

    return [
        SAUserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role or "customer",
            is_verified=user.is_verified,
            created_at=user.created_at,
            order_count=order_count,
        )
        for user, order_count in rows
    ]


@router.put("/users/{user_id}/role", response_model=SAUserOut)
async def update_user_role(
    user_id: int,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Change a user's role. Creates/deactivates Vendor record as needed."""
    allowed_roles = {"customer", "vendor", "super_admin"}
    if body.role not in allowed_roles:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(allowed_roles))}")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    old_role = user.role
    user.role = body.role

    # Promote to vendor: ensure Vendor record exists
    if body.role == "vendor" and old_role != "vendor":
        vendor_result = await db.execute(select(Vendor).where(Vendor.user_id == user_id))
        vendor = vendor_result.scalar_one_or_none()
        if not vendor:
            slug = user.name.lower().replace(" ", "-") + f"-{user.id}"
            vendor = Vendor(
                user_id=user.id,
                shop_name=f"{user.name}'s Shop",
                slug=slug,
                is_verified=False,
                is_active=True,
            )
            db.add(vendor)
        else:
            vendor.is_active = True

    # Demote from vendor: deactivate Vendor record
    if old_role == "vendor" and body.role != "vendor":
        vendor_result = await db.execute(select(Vendor).where(Vendor.user_id == user_id))
        vendor = vendor_result.scalar_one_or_none()
        if vendor:
            vendor.is_active = False

    await db.commit()
    await db.refresh(user)

    # Get order count
    oc_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == user_id)
    )
    order_count = oc_result.scalar() or 0

    return SAUserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role or "customer",
        is_verified=user.is_verified,
        created_at=user.created_at,
        order_count=order_count,
    )


@router.put("/users/{user_id}/verify", response_model=SAUserOut)
async def toggle_user_verification(
    user_id: int,
    body: VerifyUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Toggle a user's email-verification status."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.is_verified = body.is_verified
    await db.commit()
    await db.refresh(user)

    oc_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == user_id)
    )
    order_count = oc_result.scalar() or 0

    return SAUserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role or "customer",
        is_verified=user.is_verified,
        created_at=user.created_at,
        order_count=order_count,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Delete a user. Prevents deleting the super admin account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    if user.email == settings.SUPER_ADMIN_EMAIL:
        raise HTTPException(400, "Cannot delete the super admin account")

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    return {"detail": "User deleted"}


@router.get("/stats", response_model=SAStats)
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """High-level platform statistics."""
    total_users_r = await db.execute(select(func.count(User.id)))
    total_users = total_users_r.scalar() or 0

    total_vendors_r = await db.execute(
        select(func.count(Vendor.id)).where(Vendor.is_active == True)  # noqa: E712
    )
    total_vendors = total_vendors_r.scalar() or 0

    total_orders_r = await db.execute(select(func.count(Order.id)))
    total_orders = total_orders_r.scalar() or 0

    revenue_r = await db.execute(
        select(func.sum(Order.total_amount)).where(Order.status != "cancelled")
    )
    total_revenue = revenue_r.scalar() or 0.0

    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    users_month_r = await db.execute(
        select(func.count(User.id)).where(User.created_at >= month_start)
    )
    users_this_month = users_month_r.scalar() or 0

    return SAStats(
        total_users=total_users,
        total_vendors=total_vendors,
        total_orders=total_orders,
        total_revenue=total_revenue,
        users_this_month=users_this_month,
    )


@router.get("/vendors", response_model=List[SAVendorOut])
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """List all vendors with their owner info."""
    result = await db.execute(
        select(Vendor, User)
        .join(User, Vendor.user_id == User.id)
        .order_by(desc(Vendor.created_at))
    )
    rows = result.all()

    return [
        SAVendorOut(
            id=vendor.id,
            user_id=vendor.user_id,
            shop_name=vendor.shop_name,
            slug=vendor.slug,
            description=vendor.description,
            location=vendor.location,
            rating=vendor.rating,
            total_orders=vendor.total_orders,
            is_verified=vendor.is_verified,
            is_active=vendor.is_active,
            created_at=vendor.created_at,
            owner_email=user.email,
            owner_name=user.name,
        )
        for vendor, user in rows
    ]


@router.put("/vendors/{vendor_id}/approve", response_model=SAVendorOut)
async def approve_vendor(
    vendor_id: int,
    body: VendorApproval,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Approve or reject a vendor."""
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(404, "Vendor not found")

    vendor.is_verified = body.is_verified
    await db.commit()
    await db.refresh(vendor)

    user_result = await db.execute(select(User).where(User.id == vendor.user_id))
    user = user_result.scalar_one_or_none()

    return SAVendorOut(
        id=vendor.id,
        user_id=vendor.user_id,
        shop_name=vendor.shop_name,
        slug=vendor.slug,
        description=vendor.description,
        location=vendor.location,
        rating=vendor.rating,
        total_orders=vendor.total_orders,
        is_verified=vendor.is_verified,
        is_active=vendor.is_active,
        created_at=vendor.created_at,
        owner_email=user.email if user else "",
        owner_name=user.name if user else "",
    )


# ---------------------------------------------------------------------------
# Design management schemas
# ---------------------------------------------------------------------------

class SADesignOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str = "other"
    tags: List[str] = []
    is_public: bool = False
    is_featured: bool = False
    thumbnail_url: Optional[str] = None
    creator_name: str = ""
    likes_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class SADesignCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "other"
    tags: List[str] = []
    thumbnail_url: Optional[str] = None
    is_public: bool = False
    is_featured: bool = False


class SADesignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_featured: Optional[bool] = None
    thumbnail_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Design endpoints
# ---------------------------------------------------------------------------

def _design_to_out(design: "Design", creator_name: str = "") -> SADesignOut:
    """Convert a Design ORM object to an SADesignOut schema."""
    import json as _json

    tags: List[str] = []
    if design.tags:
        try:
            tags = _json.loads(design.tags)
        except (ValueError, TypeError):
            tags = []

    return SADesignOut(
        id=design.id,
        title=design.title,
        description=design.description,
        category=design.category or "other",
        tags=tags,
        is_public=design.is_public,
        is_featured=design.is_featured,
        thumbnail_url=design.thumbnail_url,
        creator_name=creator_name,
        likes_count=design.likes_count or 0,
        created_at=design.created_at,
    )


@router.get("/designs", response_model=List[SADesignOut])
async def list_designs(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """List ALL designs (public and private) for super admin management."""
    result = await db.execute(
        select(Design, User)
        .outerjoin(User, Design.creator_id == User.id)
        .order_by(desc(Design.created_at))
    )
    rows = result.all()

    return [
        _design_to_out(design, creator_name=user.name if user else "")
        for design, user in rows
    ]


@router.post("/designs", response_model=SADesignOut, status_code=status.HTTP_201_CREATED)
async def create_design(
    body: SADesignCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_super_admin),
):
    """Create a new design directly (without uploading a file)."""
    import json as _json

    design = Design(
        creator_id=admin.id,
        title=body.title,
        description=body.description,
        category=body.category,
        tags=_json.dumps(body.tags) if body.tags else None,
        thumbnail_url=body.thumbnail_url,
        is_public=body.is_public,
        is_featured=body.is_featured,
    )
    db.add(design)
    await db.commit()
    await db.refresh(design)

    return _design_to_out(design, creator_name=admin.name)


@router.put("/designs/{design_id}", response_model=SADesignOut)
async def update_design(
    design_id: int,
    body: SADesignUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Update a design's editable fields."""
    import json as _json

    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")

    if body.title is not None:
        design.title = body.title
    if body.description is not None:
        design.description = body.description
    if body.category is not None:
        design.category = body.category
    if body.tags is not None:
        design.tags = _json.dumps(body.tags)
    if body.is_public is not None:
        design.is_public = body.is_public
    if body.is_featured is not None:
        design.is_featured = body.is_featured
    if body.thumbnail_url is not None:
        design.thumbnail_url = body.thumbnail_url

    await db.commit()
    await db.refresh(design)

    # Fetch creator name
    creator_name = ""
    if design.creator_id:
        user_result = await db.execute(select(User).where(User.id == design.creator_id))
        creator = user_result.scalar_one_or_none()
        if creator:
            creator_name = creator.name

    return _design_to_out(design, creator_name=creator_name)


@router.delete("/designs/{design_id}")
async def delete_design(
    design_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """Delete a design and its associated listings and likes."""
    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")

    # Delete associated likes
    await db.execute(delete(DesignLike).where(DesignLike.design_id == design_id))
    # Delete associated listings
    await db.execute(delete(DesignListing).where(DesignListing.design_id == design_id))
    # Delete the design itself
    await db.execute(delete(Design).where(Design.id == design_id))

    await db.commit()
    return {"detail": "Design deleted"}


# ---------------------------------------------------------------------------
# Orders endpoint (platform-wide with customer + vendor info)
# ---------------------------------------------------------------------------

class SAOrderOut(BaseModel):
    id: int
    order_number: str
    file_id: str
    material_name: str
    thickness_mm: float
    quantity: int
    total_amount: float
    status: str
    customer_email: str
    customer_name: str
    vendor_name: Optional[str] = None
    shipping_address: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


@router.get("/orders", response_model=List[SAOrderOut])
async def list_orders(
    status_filter: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_super_admin),
):
    """List all orders with customer and vendor info for super admin."""
    query = (
        select(Order)
        .options(
            selectinload(Order.material),
            selectinload(Order.uploaded_file),
            selectinload(Order.vendor_order).selectinload(VendorOrder.vendor)
        )
        .order_by(desc(Order.created_at))
    )
    if status_filter:
        query = query.where(Order.status == status_filter)

    result = await db.execute(query)
    orders = result.scalars().all()

    out: List[SAOrderOut] = []
    for order in orders:
        material = order.material
        uploaded_file = order.uploaded_file

        vendor_name: Optional[str] = None
        if order.vendor_order:
            # SQLAlchemy backref makes vendor_order a list
            vo = order.vendor_order[0] if isinstance(order.vendor_order, list) else order.vendor_order
            if vo and vo.vendor:
                vendor_name = vo.vendor.shop_name

        out.append(SAOrderOut(
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
            vendor_name=vendor_name,
            shipping_address=order.shipping_address,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))

    return out
