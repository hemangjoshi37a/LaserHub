"""
Configuration settings for LaserHub
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    DATABASE_URL: str = "sqlite:///./laserhub.db"
    
    # Security
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLIC_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    
    # Admin
    ADMIN_EMAIL: str = "admin@laserhub.com"
    ADMIN_PASSWORD: str = "admin123"
    
    # Laser Settings
    LASER_POWER_WATTS: float = 60.0
    ELECTRICITY_RATE: float = 0.12  # per kWh
    CUT_SPEED_MM_PER_MIN: float = 500.0
    
    # File Upload
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: List[str] = ["dxf", "svg", "ai", "pdf", "eps"]
    
    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
