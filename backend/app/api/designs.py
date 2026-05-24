"""
Design management API - create, share, like designs
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Design, DesignLike, DesignListing, UploadedFile, User
from app.schemas import DesignCreate
from app.api.auth import get_current_user


class TagsUpdate(BaseModel):
    tags: List[str]


router = APIRouter()


# File types we can render directly inline as an image preview (no conversion).
_INLINE_PREVIEW_TYPES = {"svg", "png", "jpg", "jpeg"}
# Vector types the upload service can rasterize/convert to an inline SVG preview.
_CONVERTIBLE_PREVIEW_TYPES = {"dxf", "eps", "ai", "pdf"}


def _file_preview_url(uploaded_file: Optional[UploadedFile]) -> Optional[str]:
    """Derive a usable, relative preview URL for a design's linked uploaded file.

    Returns a path (e.g. ``/api/upload/<uuid>/raw``) — NOT an absolute URL — to
    mirror the existing ``/static/...`` thumbnail convention. Marketplace's
    ``_abs_thumb`` (and the frontend) turn relative paths into absolute ones.

    - SVG / raster images -> served inline via the ``/raw`` route (no conversion).
    - DXF / EPS / AI / PDF -> converted to an inline SVG via the ``/svg`` route.
    - Anything else (or no linked file) -> ``None`` so the frontend shows its
      own branded placeholder instead of a broken image.
    """
    if uploaded_file is None or not getattr(uploaded_file, "file_id", None):
        return None
    ftype = (uploaded_file.file_type or "").lower()
    if ftype in _INLINE_PREVIEW_TYPES:
        return f"/api/upload/{uploaded_file.file_id}/raw"
    if ftype in _CONVERTIBLE_PREVIEW_TYPES:
        return f"/api/upload/{uploaded_file.file_id}/svg"
    return None


async def _backfill_design_thumbnails(db: AsyncSession, designs: List[Design]) -> None:
    """Populate ``thumbnail_url`` for designs that lack one but have a linked file.

    This persists the derived preview URL onto the ``designs.thumbnail_url``
    column so every consumer of that column (marketplace browse/featured/detail,
    dashboards, this API) renders a real preview — for existing designs too, not
    just newly created ones. Designs with an explicit thumbnail are left intact;
    designs whose source file can't be previewed keep ``thumbnail_url`` null.
    """
    missing = [d for d in designs if not d.thumbnail_url and d.file_id is not None]
    if not missing:
        return

    file_pks = {d.file_id for d in missing}
    rows = await db.execute(
        select(UploadedFile).where(UploadedFile.id.in_(file_pks))
    )
    files_by_pk = {f.id: f for f in rows.scalars().all()}

    changed = False
    for d in missing:
        url = _file_preview_url(files_by_pk.get(d.file_id))
        if url:
            d.thumbnail_url = url
            changed = True

    if changed:
        await db.commit()


@router.post("/")
async def create_design(
    design_data: DesignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new design from an uploaded file"""
    # Verify file exists
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.file_id == design_data.file_id)
    )
    uploaded_file = result.scalar_one_or_none()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Only the uploader (or a platform super_admin) may link this file to a design.
    # `uploaded_by` may not yet exist on UploadedFile — fall back to current_user.id
    # so pre-migration uploads remain usable. Post-migration, the check is enforced.
    file_owner = getattr(uploaded_file, "uploaded_by", None)
    if file_owner is not None and file_owner != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="You do not own this file")

    design = Design(
        creator_id=current_user.id,
        file_id=uploaded_file.id,
        title=design_data.title,
        description=design_data.description,
        category=design_data.category,
        tags=json.dumps(design_data.tags) if design_data.tags else None,
        is_public=design_data.is_public,
        # Auto-derive a preview from the linked file so the design renders a real
        # thumbnail everywhere immediately (None for non-previewable file types).
        thumbnail_url=_file_preview_url(uploaded_file),
    )

    db.add(design)
    await db.commit()
    await db.refresh(design)

    return {
        "id": design.id,
        "title": design.title,
        "is_public": design.is_public,
        "thumbnail_url": design.thumbnail_url,
        "created_at": design.created_at,
    }


@router.post("/{design_id}/share")
async def toggle_design_sharing(
    design_id: int,
    is_public: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle whether a design is shared publicly (open-source)"""
    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    if design.creator_id != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to modify this design")

    design.is_public = is_public
    await db.commit()

    return {"id": design.id, "is_public": design.is_public}


@router.post("/{design_id}/like")
async def toggle_like(
    design_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Like/unlike a design"""
    user_id = current_user.id
    # Check if already liked
    result = await db.execute(
        select(DesignLike).where(
            DesignLike.user_id == user_id,
            DesignLike.design_id == design_id
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        # Decrement likes
        design_result = await db.execute(select(Design).where(Design.id == design_id))
        design = design_result.scalar_one_or_none()
        if design:
            design.likes_count = max(0, design.likes_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = DesignLike(user_id=user_id, design_id=design_id)
        db.add(like)
        design_result = await db.execute(select(Design).where(Design.id == design_id))
        design = design_result.scalar_one_or_none()
        if design:
            design.likes_count = (design.likes_count or 0) + 1
        await db.commit()
        return {"liked": True}


@router.get("/my")
async def get_my_designs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get designs created by current user"""
    result = await db.execute(
        select(Design).where(Design.creator_id == current_user.id).order_by(Design.created_at.desc())
    )
    designs = list(result.scalars().all())

    # Backfill missing previews from linked files so existing designs get a real
    # thumbnail (also persists to the column, fixing marketplace/browse views).
    await _backfill_design_thumbnails(db, designs)

    return [
        {
            "id": d.id, "title": d.title, "description": d.description,
            "category": d.category, "is_public": d.is_public,
            "thumbnail_url": d.thumbnail_url,
            "tags": json.loads(d.tags) if d.tags else [],
            "likes_count": d.likes_count, "downloads_count": d.downloads_count,
            "created_at": d.created_at,
        }
        for d in designs
    ]


@router.put("/{design_id}/tags")
async def update_design_tags(
    design_id: int,
    body: TagsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update tags for a design"""
    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    if design.creator_id != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to modify this design")

    # Validate: max 10 tags, max 30 chars each
    tags = [t.strip()[:30] for t in body.tags if t.strip()][:10]
    design.tags = json.dumps(tags)
    await db.commit()
    return {"design_id": design_id, "tags": tags}
