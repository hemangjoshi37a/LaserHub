"""
Authentication and User API endpoints
"""

import uuid
import re
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.middleware.rate_limiter import limiter
from app.models import Material, Order, UploadedFile, User, Vendor
from app.schemas import (
    OrderResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    Token,
    UserCreate,
    UserResponse,
    VerificationRequest,
)

from app.services.email_service import EmailService

router = APIRouter()

async def send_verification_email(email: str, name: str, token: str):
    """Send real verification email"""
    await EmailService.send_verification_email(email, name, token)

async def send_reset_email(email: str, token: str):
    """Send real password reset email"""
    await EmailService.send_password_reset(email, token)

def slugify(text: str) -> str:
    return re.sub(r'[\s\W\_]+', '-', text).lower().strip('-')

@router.post("/register", response_model=UserResponse)
@limiter.limit("5 per minute")
async def register(
    request: Request,
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user"""
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user
    verification_token = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)

    new_user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hashed_password,
        role=user_data.role or "customer",
        verification_token=verification_token,
        is_verified=False
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # If role is vendor, create a minimal vendor profile so they appear in listings
    if new_user.role == "vendor":
        base_shop_name = f"{new_user.name}'s Shop"
        base_slug = slugify(base_shop_name)
        
        # Ensure slug uniqueness
        unique_slug = base_slug
        counter = 1
        while True:
            existing = await db.execute(select(Vendor).where(Vendor.slug == unique_slug))
            if not existing.scalar_one_or_none():
                break
            unique_slug = f"{base_slug}-{counter}"
            counter += 1
            
        new_vendor = Vendor(
            user_id=new_user.id,
            shop_name=f"{new_user.name}'s Shop" if counter == 1 else f"{new_user.name}'s Shop {counter}",
            slug=unique_slug,
            is_active=True,
            is_verified=False,
            description=f"Professional laser cutting services by {new_user.name}"
        )
        db.add(new_vendor)
        await db.commit()

    # Auto-link any previously-placed guest orders with this email to the new user
    try:
        guest_orders = await db.execute(
            select(Order).where(
                Order.customer_email == new_user.email,
                Order.user_id.is_(None),
            )
        )
        for guest_order in guest_orders.scalars().all():
            guest_order.user_id = new_user.id
        await db.commit()
    except Exception:
        # Don't block registration if linking fails
        await db.rollback()

    # Send verification email
    background_tasks.add_task(send_verification_email, new_user.email, new_user.name, verification_token)

    return new_user

@router.post("/login", response_model=Token)
@limiter.limit("5 per minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Login and get JWT token"""
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_verified:
        # In some apps, you might allow login but restrict features
        # For now, we'll just log them in but they should verify
        pass

    access_token = create_access_token(
        data={"sub": user.email, "id": user.id, "role": user.role}
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/google")
async def google_login(
    request_data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Login or register via Google OAuth credential"""
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    credential = request_data.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential")

    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )

        email = idinfo.get("email")
        name = idinfo.get("name", email.split("@")[0])

        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")

        # Check if user exists
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            # Auto-register Google users
            user = User(
                email=email,
                name=name,
                hashed_password=get_password_hash(str(uuid.uuid4())),  # Random password
                is_verified=True,  # Google-verified email
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # Create JWT token
        access_token = create_access_token(
            data={"sub": user.email, "id": user.id, "role": user.role}
        )
        return {"access_token": access_token, "token_type": "bearer", "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_admin": user.is_admin or user.role == "admin",
            "is_verified": user.is_verified,
            "created_at": str(user.created_at) if user.created_at else None,
        }}

    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("auth.google_login_failed")
        raise HTTPException(
            status_code=502,
            detail="Authentication provider error. Please try again.",
            headers={"X-Error-Code": "AUTH_PROVIDER_UNAVAILABLE"}
        )

@router.post("/verify", status_code=status.HTTP_200_OK)
async def verify_email(request: VerificationRequest, db: AsyncSession = Depends(get_db)):
    """Verify email with token"""
    result = await db.execute(select(User).where(User.verification_token == request.token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    user.is_verified = True
    user.verification_token = None
    await db.commit()

    return {"message": "Email verified successfully"}

@router.post("/password-reset-request")
@limiter.limit("3 per minute")
async def request_password_reset(
    http_request: Request,
    request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Request password reset"""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if user:
        reset_token = str(uuid.uuid4())
        user.reset_token = reset_token
        await db.commit()
        background_tasks.add_task(send_reset_email, user.email, reset_token)

    # Always return 200 to prevent user enumeration
    return {"message": "If the email exists, a reset link has been sent"}

@router.post("/password-reset-confirm")
async def confirm_password_reset(request: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    """Confirm password reset"""
    result = await db.execute(select(User).where(User.reset_token == request.token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    user.hashed_password = get_password_hash(request.new_password)
    user.reset_token = None
    await db.commit()

    return {"message": "Password reset successfully"}

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user.

    Uses decode_access_token which validates exp, iat, and iss claims.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # decode_access_token validates exp, iat, and iss="laserhub-api"
        payload = decode_access_token(token)
        email: str = payload.get("sub")
        user_id = payload.get("id")
        if email is None:
            raise credentials_exception
    except HTTPException:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    # Extra check: token user_id must match DB record (prevents stale tokens
    # from working after account deletion / id reassignment)
    if user_id is not None and user.id != user_id:
        raise credentials_exception

    return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user)):
        if user.role not in self.allowed_roles and not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for this role",
            )
        return user

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user

@router.get("/orders", response_model=List[OrderResponse])
async def get_user_orders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get orders for current user"""
    # PERF-DB-01: eager-load material + uploaded_file to avoid N+1 per-row queries
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.material),
            selectinload(Order.uploaded_file),
        )
        .where(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()

    order_responses = []
    for order in orders:
        material = order.material
        uploaded_file = order.uploaded_file

        order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=uploaded_file.file_id if uploaded_file else str(order.file_id),
            material_name=material.name if material else "Unknown",
            thickness_mm=order.thickness_mm,
            quantity=order.quantity,
            total_amount=order.total_amount,
            status=order.status,
            customer_email=order.customer_email,
            customer_name=order.customer_name,
            shipping_address=order.shipping_address,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))

    return order_responses
