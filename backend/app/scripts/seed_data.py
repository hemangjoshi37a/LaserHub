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
    },
    {
        "name": "Acrylic (Black)",
        "type": "acrylic",
        "rate_per_cm2_mm": 0.055,
        "thicknesses": [2, 3, 5, 6],
        "description": "Opaque black acrylic for elegant designs",
    },
    {
        "name": "MDF Wood",
        "type": "wood_mdf",
        "rate_per_cm2_mm": 0.03,
        "thicknesses": [3, 6, 9, 12],
        "description": "Medium density fiberboard, great for engraving",
    },
    {
        "name": "Baltic Birch Plywood",
        "type": "plywood",
        "rate_per_cm2_mm": 0.04,
        "thicknesses": [3, 6, 9, 12, 18],
        "description": "High quality plywood with clean edges",
    },
    {
        "name": "Genuine Leather",
        "type": "leather",
        "rate_per_cm2_mm": 0.08,
        "thicknesses": [1, 2, 3],
        "description": "Premium leather for wallets, belts, and accessories",
    },
    {
        "name": "Cardstock",
        "type": "paper",
        "rate_per_cm2_mm": 0.02,
        "thicknesses": [0.3, 0.5],
        "description": "Heavy weight paper for intricate cut designs",
    },
    {
        "name": "Aluminum Sheet",
        "type": "aluminum",
        "rate_per_cm2_mm": 0.15,
        "thicknesses": [0.5, 1, 2],
        "description": "Thin aluminum for marking and light cutting",
    },
    {
        "name": "Stainless Steel",
        "type": "stainless_steel",
        "rate_per_cm2_mm": 0.25,
        "thicknesses": [0.5, 1],
        "description": "Premium stainless steel for durable parts",
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
                available_thicknesses=json.dumps(material_data["thicknesses"]),
                description=material_data["description"],
                is_active=True,
            )

            session.add(material)
            print(f"Created {material_data['name']}")

        await session.commit()
        print("\n✓ Database seeded successfully!")


if __name__ == "__main__":
    print("Seeding LaserHub database...")
    asyncio.run(seed_database())
