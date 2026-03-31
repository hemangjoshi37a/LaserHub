"""
Database seed script - Creates initial materials
Run with: python -m app.scripts.seed_data
"""

import asyncio
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base
from app.models import Material

# Initial materials data
MATERIALS = [
    {
        "name": "Acrylic (Clear)",
        "type": "acrylic",
        "rate_per_cm2_mm": 0.05,
        "thicknesses": [2, 3, 5, 6, 10],
        "description": "Crystal clear acrylic, perfect for signs and displays",
        "color": "#e0f2fe",  # Light blue
    },
    {
        "name": "Acrylic (Black)",
        "type": "acrylic",
        "rate_per_cm2_mm": 0.055,
        "thicknesses": [2, 3, 5, 6],
        "description": "Opaque black acrylic for elegant designs",
        "color": "#1e293b",  # Dark slate
    },
    {
        "name": "MDF Wood",
        "type": "wood_mdf",
        "rate_per_cm2_mm": 0.03,
        "thicknesses": [3, 6, 9, 12],
        "description": "Medium density fiberboard, great for engraving",
        "color": "#d4a574",  # Wood brown
    },
    {
        "name": "Baltic Birch Plywood",
        "type": "plywood",
        "rate_per_cm2_mm": 0.04,
        "thicknesses": [3, 6, 9, 12, 18],
        "description": "High quality plywood with clean edges",
        "color": "#f5deb3",  # Wheat
    },
    {
        "name": "Genuine Leather",
        "type": "leather",
        "rate_per_cm2_mm": 0.08,
        "thicknesses": [1, 2, 3],
        "description": "Premium leather for wallets, belts, and accessories",
        "color": "#8b4513",  # Saddle brown
    },
    {
        "name": "Cardstock",
        "type": "paper",
        "rate_per_cm2_mm": 0.02,
        "thicknesses": [0.3, 0.5],
        "description": "Heavy weight paper for intricate cut designs",
        "color": "#fef3c7",  # Amber light
    },
    {
        "name": "Aluminum Sheet",
        "type": "aluminum",
        "rate_per_cm2_mm": 0.15,
        "thicknesses": [0.5, 1, 2],
        "description": "Thin aluminum for marking and light cutting",
        "color": "#94a3b8",  # Slate gray
    },
    {
        "name": "Stainless Steel",
        "type": "stainless_steel",
        "rate_per_cm2_mm": 0.25,
        "thicknesses": [0.5, 1],
        "description": "Premium stainless steel for durable parts",
        "color": "#64748b",  # Slate
    },
]


async def seed_database():
    """Seed the database with initial materials"""

    # Create engine and tables
    engine = create_async_engine(settings.DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session
    async_session = async_sessionmaker(engine, class_=AsyncSession)

    async with async_session() as session:
        for material_data in MATERIALS:
            # Check if material exists
            existing = await session.execute(
                Material.__table__.select().where(
                    Material.name == material_data["name"]
                )
            )

            if existing.fetchone():
                print(f"Skipping {material_data['name']} - already exists")
                continue

            # Create material
            material = Material(
                name=material_data["name"],
                type=material_data["type"],
                rate_per_cm2_mm=material_data["rate_per_cm2_mm"],
                available_thicknesses_raw=json.dumps(material_data["thicknesses"]),
                description=material_data["description"],
                color_hex=material_data.get("color", "#0ea5e9"),
                is_active=True,
            )

            session.add(material)
            print(f"Created {material_data['name']}")

        await session.commit()
        print("\n✓ Database seeded successfully!")


if __name__ == "__main__":
    print("Seeding LaserHub database...")
    asyncio.run(seed_database())
