"""
Authentication and User API endpoints
"""

import uuid
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.models import Material, Order, User
from app.schemas import (
    OrderResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    Token,
    UserCreate,
    UserResponse,
    VerificationRequest,
)

router = APIRouter()

async def send_verification_email(email: str, token: str):
    """Simulate sending verification email"""
    print(f"DEBUG: Sending verification email to {email} with token {token}")
    # In a real app, use a mail service here

async def send_reset_email(email: str, token: str):
    """Simulate sending password reset email"""
    print(f"DEBUG: Sending reset email to {email} with token {token}")
    # In a real app, use a mail service here

@router.post("/register", response_model=UserResponse)
async def register(
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
        verification_token=verification_token,
        is_verified=False
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Send verification email
    background_tasks.add_task(send_verification_email, new_user.email, verification_token)

    return new_user

@router.post("/login", response_model=Token)
async def login(
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
        data={"sub": user.email, "id": user.id, "role": "user"}
    )
    return {"access_token": access_token, "token_type": "bearer"}

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
async def request_password_reset(
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
from jose import JWTError, jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
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
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()

    order_responses = []
    for order in orders:
        material_result = await db.execute(
            select(Material).where(Material.id == order.material_id)
        )
        material = material_result.scalar_one_or_none()

        order_responses.append(OrderResponse(
            id=order.id,
            order_number=order.order_number,
            file_id=str(order.file_id),
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
