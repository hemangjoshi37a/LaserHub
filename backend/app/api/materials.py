"""
Materials API endpoints
"""

import json
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models import Material
from app.schemas import MaterialResponse, MaterialCreate

router = APIRouter()


@router.get("/", response_model=list[MaterialResponse])
async def list_materials(db: AsyncSession = Depends(get_db)):
    """List all available materials"""
    result = await db.execute(
        select(Material).where(Material.is_active == True)
    )
    materials = result.scalars().all()
    return materials


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(material_id: int, db: AsyncSession = Depends(get_db)):
    """Get material details"""
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    return material


@router.post("/", response_model=MaterialResponse)
async def create_material(
    material: MaterialCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create new material (admin only)"""
    # Convert thicknesses to JSON string
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
    
    return db_material
