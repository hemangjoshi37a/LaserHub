"""
Materials API endpoints
"""

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.admin import get_current_admin
from app.core.database import get_db
from app.models import Material, MaterialConfig
from app.schemas import (
    MaterialCreate, 
    MaterialResponse, 
    MaterialUpdate, 
    MaterialConfigCreate, 
    MaterialConfigResponse,
    MaterialConfigBase
)

router = APIRouter()


@router.get("/", response_model=List[MaterialResponse])
async def list_materials(db: AsyncSession = Depends(get_db)):
    """List all active materials with their configs"""
    result = await db.execute(
        select(Material)
        .where(Material.is_active == True)
        .options(selectinload(Material.configs))
    )
    materials = result.scalars().all()
    
    # We need to ensure available_thicknesses is parsed if it's a string
    # But MaterialResponse expects a list, and Pydantic will handle from_attributes
    return materials


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(material_id: int, db: AsyncSession = Depends(get_db)):
    """Get material details with configs"""
    result = await db.execute(
        select(Material)
        .where(Material.id == material_id)
        .options(selectinload(Material.configs))
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.post("/", response_model=MaterialResponse)
async def create_material(
    material_data: MaterialCreate,
    admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new material (admin only)"""
    new_material = Material(
        name=material_data.name,
        type=material_data.type.value,
        rate_per_cm2_mm=material_data.rate_per_cm2_mm,
        available_thicknesses=json.dumps(material_data.available_thicknesses),
        description=material_data.description
    )
    db.add(new_material)
    await db.commit()
    await db.refresh(new_material)
    
    # Create default configs for each thickness
    for thickness in material_data.available_thicknesses:
        config = MaterialConfig(
            material_id=new_material.id,
            thickness_mm=thickness,
            rate_per_cm2=material_data.rate_per_cm2_mm * thickness,
            cut_speed_mm_min=500.0, # Default speed
            is_in_stock=True
        )
        db.add(config)
    
    await db.commit()
    
    # Reload with configs
    result = await db.execute(
        select(Material)
        .where(Material.id == new_material.id)
        .options(selectinload(Material.configs))
    )
    return result.scalar_one()


@router.put("/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: int,
    material_data: MaterialUpdate,
    admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update material details (admin only)"""
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material_data.name is not None:
        material.name = material_data.name
    if material_data.type is not None:
        material.type = material_data.type.value
    if material_data.rate_per_cm2_mm is not None:
        material.rate_per_cm2_mm = material_data.rate_per_cm2_mm
    if material_data.available_thicknesses is not None:
        material.available_thicknesses = json.dumps(material_data.available_thicknesses)
    if material_data.description is not None:
        material.description = material_data.description
    if material_data.is_active is not None:
        material.is_active = material_data.is_active

    await db.commit()
    
    # Reload with configs
    result = await db.execute(
        select(Material)
        .where(Material.id == material.id)
        .options(selectinload(Material.configs))
    )
    return result.scalar_one()


@router.delete("/{material_id}")
async def deactivate_material(
    material_id: int,
    admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Deactivate a material instead of deletion (admin only)"""
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    material.is_active = False
    await db.commit()
    return {"status": "deactivated", "id": material_id}


# Material Config Endpoints
@router.post("/configs", response_model=MaterialConfigResponse)
async def create_material_config(
    config_data: MaterialConfigCreate,
    admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Add or update a granular thickness config"""
    # Check if exists
    result = await db.execute(
        select(MaterialConfig).where(
            MaterialConfig.material_id == config_data.material_id,
            MaterialConfig.thickness_mm == config_data.thickness_mm
        )
    )
    config = result.scalar_one_or_none()
    
    if config:
        config.rate_per_cm2 = config_data.rate_per_cm2
        config.cut_speed_mm_min = config_data.cut_speed_mm_min
        config.is_in_stock = config_data.is_in_stock
    else:
        config = MaterialConfig(**config_data.model_dump())
        db.add(config)
        
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/configs/{config_id}", response_model=MaterialConfigResponse)
async def update_material_config(
    config_id: int,
    config_data: MaterialConfigBase,
    admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a specific config"""
    result = await db.execute(select(MaterialConfig).where(MaterialConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    config.thickness_mm = config_data.thickness_mm
    config.rate_per_cm2 = config_data.rate_per_cm2
    config.cut_speed_mm_min = config_data.cut_speed_mm_min
    config.is_in_stock = config_data.is_in_stock
    
    await db.commit()
    await db.refresh(config)
    return config
