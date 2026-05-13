import asyncio
import json
import os
import uuid
from pathlib import Path
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models import User, Design, DesignListing, Vendor, Material, UploadedFile
from app.utils.file_parser import parse_generic

DESIGNS_DIR = Path(__file__).parent / "app" / "static" / "designs"

async def _get_or_create_uploaded_file(session, svg_name):
    svg_path = DESIGNS_DIR / svg_name
    if not svg_path.exists():
        return None
        
    # Check if already exists
    res = await session.execute(select(UploadedFile).where(UploadedFile.filename == svg_name))
    existing = res.scalars().first()
    if existing:
        return existing
        
    try:
        parsed = parse_generic(str(svg_path))
    except:
        parsed = {"width_mm": 100, "height_mm": 100, "area_cm2": 100, "cut_length_mm": 400}
        
    uploaded_file = UploadedFile(
        file_id=str(uuid.uuid4()),
        filename=svg_name,
        file_path=str(svg_path),
        file_size=svg_path.stat().st_size,
        file_type="svg",
        width_mm=parsed.get("width_mm"),
        height_mm=parsed.get("height_mm"),
        area_cm2=parsed.get("area_cm2"),
        cut_length_mm=parsed.get("cut_length_mm"),
        estimated_cut_time_minutes=(parsed.get("cut_length_mm", 0) or 0) / 500.0,
    )
    session.add(uploaded_file)
    await session.flush()
    return uploaded_file

async def seed_designs():
    async with async_session_maker() as db:
        # Find a creator
        res = await db.execute(select(User).where(User.is_admin == True))
        admin = res.scalars().first()
        if not admin:
            res = await db.execute(select(User).limit(1))
            admin = res.scalars().first()
            
        if not admin:
            print("No user found to be creator")
            return
        
        # Find a vendor for listings
        res = await db.execute(select(Vendor))
        vendor = res.scalars().first()
        
        # Find a material for listings
        res = await db.execute(select(Material))
        material = res.scalars().first()
        
        designs = [
            {
                "title": "Geometric Wall Art",
                "description": "A stunning geometric laser-cut wall art piece made of dark wood.",
                "category": "art",
                "tags": json.dumps(["geometric", "decor", "wall-art"]),
                "svg": "geometric_clock.svg",
                "is_public": True,
                "is_featured": True,
                "likes_count": 124
            },
            {
                "title": "Minimalist Jewelry Organizer",
                "description": "Elegant laser-cut acrylic jewelry organizer for earrings and necklaces.",
                "category": "home_decor",
                "tags": json.dumps(["jewelry", "organizer", "acrylic"]),
                "svg": "mandala_earrings.svg",
                "is_public": True,
                "is_featured": True,
                "likes_count": 89
            },
            {
                "title": "Premium Desk Name Plate",
                "description": "Elegant laser-engraved brushed metal name plate for a professional desk.",
                "category": "signage",
                "tags": json.dumps(["office", "name-plate", "metal"]),
                "svg": "name_sign_template.svg",
                "is_public": True,
                "is_featured": False,
                "likes_count": 45
            },
            {
                "title": "Mechanical Gear Set",
                "description": "Interlocking mechanical gears made of premium plywood.",
                "category": "mechanical",
                "tags": json.dumps(["gears", "mechanical", "plywood"]),
                "svg": "gear_set_mechanical.svg",
                "is_public": True,
                "is_featured": False,
                "likes_count": 210
            },
            {
                "title": "Snowflake Christmas Ornament",
                "description": "Delicate laser-cut snowflake ornament for the festive season.",
                "category": "home_decor",
                "tags": json.dumps(["holiday", "snowflake", "ornament"]),
                "svg": "geometric_pendant.svg",
                "is_public": True,
                "is_featured": False,
                "likes_count": 56
            },
            {
                "title": "Modern Architectural Model",
                "description": "Precise laser-cut cardboard model of a modern minimalist house.",
                "category": "educational",
                "tags": json.dumps(["architecture", "model", "cardboard"]),
                "svg": "city_skyline_art.svg",
                "is_public": True,
                "is_featured": True,
                "likes_count": 167
            }
        ]

        prices = [450.0, 250.0, 150.0, 550.0, 80.0, 750.0]

        for i, d_data in enumerate(designs):
            svg_name = d_data.pop("svg")
            # Check if exists
            res = await db.execute(select(Design).where(Design.title == d_data["title"]))
            existing_d = res.scalars().first()
            
            uploaded_file = await _get_or_create_uploaded_file(db, svg_name)
            
            if existing_d:
                print(f"Design {d_data['title']} already exists")
                d = existing_d
                if not d.file_id and uploaded_file:
                    d.file_id = uploaded_file.id
                    d.thumbnail_url = f"/static/designs/{svg_name}"
            else:
                d = Design(
                    creator_id=admin.id,
                    file_id=uploaded_file.id if uploaded_file else None,
                    thumbnail_url=f"/static/designs/{svg_name}" if uploaded_file else None,
                    **d_data
                )
                db.add(d)
                await db.flush()
                print(f"Added design: {d.title}")
            
            # Add listing if vendor and material exist
            if vendor and material:
                res = await db.execute(select(DesignListing).where(DesignListing.design_id == d.id, DesignListing.vendor_id == vendor.id))
                if not res.scalars().first():
                    listing = DesignListing(
                        vendor_id=vendor.id,
                        design_id=d.id,
                        material_id=material.id,
                        thickness_mm=3.0,
                        price=prices[i],
                        description=f"Standard production of {d.title}",
                        is_active=True
                    )
                    db.add(listing)
                    print(f"Added listing for {d.title} by {vendor.shop_name}")
        
        await db.commit()
        print("Successfully seeded designs and listings")

if __name__ == "__main__":
    asyncio.run(seed_designs())

