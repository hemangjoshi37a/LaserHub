"""
Vendor API endpoints for marketplace
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.security import decode_access_token
from app.api.auth import get_current_user
from app.models import User, Vendor, VendorMaterial, Material, VendorOrder, Order
from app.schemas import (
    VendorCreate, VendorUpdate, VendorResponse,
    VendorMaterialCreate, VendorMaterialResponse,
)


# Vendor asset storage (profile images, GST cert, etc.)
VENDOR_ASSETS_DIR = Path(__file__).parent.parent.parent / "uploads" / "vendor-assets"
VENDOR_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

_ASSET_TYPE_TO_COLUMN = {
    "logo": "logo_url",
    "storefront": "storefront_image_url",
    "gst": "gst_certificate_url",
    "banner": "banner_url",
}
_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
_IMAGE_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_MAX_PDF_BYTES = 10 * 1024 * 1024


class TagsUpdate(BaseModel):
    tags: List[str]


router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def slugify(text: str) -> str:
    """Generate URL-friendly slug"""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text[:64]


async def get_current_vendor(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Vendor:
    """Get current vendor from JWT token.
    Ensures user has 'vendor' role and a valid vendor profile.
    """
    payload = decode_access_token(token)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.role != "vendor" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Vendor role required")

    result = await db.execute(select(Vendor).where(Vendor.user_id == user.id))
    vendor = result.scalar_one_or_none()
    
    if not vendor:
        # Auto-create a minimal vendor profile for admins so they can use vendor dashboard tools
        # without manually going through the marketplace registration flow.
        if user.is_admin or user.role == "super_admin":
            shop_name = f"{user.name or 'Admin'} Shop"
            slug = slugify(shop_name)
            
            # Ensure slug uniqueness
            s_res = await db.execute(select(Vendor).where(Vendor.slug == slug))
            if s_res.scalar_one_or_none():
                slug = f"{slug}-{user.id}"
                
            vendor = Vendor(
                user_id=user.id,
                shop_name=shop_name,
                slug=slug,
                is_active=True,
                is_verified=True,
                description="Platform admin profile",
            )
            db.add(vendor)
            await db.commit()
            await db.refresh(vendor)
            return vendor
            
        raise HTTPException(status_code=403, detail="Vendor profile not initialized")

    return vendor


# === Vendor Registration & Profile ===

@router.post("/register", response_model=VendorResponse)
async def register_vendor(
    vendor_data: VendorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Register the authenticated user as a vendor.

    The user_id is derived from the JWT — never accepted from the client.
    """
    # Check user isn't already a vendor
    existing = await db.execute(select(Vendor).where(Vendor.user_id == current_user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already registered as vendor")

    # Check shop name uniqueness
    slug = slugify(vendor_data.shop_name)
    result = await db.execute(select(Vendor).where(Vendor.slug == slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shop name already taken")

    vendor = Vendor(
        user_id=current_user.id,
        shop_name=vendor_data.shop_name,
        slug=slug,
        description=vendor_data.description,
        website=vendor_data.website,
        location=vendor_data.location,
    )

    # Promote user to vendor role
    current_user.role = "vendor"

    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return _vendor_to_response(vendor)


@router.get("/", response_model=List[VendorResponse])
async def list_vendors(
    location: Optional[str] = None,
    q: Optional[str] = None,
    sort_by: str = "rating",
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List all active vendors, with optional full-text search via ?q="""
    query = select(Vendor).where(Vendor.is_active == True)

    if location:
        query = query.where(Vendor.location.ilike(f"%{location}%"))

    if q:
        term = f"%{q}%"
        query = query.where(
            or_(
                func.lower(Vendor.shop_name).contains(func.lower(q)),
                Vendor.shop_name.ilike(term),
                Vendor.description.ilike(term),
                Vendor.location.ilike(term),
            )
        )

    if sort_by == "rating":
        query = query.order_by(Vendor.rating.desc())
    elif sort_by == "orders":
        query = query.order_by(Vendor.total_orders.desc())
    elif sort_by == "newest":
        query = query.order_by(Vendor.created_at.desc())

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    vendors = result.scalars().all()
    return [_vendor_to_response(v) for v in vendors]


@router.get("/{slug}", response_model=VendorResponse)
async def get_vendor(slug: str, db: AsyncSession = Depends(get_db)):
    """Get vendor profile by slug"""
    result = await db.execute(select(Vendor).where(Vendor.slug == slug))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return _vendor_to_response(vendor)


@router.put("/profile", response_model=VendorResponse)
async def update_vendor_profile(
    update_data: VendorUpdate,
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """Update vendor profile"""
    for field, value in update_data.model_dump(exclude_unset=True).items():
        if field == "shop_name" and value:
            vendor.slug = slugify(value)
            setattr(vendor, field, value)
        elif field == "specialties" and value is not None:
            # Store specialties as JSON string
            vendor.specialties = json.dumps(value)
        else:
            setattr(vendor, field, value)

    await db.commit()
    await db.refresh(vendor)
    return _vendor_to_response(vendor)


@router.post("/profile/upload-asset")
async def upload_vendor_asset(
    file: UploadFile = File(...),
    asset_type: str = Form(...),
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db),
):
    """Upload a vendor profile asset (logo, storefront, gst, banner)."""
    if asset_type not in _ASSET_TYPE_TO_COLUMN:
        raise HTTPException(
            status_code=400,
            detail=f"asset_type must be one of: {sorted(_ASSET_TYPE_TO_COLUMN)}",
        )

    mime = (file.content_type or "").lower()
    is_pdf = mime == "application/pdf"
    if asset_type == "gst":
        if mime not in _IMAGE_MIMES and not is_pdf:
            raise HTTPException(status_code=400, detail="GST must be JPEG, PNG, WebP, or PDF")
    else:
        if mime not in _IMAGE_MIMES:
            raise HTTPException(status_code=400, detail="File must be JPEG, PNG, or WebP")

    max_bytes = _MAX_PDF_BYTES if is_pdf else _MAX_IMAGE_BYTES
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {max_bytes // (1024 * 1024)} MB)",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = _IMAGE_EXT.get(mime, "bin")
    vendor_dir = VENDOR_ASSETS_DIR / str(vendor.id)
    vendor_dir.mkdir(parents=True, exist_ok=True)

    # Remove any previous file for this asset_type to avoid orphans
    for old in vendor_dir.glob(f"{asset_type}-*"):
        try:
            old.unlink()
        except OSError:
            pass

    filename = f"{asset_type}-{int(time.time())}.{ext}"
    dest = vendor_dir / filename
    dest.write_bytes(content)

    url = f"/uploads/vendor-assets/{vendor.id}/{filename}"
    column = _ASSET_TYPE_TO_COLUMN[asset_type]
    setattr(vendor, column, url)
    await db.commit()

    return {"url": url, "asset_type": asset_type}


class GMBSyncRequest(BaseModel):
    place_id: str


@router.post("/profile/sync-gmb", response_model=VendorResponse)
async def sync_vendor_gmb(
    body: GMBSyncRequest,
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db),
):
    """Sync Google My Business data into the vendor's cached gmb_* columns."""
    place_id = (body.place_id or "").strip()
    if not place_id:
        raise HTTPException(status_code=400, detail="place_id is required")

    api_key = settings.GOOGLE_PLACES_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=422,
            detail="Google Places API key not configured; vendor GMB fields can be edited manually via /vendor/profile",
        )

    fields = "name,formatted_phone_number,international_phone_number,formatted_address,website,rating,user_ratings_total,url"
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {"place_id": place_id, "fields": fields, "key": api_key}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Google Places request failed: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Google Places HTTP {resp.status_code}")

    payload = resp.json()
    g_status = payload.get("status")
    if g_status != "OK":
        msg = payload.get("error_message") or g_status or "Unknown Google Places error"
        raise HTTPException(status_code=400, detail=f"Google Places: {msg}")

    result = payload.get("result") or {}
    vendor.gmb_place_id = place_id
    vendor.gmb_name = result.get("name")
    vendor.gmb_phone = (
        result.get("international_phone_number") or result.get("formatted_phone_number")
    )
    vendor.gmb_address = result.get("formatted_address")
    vendor.gmb_website = result.get("website")
    vendor.gmb_rating = result.get("rating")
    vendor.gmb_review_count = result.get("user_ratings_total")
    vendor.gmb_maps_url = result.get("url")
    vendor.gmb_last_synced = datetime.utcnow()

    await db.commit()
    await db.refresh(vendor)
    return _vendor_to_response(vendor)


def _vendor_to_response(vendor: Vendor) -> VendorResponse:
    """Convert vendor ORM to response, parsing JSON specialties"""
    specialties = []
    if vendor.specialties:
        try:
            specialties = json.loads(vendor.specialties)
        except (json.JSONDecodeError, TypeError):
            specialties = []
    return VendorResponse(
        id=vendor.id,
        shop_name=vendor.shop_name,
        slug=vendor.slug,
        description=vendor.description,
        logo_url=vendor.logo_url,
        banner_url=vendor.banner_url,
        website=vendor.website,
        location=vendor.location,
        rating=vendor.rating,
        total_reviews=vendor.total_reviews,
        total_orders=vendor.total_orders,
        is_verified=vendor.is_verified,
        avg_turnaround_days=vendor.avg_turnaround_days,
        min_order_amount=vendor.min_order_amount,
        specialties=specialties,
        created_at=vendor.created_at,
        phone_country_code=getattr(vendor, "phone_country_code", None),
        phone_number=getattr(vendor, "phone_number", None),
        business_email=getattr(vendor, "business_email", None),
        business_address=getattr(vendor, "business_address", None),
        gst_number=getattr(vendor, "gst_number", None),
        gst_certificate_url=getattr(vendor, "gst_certificate_url", None),
        storefront_image_url=getattr(vendor, "storefront_image_url", None),
        gmb_place_id=getattr(vendor, "gmb_place_id", None),
        gmb_name=getattr(vendor, "gmb_name", None),
        gmb_phone=getattr(vendor, "gmb_phone", None),
        gmb_address=getattr(vendor, "gmb_address", None),
        gmb_website=getattr(vendor, "gmb_website", None),
        gmb_rating=getattr(vendor, "gmb_rating", None),
        gmb_review_count=getattr(vendor, "gmb_review_count", None),
        gmb_maps_url=getattr(vendor, "gmb_maps_url", None),
        gmb_last_synced=getattr(vendor, "gmb_last_synced", None),
    )


# === Vendor Materials ===

@router.get("/{vendor_id}/materials", response_model=List[VendorMaterialResponse])
async def list_vendor_materials(
    vendor_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List materials available from a vendor"""
    result = await db.execute(
        select(VendorMaterial, Material.name)
        .join(Material, VendorMaterial.material_id == Material.id)
        .where(VendorMaterial.vendor_id == vendor_id)
    )
    rows = result.all()

    return [
        VendorMaterialResponse(
            id=vm.id,
            vendor_id=vm.vendor_id,
            material_id=vm.material_id,
            material_name=name,
            custom_price_per_cm2_mm=vm.custom_price_per_cm2_mm,
            thickness_mm=vm.thickness_mm,
            is_in_stock=vm.is_in_stock,
            cut_speed_mm_min=vm.cut_speed_mm_min,
            lead_time_days=vm.lead_time_days,
        )
        for vm, name in rows
    ]


@router.get("/{vendor_id}/listings")
async def list_vendor_listings(
    vendor_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List design listings published by a vendor, joined with design info"""
    from app.models import Design, DesignListing

    result = await db.execute(
        select(
            DesignListing,
            Design.id,
            Design.title,
            Design.category,
            Design.thumbnail_url,
            Design.likes_count,
            Material.name,
        )
        .join(Design, DesignListing.design_id == Design.id)
        .join(Material, DesignListing.material_id == Material.id)
        .where(
            DesignListing.vendor_id == vendor_id,
            DesignListing.is_active == True,
        )
        .order_by(DesignListing.created_at.desc())
    )

    items = []
    for dl, design_id, title, category, thumb, likes, mat_name in result.all():
        items.append({
            "id": design_id,
            "listing_id": dl.id,
            "title": title,
            "category": category or "other",
            "thumbnail_url": thumb,
            "likes_count": likes or 0,
            "material_name": mat_name,
            "thickness_mm": dl.thickness_mm,
            "price": dl.price,
            "min_price": dl.price,
            "sold_count": dl.sold_count,
        })
    return items


@router.post("/materials", response_model=VendorMaterialResponse)
async def add_vendor_material(
    mat_data: VendorMaterialCreate,
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """Add a material to vendor's catalog"""
    # Verify material exists
    result = await db.execute(select(Material).where(Material.id == mat_data.material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    vm = VendorMaterial(
        vendor_id=vendor.id,
        material_id=mat_data.material_id,
        thickness_mm=mat_data.thickness_mm,
        custom_price_per_cm2_mm=mat_data.custom_price_per_cm2_mm,
        cut_speed_mm_min=mat_data.cut_speed_mm_min,
        lead_time_days=mat_data.lead_time_days,
        is_in_stock=mat_data.is_in_stock,
        notes=mat_data.notes,
    )
    db.add(vm)
    await db.commit()
    await db.refresh(vm)

    return VendorMaterialResponse(
        id=vm.id,
        vendor_id=vm.vendor_id,
        material_id=vm.material_id,
        material_name=material.name,
        custom_price_per_cm2_mm=vm.custom_price_per_cm2_mm,
        thickness_mm=vm.thickness_mm,
        is_in_stock=vm.is_in_stock,
        cut_speed_mm_min=vm.cut_speed_mm_min,
        lead_time_days=vm.lead_time_days,
    )


# === Vendor Orders ===

@router.get("/orders", response_model=list)
async def list_vendor_orders(
    status_filter: Optional[str] = None,
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """List orders for the current vendor"""
    query = (
        select(VendorOrder, Order)
        .join(Order, VendorOrder.order_id == Order.id)
        .where(VendorOrder.vendor_id == vendor.id)
        .order_by(VendorOrder.created_at.desc())
    )

    if status_filter:
        query = query.where(VendorOrder.status == status_filter)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": vo.id,
            "order_id": vo.order_id,
            "order_number": order.order_number,
            "status": vo.status,
            "customer_name": order.customer_name,
            "customer_email": order.customer_email,
            "total_amount": order.total_amount,
            "vendor_cost": vo.vendor_cost,
            "platform_fee": vo.platform_fee,
            "created_at": vo.created_at,
        }
        for vo, order in rows
    ]


@router.put("/orders/{vendor_order_id}")
async def update_vendor_order(
    vendor_order_id: int,
    status: str,
    notes: Optional[str] = None,
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """Update a vendor order status"""
    result = await db.execute(
        select(VendorOrder).where(
            VendorOrder.id == vendor_order_id,
            VendorOrder.vendor_id == vendor.id
        )
    )
    vo = result.scalar_one_or_none()
    if not vo:
        raise HTTPException(status_code=404, detail="Vendor order not found")

    vo.status = status
    if notes:
        vo.vendor_notes = notes

    await db.commit()
    return {"status": "updated"}


# === Vendor Dashboard Stats ===

@router.get("/dashboard/stats")
async def get_vendor_stats(
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """Get vendor dashboard statistics"""
    # Total orders
    total_result = await db.execute(
        select(func.count(VendorOrder.id)).where(VendorOrder.vendor_id == vendor.id)
    )
    total_orders = total_result.scalar() or 0

    # Pending orders
    pending_result = await db.execute(
        select(func.count(VendorOrder.id)).where(
            VendorOrder.vendor_id == vendor.id,
            VendorOrder.status == "pending"
        )
    )
    pending_orders = pending_result.scalar() or 0

    # Revenue
    revenue_result = await db.execute(
        select(func.sum(VendorOrder.vendor_cost)).where(VendorOrder.vendor_id == vendor.id)
    )
    total_revenue = revenue_result.scalar() or 0

    # Material count
    mat_result = await db.execute(
        select(func.count(VendorMaterial.id)).where(VendorMaterial.vendor_id == vendor.id)
    )
    material_count = mat_result.scalar() or 0

    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_revenue": total_revenue,
        "material_count": material_count,
        "rating": vendor.rating,
        "total_reviews": vendor.total_reviews,
    }


@router.get("/dashboard/analytics")
async def get_vendor_analytics(
    vendor: Vendor = Depends(get_current_vendor),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed analytics for vendor dashboard (revenue timeline, materials)"""
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    # 1. Revenue Timeline
    revenue_query = (
        select(
            func.strftime("%Y-%m-%d", VendorOrder.created_at).label("date"),
            func.sum(VendorOrder.vendor_cost).label("revenue"),
            func.count(VendorOrder.id).label("orders")
        )
        .where(
            VendorOrder.vendor_id == vendor.id,
            VendorOrder.created_at >= thirty_days_ago
        )
        .group_by("date")
        .order_by("date")
    )
    revenue_result = await db.execute(revenue_query)
    revenue_timeline = [
        {"date": row.date, "revenue": row.revenue or 0, "orders": row.orders}
        for row in revenue_result.all()
    ]

    # 2. Material Distribution
    material_query = (
        select(
            Material.name.label("material_name"),
            func.count(Order.id).label("count")
        )
        .join(Order, Material.id == Order.material_id)
        .join(VendorOrder, Order.id == VendorOrder.order_id)
        .where(VendorOrder.vendor_id == vendor.id)
        .group_by(Material.name)
        .order_by(desc("count"))
        .limit(5)
    )
    material_result = await db.execute(material_query)
    popular_materials = [
        {"name": row.material_name, "count": row.count}
        for row in material_result.all()
    ]

    return {
        "revenue_timeline": revenue_timeline,
        "popular_materials": popular_materials,
        "summary": {
            "avg_order_value": (await db.execute(
                select(func.avg(VendorOrder.vendor_cost))
                .where(VendorOrder.vendor_id == vendor.id)
            )).scalar() or 0
        }
    }



# === Vendor Tags ===

@router.put("/{vendor_id}/tags")
async def update_vendor_tags(
    vendor_id: int,
    body: TagsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update specialties/tags for a vendor.

    Only the vendor's owning user or a super_admin may update tags.
    """
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    if vendor.user_id != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this vendor")

    # Validate: max 10 tags, max 30 chars each
    tags = [t.strip()[:30] for t in body.tags if t.strip()][:10]
    vendor.specialties = json.dumps(tags)
    await db.commit()
    return {"vendor_id": vendor_id, "specialties": tags}
