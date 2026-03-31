"""
Pydantic schemas for request/response validation
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator


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


class MaterialUpdate(BaseModel):
    """Schema for updating material"""
    name: Optional[str] = None
    type: Optional[MaterialType] = None
    rate_per_cm2_mm: Optional[float] = None
    available_thicknesses: Optional[List[float]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


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
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None


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


class SalesData(BaseModel):
    """Sales data over time"""
    date: str
    revenue: float
    orders: int


class MaterialMetric(BaseModel):
    """Material usage metric"""
    material_name: str
    count: int
    revenue: float


class CustomerMetric(BaseModel):
    """Customer metric"""
    email: str
    name: str
    order_count: int
    total_spent: float


class AnalyticsData(BaseModel):
    """Comprehensive analytics data"""
    sales_over_time: List[SalesData]
    popular_materials: List[MaterialMetric]
    top_customers: List[CustomerMetric]
    total_orders: int
    total_revenue: float
    average_order_value: float


# User Schemas
class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    name: str


class UserCreate(UserBase):
    """Schema for creating user"""
    password: str


class UserResponse(UserBase):
    """User response schema"""
    id: int
    is_admin: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token response"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token data"""
    email: Optional[str] = None


class VerificationRequest(BaseModel):
    """Email verification request"""
    token: str


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    token: str
    new_password: str
