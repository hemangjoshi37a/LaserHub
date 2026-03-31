"""
File upload and analysis API endpoints
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models import UploadedFile
from app.schemas import FileAnalysis, FileUploadResponse
from app.utils.file_parser import parse_generic

router = APIRouter()

# Ensure upload directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/",
    response_model=FileUploadResponse,
    summary="Upload a vector file",
    description="Upload a vector file (DXF, SVG, AI, etc.) for laser cutting cost calculation. The file is analyzed to extract dimensions and cut length."
)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a vector file and perform initial analysis
    """
    # Check file extension
    ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ''
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension {ext} not allowed. Supported: {settings.ALLOWED_EXTENSIONS}"
        )

    # Generate unique file ID and path
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}.{ext}"

    # Save physical file
    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    with open(file_path, "wb") as f:
        f.write(content)

    # Try to parse file and extract dimensions
    try:
        analysis = parse_generic(str(file_path))
        width_mm = analysis.get("width_mm", 0)
        height_mm = analysis.get("height_mm", 0)
        area_cm2 = analysis.get("area_cm2", 0)
        cut_length_mm = analysis.get("cut_length_mm", 0)
        estimated_cut_time = cut_length_mm / settings.CUT_SPEED_MM_PER_MIN if cut_length_mm else 0
    except Exception:
        # If parsing fails, store file but mark analysis as pending
        width_mm = height_mm = area_cm2 = cut_length_mm = estimated_cut_time = None

    # Save to database
    uploaded_file = UploadedFile(
        file_id=file_id,
        filename=file.filename,
        file_path=str(file_path),
        file_size=file_size,
        file_type=ext,
        width_mm=width_mm,
        height_mm=height_mm,
        area_cm2=area_cm2,
        cut_length_mm=cut_length_mm,
        estimated_cut_time_minutes=estimated_cut_time,
    )
    db.add(uploaded_file)
    await db.commit()
    await db.refresh(uploaded_file)

    return FileUploadResponse(
        file_id=file_id,
        filename=file.filename,
        file_size=file_size,
        file_type=ext,
        upload_url=f"/api/upload/{file_id}",
    )


@router.get("/{file_id}",
    response_model=FileAnalysis,
    summary="Get file analysis",
    description="Retrieve the geometric analysis (dimensions, area, cut length) for a previously uploaded file."
)
async def get_file_analysis(
    file_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get analysis results for uploaded file"""
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    return FileAnalysis(
        file_id=file_record.file_id,
        width_mm=file_record.width_mm or 0,
        height_mm=file_record.height_mm or 0,
        area_cm2=file_record.area_cm2 or 0,
        cut_length_mm=file_record.cut_length_mm or 0,
        estimated_cut_time_minutes=file_record.estimated_cut_time_minutes or 0,
        complexity_score=(file_record.cut_length_mm or 0) / (file_record.area_cm2 or 1),
    )


@router.delete("/{file_id}",
    summary="Delete uploaded file",
    description="Remove the uploaded file from storage and delete its database record."
)
async def delete_file(
    file_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete uploaded file"""
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete physical file
    file_path = Path(file_record.file_path)
    if file_path.exists():
        file_path.unlink()

    # Delete database record
    await db.delete(file_record)
    await db.commit()

    return {"status": "deleted", "file_id": file_id}
