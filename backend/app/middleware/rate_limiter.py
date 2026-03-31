"""
Rate limiting middleware using slowapi
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE} per minute"],
    storage_uri="memory://",
)

# Rate limit decorators
RATE_LIMIT_UPLOAD = f"{settings.RATE_LIMIT_FILE_UPLOAD_PER_HOUR} per hour"
RATE_LIMIT_ADMIN = f"{settings.RATE_LIMIT_AUTHENTICATED_PER_MINUTE} per minute"
RATE_LIMIT_AUTH = f"{settings.RATE_LIMIT_PER_MINUTE} per minute"
RATE_LIMIT_CALCULATE = f"{settings.RATE_LIMIT_PER_MINUTE} per minute"
RATE_LIMIT_ORDERS = f"{settings.RATE_LIMIT_AUTHENTICATED_PER_MINUTE} per minute"
