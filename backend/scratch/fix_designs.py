
import asyncio
import os
import sys
import uuid
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(r'c:\Users\nitya\Desktop\LaserHub\backend')))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models import Design, UploadedFile
from app.utils.file_parser import parse_generic

DESIGNS_DIR = Path(r'c:\Users\nitya\Desktop\LaserHub\backend\app\static\designs')

MAPPING = {
    "Geometric Wall Art": "geometric_clock.svg",
    "Minimalist Jewelry Organizer": "mandala_earrings.svg",
    "Premium Desk Name Plate": "name_sign_template.svg",
    "Mechanical Gear Set": "gear_set_mechanical.svg",
    "Snowflake Christmas Ornament": "geometric_pendant.svg",
    "Modern Architectural Model": "city_skyline_art.svg",
}

async def fix_designs():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        for title, svg_name in MAPPING.items():
            # Check if design exists
            stmt = select(Design).where(Design.title == title)
            result = await session.execute(stmt)
            design = result.scalars().first()
            
            if not design:
                print(f"Design '{title}' not found, skipping.")
                continue
                
            if design.file_id is not None:
                print(f"Design '{title}' already has a file associated, skipping.")
                continue
            
            svg_path = DESIGNS_DIR / svg_name
            if not svg_path.exists():
                print(f"SVG file '{svg_name}' not found for '{title}', skipping.")
                continue
            
            print(f"Fixing '{title}' with '{svg_name}'...")
            
            # Parse SVG for metadata
            try:
                parsed = parse_generic(str(svg_path))
            except:
                parsed = {"width_mm": 100, "height_mm": 100, "area_cm2": 100, "cut_length_mm": 400}
                
            # Create UploadedFile
            file_id = str(uuid.uuid4())
            uploaded_file = UploadedFile(
                file_id=file_id,
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
            
            # Update Design
            design.file_id = uploaded_file.id
            # Also update thumbnail to the static path if it was broken
            design.thumbnail_url = f"/static/designs/{svg_name}"
            
        await session.commit()
        print("Finished fixing designs.")

if __name__ == "__main__":
    asyncio.run(fix_designs())
