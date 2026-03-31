"""
Cost calculation API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Material, UploadedFile
from app.schemas import CostBreakdown, CostCalculationRequest, CostEstimate
from app.services.cost_calculator import calculate_total_cost

router = APIRouter()


@router.post("/",
    response_model=CostEstimate,
    summary="Calculate cost",
    description="Calculate detailed cost for laser cutting based on an uploaded file, selected material, thickness, and quantity. Includes breakdown of material, laser time, energy, setup fee, and tax."
)
async def calculate_cost(
    request: CostCalculationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate cost for laser cutting based on uploaded file and material selection
    """
    # Get uploaded file
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == request.file_id)
    )
    uploaded_file = result.scalar_one_or_none()

    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    if not uploaded_file.area_cm2 or not uploaded_file.cut_length_mm:
        raise HTTPException(
            status_code=400,
            detail="File analysis not available. Please re-upload the file."
        )

    # Get material with configs
    result = await db.execute(
        select(Material)
        .where(Material.id == request.material_id)
        .options(selectinload(Material.configs))
    )
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if not material.is_active:
        raise HTTPException(status_code=400, detail="Material is not available")

    # Find specific config for this thickness
    config = next((c for c in material.configs if c.thickness_mm == request.thickness_mm), None)
    
    if config and not config.is_in_stock:
        raise HTTPException(status_code=400, detail=f"Material with thickness {request.thickness_mm}mm is currently out of stock")

    # Fallback to general rate if no specific config found
    rate_per_cm2 = config.rate_per_cm2 if config else (material.rate_per_cm2_mm * request.thickness_mm)
    cut_speed = config.cut_speed_mm_min if config else settings.CUT_SPEED_MM_PER_MIN

    # Calculate cost using the service
    # We'll need to update calculate_total_cost to accept these new parameters
    from app.services.cost_calculator import calculate_total_cost_v2
    
    cost_data = calculate_total_cost_v2(
        area_cm2=uploaded_file.area_cm2,
        cut_length_mm=uploaded_file.cut_length_mm,
        thickness_mm=request.thickness_mm,
        rate_per_cm2=rate_per_cm2,
        cut_speed_mm_min=cut_speed,
        quantity=request.quantity,
    )

    return CostEstimate(
        file_id=request.file_id,
        material_name=material.name,
        thickness_mm=request.thickness_mm,
        quantity=request.quantity,
        breakdown=CostBreakdown(**cost_data),
        estimated_production_time_hours=cost_data["estimated_production_time_hours"],
    )


@router.get("/preview/{file_id}",
    summary="Get cost preview",
    description="Quickly estimate cost using a default material and thickness. Useful for showing instant pricing after upload."
)
async def preview_cost(file_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get cost preview for a file with default material
    """
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    uploaded_file = result.scalar_one_or_none()

    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Get default material
    result = await db.execute(select(Material).where(Material.is_active == True).limit(1))
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="No materials available")

    # Calculate with default thickness
    import json
    available_thicknesses = json.loads(material.available_thicknesses or "[3]")
    default_thickness = available_thicknesses[0] if available_thicknesses else 3.0

    cost_data = calculate_total_cost(
        area_cm2=uploaded_file.area_cm2 or 0,
        cut_length_mm=uploaded_file.cut_length_mm or 0,
        thickness_mm=default_thickness,
        material_rate=material.rate_per_cm2_mm,
        quantity=1,
    )

    return {
        "file_id": file_id,
        "preview_material": material.name,
        "preview_thickness_mm": default_thickness,
        "estimated_total": cost_data["total"],
        "note": "This is a preview. Select material and thickness for accurate pricing.",
    }
