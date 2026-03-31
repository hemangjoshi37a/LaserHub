"""
Configuration settings for LaserHub
"""

from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./laserhub.db"

    # Security
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # API Key Authentication
    API_KEY_HEADER_NAME: str = "X-API-Key"
    EXTERNAL_API_KEYS: List[str] = []

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000
    RATE_LIMIT_AUTHENTICATED_PER_MINUTE: int = 300
    RATE_LIMIT_FILE_UPLOAD_PER_HOUR: int = 50
    RATE_LIMIT_FILE_DOWNLOAD_PER_HOUR: int = 100

    # Request Size Limits
    MAX_REQUEST_SIZE_MB: int = 10
    MAX_FILE_SIZE_MB: int = 50
    MAX_BATCH_SIZE: int = 100

    # API Versioning
    API_VERSION: str = "v1"
    LATEST_API_VERSION: str = "v1"

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLIC_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Admin
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # Laser Settings
    LASER_POWER_WATTS: float = 60.0
    ELECTRICITY_RATE: float = 0.12  # per kWh
    CUT_SPEED_MM_PER_MIN: float = 500.0

    # File Upload
    ALLOWED_EXTENSIONS: List[str] = ["dxf", "svg", "ai", "pdf", "eps"]

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

    # Monitoring & Logging
    ENABLE_REQUEST_LOGGING: bool = True
    ENABLE_RESPONSE_LOGGING: bool = True
    LOG_LEVEL: str = "INFO"
    LOG_REQUEST_BODY: bool = False  # Disable in production for security
    LOG_RESPONSE_BODY: bool = False  # Disable in production for security

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
