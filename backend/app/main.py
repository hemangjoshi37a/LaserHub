"""
LaserHub - Laser Cutting Cost Calculator
Backend API
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api import upload, calculate, orders, payment, admin, materials
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup"""
    await init_db()
    yield


app = FastAPI(
    title="LaserHub API",
    description="API for laser cutting cost calculation and order management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
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
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


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
