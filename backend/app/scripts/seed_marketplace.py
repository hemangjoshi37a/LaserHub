"""
Seed marketplace demo data
Run with: cd backend && python3.13 -m app.scripts.seed_marketplace
"""
import asyncio
import json
import os
import secrets
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings
from app.core.database import Base
from app.core.security import get_password_hash
from app.models import (
    User,
    Vendor,
    VendorMaterial,
    Material,
    Design,
    DesignListing,
    UploadedFile,
)


# SEED-04: directory that actually contains the seeded SVG artwork. All demo
# designs map to a real file in here, which becomes the UploadedFile row the
# Design references and the thumbnail the marketplace UI renders.
DESIGNS_DIR = Path(__file__).resolve().parent.parent / "static" / "designs"


# SEED-06: env-driven random password for demo vendors.
# Operator can pin a value via SEED_VENDOR_PASSWORD; otherwise we generate
# a fresh 16-byte URL-safe token per invocation and print it once.
DEMO_VENDOR_PASSWORD = os.getenv("SEED_VENDOR_PASSWORD", "").strip() or secrets.token_urlsafe(16)


DEMO_VENDORS = [
    {
        "user": {"email": "precision@laserhub.com", "name": "Alex Chen"},
        "vendor": {
            "shop_name": "Precision Laser Co.",
            "description": "High-precision laser cutting with 0.1mm accuracy. Specializing in acrylic and metal work.",
            "location": "San Francisco, CA",
            "rating": 4.8,
            "total_reviews": 127,
            "total_orders": 456,
            "avg_turnaround_days": 2.0,
            "is_verified": True,
        },
        "materials": [
            {"material_name": "Acrylic (Clear)", "thicknesses": [3, 5, 10], "price_mult": 1.0, "speed": 800, "lead": 2},
            {"material_name": "MDF Wood", "thicknesses": [3, 6, 9], "price_mult": 0.9, "speed": 600, "lead": 1.5},
            {"material_name": "Stainless Steel", "thicknesses": [0.5, 1], "price_mult": 1.2, "speed": 150, "lead": 3},
        ],
    },
    {
        "user": {"email": "artisan@laserhub.com", "name": "Sarah Miller"},
        "vendor": {
            "shop_name": "Artisan Cuts Studio",
            "description": "Handcrafted laser cutting for artists and designers. We specialize in wood and leather.",
            "location": "Portland, OR",
            "rating": 4.9,
            "total_reviews": 89,
            "total_orders": 312,
            "avg_turnaround_days": 3.0,
            "is_verified": True,
        },
        "materials": [
            {"material_name": "Baltic Birch Plywood", "thicknesses": [3, 6, 9], "price_mult": 0.85, "speed": 500, "lead": 2},
            {"material_name": "Genuine Leather", "thicknesses": [1, 2, 3], "price_mult": 1.1, "speed": 400, "lead": 2.5},
            {"material_name": "MDF Wood", "thicknesses": [3, 6, 12], "price_mult": 0.8, "speed": 550, "lead": 2},
        ],
    },
    {
        "user": {"email": "speedcut@laserhub.com", "name": "Mike Johnson"},
        "vendor": {
            "shop_name": "SpeedCut Industries",
            "description": "Fast turnaround laser cutting. Same-day service available. Industrial-grade equipment.",
            "location": "Austin, TX",
            "rating": 4.5,
            "total_reviews": 203,
            "total_orders": 1089,
            "avg_turnaround_days": 1.0,
            "is_verified": True,
        },
        "materials": [
            {"material_name": "Acrylic (Clear)", "thicknesses": [3, 5, 10], "price_mult": 1.15, "speed": 1000, "lead": 0.5},
            {"material_name": "Acrylic (Black)", "thicknesses": [2, 3, 5], "price_mult": 1.2, "speed": 900, "lead": 0.5},
            {"material_name": "Aluminum Sheet", "thicknesses": [0.5, 1, 2], "price_mult": 1.1, "speed": 200, "lead": 1},
            {"material_name": "Cardstock", "thicknesses": [0.3, 0.5], "price_mult": 0.9, "speed": 2000, "lead": 0.5},
        ],
    },
    {
        "user": {"email": "eco@laserhub.com", "name": "Emma Green"},
        "vendor": {
            "shop_name": "EcoLaser Workshop",
            "description": "Sustainable laser cutting using recycled materials. Carbon-neutral operations.",
            "location": "Denver, CO",
            "rating": 4.7,
            "total_reviews": 56,
            "total_orders": 178,
            "avg_turnaround_days": 3.5,
            "is_verified": False,
        },
        "materials": [
            {"material_name": "MDF Wood", "thicknesses": [3, 6], "price_mult": 0.75, "speed": 450, "lead": 3},
            {"material_name": "Baltic Birch Plywood", "thicknesses": [3, 6, 9, 12], "price_mult": 0.8, "speed": 400, "lead": 3},
            {"material_name": "Cardstock", "thicknesses": [0.3, 0.5], "price_mult": 0.7, "speed": 1500, "lead": 2},
        ],
    },
]

DEMO_DESIGNS = [
    # SEED-04: each design is mapped to a real SVG in backend/app/static/designs/
    # so the marketplace thumbnail + UploadedFile FK both resolve against a
    # concrete artifact (no more `file_id=1` placeholder producing 404 images).
    {"title": "Geometric Wall Clock", "category": "home_decor", "desc": "Modern minimalist wall clock with geometric cutouts. Fits standard clock mechanism.", "likes": 234, "downloads": 89, "svg": "geometric_clock.svg"},
    {"title": "Custom Name Sign", "category": "signage", "desc": "Personalized name sign with script font. Perfect for nurseries and bedrooms.", "likes": 189, "downloads": 156, "svg": "name_sign_template.svg"},
    {"title": "Honeycomb Shelf Brackets", "category": "home_decor", "desc": "Decorative hexagonal shelf brackets. Set of 2. Supports up to 5kg.", "likes": 145, "downloads": 67, "svg": "honeycomb_shelf_bracket.svg"},
    {"title": "Laser Cut Earrings Set", "category": "jewelry", "desc": "Set of 3 geometric earring designs. Includes circle, triangle, and hexagon patterns.", "likes": 312, "downloads": 201, "svg": "mandala_earrings.svg"},
    {"title": "Mechanical Gear Set", "category": "mechanical", "desc": "Interlocking gear set for kinetic art installations. 5 gears of varying sizes.", "likes": 98, "downloads": 45, "svg": "gear_set_mechanical.svg"},
    {"title": "City Skyline Art", "category": "art", "desc": "Multi-layer cityscape wall art. Creates beautiful shadow effects.", "likes": 276, "downloads": 134, "svg": "city_skyline_art.svg"},
    {"title": "Puzzle Box Template", "category": "educational", "desc": "Interlocking puzzle box with sliding lid. Great STEM project.", "likes": 167, "downloads": 98, "svg": "puzzle_box.svg"},
    {"title": "Phone Stand", "category": "other", "desc": "Minimalist phone stand with cable management slot. Fits all phone sizes.", "likes": 201, "downloads": 178, "svg": "phone_stand.svg"},
]


async def _get_or_create_uploaded_file_for_svg(
    session: AsyncSession, svg_filename: str
) -> UploadedFile | None:
    """SEED-04: ensure an UploadedFile row exists for the given SVG in
    backend/app/static/designs/ and return it. Idempotent — a prior run's
    row is reused (looked up by file_path) so re-seeding does not create
    duplicates. Returns None if the SVG is missing on disk so the caller
    can skip cleanly.
    """
    svg_path = DESIGNS_DIR / svg_filename
    if not svg_path.exists():
        print(f"    SEED-04: SVG missing, skipping UploadedFile: {svg_filename}")
        return None

    # Reuse existing row if already seeded (match on absolute file_path).
    existing_q = await session.execute(
        sa.select(UploadedFile).where(UploadedFile.file_path == str(svg_path))
    )
    existing = existing_q.scalar_one_or_none()
    if existing is not None:
        return existing

    file_size = svg_path.stat().st_size
    uploaded = UploadedFile(
        file_id=str(uuid.uuid4()),
        filename=svg_filename,
        file_path=str(svg_path),
        file_size=file_size,
        file_type="svg",
        # Geometry fields are nullable — seed_designs.py parses them for real;
        # here we just need the FK target to exist so the thumbnail resolves.
        width_mm=None,
        height_mm=None,
        area_cm2=None,
        cut_length_mm=None,
        estimated_cut_time_minutes=None,
    )
    session.add(uploaded)
    await session.flush()
    return uploaded


async def seed_marketplace():
    if settings.ENVIRONMENT.lower() != "development":
        raise SystemExit(
            f"Seed scripts are development-only. Current ENVIRONMENT={settings.ENVIRONMENT}. "
            "Set ENVIRONMENT=development to run."
        )

    # SEED-06: surface the demo vendor password once per run so the operator
    # can log in as any seeded vendor. Honors $SEED_VENDOR_PASSWORD when set.
    print(f"[seed_marketplace] demo vendor password = {DEMO_VENDOR_PASSWORD!r}", flush=True)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add missing columns to existing tables (lightweight migration)
    async with engine.begin() as conn:
        # Check and add 'role' column to users if missing
        result = await conn.execute(sa.text("PRAGMA table_info(users)"))
        existing_cols = {row[1] for row in result.fetchall()}
        if "role" not in existing_cols:
            await conn.execute(sa.text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'customer'"))
            print("  Migrated: added 'role' column to users table")

    async_session = async_sessionmaker(engine, class_=AsyncSession)

    async with async_session() as session:
        # Get existing materials
        result = await session.execute(Material.__table__.select())
        materials_db = {row.name: row for row in result.fetchall()}

        if not materials_db:
            print("No materials found. Run seed_data.py first!")
            return

        # Create vendors
        vendors_created = []
        # Anchor "now" once so all vendors share the same reference point per run.
        seed_now = datetime.utcnow()
        for i, vendor_data in enumerate(DEMO_VENDORS):
            # Check if user exists
            user_check = await session.execute(
                User.__table__.select().where(User.email == vendor_data["user"]["email"])
            )
            existing_user = user_check.fetchone()

            if existing_user:
                user_id = existing_user.id
                # Check if vendor exists
                vendor_check = await session.execute(
                    Vendor.__table__.select().where(Vendor.user_id == user_id)
                )
                if vendor_check.fetchone():
                    print(f"  Skipping {vendor_data['vendor']['shop_name']} - already exists")
                    continue
            else:
                # Create user
                user = User(
                    email=vendor_data["user"]["email"],
                    name=vendor_data["user"]["name"],
                    hashed_password=get_password_hash(DEMO_VENDOR_PASSWORD),
                    is_verified=True,
                    role="vendor",
                    is_demo=True,
                )
                session.add(user)
                await session.flush()
                user_id = user.id

            # Create vendor
            vd = vendor_data["vendor"]
            slug = vd["shop_name"].lower().replace(" ", "-").replace(".", "")
            # Deterministic staggered "Member since" dates: spreads demo vendors
            # across the last ~24 months so the /vendor/:slug page does not show
            # the same month for every vendor after a fresh seed run.
            # Offsets: i=0 -> 30d, i=1 -> 117d, i=2 -> 204d, i=3 -> 291d, ...
            created_at = seed_now - timedelta(days=30 + i * 87)
            vendor = Vendor(
                user_id=user_id,
                shop_name=vd["shop_name"],
                slug=slug,
                description=vd["description"],
                location=vd["location"],
                rating=vd["rating"],
                total_reviews=vd["total_reviews"],
                total_orders=vd["total_orders"],
                avg_turnaround_days=vd["avg_turnaround_days"],
                is_verified=vd.get("is_verified", False),
                is_active=True,
                is_demo=True,
                created_at=created_at,
            )
            session.add(vendor)
            await session.flush()

            # Add materials
            for mat_info in vendor_data["materials"]:
                mat_name = mat_info["material_name"]
                if mat_name not in materials_db:
                    continue
                mat_row = materials_db[mat_name]

                for thickness in mat_info["thicknesses"]:
                    vm = VendorMaterial(
                        vendor_id=vendor.id,
                        material_id=mat_row.id,
                        thickness_mm=thickness,
                        custom_price_per_cm2_mm=mat_row.rate_per_cm2_mm * mat_info["price_mult"],
                        cut_speed_mm_min=mat_info["speed"],
                        lead_time_days=mat_info["lead"],
                        is_in_stock=True,
                    )
                    session.add(vm)

            vendors_created.append(vendor)
            print(f"  Created vendor: {vd['shop_name']}")

        # Create demo designs (using first user as creator)
        first_user = await session.execute(User.__table__.select().limit(1))
        first_user_row = first_user.fetchone()

        # SEED-03: resolve the first two DEMO_VENDORS (indices 0, 1) so each
        # seeded design can be attached to 2 DesignListing rows. We look the
        # vendors up by the email on the demo-user record instead of relying on
        # `vendors_created` — that list is empty when vendors already exist
        # from a previous seed run (the creation branch `continue`s above).
        listing_vendors: list[tuple[Vendor, int, float]] = []  # (vendor, material_id, thickness_mm)
        for seed_idx in (0, 1):
            demo = DEMO_VENDORS[seed_idx]
            v_user_q = await session.execute(
                User.__table__.select().where(User.email == demo["user"]["email"])
            )
            v_user_row = v_user_q.fetchone()
            if not v_user_row:
                continue
            v_q = await session.execute(
                Vendor.__table__.select().where(Vendor.user_id == v_user_row.id)
            )
            v_row = v_q.fetchone()
            if not v_row:
                continue
            # Use the vendor's first stocked material + first thickness for the listing.
            first_mat = demo["materials"][0]
            mat_row = materials_db.get(first_mat["material_name"])
            if not mat_row:
                continue
            listing_vendors.append((v_row, mat_row.id, float(first_mat["thicknesses"][0])))

        if first_user_row:
            for design_index, design_data in enumerate(DEMO_DESIGNS):
                # Check if design exists
                existing = await session.execute(
                    Design.__table__.select().where(Design.title == design_data["title"])
                )
                if existing.fetchone():
                    print(f"  Skipping design: {design_data['title']} - exists")
                    continue

                # SEED-04: create (or reuse) a real UploadedFile row pointing at
                # the SVG in backend/app/static/designs/ instead of the old
                # `file_id=1` placeholder. Designs whose SVG is missing on disk
                # are created with `file_id=None` (nullable FK) so the UI shows
                # "no image" rather than a broken thumbnail.
                svg_filename = design_data.get("svg")
                uploaded_file = None
                if svg_filename:
                    uploaded_file = await _get_or_create_uploaded_file_for_svg(
                        session, svg_filename
                    )
                thumbnail_url = (
                    f"/static/designs/{svg_filename}" if uploaded_file else None
                )

                design = Design(
                    creator_id=first_user_row.id,
                    file_id=uploaded_file.id if uploaded_file else None,
                    title=design_data["title"],
                    description=design_data["desc"],
                    category=design_data["category"],
                    thumbnail_url=thumbnail_url,
                    is_public=True,
                    is_featured=design_data["likes"] > 200,
                    likes_count=design_data["likes"],
                    downloads_count=design_data["downloads"],
                )
                session.add(design)
                # Flush so `design.id` is populated before we create DesignListing FKs.
                await session.flush()
                print(
                    f"  Created design: {design_data['title']} "
                    f"(file_id={design.file_id}, thumb={thumbnail_url})"
                )

                # SEED-03: attach 2 DesignListing rows (one per vendor) so the
                # /design/{id} page shows a real "from $X" price instead of the
                # "Quote on request" placeholder. Deterministic pricing:
                #   vendor 0 -> base_price = 10.00 + design_index * 2.50
                #   vendor 1 -> base_price * 1.20
                base_price = 10.00 + design_index * 2.50
                for listing_idx, (v_row, mat_id, thickness_mm) in enumerate(listing_vendors):
                    price = round(base_price * (1.20 if listing_idx == 1 else 1.0), 2)
                    listing = DesignListing(
                        vendor_id=v_row.id,
                        design_id=design.id,
                        material_id=mat_id,
                        thickness_mm=thickness_mm,
                        price=price,
                        is_active=True,
                    )
                    session.add(listing)

        await session.commit()
        print("\nMarketplace seeded successfully!")


# Alias so this script can be invoked as `seed_marketplace.main()` per the
# repo-wide seed-script convention (SEED-01).
main = seed_marketplace


if __name__ == "__main__":
    print("Seeding LaserHub marketplace data...")
    asyncio.run(main())
