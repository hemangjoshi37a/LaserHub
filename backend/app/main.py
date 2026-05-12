"""
LaserHub - Laser Cutting Cost Calculator
Backend API
"""

import warnings
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import addresses, admin, auth, billing_addresses, calculate, crm, designs, inventory, invoices, marketplace, materials, notifications, optimization, orders, payment, quotes, super_admin, team, tracking, upload, vendor
from app.core.cache import cache
from app.core.config import settings
from app.core.database import async_session_maker, init_db
from app.core.logger import get_logger
from app.core.security import get_password_hash, verify_password
from app.middleware.rate_limiter import limiter

logger = get_logger(__name__)

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"

# Initialize Sentry before app creation so startup errors are captured.
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        environment=settings.ENVIRONMENT,
        send_default_pii=False,  # Never send user emails/tokens
    )


async def init_admin_user() -> None:
    """Bootstrap the admin user row with a bcrypt-hashed ADMIN_PASSWORD.

    Runs at startup after init_db(). Creates the admin User if absent, or
    rehashes the stored password if it's empty or doesn't match the current
    ADMIN_PASSWORD env var. The DB-stored hash is the source of truth for
    admin_login; the plaintext env var is no longer compared at request time.
    """
    # Lazy import to avoid touching model import graph at module load.
    from sqlalchemy import select
    from app.models import User as UserModel

    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return

    async with async_session_maker() as db:
        result = await db.execute(
            select(UserModel).where(UserModel.email == settings.ADMIN_EMAIL)
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            admin_user = UserModel(
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                name="Admin",
                is_admin=True,
                role="super_admin",
                is_verified=True,
            )
            db.add(admin_user)
            await db.commit()
        else:
            needs_update = False
            if not existing.hashed_password:
                needs_update = True
            else:
                try:
                    if not verify_password(settings.ADMIN_PASSWORD, existing.hashed_password):
                        needs_update = True
                except Exception:
                    # Malformed hash in DB — overwrite with a fresh one.
                    needs_update = True

            if needs_update:
                existing.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
                await db.commit()

    logger.info("admin_user.bootstrapped", email=settings.ADMIN_EMAIL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and cache on startup"""
    # Startup security checks
    if settings.SECRET_KEY == DEFAULT_SECRET_KEY:
        warnings.warn(
            "SECURITY: SECRET_KEY is the default value! "
            "Change it in production via the SECRET_KEY environment variable.",
            stacklevel=2,
        )
    if len(settings.SECRET_KEY) < 32:
        warnings.warn(
            "SECURITY: SECRET_KEY is shorter than 32 characters. "
            "Use a long random string for production.",
            stacklevel=2,
        )
    if not settings.ADMIN_PASSWORD:
        warnings.warn(
            "SECURITY: ADMIN_PASSWORD is not set. Admin login will fail.",
            stacklevel=2,
        )
    await init_db()
    await init_admin_user()
    await cache.init()
    yield
    await cache.close()


app = FastAPI(
    title="LaserHub API",
    description="API for laser cutting cost calculation and order management",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter integration
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Log structured audit records for 401 responses and preserve default FastAPI behaviour.

    Helps detect credential stuffing and auth misuse. The token value itself is never
    logged — only whether an Authorization header was present.
    """
    if exc.status_code == 401:
        xff = request.headers.get("x-forwarded-for")
        client_ip = xff if xff else (request.client.host if request.client else None)
        logger.warning(
            "auth.unauthorized",
            path=request.url.path,
            method=request.method,
            client_ip=client_ip,
            user_agent=request.headers.get("user-agent"),
            had_auth_header=bool(request.headers.get("authorization")),
        )
    headers = getattr(exc, "headers", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


# Security headers middleware — must be added BEFORE CORS so headers appear on all responses
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next) -> Response:
    """Add security headers to every response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Only add HSTS for HTTPS connections
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https?://localhost(:\d+)?|https?://127\.0\.0\.1(:\d+)?|https://laserhub\.hjlabs\.in)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
app.include_router(calculate.router, prefix="/api/calculate", tags=["Calculate"])
app.include_router(materials.router, prefix="/api/materials", tags=["Materials"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(payment.router, prefix="/api/payment", tags=["Payment"])
app.include_router(optimization.router, prefix="/api/optimization", tags=["optimization"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(vendor.router, prefix="/api/vendors", tags=["Vendors"])
app.include_router(marketplace.router, prefix="/api/marketplace", tags=["Marketplace"])
app.include_router(designs.router, prefix="/api/designs", tags=["Designs"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(super_admin.router, prefix="/api/super-admin", tags=["SuperAdmin"])
app.include_router(quotes.router, prefix="/api/quotes", tags=["Quotes"])
app.include_router(crm.router, prefix="/api/crm", tags=["CRM"])
app.include_router(team.router, prefix="/api/team", tags=["Team"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(tracking.router, prefix="/api/tracking", tags=["Tracking"])
app.include_router(addresses.router, prefix="/api/addresses", tags=["Addresses"])
app.include_router(billing_addresses.router, prefix="/api/billing-addresses", tags=["BillingAddresses"])
app.include_router(invoices.router, prefix="/api/invoices", tags=["Invoices"])

# Serve static files (design assets)
import os
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

# Serve uploaded files (vendor assets: logos, storefront photos, GST certs, banners)
_uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
_uploads_dir = os.path.abspath(_uploads_dir)
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "LaserHub API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/sitemap.xml")
async def sitemap_xml():
    """SEO: Sitemap for Google Search Console (fallback if frontend doesn't serve it)."""
    from datetime import date
    today = date.today().isoformat()
    base = "https://laserhub.hjlabs.in"
    pages = [
        ("/", "1.0", "weekly"),
        ("/browse", "0.9", "daily"),
        ("/vendors", "0.8", "daily"),
        ("/about", "0.6", "monthly"),
        ("/contact", "0.6", "monthly"),
        ("/login", "0.4", "yearly"),
        ("/register", "0.4", "yearly"),
        ("/privacy", "0.3", "yearly"),
        ("/terms", "0.3", "yearly"),
        ("/refund-policy", "0.3", "yearly"),
    ]
    urls = "\n".join(
        f'  <url><loc>{base}{p}</loc><lastmod>{today}</lastmod>'
        f'<changefreq>{cf}</changefreq><priority>{pr}</priority></url>'
        for p, pr, cf in pages
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>'
    return Response(content=xml, media_type="application/xml; charset=utf-8")


@app.get("/robots.txt")
async def robots_txt():
    """SEO: Robots.txt — allows search engines, blocks AI training bots."""
    content = """User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

Disallow: /admin
Disallow: /super-admin
Disallow: /vendor-dashboard
Disallow: /profile
Disallow: /api/

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

Sitemap: https://laserhub.hjlabs.in/sitemap.xml
"""
    return Response(content=content, media_type="text/plain; charset=utf-8")
