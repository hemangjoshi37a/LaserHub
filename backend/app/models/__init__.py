"""
Database models for LaserHub
"""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
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
    role = Column(String, default="customer")  # customer, vendor, admin
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    crm_notes = Column(Text, default="")
    crm_tags = Column(String, default="[]")
    addresses = Column(Text, default="[]")  # JSON list of saved addresses
    notification_prefs = Column(Text, nullable=True)  # JSON: {"email": bool, "push": bool, "sms": bool}
    is_internal = Column(Boolean, default=False, server_default="0")
    is_demo = Column(Boolean, default=False, server_default="0")
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
    image_url = Column(String, nullable=True)  # Thumbnail image URL for material card
    # Comparison / wizard metadata (Phase 2.5)
    strength_rating = Column(Integer, default=3)  # 1-5
    outdoor_safe = Column(Boolean, default=False)
    food_safe = Column(Boolean, default=False)
    burn_behavior = Column(String, default="")  # "clean-cut", "chars", "melts", ...
    finish_options = Column(String, default="")  # comma-separated "matte, glossy"
    best_use_cases = Column(Text, default="[]")  # JSON list of strings
    max_thickness_mm = Column(Float, nullable=True)
    base_currency = Column(String(3), nullable=False, default="USD", server_default="USD")
    is_internal = Column(Boolean, default=False, server_default="0")
    is_demo = Column(Boolean, default=False, server_default="0")
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
    base_currency = Column(String(3), nullable=False, default="USD", server_default="USD")
    
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
    validation_issues = Column(Text, default="[]")  # JSON list of issues
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

    # Guest checkout tracking token (UUID for non-authenticated orders)
    guest_tracking_token = Column(String, nullable=True, index=True)
    courier = Column(String, nullable=True)
    estimated_delivery_date = Column(DateTime, nullable=True)

    is_internal = Column(Boolean, default=False, server_default="0")
    is_demo = Column(Boolean, default=False, server_default="0")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploaded_file = relationship("UploadedFile", back_populates="orders")
    material = relationship("Material", back_populates="orders")
    user = relationship("User", back_populates="orders")
    events = relationship(
        "OrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderEvent.created_at",
    )


class OrderEvent(Base):
    """Event/update on an order timeline."""
    __tablename__ = "order_events"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    message = Column(Text, default="")
    photo_url = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True)
    courier = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    order = relationship("Order", back_populates="events")
    created_by = relationship("User")


class AppSetting(Base):
    """Application settings stored in DB"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="general")
    is_secret = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================
# Multi-Vendor Marketplace Models
# =============================================


class Vendor(Base):
    """Vendor/Shop model"""
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    shop_name = Column(String, unique=True, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text)
    logo_url = Column(String)
    banner_url = Column(String)
    website = Column(String)
    location = Column(String)
    rating = Column(Float, default=0.0)
    total_reviews = Column(Integer, default=0)
    total_orders = Column(Integer, default=0)
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    avg_turnaround_days = Column(Float, default=3.0)
    min_order_amount = Column(Float, default=0.0)
    shipping_policy = Column(Text)
    specialties = Column(String, default="[]")  # JSON array of specialty tags
    is_internal = Column(Boolean, default=False, server_default="0")
    is_demo = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Contact / verification (platform-entered)
    phone_country_code = Column(String(8), nullable=True)
    phone_number = Column(String(32), nullable=True)
    business_email = Column(String(255), nullable=True)
    business_address = Column(Text, nullable=True)
    gst_number = Column(String(32), nullable=True)
    gst_certificate_url = Column(String(512), nullable=True)
    storefront_image_url = Column(String(512), nullable=True)

    # GST / Billing details (Phase: GST billing)
    gstin = Column(String(15), nullable=True, index=True)  # 15-char GST number
    pan = Column(String(10), nullable=True)                # 10-char PAN
    state = Column(String(64), nullable=True)              # e.g., "Karnataka"
    state_code = Column(String(2), nullable=True)          # 2-digit GST state code
    signature_url = Column(String, nullable=True)
    registered_business_name = Column(String(255), nullable=True)  # legal name

    # Enhanced registration (Phase: stricter vendor registration)
    # NB: storefront_image_url already defined above in "Contact / verification" block.
    mobile_number = Column(String(16), nullable=True)  # nullable at DB level for legacy rows; API enforces required for new registrations
    google_business_url = Column(String(512), nullable=True)

    # Google My Business (cached — synced on demand)
    gmb_place_id = Column(String(128), nullable=True, index=True)
    gmb_name = Column(String(255), nullable=True)
    gmb_phone = Column(String(64), nullable=True)
    gmb_address = Column(Text, nullable=True)
    gmb_website = Column(String(512), nullable=True)
    gmb_rating = Column(Float, nullable=True)
    gmb_review_count = Column(Integer, nullable=True)
    gmb_maps_url = Column(String(512), nullable=True)
    gmb_last_synced = Column(DateTime, nullable=True)

    user = relationship("User", backref="vendor")
    vendor_materials = relationship("VendorMaterial", back_populates="vendor", cascade="all, delete-orphan")
    design_listings = relationship("DesignListing", back_populates="vendor")
    vendor_orders = relationship("VendorOrder", back_populates="vendor")


class VendorMaterial(Base):
    """Vendor-specific material availability and pricing"""
    __tablename__ = "vendor_materials"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    custom_price_per_cm2_mm = Column(Float)  # Vendor-specific pricing, null = use default
    thickness_mm = Column(Float, nullable=False)
    is_in_stock = Column(Boolean, default=True)
    cut_speed_mm_min = Column(Float, default=500.0)
    lead_time_days = Column(Float, default=2.0)
    notes = Column(Text)

    vendor = relationship("Vendor", back_populates="vendor_materials")
    material = relationship("Material")

    __table_args__ = (
        sa.UniqueConstraint('vendor_id', 'material_id', 'thickness_mm', name='uq_vendor_material_thickness'),
    )


class Design(Base):
    """Shared design that can be listed on marketplace"""
    __tablename__ = "designs"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, default="other")
    tags = Column(Text)  # JSON array of tags
    thumbnail_url = Column(String)
    is_public = Column(Boolean, default=False)  # Open-source design
    is_featured = Column(Boolean, default=False)
    likes_count = Column(Integer, default=0)
    downloads_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", backref="designs")
    uploaded_file = relationship("UploadedFile")
    listings = relationship("DesignListing", back_populates="design", cascade="all, delete-orphan")


class DesignListing(Base):
    """A vendor's listing of a design (ready-to-buy product)"""
    __tablename__ = "design_listings"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    design_id = Column(Integer, ForeignKey("designs.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    thickness_mm = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    sold_count = Column(Integer, default=0)
    base_currency = Column(String(3), nullable=False, default="USD", server_default="USD")
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="design_listings")
    design = relationship("Design", back_populates="listings")
    material = relationship("Material")


class VendorOrder(Base):
    """Order placed with a specific vendor"""
    __tablename__ = "vendor_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    status = Column(String, default="pending")
    vendor_notes = Column(Text)
    estimated_completion = Column(DateTime)
    actual_completion = Column(DateTime)
    vendor_cost = Column(Float)  # What vendor charges
    platform_fee = Column(Float)  # Platform commission
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", backref="vendor_order")
    vendor = relationship("Vendor", back_populates="vendor_orders")


class Review(Base):
    """Customer review of a vendor"""
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    rating = Column(Float, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="reviews")
    vendor = relationship("Vendor", backref="reviews")


class PushSubscription(Base):
    """Web Push subscription per user"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="push_subscriptions")


class Notification(Base):
    """In-app notification model"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, sa.ForeignKey("users.id"), nullable=False, index=True)
    title = sa.Column(sa.String(255), nullable=False)
    message = sa.Column(sa.Text, nullable=False)
    type = sa.Column(sa.String(50), default="info")  # info, success, warning, error
    link = sa.Column(sa.String(512), nullable=True)
    is_read = sa.Column(sa.Boolean, default=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    user = relationship("User", backref="notifications")


class Quote(Base):
    """Custom quote for off-platform inquiries"""
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    quote_number = Column(String, unique=True, nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    items = Column(Text, nullable=False, default="[]")  # JSON list
    subtotal = Column(Float, default=0)
    setup_fee = Column(Float, default=0)
    tax = Column(Float, default=0)
    total = Column(Float, default=0)
    notes = Column(Text, default="")
    status = Column(String, default="draft")  # draft, sent, accepted, rejected, expired
    valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", backref="quotes")


class TeamMember(Base):
    """Team member attached to a vendor account"""
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    email = Column(String, nullable=True)  # For pending invites where user may not yet exist
    role = Column(String, default="operator")  # owner, operator, designer, accountant
    invited_at = Column(DateTime, default=datetime.utcnow)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    accepted = Column(Boolean, default=False)
    invite_token = Column(String, nullable=True, index=True)
    last_active_at = Column(DateTime, nullable=True)

    vendor = relationship("Vendor", foreign_keys=[vendor_id], backref="team_members")
    user = relationship("User", foreign_keys=[user_id])


class ActivityLog(Base):
    """Activity log for vendor team audit trail"""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")


class DesignLike(Base):
    """User like on a design"""
    __tablename__ = "design_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    design_id = Column(Integer, ForeignKey("designs.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        sa.UniqueConstraint('user_id', 'design_id', name='uq_user_design_like'),
    )


class MaterialStock(Base):
    """Vendor material inventory line item"""
    __tablename__ = "material_stock"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    thickness_mm = Column(Float, nullable=False)
    sheet_width_mm = Column(Float, nullable=False)
    sheet_height_mm = Column(Float, nullable=False)
    quantity_sheets = Column(Integer, default=0)
    cost_per_sheet = Column(Float, default=0)
    low_threshold = Column(Integer, default=5)
    supplier = Column(String, default="")
    supplier_url = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", backref="stock_items")
    material = relationship("Material")
    movements = relationship("StockMovement", back_populates="stock", cascade="all, delete-orphan")


class StockMovement(Base):
    """Log of stock quantity changes"""
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("material_stock.id"), nullable=False)
    delta = Column(Integer, nullable=False)
    reason = Column(String, default="")
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    stock = relationship("MaterialStock", back_populates="movements")


class WebhookEvent(Base):
    """Payment-provider webhook event log for replay protection (SEC-09).

    Every incoming webhook (after signature verification) is recorded here.
    A unique constraint on (provider, event_id) ensures duplicate deliveries
    are rejected cheaply at the DB layer before any order state is mutated.
    """
    __tablename__ = "webhook_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(20), nullable=False)  # 'stripe', 'razorpay', ...
    event_id = Column(String(128), nullable=False)  # provider-supplied event id
    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        sa.UniqueConstraint('provider', 'event_id', name='uq_webhook_events_provider_event_id'),
    )


# =============================================
# GST Billing Models
# =============================================


class Invoice(Base):
    """GST tax invoice / proforma / credit note."""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_number = Column(String(32), unique=True, nullable=False, index=True)  # e.g., "INV/2026-27/00001"
    invoice_type = Column(String(20), default="tax_invoice")  # tax_invoice, proforma, credit_note
    status = Column(String(20), default="issued")  # draft, issued, paid, cancelled

    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)

    # Seller snapshot (so invoice doesn't change if vendor updates details later)
    seller_name = Column(String(255), nullable=False)
    seller_address = Column(Text, nullable=False)
    seller_gstin = Column(String(15), nullable=True)
    seller_pan = Column(String(10), nullable=True)
    seller_state = Column(String(64), nullable=False)
    seller_state_code = Column(String(2), nullable=False)
    seller_email = Column(String(255), nullable=True)
    seller_phone = Column(String(32), nullable=True)

    # Buyer snapshot
    buyer_name = Column(String(255), nullable=False)
    buyer_address = Column(Text, nullable=False)
    buyer_gstin = Column(String(15), nullable=True)
    buyer_state = Column(String(64), nullable=False)
    buyer_state_code = Column(String(2), nullable=False)
    buyer_email = Column(String(255), nullable=True)
    buyer_phone = Column(String(32), nullable=True)

    # Financials (Decimal with 2 digits for money)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    taxable_amount = Column(Numeric(12, 2), nullable=False, default=0)
    cgst_amount = Column(Numeric(12, 2), nullable=False, default=0)
    sgst_amount = Column(Numeric(12, 2), nullable=False, default=0)
    igst_amount = Column(Numeric(12, 2), nullable=False, default=0)
    round_off = Column(Numeric(6, 2), nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), nullable=False)
    amount_in_words = Column(String(512), nullable=True)

    # Meta
    place_of_supply = Column(String(64), nullable=False)
    place_of_supply_code = Column(String(2), nullable=False)
    reverse_charge = Column(Boolean, default=False)
    is_interstate = Column(Boolean, default=False)
    currency = Column(String(3), default="INR")
    notes = Column(Text, nullable=True)
    terms_and_conditions = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    line_items = relationship(
        "InvoiceLineItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )


class InvoiceLineItem(Base):
    """Line item on a GST invoice."""
    __tablename__ = "invoice_line_items"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(
        Integer,
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )
    description = Column(String(512), nullable=False)
    hsn_sac_code = Column(String(10), nullable=False, default="9987")  # SAC for laser cutting service
    quantity = Column(Numeric(10, 3), nullable=False, default=1)
    unit = Column(String(16), default="pcs")
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    taxable_value = Column(Numeric(12, 2), nullable=False)
    cgst_rate = Column(Numeric(5, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_rate = Column(Numeric(5, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_rate = Column(Numeric(5, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="line_items")


class BillingAddress(Base):
    """Saved billing address for a user (with optional GSTIN for B2B)."""
    __tablename__ = "billing_addresses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(64), nullable=True)  # e.g., "Home", "Office"
    name = Column(String(255), nullable=False)  # recipient/company name
    gstin = Column(String(15), nullable=True)
    address_line_1 = Column(String(255), nullable=False)
    address_line_2 = Column(String(255), nullable=True)
    city = Column(String(128), nullable=False)
    state = Column(String(64), nullable=False)
    state_code = Column(String(2), nullable=False)
    postal_code = Column(String(16), nullable=False)
    country = Column(String(64), default="India")
    phone = Column(String(32), nullable=True)
    email = Column(String(255), nullable=True)
    is_default = Column(Boolean, default=False)
    is_business = Column(Boolean, default=False)  # True if GSTIN is provided
    created_at = Column(DateTime, default=datetime.utcnow)


# =============================================
# Invoice numbering helper
# =============================================


def _current_financial_year() -> str:
    """Return current Indian FY as 'YYYY-YY' (April 1 → March 31)."""
    today = datetime.utcnow()
    if today.month >= 4:
        start, end = today.year, today.year + 1
    else:
        start, end = today.year - 1, today.year
    return f"{start}-{str(end)[-2:]}"


def generate_invoice_number(db, financial_year: str | None = None) -> str:
    """Generate next invoice number in format INV/YYYY-YY/NNNNN (sequential per FY).

    Accepts either a sync SQLAlchemy Session or an async AsyncSession (best-effort:
    when given an AsyncSession this function will still work if called from a
    context where ``db.execute`` has been awaited elsewhere — for most callers
    we recommend using the async helper ``generate_invoice_number_async``).

    FY runs April 1 → March 31. Auto-computes current FY when not provided.
    Counts existing invoices matching the FY prefix, then increments.
    """
    fy = financial_year or _current_financial_year()
    prefix = f"INV/{fy}/"

    # Best-effort sync path (works with sync Session).
    try:
        from sqlalchemy import func, select

        stmt = select(func.count(Invoice.id)).where(Invoice.invoice_number.like(f"{prefix}%"))
        result = db.execute(stmt)
        count = result.scalar() or 0
    except Exception:
        count = 0

    return f"{prefix}{count + 1:05d}"


async def generate_invoice_number_async(db, financial_year: str | None = None) -> str:
    """Async variant of generate_invoice_number for AsyncSession callers."""
    from sqlalchemy import func, select

    fy = financial_year or _current_financial_year()
    prefix = f"INV/{fy}/"
    stmt = select(func.count(Invoice.id)).where(Invoice.invoice_number.like(f"{prefix}%"))
    result = await db.execute(stmt)
    count = result.scalar() or 0
    return f"{prefix}{count + 1:05d}"
