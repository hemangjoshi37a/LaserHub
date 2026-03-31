"""
Security utilities for authentication and authorization
"""

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Header, HTTPException, Security, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)


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


async def require_verified_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> dict:
    """Require verified user"""
    user = await get_current_user(credentials)
    # Note: In production, add is_verified field to User model
    # For now, only require authentication
    return user
