"""
File upload and analysis API endpoints
"""

import uuid
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Security, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_verified_user
from app.models import UploadedFile
from app.schemas import FileAnalysis, FileUploadResponse
from app.utils.file_parser import parse_generic
from app.middleware.rate_limiter import limiter

router = APIRouter()

# Ensure upload directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed MIME types for validation
ALLOWED_MIME_TYPES = {
    "dxf": ["application/dxf", "image/vnd.dxf"],
    "svg": ["image/svg+xml"],
    "ai": ["application/illustrator", "application/postscript"],
    "pdf": ["application/pdf"],
    "eps": ["application/postscript", "application/eps", "image/eps"],
}


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal"""
    # Remove any path components
    filename = filename.split('/')[-1].split('\\')[-1]
    # Only allow alphanumeric and basic punctuation
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    return filename[:255]


def validate_file_type(file: UploadFile, ext: str) -> bool:
    """Validate file MIME type matches extension"""
    if not file.content_type:
        return False
    
    allowed_types = ALLOWED_MIME_TYPES.get(ext, [])
    if file.content_type not in allowed_types:
        # Check if content type could be valid based on extension
        if ext == "dxf" and "application" in file.content_type:
            return True
        if ext in ["ai", "eps"] and "postscript" in file.content_type:
            return True
    
    return file.content_type in allowed_types


@router.post("/",
    response_model=FileUploadResponse,
    summary="Upload a vector file",
    description="Upload a vector file (DXF, SVG, AI, etc.) for laser cutting cost calculation. The file is analyzed to extract dimensions and cut length."
)
@limiter.limit(settings.RATE_LIMIT_FILE_UPLOAD_PER_HOUR)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Security(require_verified_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a vector file and perform initial analysis
    """
    # Sanitize filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    
    sanitized_filename = sanitize_filename(file.filename)
    
    # Validate filename has extension
    if '.' not in sanitized_filename:
        raise HTTPException(status_code=400, detail="Invalid filename - missing extension")
    
    # Check file extension
    ext = sanitized_filename.split('.')[-1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension {ext} not allowed. Supported: {settings.ALLOWED_EXTENSIONS}"
        )
    
    # Validate MIME type
    if not validate_file_type(file, ext):
        raise HTTPException(status_code=400, detail=f"Invalid file type for extension {ext}")

    # Generate secure file ID and path
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}.{ext}"
    file_path = UPLOAD_DIR / safe_filename

    # Ensure file_path stays within upload directory
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Save physical file with size check
    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB")

    # Additional size validation
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Write file atomically
    with open(file_path, "wb") as f:
        f.write(content)

    # Verify file was written and has expected size
    if not file_path.exists() or file_path.stat().st_size != file_size:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail="Failed to save file")

    # Try to parse file and extract dimensions
    analysis_results = None
    try:
        analysis = parse_generic(str(file_path))
        width_mm = analysis.get("width_mm", 0)
        height_mm = analysis.get("height_mm", 0)
        area_cm2 = analysis.get("area_cm2", 0)
        cut_length_mm = analysis.get("cut_length_mm", 0)
        estimated_cut_time = cut_length_mm / settings.CUT_SPEED_MM_PER_MIN if cut_length_mm else 0
        analysis_results = "completed"
    except Exception as e:
        # If parsing fails, store file but mark analysis as pending
        width_mm = height_mm = area_cm2 = cut_length_mm = estimated_cut_time = None
        analysis_results = "failed"

    # Save to database with user association
    uploaded_file = UploadedFile(
        file_id=file_id,
        filename=sanitized_filename,
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
        filename=sanitized_filename,
        file_size=file_size,
        file_type=ext,
        upload_url=f"/api/upload/{file_id}",
    )


@router.delete("/{file_id}",
    summary="Delete uploaded file",
    description="Remove the uploaded file from storage and delete its database record."
)
@limiter.limit(settings.RATE_LIMIT_FILE_UPLOAD_PER_HOUR)
async def delete_file(
    request: Request,
    file_id: str,
    current_user: dict = Security(require_verified_user),
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
        # Security: Verify file is in upload directory
        try:
            file_path.resolve().relative_to(UPLOAD_DIR.resolve())
            file_path.unlink()
        except (ValueError, FileNotFoundError):
            # File not in upload directory or already deleted
            pass

    # Delete database record
    await db.delete(file_record)
    await db.commit()

    return {"status": "deleted", "file_id": file_id}


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
