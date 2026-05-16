"""
Pydantic schemas for request/response validation
"""

import re
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator


def sanitize_text(value: str) -> str:
    """Strip HTML tags and dangerous attributes from user-supplied text.

    This is a simple regex-based defence. For rich-text fields consider using
    the 'bleach' library with a strict allowlist instead.
    """
    if not value:
        return value
    # Remove script/style blocks first
    value = re.sub(r"<\s*(script|style)[^>]*>.*?</\s*\1\s*>", "", value, flags=re.IGNORECASE | re.DOTALL)
    # Remove all remaining HTML tags
    value = re.sub(r"<[^>]+>", "", value)
    # Remove javascript: protocol anywhere
    value = re.sub(r"javascript\s*:", "", value, flags=re.IGNORECASE)
    return value.strip()


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
    QUOTED = "quoted"
    ACCEPTED = "accepted"
    PAID = "paid"
    IN_PRODUCTION = "in_production"
    SHIPPED = "shipped"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


# Material Config Schemas
class MaterialConfigBase(BaseModel):
    thickness_mm: float
    rate_per_cm2: float
    cut_speed_mm_min: float
    is_in_stock: bool = True


class MaterialConfigCreate(MaterialConfigBase):
    material_id: int


class MaterialConfigResponse(MaterialConfigBase):
    id: int

    class Config:
        from_attributes = True


# Material Schemas
class MaterialBase(BaseModel):
    """Base material schema"""
    name: str
    type: MaterialType
    rate_per_cm2_mm: float
    available_thicknesses: List[float]
    description: Optional[str] = None
    color_hex: str = "#0ea5e9"
    image_url: Optional[str] = None


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
    color_hex: Optional[str] = None
    image_url: Optional[str] = None


class MaterialResponse(MaterialBase):
    """Schema for material response"""
    id: int
    configs: List[MaterialConfigResponse] = []
    is_active: bool = True
    created_at: Optional[datetime] = None
    # Comparison / wizard metadata (Phase 2.5)
    strength_rating: int = 3
    outdoor_safe: bool = False
    food_safe: bool = False
    burn_behavior: str = ""
    finish_options: str = ""
    best_use_cases: List[str] = []
    max_thickness_mm: Optional[float] = None

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
    parse_warning: Optional[str] = None


class FileAnalysis(BaseModel):
    """Analysis results for uploaded file"""
    file_id: str
    width_mm: float
    height_mm: float
    area_cm2: float
    cut_length_mm: float
    estimated_cut_time_minutes: float
    complexity_score: float
    validation_issues: List[dict] = []
    health_score: float = 100.0
    health_status: str = "optimal"  # optimal, warning, critical


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
    vendor_id: Optional[int] = None


class SamplePackOrderRequest(BaseModel):
    """Request schema for sample pack orders"""
    customer_name: str
    customer_email: EmailStr
    shipping_address: str
    amount: float = 299.0



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
    guest_tracking_token: Optional[str] = None

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
    role: Optional[str] = "customer"

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserResponse(UserBase):
    """User response schema"""
    id: int
    role: Optional[str] = "customer"
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

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# =============================================
# Multi-Vendor Marketplace Schemas
# =============================================


# Vendor Schemas
# Regex validators for vendor registration. Use the full GSTIN pattern so the
# 14th char is the "Z" literal as mandated by the GST authority.
_VENDOR_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def _clean_mobile(v: str) -> str:
    """Normalise an Indian mobile number to a 10-digit string.

    Accepts free-form input like "+91 98765 43210" or "919876543210" and
    returns "9876543210". Raises ValueError on anything that can't reduce to
    a valid 10-digit Indian mobile starting with 6/7/8/9.
    """
    if not isinstance(v, str):
        raise ValueError("Mobile number must be a string")
    cleaned = re.sub(r"\D", "", v)
    if len(cleaned) == 12 and cleaned.startswith("91"):
        cleaned = cleaned[2:]
    if len(cleaned) == 11 and cleaned.startswith("0"):
        cleaned = cleaned[1:]
    if len(cleaned) != 10 or not cleaned.startswith(("6", "7", "8", "9")):
        raise ValueError("Invalid Indian mobile number (expected 10 digits starting 6-9)")
    return cleaned


class VendorCreate(BaseModel):
    """Enhanced vendor registration payload.

    Requires identity + contact + GST fields. Images and Google Business
    profile are optional. Validates GSTIN format, 10-digit Indian mobile,
    and 2-digit GST state code.
    """
    shop_name: str
    business_email: EmailStr
    mobile_number: str
    gstin: str
    business_address: str
    state: str
    state_code: str

    description: Optional[str] = None
    registered_business_name: Optional[str] = None
    pan: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None  # legacy: city / free-form location label

    # Optional assets
    logo_url: Optional[str] = None
    storefront_image_url: Optional[str] = None
    google_business_url: Optional[str] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def _validate_gstin(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            raise ValueError("GSTIN is required")
        v = str(v).strip().upper()
        if not _VENDOR_GSTIN_RE.match(v):
            raise ValueError(
                "Invalid GSTIN format (must be 15-char GST number, e.g. 29ABCDE1234F1Z5)"
            )
        return v

    @field_validator("mobile_number", mode="before")
    @classmethod
    def _validate_mobile(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            raise ValueError("Mobile number is required")
        return _clean_mobile(str(v))

    @field_validator("state_code", mode="before")
    @classmethod
    def _validate_state_code(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            raise ValueError("State code is required")
        v = str(v).strip()
        if not STATE_CODE_RE.match(v):
            raise ValueError("State code must be exactly 2 digits")
        return v

    @field_validator("pan", mode="before")
    @classmethod
    def _validate_pan(cls, v):
        return _validate_optional_pan(v)

    @field_validator(
        "shop_name",
        "description",
        "location",
        "business_address",
        "state",
        "registered_business_name",
        mode="before",
    )
    @classmethod
    def _strip_html(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_text(v)

    @field_validator("shop_name")
    @classmethod
    def _shop_name_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Shop name is required")
        return v.strip()

    @field_validator("business_address")
    @classmethod
    def _address_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Business address is required")
        return v.strip()

    @field_validator("state")
    @classmethod
    def _state_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("State is required")
        return v.strip()


class VendorUpdate(BaseModel):
    shop_name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    avg_turnaround_days: Optional[float] = None
    min_order_amount: Optional[float] = None
    shipping_policy: Optional[str] = None
    specialties: Optional[List[str]] = None

    # Contact / verification
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    mobile_number: Optional[str] = None
    business_email: Optional[str] = None
    business_address: Optional[str] = None
    gst_number: Optional[str] = None
    gst_certificate_url: Optional[str] = None
    storefront_image_url: Optional[str] = None
    google_business_url: Optional[str] = None

    # GST fields
    gstin: Optional[str] = None
    pan: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    registered_business_name: Optional[str] = None

    # GMB fields — allow manual override
    gmb_place_id: Optional[str] = None
    gmb_name: Optional[str] = None
    gmb_phone: Optional[str] = None
    gmb_address: Optional[str] = None
    gmb_website: Optional[str] = None
    gmb_rating: Optional[float] = None
    gmb_review_count: Optional[int] = None
    gmb_maps_url: Optional[str] = None

    @field_validator(
        "shop_name", "description", "location", "shipping_policy",
        "business_address", "gmb_name", "gmb_address",
        "registered_business_name", "state",
        mode="before",
    )
    @classmethod
    def strip_html(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_text(v)

    @field_validator("gstin", mode="before")
    @classmethod
    def _gstin_check(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        v = str(v).strip().upper()
        if not _VENDOR_GSTIN_RE.match(v):
            raise ValueError(
                "Invalid GSTIN format (must be 15-char GST number, e.g. 29ABCDE1234F1Z5)"
            )
        return v

    @field_validator("pan", mode="before")
    @classmethod
    def _pan_check(cls, v):
        return _validate_optional_pan(v)

    @field_validator("state_code", mode="before")
    @classmethod
    def _state_code_check(cls, v):
        return _validate_state_code(v)

    @field_validator("mobile_number", mode="before")
    @classmethod
    def _mobile_check(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        return _clean_mobile(str(v))


class VendorResponse(BaseModel):
    id: int
    shop_name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    rating: float
    total_reviews: int
    total_orders: int
    is_verified: bool
    avg_turnaround_days: float
    min_order_amount: float
    shipping_policy: Optional[str] = None
    specialties: Optional[List[str]] = None
    created_at: datetime

    # Contact / verification
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    business_email: Optional[str] = None
    business_address: Optional[str] = None
    gst_number: Optional[str] = None
    gst_certificate_url: Optional[str] = None
    storefront_image_url: Optional[str] = None

    # GMB cache
    gmb_place_id: Optional[str] = None
    gmb_name: Optional[str] = None
    gmb_phone: Optional[str] = None
    gmb_address: Optional[str] = None
    gmb_website: Optional[str] = None
    gmb_rating: Optional[float] = None
    gmb_review_count: Optional[int] = None
    gmb_maps_url: Optional[str] = None
    gmb_last_synced: Optional[datetime] = None

    class Config:
        from_attributes = True


class VendorMaterialCreate(BaseModel):
    material_id: int
    thickness_mm: float
    custom_price_per_cm2_mm: Optional[float] = None
    cut_speed_mm_min: float = 500.0
    lead_time_days: float = 2.0
    is_in_stock: bool = True
    notes: Optional[str] = None


class VendorMaterialUpdate(BaseModel):
    custom_price_per_cm2_mm: Optional[float] = None
    cut_speed_mm_min: Optional[float] = None
    lead_time_days: Optional[float] = None
    is_in_stock: Optional[bool] = None
    notes: Optional[str] = None


class VendorMaterialResponse(BaseModel):
    id: int
    vendor_id: int
    material_id: int
    material_name: Optional[str] = None
    custom_price_per_cm2_mm: Optional[float] = None
    thickness_mm: float
    is_in_stock: bool
    cut_speed_mm_min: float
    lead_time_days: float

    class Config:
        from_attributes = True


# Design Schemas
class DesignCreate(BaseModel):
    file_id: str
    title: str
    description: Optional[str] = None
    category: str = "other"
    tags: Optional[List[str]] = None
    is_public: bool = False

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_html(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_text(v)


class DesignResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str
    tags: Optional[List[str]] = None
    thumbnail_url: Optional[str] = None
    is_public: bool
    is_featured: bool
    likes_count: int
    downloads_count: int
    creator_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DesignListingCreate(BaseModel):
    design_id: int
    material_id: int
    thickness_mm: float
    price: float
    description: Optional[str] = None


class DesignListingResponse(BaseModel):
    id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    design_id: int
    design_title: Optional[str] = None
    material_id: int
    material_name: Optional[str] = None
    thickness_mm: float
    price: float
    description: Optional[str] = None
    is_active: bool
    sold_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# Vendor Comparison
class VendorQuote(BaseModel):
    vendor_id: int
    vendor_name: str
    vendor_slug: str
    vendor_rating: float
    price: float
    lead_time_days: float
    is_in_stock: bool
    cut_speed_mm_min: float


class VendorComparisonResponse(BaseModel):
    file_id: str
    material_id: int
    material_name: str
    thickness_mm: float
    quantity: int
    quotes: List[VendorQuote]


# Review Schemas
class ReviewCreate(BaseModel):
    vendor_id: int
    order_id: Optional[int] = None
    rating: float
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    vendor_id: int
    rating: float
    comment: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================
# GST Billing Schemas
# =============================================


# Regex validators — lightweight; keep permissive to allow test fixtures.
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9]{1}[A-Z]{1}[0-9A-Z]{1}$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
STATE_CODE_RE = re.compile(r"^[0-9]{2}$")


def _validate_optional_gstin(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    v = v.strip().upper()
    if not GSTIN_RE.match(v):
        raise ValueError("Invalid GSTIN format (must be 15-char GST number)")
    return v


def _validate_optional_pan(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    v = v.strip().upper()
    if not PAN_RE.match(v):
        raise ValueError("Invalid PAN format (must be 10-char PAN like ABCDE1234F)")
    return v


def _validate_state_code(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    v = v.strip()
    if not STATE_CODE_RE.match(v):
        raise ValueError("Invalid GST state code (must be 2 digits)")
    return v


# Invoice Line Item --------------------------------------------------


class InvoiceLineItemCreate(BaseModel):
    description: str
    hsn_sac_code: str = "9987"
    quantity: Decimal = Decimal("1")
    unit: str = "pcs"
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0")
    taxable_value: Decimal
    cgst_rate: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_rate: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_rate: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    total_amount: Decimal


class InvoiceLineItemResponse(BaseModel):
    id: int
    invoice_id: int
    description: str
    hsn_sac_code: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    discount_percent: Decimal
    taxable_value: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_amount: Decimal

    class Config:
        from_attributes = True


# Invoice ------------------------------------------------------------


class InvoiceCreate(BaseModel):
    invoice_type: str = "tax_invoice"
    status: str = "issued"

    order_id: Optional[int] = None
    vendor_id: Optional[int] = None
    customer_id: Optional[int] = None

    invoice_date: date
    due_date: Optional[date] = None

    # Seller snapshot
    seller_name: str
    seller_address: str
    seller_gstin: Optional[str] = None
    seller_pan: Optional[str] = None
    seller_state: str
    seller_state_code: str
    seller_email: Optional[EmailStr] = None
    seller_phone: Optional[str] = None

    # Buyer snapshot
    buyer_name: str
    buyer_address: str
    buyer_gstin: Optional[str] = None
    buyer_state: str
    buyer_state_code: str
    buyer_email: Optional[EmailStr] = None
    buyer_phone: Optional[str] = None

    # Financials
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    round_off: Decimal = Decimal("0")
    total_amount: Decimal
    amount_in_words: Optional[str] = None

    # Meta
    place_of_supply: str
    place_of_supply_code: str
    reverse_charge: bool = False
    is_interstate: bool = False
    currency: str = "INR"
    notes: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    line_items: List[InvoiceLineItemCreate] = []

    @field_validator("seller_gstin", "buyer_gstin", mode="before")
    @classmethod
    def _gstin_check(cls, v):
        return _validate_optional_gstin(v)

    @field_validator("seller_pan", mode="before")
    @classmethod
    def _pan_check(cls, v):
        return _validate_optional_pan(v)

    @field_validator("seller_state_code", "buyer_state_code", "place_of_supply_code", mode="before")
    @classmethod
    def _state_code_check(cls, v):
        out = _validate_state_code(v)
        if out is None:
            raise ValueError("state_code is required and must be 2 digits")
        return out


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    invoice_type: str
    status: str

    order_id: Optional[int] = None
    vendor_id: Optional[int] = None
    customer_id: Optional[int] = None

    invoice_date: date
    due_date: Optional[date] = None

    seller_name: str
    seller_address: str
    seller_gstin: Optional[str] = None
    seller_pan: Optional[str] = None
    seller_state: str
    seller_state_code: str
    seller_email: Optional[str] = None
    seller_phone: Optional[str] = None

    buyer_name: str
    buyer_address: str
    buyer_gstin: Optional[str] = None
    buyer_state: str
    buyer_state_code: str
    buyer_email: Optional[str] = None
    buyer_phone: Optional[str] = None

    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    round_off: Decimal
    total_amount: Decimal
    amount_in_words: Optional[str] = None

    place_of_supply: str
    place_of_supply_code: str
    reverse_charge: bool
    is_interstate: bool
    currency: str
    notes: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    line_items: List[InvoiceLineItemResponse] = []

    class Config:
        from_attributes = True


class InvoiceSummary(BaseModel):
    """Trimmed response for list views."""
    id: int
    invoice_number: str
    invoice_type: str
    status: str
    invoice_date: date
    due_date: Optional[date] = None
    buyer_name: str
    buyer_gstin: Optional[str] = None
    total_amount: Decimal
    currency: str
    order_id: Optional[int] = None
    vendor_id: Optional[int] = None
    customer_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Billing Address ----------------------------------------------------


class BillingAddressCreate(BaseModel):
    label: Optional[str] = None
    name: str
    gstin: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state: str
    state_code: str
    postal_code: str
    country: str = "India"
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_default: bool = False
    is_business: bool = False

    @field_validator("gstin", mode="before")
    @classmethod
    def _gstin_check(cls, v):
        return _validate_optional_gstin(v)

    @field_validator("state_code", mode="before")
    @classmethod
    def _state_code_check(cls, v):
        out = _validate_state_code(v)
        if out is None:
            raise ValueError("state_code is required and must be 2 digits")
        return out


class BillingAddressUpdate(BaseModel):
    label: Optional[str] = None
    name: Optional[str] = None
    gstin: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_default: Optional[bool] = None
    is_business: Optional[bool] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def _gstin_check(cls, v):
        return _validate_optional_gstin(v)

    @field_validator("state_code", mode="before")
    @classmethod
    def _state_code_check(cls, v):
        return _validate_state_code(v)


class BillingAddressResponse(BaseModel):
    id: int
    user_id: int
    label: Optional[str] = None
    name: str
    gstin: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state: str
    state_code: str
    postal_code: str
    country: str
    phone: Optional[str] = None
    email: Optional[str] = None
    is_default: bool
    is_business: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Vendor billing update ----------------------------------------------


class VendorBillingUpdate(BaseModel):
    """Update GST / billing fields on a vendor profile."""
    gstin: Optional[str] = None
    pan: Optional[str] = None
    business_address: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    signature_url: Optional[str] = None
    registered_business_name: Optional[str] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def _gstin_check(cls, v):
        return _validate_optional_gstin(v)

    @field_validator("pan", mode="before")
    @classmethod
    def _pan_check(cls, v):
        return _validate_optional_pan(v)

    @field_validator("state_code", mode="before")
    @classmethod
    def _state_code_check(cls, v):
        return _validate_state_code(v)

    @field_validator("business_address", "registered_business_name", "state", mode="before")
    @classmethod
    def _strip_html(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_text(v)
