"""
Marketplace API - public browsing, comparison, search
"""
import json
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models import (
    Design, DesignListing, DesignLike, Vendor, VendorMaterial,
    Material, UploadedFile, User, Review, Order, VendorOrder
)
from app.schemas import (
    DesignResponse, DesignListingResponse, VendorResponse,
    VendorQuote, VendorComparisonResponse, ReviewResponse, ReviewCreate
)
from app.services.cost_calculator import calculate_total_cost_v2

router = APIRouter()


def _abs_thumb(request: Request, thumb: str | None) -> str | None:
    """Convert a relative thumbnail path like /static/... to an absolute URL."""
    if not thumb:
        return None
    if thumb.startswith("http"):
        return thumb
    base = str(request.base_url).rstrip("/")
    return f"{base}{thumb}"


def _not_test(*flagged_models):
    """Build filter expressions that exclude test/internal/demo records.

    Returns a list of WHERE clauses, one per is_internal/is_demo column on the
    given model(s). Uses ``IS NOT TRUE`` semantics so that NULL/None is treated
    as NOT excluded — only rows explicitly flagged True are dropped. Used to keep
    QA/internal seed data out of public-facing listings while leaving admin
    endpoints unfiltered.

    The ``Design`` model has no such flags, so design visibility is gated on its
    creator (``User``) and its listings' ``Vendor``/``Material`` flags instead.
    """
    clauses = []
    for model in flagged_models:
        if hasattr(model, "is_internal"):
            clauses.append(model.is_internal.isnot(True))
        if hasattr(model, "is_demo"):
            clauses.append(model.is_demo.isnot(True))
    return clauses


# === Homepage / Featured ===

@router.get("/featured")
async def get_featured_content(request: Request, db: AsyncSession = Depends(get_db)):
    """Get featured content for marketplace homepage"""
    # Featured designs — exclude designs created by internal/demo (QA) users
    feat_designs = await db.execute(
        select(Design, User.name)
        .join(User, Design.creator_id == User.id)
        .where(Design.is_public == True, Design.is_featured == True, *_not_test(User))
        .order_by(desc(Design.likes_count))
        .limit(8)
    )

    # Popular designs — exclude designs created by internal/demo (QA) users
    pop_designs = await db.execute(
        select(Design, User.name)
        .join(User, Design.creator_id == User.id)
        .where(Design.is_public == True, *_not_test(User))
        .order_by(desc(Design.likes_count))
        .limit(12)
    )

    # Top vendors
    top_vendors = await db.execute(
        select(Vendor)
        .where(Vendor.is_active == True, *_not_test(Vendor))
        .order_by(desc(Vendor.rating))
        .limit(6)
    )

    # Recent listings
    recent_listings = await db.execute(
        select(DesignListing, Design.title, Vendor.shop_name, Material.name, Design.thumbnail_url)
        .join(Design, DesignListing.design_id == Design.id)
        .join(User, Design.creator_id == User.id)
        .join(Vendor, DesignListing.vendor_id == Vendor.id)
        .join(Material, DesignListing.material_id == Material.id)
        .where(
            DesignListing.is_active == True,
            *_not_test(User, Vendor, Material),
        )
        .order_by(desc(DesignListing.created_at))
        .limit(12)
    )

    # Stats — query real counts from DB (public-facing, so exclude test records)
    design_count = (await db.execute(
        select(func.count(Design.id))
        .join(User, Design.creator_id == User.id)
        .where(Design.is_public == True, *_not_test(User))
    )).scalar() or 0
    vendor_count = (await db.execute(
        select(func.count(Vendor.id)).where(Vendor.is_active == True, *_not_test(Vendor))
    )).scalar() or 0
    order_count = (await db.execute(select(func.count(Order.id)))).scalar() or 0

    return {
        "featured_designs": [
            {
                "id": d.id, "title": d.title, "description": d.description,
                "category": d.category, "thumbnail_url": _abs_thumb(request, d.thumbnail_url),
                "likes_count": d.likes_count, "downloads_count": d.downloads_count,
                "creator_name": name, "is_featured": d.is_featured,
            }
            for d, name in feat_designs.all()
        ],
        "popular_designs": [
            {
                "id": d.id, "title": d.title, "description": d.description,
                "category": d.category, "thumbnail_url": _abs_thumb(request, d.thumbnail_url),
                "likes_count": d.likes_count, "downloads_count": d.downloads_count,
                "creator_name": name,
            }
            for d, name in pop_designs.all()
        ],
        "top_vendors": [
            {
                "id": v.id, "shop_name": v.shop_name, "slug": v.slug,
                "description": v.description, "logo_url": v.logo_url,
                "location": v.location, "rating": v.rating,
                "total_orders": v.total_orders, "is_verified": v.is_verified,
                "specialties": json.loads(v.specialties) if v.specialties else [],
            }
            for v in top_vendors.scalars().all()
        ],
        "recent_listings": [
            {
                "id": l.id, "design_id": l.design_id, "design_title": title,
                "vendor_name": vname, "material_name": mname,
                "thickness_mm": l.thickness_mm,
                "price": l.price, "sold_count": l.sold_count,
                "thumbnail_url": _abs_thumb(request, thumb),
            }
            for l, title, vname, mname, thumb in recent_listings.all()
        ],
        "stats": {
            "total_designs": design_count,
            "total_vendors": vendor_count,
            "total_orders": order_count,
        }
    }


# === Design Browsing ===

@router.get("/tags")
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    """Get all unique tags across public designs"""
    result = await db.execute(
        select(Design.tags).where(Design.is_public == True, Design.tags != None)
    )
    all_tags_raw = result.scalars().all()

    tag_set: dict[str, int] = {}
    for raw in all_tags_raw:
        if not raw:
            continue
        try:
            tags = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        for tag in tags:
            if tag:
                tag_set[tag] = tag_set.get(tag, 0) + 1

    # Return sorted by frequency, then alpha
    sorted_tags = sorted(tag_set.items(), key=lambda x: (-x[1], x[0]))
    return {"tags": [{"name": t, "count": c} for t, c in sorted_tags]}


@router.get("/designs")
async def browse_designs(
    request: Request,
    category: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = "popular",
    limit: int = Query(default=24, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Browse public designs"""
    # Single aggregate query: LEFT JOIN design_listings (active only) + GROUP BY design
    # computes listing_count and min_price per design, eliminating the N+1 loop.
    query = (
        select(
            Design,
            User.name,
            func.count(DesignListing.id).label("listing_count"),
            func.min(DesignListing.price).label("min_price"),
        )
        .join(User, Design.creator_id == User.id)
        .outerjoin(
            DesignListing,
            (DesignListing.design_id == Design.id) & (DesignListing.is_active == True),
        )
        .where(Design.is_public == True, *_not_test(User))
        .group_by(Design.id, User.name)
    )

    if category and category != "all":
        query = query.where(Design.category == category)

    if search:
        query = query.where(
            or_(
                Design.title.ilike(f"%{search}%"),
                Design.description.ilike(f"%{search}%"),
                Design.tags.ilike(f"%{search}%"),
            )
        )

    if tag:
        # Filter designs that contain this tag in their JSON tags array
        query = query.where(Design.tags.ilike(f"%\"{tag}\"%"))

    if sort_by == "popular":
        query = query.order_by(desc(Design.likes_count))
    elif sort_by == "newest":
        query = query.order_by(desc(Design.created_at))
    elif sort_by == "downloads":
        query = query.order_by(desc(Design.downloads_count))

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)

    designs = []
    for d, creator_name, listing_count, min_price in result.all():
        try:
            tags = json.loads(d.tags) if d.tags else []
        except (json.JSONDecodeError, TypeError):
            tags = []

        designs.append({
            "id": d.id, "title": d.title, "description": d.description,
            "category": d.category, "thumbnail_url": _abs_thumb(request, d.thumbnail_url),
            "likes_count": d.likes_count, "downloads_count": d.downloads_count,
            "creator_name": creator_name, "is_featured": d.is_featured,
            "vendor_count": listing_count or 0,
            "min_price": min_price,
            "tags": tags,
            "created_at": d.created_at,
        })

    return {"designs": designs, "total": len(designs)}


@router.get("/designs/{design_id}")
async def get_design_detail(design_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Get full design details with all vendor listings"""
    result = await db.execute(
        select(Design, User.name)
        .join(User, Design.creator_id == User.id)
        .where(Design.id == design_id, *_not_test(User))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Design not found")

    design, creator_name = row

    # Get all active listings
    listings_result = await db.execute(
        select(DesignListing, Vendor.shop_name, Vendor.slug, Vendor.rating, Vendor.avg_turnaround_days, Material.name)
        .join(Vendor, DesignListing.vendor_id == Vendor.id)
        .join(Material, DesignListing.material_id == Material.id)
        .where(
            DesignListing.design_id == design_id,
            DesignListing.is_active == True,
            *_not_test(Vendor, Material),
        )
        .order_by(DesignListing.price)
    )
    listing_rows = listings_result.all()

    # ETA calculation: base = VendorMaterial.lead_time_days (per vendor+material)
    # or fallback to Vendor.avg_turnaround_days. Add a workload bump based on the
    # count of active (non-terminal) orders per vendor: +1 day per 5 open orders.
    if listing_rows:
        vendor_ids = list({l.vendor_id for l, *_ in listing_rows})
        vendor_material_keys = {(l.vendor_id, l.material_id) for l, *_ in listing_rows}

        # Fetch matching VendorMaterial rows in one query
        vm_rows = await db.execute(
            select(VendorMaterial).where(
                VendorMaterial.vendor_id.in_(vendor_ids)
            )
        )
        vm_lookup = {
            (vm.vendor_id, vm.material_id): vm.lead_time_days
            for vm in vm_rows.scalars().all()
            if (vm.vendor_id, vm.material_id) in vendor_material_keys
        }

        # Count open orders per vendor (workload) in one query
        ACTIVE_STATUSES = ("pending", "paid", "accepted", "in_production")
        workload_rows = await db.execute(
            select(VendorOrder.vendor_id, func.count(VendorOrder.id))
            .join(Order, VendorOrder.order_id == Order.id)
            .where(VendorOrder.vendor_id.in_(vendor_ids))
            .where(Order.status.in_(ACTIVE_STATUSES))
            .group_by(VendorOrder.vendor_id)
        )
        workload_by_vendor: dict[int, int] = {vid: cnt for vid, cnt in workload_rows.all()}
    else:
        vm_lookup = {}
        workload_by_vendor = {}

    # Get file info
    file_result = await db.execute(select(UploadedFile).where(UploadedFile.id == design.file_id))
    uploaded_file = file_result.scalar_one_or_none()

    return {
        "id": design.id,
        "title": design.title,
        "description": design.description,
        "category": design.category,
        "tags": json.loads(design.tags) if design.tags else [],
        "thumbnail_url": _abs_thumb(request, design.thumbnail_url),
        "is_public": design.is_public,
        "likes_count": design.likes_count,
        "downloads_count": design.downloads_count,
        "creator_name": creator_name,
        "created_at": design.created_at,
        "file_id": uploaded_file.file_id if uploaded_file else None,
        "file_info": {
            "width_mm": uploaded_file.width_mm,
            "height_mm": uploaded_file.height_mm,
            "area_cm2": uploaded_file.area_cm2,
            "cut_length_mm": uploaded_file.cut_length_mm,
        } if uploaded_file else None,
        "listings": [
            _listing_row_with_eta(l, vname, vslug, vrating, vturn, mname, vm_lookup, workload_by_vendor)
            for l, vname, vslug, vrating, vturn, mname in listing_rows
        ],
    }


def _listing_row_with_eta(
    l, vname, vslug, vrating, vturn, mname,
    vm_lookup, workload_by_vendor,
):
    """Build a design-listing row with a computed ETA.

    ETA (days) = material-specific lead time (VendorMaterial.lead_time_days)
    or vendor average turnaround, + workload bump (ceil(open_orders / 5)).
    """
    import math
    base = vm_lookup.get((l.vendor_id, l.material_id))
    if base is None:
        base = float(vturn) if vturn is not None else 3.0
    workload = workload_by_vendor.get(l.vendor_id, 0)
    bump = math.ceil(workload / 5) if workload else 0
    eta_days = float(base) + bump
    from datetime import datetime, timedelta
    eta_date = (datetime.utcnow() + timedelta(days=eta_days)).date().isoformat()
    return {
        "id": l.id, "vendor_name": vname, "vendor_slug": vslug,
        "vendor_rating": vrating, "material_name": mname,
        "thickness_mm": l.thickness_mm, "price": l.price,
        "sold_count": l.sold_count,
        "turnaround_days": round(eta_days, 1),
        "eta_days": round(eta_days, 1),
        "eta_date": eta_date,
        "active_orders": workload,
    }


# === Vendor Comparison ===

@router.post("/compare")
async def compare_vendors(
    file_id: str,
    material_id: int,
    thickness_mm: float,
    quantity: int = 1,
    db: AsyncSession = Depends(get_db)
):
    """Compare prices across vendors for a specific file + material + thickness"""
    # Get file
    result = await db.execute(select(UploadedFile).where(UploadedFile.file_id == file_id))
    uploaded_file = result.scalar_one_or_none()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Get material
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Find all vendors with this material+thickness
    result = await db.execute(
        select(VendorMaterial, Vendor)
        .join(Vendor, VendorMaterial.vendor_id == Vendor.id)
        .where(
            VendorMaterial.material_id == material_id,
            VendorMaterial.thickness_mm == thickness_mm,
            Vendor.is_active == True,
            *_not_test(Vendor),
        )
    )

    quotes = []
    for vm, vendor in result.all():
        rate = vm.custom_price_per_cm2_mm or material.rate_per_cm2_mm
        cost_data = calculate_total_cost_v2(
            area_cm2=uploaded_file.area_cm2 or 0,
            cut_length_mm=uploaded_file.cut_length_mm or 0,
            thickness_mm=thickness_mm,
            rate_per_cm2=rate * thickness_mm,
            cut_speed_mm_min=vm.cut_speed_mm_min,
            quantity=quantity,
        )

        quotes.append(VendorQuote(
            vendor_id=vendor.id,
            vendor_name=vendor.shop_name,
            vendor_slug=vendor.slug,
            vendor_rating=vendor.rating,
            price=cost_data["total"],
            lead_time_days=vm.lead_time_days,
            is_in_stock=vm.is_in_stock,
            cut_speed_mm_min=vm.cut_speed_mm_min,
        ))

    quotes.sort(key=lambda q: q.price)

    return VendorComparisonResponse(
        file_id=file_id,
        material_id=material_id,
        material_name=material.name,
        thickness_mm=thickness_mm,
        quantity=quantity,
        quotes=quotes,
    )


# === Reviews ===

@router.get("/vendors/{vendor_id}/reviews")
async def get_vendor_reviews(
    vendor_id: int,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get reviews for a vendor"""
    result = await db.execute(
        select(Review, User.name)
        .join(User, Review.user_id == User.id)
        .where(Review.vendor_id == vendor_id)
        .order_by(desc(Review.created_at))
        .offset(offset).limit(limit)
    )

    return [
        {
            "id": r.id, "user_name": name, "rating": r.rating,
            "comment": r.comment, "created_at": r.created_at,
        }
        for r, name in result.all()
    ]


@router.post("/vendors/{vendor_id}/reviews")
async def create_vendor_review(
    vendor_id: int,
    review_data: ReviewCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a review for a vendor (requires authenticated verified buyer)"""
    # Verify vendor exists
    vendor_result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = vendor_result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Validate rating range
    if not (1 <= review_data.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Verified-buyer check: user must have at least one completed/delivered order
    # with this vendor. Order has no direct vendor_id, so join through VendorOrder.
    verified_q = await db.execute(
        select(Order.id)
        .join(VendorOrder, VendorOrder.order_id == Order.id)
        .where(
            Order.user_id == current_user.id,
            VendorOrder.vendor_id == vendor_id,
            Order.status.in_(("completed", "delivered")),
        )
        .limit(1)
    )
    if verified_q.first() is None:
        raise HTTPException(
            status_code=403,
            detail="Only verified buyers can review this vendor",
        )

    # If order_id provided, verify the order exists, belongs to the user, and is completed
    if review_data.order_id:
        order_result = await db.execute(select(Order).where(Order.id == review_data.order_id))
        order = order_result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only review your own orders")
        if order.status not in ("completed", "delivered"):
            raise HTTPException(status_code=400, detail="Can only review completed orders")

        # Check if a review already exists for this order
        existing = await db.execute(
            select(Review).where(Review.order_id == review_data.order_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="A review already exists for this order")

    # Create the review
    review = Review(
        user_id=current_user.id,
        vendor_id=vendor_id,
        order_id=review_data.order_id,
        rating=review_data.rating,
        comment=review_data.comment,
    )
    db.add(review)
    # Flush so the new review participates in the aggregate below
    await db.flush()

    # Update vendor aggregate rating — single SQL, includes the just-inserted row.
    # Fixes prior double-count bug (old code appended the new rating on top of a
    # query that already contained it after flush).
    agg = await db.execute(
        select(
            func.avg(Review.rating).label("avg_rating"),
            func.count(Review.id).label("total"),
        ).where(Review.vendor_id == vendor_id)
    )
    row = agg.one()
    vendor.rating = float(row.avg_rating or 0)
    vendor.total_reviews = int(row.total or 0)

    await db.commit()
    await db.refresh(review)

    # Notify the vendor owner about the new review
    if vendor.user_id:
        from app.api.notifications import send_push_notification_bg
        stars = "★" * int(review_data.rating) + "☆" * (5 - int(review_data.rating))
        background_tasks.add_task(
            send_push_notification_bg,
            vendor.user_id,
            "New Review",
            f"{stars} {current_user.name or 'A customer'} reviewed your shop.",
            f"/vendor/{vendor.slug}" if getattr(vendor, "slug", None) else "/admin/dashboard",
        )

    # Get user name for response
    user_result = await db.execute(select(User.name).where(User.id == review.user_id))
    user_name = user_result.scalar_one_or_none() or "Anonymous"

    return {
        "id": review.id,
        "user_name": user_name,
        "vendor_id": vendor_id,
        "rating": review.rating,
        "comment": review.comment,
        "created_at": review.created_at,
    }


# === Design Categories ===

@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Get available design categories"""
    return {
        "categories": [
            {"id": "signage", "name": "Signage & Letters", "icon": "type"},
            {"id": "jewelry", "name": "Jewelry & Accessories", "icon": "gem"},
            {"id": "home_decor", "name": "Home Decor", "icon": "home"},
            {"id": "art", "name": "Art & Wall Pieces", "icon": "palette"},
            {"id": "mechanical", "name": "Mechanical Parts", "icon": "cog"},
            {"id": "packaging", "name": "Packaging & Boxes", "icon": "package"},
            {"id": "stencils", "name": "Stencils & Templates", "icon": "layout"},
            {"id": "educational", "name": "Educational & Puzzles", "icon": "book"},
            {"id": "custom", "name": "Custom Projects", "icon": "scissors"},
            {"id": "other", "name": "Other", "icon": "grid"},
        ]
    }
