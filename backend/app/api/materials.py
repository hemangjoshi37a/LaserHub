"""
Materials API endpoints
"""

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Material
from app.schemas import MaterialCreate, MaterialResponse

router = APIRouter()


def material_to_dict(material: Material) -> Dict[str, Any]:
    """Convert Material model to dictionary with parsed thicknesses"""
    thicknesses = []
    if material.available_thicknesses:
        try:
            if isinstance(material.available_thicknesses, str):
                thicknesses = json.loads(material.available_thicknesses)
            elif isinstance(material.available_thicknesses, list):
                thicknesses = material.available_thicknesses
        except (json.JSONDecodeError, TypeError):
            thicknesses = []
    
    return {
        "id": material.id,
        "name": material.name,
        "type": material.type,
        "rate_per_cm2_mm": material.rate_per_cm2_mm,
        "available_thicknesses": thicknesses,
        "description": material.description,
        "is_active": material.is_active,
        "created_at": material.created_at.isoformat() if material.created_at else None,
    }


@router.get("/", response_model=list[MaterialResponse])
async def list_materials(db: AsyncSession = Depends(get_db)):
    """List all available materials"""
    result = await db.execute(
        select(Material).where(Material.is_active == True)
    )
    materials = result.scalars().all()
    return [material_to_dict(m) for m in materials]


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(material_id: int, db: AsyncSession = Depends(get_db)):
    """Get material details"""
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    return material_to_dict(material)


@router.post("/", response_model=MaterialResponse)
async def create_material(
    material: MaterialCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create new material (admin only)"""
    thicknesses_json = json.dumps(material.available_thicknesses)

    db_material = Material(
        name=material.name,
        type=material.type.value,
        rate_per_cm2_mm=material.rate_per_cm2_mm,
        available_thicknesses=thicknesses_json,
        description=material.description,
    )

    db.add(db_material)
    await db.commit()
    await db.refresh(db_material)

    return material_to_dict(db_material)
