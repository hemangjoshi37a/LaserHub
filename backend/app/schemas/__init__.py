"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MaterialType(str, Enum):
    """Available material types"""
    ACRYLIC = "acrylic"
    WOOD_MDF = "wood_mdf"
    PLYWOOD = "plywood"
    LEATHER = "leather"
    PAPER = "paper"
    ALUMINUM = "aluminum"
    STAINLESS_STEEL = "stainless_steel"


class OrderStatus(str, Enum):
    """Order status options"""
    PENDING = "pending"
    PAID = "paid"
    IN_PRODUCTION = "in_production"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# Material Schemas
class MaterialBase(BaseModel):
    """Base material schema"""
    name: str
    type: MaterialType
    rate_per_cm2_mm: float
    available_thicknesses: List[float]
    description: Optional[str] = None


class MaterialCreate(MaterialBase):
    """Schema for creating material"""
    pass


class MaterialResponse(MaterialBase):
    """Schema for material response"""
    id: int
    
    class Config:
        from_attributes = True


# File Upload Schemas
class FileUploadResponse(BaseModel):
    """Response after file upload"""
    file_id: str
    filename: str
    file_size: int
    file_type: str
    upload_url: str


class FileAnalysis(BaseModel):
    """Analysis results for uploaded file"""
    file_id: str
    width_mm: float
    height_mm: float
    area_cm2: float
    cut_length_mm: float
    estimated_cut_time_minutes: float
    complexity_score: float


# Cost Calculation Schemas
class CostCalculationRequest(BaseModel):
    """Request for cost calculation"""
    file_id: str
    material_id: int
    thickness_mm: float
    quantity: int = 1


class CostBreakdown(BaseModel):
    """Detailed cost breakdown"""
    material_cost: float
    laser_time_cost: float
    energy_cost: float
    setup_fee: float
    subtotal: float
    tax: float
    total: float


class CostEstimate(BaseModel):
    """Cost estimate response"""
    file_id: str
    material_name: str
    thickness_mm: float
    quantity: int
    breakdown: CostBreakdown
    estimated_production_time_hours: float


# Order Schemas
class OrderCreate(BaseModel):
    """Schema for creating order"""
    file_id: str
    material_id: int
    thickness_mm: float
    quantity: int
    customer_email: EmailStr
    customer_name: str
    shipping_address: str
    total_amount: float


class OrderResponse(BaseModel):
    """Order response schema"""
    id: int
    order_number: str
    file_id: str
    material_name: str
    thickness_mm: float
    quantity: int
    total_amount: float
    status: OrderStatus
    customer_email: EmailStr
    customer_name: str
    shipping_address: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class OrderUpdate(BaseModel):
    """Schema for updating order"""
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None


# Payment Schemas
class PaymentIntentCreate(BaseModel):
    """Create payment intent"""
    order_id: int
    amount: float
    currency: str = "usd"


class PaymentIntentResponse(BaseModel):
    """Payment intent response"""
    client_secret: str
    payment_intent_id: str


class PaymentWebhook(BaseModel):
    """Payment webhook payload"""
    event_type: str
    payment_intent_id: str
    order_id: int


# Admin Schemas
class AdminLogin(BaseModel):
    """Admin login request"""
    email: EmailStr
    password: str


class AdminToken(BaseModel):
    """Admin token response"""
    access_token: str
    token_type: str = "bearer"


class DashboardStats(BaseModel):
    """Admin dashboard statistics"""
    total_orders: int
    pending_orders: int
    total_revenue: float
    monthly_revenue: float
    recent_orders: List[OrderResponse]
