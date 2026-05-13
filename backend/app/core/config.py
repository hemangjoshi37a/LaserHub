"""
Configuration settings for LaserHub
"""

import os
from pathlib import Path
from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

# Base directory of the backend
BASE_DIR = Path(__file__).parent.parent.parent

DEFAULT_INSECURE_KEYS = {"change-this-secret-key-in-production", "dev-secret-key"}

class Settings(BaseSettings):
    """Application settings"""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./laserhub.db"

    # Security
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    # 30 days — persistent sessions. Frontend caches token in localStorage.
    # Refresh-token rotation would be the better long-term fix; defer until needed.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200

    # API Key Authentication
    API_KEY_HEADER_NAME: str = "X-API-Key"
    EXTERNAL_API_KEYS: List[str] = []

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000
    RATE_LIMIT_AUTHENTICATED_PER_MINUTE: int = 300
    RATE_LIMIT_FILE_UPLOAD_PER_HOUR: int = 50
    RATE_LIMIT_FILE_DOWNLOAD_PER_HOUR: int = 100

    # Redis (optional; enables shared storage for rate limiter across workers)
    REDIS_URL: str = ""

    # Request Size Limits
    MAX_REQUEST_SIZE_MB: int = 10
    MAX_FILE_SIZE_MB: int = 50
    MAX_BATCH_SIZE: int = 100

    # API Versioning
    API_VERSION: str = "v1"
    LATEST_API_VERSION: str = "v1"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # Google Places API (for vendor GMB sync)
    GOOGLE_PLACES_API_KEY: Optional[str] = None

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLIC_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # Admin
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # Super Admin (platform owner)
    SUPER_ADMIN_EMAIL: str = "hemangjoshi37a@gmail.com"

    # Laser Settings
    LASER_POWER_WATTS: float = 60.0
    ELECTRICITY_RATE: float = 0.12  # per kWh
    CUT_SPEED_MM_PER_MIN: float = 500.0

    # File Upload
    ALLOWED_EXTENSIONS: str = "dxf,svg,ai,pdf,eps,cdr,plt,hpgl,wmf,emf,png,jpg,jpeg,dwg"

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    TRUSTED_ORIGINS: List[str] = []

    # Email (SMTP)
    SMTP_SERVER: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@laserhub.com"
    SMTP_TLS: bool = False

    # Web Push (VAPID)
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "hemangjoshi37a@gmail.com"

    # Observability
    SENTRY_DSN: str = ""
    ENVIRONMENT: str = "development"

    # Monitoring & Logging
    ENABLE_REQUEST_LOGGING: bool = True
    ENABLE_RESPONSE_LOGGING: bool = True
    LOG_LEVEL: str = "INFO"
    LOG_REQUEST_BODY: bool = False  # Disable in production for security
    LOG_RESPONSE_BODY: bool = False  # Disable in production for security

    model_config = {
        "env_file": str(BASE_DIR / ".env"),
        "case_sensitive": True,
        "extra": "ignore"
    }

    @model_validator(mode="after")
    def _enforce_production_secrets(self):
        if self.ENVIRONMENT.lower() != "development":
            if self.SECRET_KEY in DEFAULT_INSECURE_KEYS or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    f"SECRET_KEY must be set to a non-default 32+ char value when ENVIRONMENT={self.ENVIRONMENT}"
                )
            if not self.ADMIN_PASSWORD or self.ADMIN_PASSWORD == "changeme123":
                raise ValueError("ADMIN_PASSWORD must be rotated in non-dev environments")
        return self


settings = Settings()
