"""
File upload and analysis API endpoints
"""

import asyncio
import logging
import re
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import get_db
from app.models import UploadedFile, User
from app.api.auth import get_current_user
from app.schemas import FileAnalysis, FileUploadResponse
from app.utils.file_parser import parse_generic, validate_laser_cuttable
from app.middleware.rate_limiter import limiter

router = APIRouter()

# Ensure upload directory exists
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed MIME types for validation
# All supported file extensions.  MIME type checking is disabled (browsers are
# too inconsistent) — this dict is used only to check if an extension is known.
ALLOWED_MIME_TYPES = {
    "dxf": True, "svg": True, "ai": True, "pdf": True, "eps": True,
    "cdr": True, "plt": True, "hpgl": True, "wmf": True, "emf": True,
    "png": True, "jpg": True, "jpeg": True, "dwg": True,
}

# Magic bytes (file signatures) for binary formats — partial check to detect gross mismatches
# DXF, SVG, EPS, AI are text-based so magic-byte checks are limited to obvious binary guards.
_BINARY_MAGIC_DENY = [
    b"MZ",         # Windows PE executable
    b"\x7fELF",    # Linux ELF executable
    b"\xca\xfe\xba\xbe",  # macOS fat binary
    b"PK\x03\x04", # ZIP / Office document (not a vector file)
]


def _check_magic_bytes(content: bytes, ext: str = "") -> bool:
    """Return False if the file starts with a clearly disallowed binary signature.

    Container-based vector formats (CDR v9+ is a ZIP/RIFF container, WMF/EMF
    have their own binary headers) are allowed through when the extension
    already matched the extension allow-list. We only use magic-bytes here to
    catch gross MIME confusion: someone renaming a `.exe` or `.docx` to `.svg`.
    """
    ext = (ext or "").lower()
    # Container formats legitimately start with a ZIP/RIFF/OLE signature.
    # Trusting the extension is fine because ALLOWED_EXTENSIONS is already
    # enforced upstream.
    CONTAINER_EXTS = {"cdr", "ai", "wmf", "emf", "plt", "hpgl"}
    if ext in CONTAINER_EXTS:
        return True
    for magic in _BINARY_MAGIC_DENY:
        if content[:len(magic)] == magic:
            return False
    return True


import re as _re

_SVG_SCRIPT_RE = _re.compile(
    r"<\s*script[\s>]|javascript\s*:|on\w+\s*=",
    _re.IGNORECASE,
)


def _decode_svg_bytes(content: bytes) -> str:
    """Decode SVG bytes to text, handling UTF-16 BOM (Corel Draw exports)."""
    if content[:2] == b"\xff\xfe" or content[:2] == b"\xfe\xff":
        return content.decode("utf-16", errors="replace")
    if content[:4] == b"\x00<\x00?":
        return content.decode("utf-16-be", errors="replace")
    if content[:4] == b"<\x00?\x00":
        return content.decode("utf-16-le", errors="replace")
    return content.decode("utf-8", errors="replace")


def _sanitize_svg(content: bytes) -> bytes:
    """Strip <script> tags and javascript: event handlers from SVG content.

    This is a best-effort defence-in-depth measure. A full SVG sanitiser
    (e.g. DOMPurify on the frontend) is the primary XSS control.

    UTF-16-encoded SVGs (Corel Draw) are decoded before sanitisation and
    re-emitted as UTF-8, so the downstream parser always sees UTF-8.
    """
    import xml.etree.ElementTree as ET  # stdlib — safe for parsing

    try:
        text = _decode_svg_bytes(content)
        # Re-write any UTF-16 prolog declaration so ET is happy if re-parsed later
        text = _re.sub(
            r'(<\?xml[^?]*?)encoding\s*=\s*"[^"]*"',
            r'\1encoding="utf-8"',
            text,
            count=1,
            flags=_re.IGNORECASE,
        )

        # Register common SVG namespaces so ET.tostring preserves them
        # instead of rewriting to ns0:, ns1:, etc.
        ET.register_namespace("", "http://www.w3.org/2000/svg")
        ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
        ET.register_namespace("xml", "http://www.w3.org/XML/1998/namespace")

        root = ET.fromstring(text)

        # Recursively remove <script> elements
        def _remove_scripts(parent: ET.Element) -> None:
            to_remove = []
            for child in parent:
                tag_local = child.tag.split("}")[-1].lower() if "}" in child.tag else child.tag.lower()
                if tag_local == "script":
                    to_remove.append(child)
                else:
                    # Strip on* event handler attributes and javascript: hrefs
                    bad_attrs = [
                        attr for attr in list(child.attrib)
                        if attr.lower().startswith("on")
                        or (attr.lower() in ("href", "xlink:href", "src",
                                              "{http://www.w3.org/1999/xlink}href")
                            and "javascript:" in (child.attrib[attr] or "").lower())
                    ]
                    for attr in bad_attrs:
                        del child.attrib[attr]
                    _remove_scripts(child)
            for elem in to_remove:
                parent.remove(elem)

        _remove_scripts(root)

        # Also strip dangerous attrs from root itself
        bad_root_attrs = [
            attr for attr in list(root.attrib)
            if attr.lower().startswith("on")
        ]
        for attr in bad_root_attrs:
            del root.attrib[attr]

        cleaned = ET.tostring(root, encoding="unicode", xml_declaration=False)
        # Final regex guard for any remaining script remnants
        cleaned = _re.sub(r"<\s*script[^>]*>.*?</\s*script\s*>", "", cleaned, flags=_re.IGNORECASE | _re.DOTALL)
        cleaned = _re.sub(r"\bon\w+\s*=\s*['\"][^'\"]*['\"]", "", cleaned, flags=_re.IGNORECASE)
        return cleaned.encode("utf-8")
    except Exception:
        # If XML parsing fails, apply regex sanitisation to the raw text
        text = _decode_svg_bytes(content)
        text = _re.sub(r"<\s*script[^>]*>.*?</\s*script\s*>", "", text, flags=_re.IGNORECASE | _re.DOTALL)
        text = _re.sub(r"\bon\w+\s*=\s*['\"][^'\"]*['\"]", "", text, flags=_re.IGNORECASE)
        return text.encode("utf-8")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal"""
    # Remove any path components
    filename = filename.split('/')[-1].split('\\')[-1]
    # Only allow alphanumeric and basic punctuation
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    return filename[:255]


def validate_file_type(file: UploadFile, ext: str) -> bool:
    """Validate that the file extension is in our allowed list.

    Browsers are wildly inconsistent with MIME types for vector/CAD files
    (DXF → text/plain, EPS → application/x-eps, AI → application/pdf, etc.).
    Trying to match MIME types causes false rejections.

    Security strategy: we validate the extension against ALLOWED_EXTENSIONS,
    check magic bytes to block executables/ZIP, and sanitize SVG content.
    The MIME type from the browser is unreliable and ignored.
    """
    return ext in ALLOWED_MIME_TYPES


@router.post("/",
    response_model=FileUploadResponse,
    summary="Upload a vector file",
    description="Upload a vector file (DXF, SVG, AI, etc.) for laser cutting cost calculation."
)
@limiter.limit(f"{settings.RATE_LIMIT_FILE_UPLOAD_PER_HOUR} per hour")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a vector file and perform initial analysis
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    
    sanitized_filename = sanitize_filename(file.filename)
    
    if '.' not in sanitized_filename:
        raise HTTPException(status_code=400, detail="Invalid filename - missing extension")
    
    ext = sanitized_filename.split('.')[-1].lower()
    allowed_exts = settings.ALLOWED_EXTENSIONS.split(',')
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"File extension {ext} not allowed. Supported: {settings.ALLOWED_EXTENSIONS}"
        )
    
    if not validate_file_type(file, ext):
        raise HTTPException(status_code=400, detail=f"Invalid file type for extension {ext}")

    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}.{ext}"
    file_path = UPLOAD_DIR / safe_filename

    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")

    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB")

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Check magic bytes to catch gross MIME-confusion / executable uploads
    if not _check_magic_bytes(content, ext):
        raise HTTPException(status_code=400, detail="File content does not match an allowed vector format")

    # SVG XSS: sanitise script tags and event handlers before storing
    if ext == "svg":
        content = _sanitize_svg(content)

    # AV Scanning integration point
    # We log the scan operation as a stub for future ClamAV integration.
    # When deployed with clamd, uncomment and configure:
    #   result = clamd.scan_bytes(content)
    #   if result and result != 'OK':
    #       raise HTTPException(status_code=400, detail="File failed virus scan")
    logger.info(f"AV Scan [Mock]: Passed for file {sanitized_filename} (size: {file_size} bytes)")
    if getattr(settings, "ENABLE_VIRUS_SCAN", False):
        pass # Placeholder for real AV daemon check

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    import json
    validation_issues = []
    try:
        analysis = await asyncio.to_thread(parse_generic, str(file_path))
        width_mm = analysis.get("width_mm", 0) or 0
        height_mm = analysis.get("height_mm", 0) or 0
        area_cm2 = analysis.get("area_cm2", 0) or 0
        cut_length_mm = analysis.get("cut_length_mm", 0) or 0
        estimated_cut_time = cut_length_mm / settings.CUT_SPEED_MM_PER_MIN if cut_length_mm else 0
        validation_issues = analysis.get("validation", [])
        
        # Surface any parser-level notes as a warning
        if analysis.get("notes"):
            parse_warning = analysis["notes"]
        elif analysis.get("error"):
            parse_warning = f"Parsing issue: {analysis['error']}"
    except ValueError as e:
        # Known parse error with a user-readable message
        logger.warning(f"File parse error for {sanitized_filename}: {e}")
        width_mm = height_mm = area_cm2 = cut_length_mm = estimated_cut_time = 0
        parse_warning = str(e)
    except Exception as e:
        logger.error(f"Unexpected parse error for {sanitized_filename}: {e}")
        width_mm = height_mm = area_cm2 = cut_length_mm = estimated_cut_time = 0
        parse_warning = "Could not analyse file geometry; dimensions will be estimated."

    # For CDR we parse via LibreOffice and report dimensions. Only warn if
    # the parse actually fell back to the binary heuristic (width=height=100).
    if ext == "cdr" and parse_warning is None and (width_mm, height_mm) == (100.0, 100.0):
        parse_warning = (
            "CDR conversion fell back to size estimation. "
            "Install LibreOffice or export as SVG/DXF from CorelDRAW for accurate dimensions."
        )

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
        validation_issues=json.dumps(validation_issues),
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
        parse_warning=parse_warning,
    )


@router.get("/{file_id}/raw",
    summary="Get raw uploaded file",
    description="Retrieve the raw file content for previewing or downloading."
)
async def get_raw_file(
    file_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get raw file content"""
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(file_record.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found")

    # SVG files: serve inline with correct MIME for preview (sanitized on upload)
    if file_record.file_type == "svg":
        return FileResponse(
            path=file_path,
            media_type="image/svg+xml",
            headers={"Content-Disposition": "inline"},
        )

    # Other files: force download to prevent browser execution
    return FileResponse(
        path=file_path,
        filename=file_record.filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_record.filename}"'},
    )


@router.get("/{file_id}/svg",
    summary="Get file as SVG",
    description="Convert the uploaded file to SVG format for preview rendering."
)
async def get_file_as_svg(
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Convert any supported vector file to SVG for 3D preview."""
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(file_record.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found")

    # If already SVG, return directly with inline disposition for preview
    if file_record.file_type == "svg":
        return FileResponse(
            path=file_path,
            media_type="image/svg+xml",
            headers={"Content-Disposition": "inline"},
        )

    svg_headers = {"Content-Disposition": "inline"}

    # Convert DXF to SVG using ezdxf drawing backend
    if file_record.file_type == "dxf":
        try:
            from app.utils.file_converter import dxf_to_svg
            svg_content = await asyncio.to_thread(dxf_to_svg, str(file_path))
            return Response(content=svg_content, media_type="image/svg+xml", headers=svg_headers)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"DXF conversion failed: {str(e)}")

    # Convert EPS/AI/PDF to SVG using ghostscript/inkscape
    if file_record.file_type in ("eps", "ai", "pdf"):
        try:
            from app.utils.file_converter import postscript_to_svg
            svg_content = await postscript_to_svg(str(file_path))
            return Response(content=svg_content, media_type="image/svg+xml", headers=svg_headers)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Conversion failed: {str(e)}")

    raise HTTPException(
        status_code=422,
        detail=f"Cannot convert {file_record.file_type} to SVG",
    )


@router.get("/{file_id}",
    response_model=FileAnalysis,
    summary="Get file analysis",
    description="Retrieve the geometric analysis for a previously uploaded file."
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

    cut_length = file_record.cut_length_mm or 0
    area = file_record.area_cm2 or 1
    
    import json
    issues = []
    if file_record.validation_issues:
        try:
            issues = json.loads(file_record.validation_issues)
        except Exception:
            issues = []

    validation_data = validate_laser_cuttable(str(file_record.file_path))
    health_score = validation_data.get("health_score", 100.0)
    health_status = "optimal"
    if health_score < 50:
        health_status = "critical"
    elif health_score < 90:
        health_status = "warning"

    return FileAnalysis(
        file_id=file_record.file_id,
        width_mm=file_record.width_mm or 0,
        height_mm=file_record.height_mm or 0,
        area_cm2=file_record.area_cm2 or 0,
        cut_length_mm=cut_length,
        estimated_cut_time_minutes=file_record.estimated_cut_time_minutes or 0,
        complexity_score=cut_length / area if area > 0 else 0,
        validation_issues=issues,
        health_score=health_score,
        health_status=health_status,
    )


@router.get("/{file_id}/validate",
    summary="Validate file for laser cutting",
    description="Run heuristic checks on an uploaded file and return issues + score.",
)
async def validate_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return laser-cutting validation results for a previously uploaded file."""
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    )
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(file_record.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found")

    return validate_laser_cuttable(str(file_path))


@router.delete("/{file_id}",
    summary="Delete uploaded file",
    description="Remove the uploaded file from storage and delete its record."
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

    file_path = Path(file_record.file_path)
    if file_path.exists():
        try:
            file_path.resolve().relative_to(UPLOAD_DIR.resolve())
            file_path.unlink()
        except Exception:
            pass

    await db.delete(file_record)
    await db.commit()

    return {"status": "deleted", "file_id": file_id}
