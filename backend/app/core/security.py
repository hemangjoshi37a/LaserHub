"""
Security utilities for authentication and authorization
"""

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
import bcrypt

from fastapi import Header, HTTPException, Security, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings


# Using bcrypt directly to avoid passlib incompatibility with newer bcrypt versions
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash password"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token with security claims"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "iss": "laserhub-api"
    })
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token"""
    expires_delta = timedelta(days=7) # Refresh tokens last 7 days
    return create_access_token(data, expires_delta)


def decode_access_token(token: str) -> dict:
    """Decode JWT access token with validation"""
    try:
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM],
            issuer="laserhub-api"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def generate_api_key() -> tuple[str, str]:
    """Generate a new API key and its hash"""
    api_key = f"lk_{secrets.token_urlsafe(32)}"
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    return api_key, api_key_hash


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> dict:
    """Get current user from JWT token"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    token = credentials.credentials
    payload = decode_access_token(token)
    
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    return {
        "email": email,
        "is_admin": payload.get("role") == "admin",
        "user_id": payload.get("id"),
        "auth_type": "jwt"
    }


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Require admin privileges"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


async def require_authentication(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> dict:
    """Require authentication for protected endpoints"""
    return await get_current_user(credentials)


def require_role(*allowed_roles: str):
    """Create a dependency that enforces the caller's TeamMember role is in allowed_roles.

    Usage:
        @router.get(..., dependencies=[Depends(require_role("owner", "operator"))])

    The check runs against the caller's TeamMember record within their vendor.
    A user without a vendor context (e.g. pure customer) is rejected.
    Owners pass all role checks implicitly.
    """
    async def _checker(
        credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    ) -> dict:
        user = await get_current_user(credentials)
        # Lazy import to avoid circular deps
        from sqlalchemy import select
        from app.core.database import async_session_maker
        from app.models import User as UserModel, Vendor, TeamMember

        async with async_session_maker() as db:
            u_res = await db.execute(select(UserModel).where(UserModel.email == user["email"]))
            db_user = u_res.scalar_one_or_none()
            if not db_user:
                raise HTTPException(status_code=401, detail="User not found")

            # Vendor owner?
            v_res = await db.execute(select(Vendor).where(Vendor.user_id == db_user.id))
            vendor = v_res.scalar_one_or_none()
            if vendor:
                user["vendor_id"] = vendor.id
                user["team_role"] = "owner"
                return user

            # Team member?
            tm_res = await db.execute(
                select(TeamMember).where(
                    TeamMember.user_id == db_user.id,
                    TeamMember.accepted == True,  # noqa: E712
                )
            )
            tm = tm_res.scalar_one_or_none()
            if not tm:
                raise HTTPException(status_code=403, detail="No team access")

            if tm.role not in allowed_roles and "owner" not in allowed_roles:
                # owners always implicitly allowed by presence of role in allowed list
                if tm.role != "owner":
                    raise HTTPException(status_code=403, detail=f"Role '{tm.role}' not permitted")

            user["vendor_id"] = tm.vendor_id
            user["team_role"] = tm.role
            return user

    return _checker


async def require_verified_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> dict:
    """Require verified user"""
    user = await get_current_user(credentials)
    # Note: In production, add is_verified field to User model
    # For now, only require authentication
    return user
