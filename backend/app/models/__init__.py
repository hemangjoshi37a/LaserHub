"""
Database models for LaserHub
"""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    """User model"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="user")


class Material(Base):
    """Material model for laser cutting"""
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    rate_per_cm2_mm = Column(Float, nullable=False)
    available_thicknesses_raw = Column("available_thicknesses", Text)  # Map to actual DB column name
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    color_hex = Column(String, default="#0ea5e9")  # Material color for UI
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="material")
    configs = relationship("MaterialConfig", back_populates="material", cascade="all, delete-orphan")

    @property
    def available_thicknesses(self) -> list:
        """Parse available_thicknesses JSON string to list for Pydantic"""
        import json
        if not self.available_thicknesses_raw:
            return []
        if isinstance(self.available_thicknesses_raw, str):
            try:
                return json.loads(self.available_thicknesses_raw)
            except (json.JSONDecodeError, TypeError):
                return []
        return self.available_thicknesses_raw if isinstance(self.available_thicknesses_raw, list) else []


class MaterialConfig(Base):
    """Granular configuration for material + thickness combination"""
    __tablename__ = "material_configs"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    thickness_mm = Column(Float, nullable=False)
    rate_per_cm2 = Column(Float, nullable=False)  # Custom rate for this thickness
    cut_speed_mm_min = Column(Float, nullable=False)  # Speed for this thickness
    is_in_stock = Column(Boolean, default=True)
    
    material = relationship("Material", back_populates="configs")


class UploadedFile(Base):
    """Uploaded file model"""
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String, nullable=False)
    width_mm = Column(Float)
    height_mm = Column(Float)
    area_cm2 = Column(Float)
    cut_length_mm = Column(Float)
    estimated_cut_time_minutes = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="uploaded_file")


class Order(Base):
    """Order model"""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    thickness_mm = Column(Float, nullable=False)
    quantity = Column(Integer, default=1)

    # Cost breakdown
    material_cost = Column(Float, nullable=False)
    laser_time_cost = Column(Float, nullable=False)
    energy_cost = Column(Float, nullable=False)
    setup_fee = Column(Float, default=5.0)
    total_amount = Column(Float, nullable=False)

    # Customer info
    customer_email = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    shipping_address = Column(Text, nullable=False)

    # Payment
    payment_intent_id = Column(String)
    payment_status = Column(String, default="pending")

    # Status
    status = Column(String, default="pending")
    notes = Column(Text)
    carrier = Column(String)
    tracking_number = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploaded_file = relationship("UploadedFile", back_populates="orders")
    material = relationship("Material", back_populates="orders")
    user = relationship("User", back_populates="orders")


class AppSetting(Base):
    """Application settings stored in DB"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="general")
    is_secret = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
