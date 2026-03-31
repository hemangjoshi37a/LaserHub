"""
API routers initialization
"""

from . import admin, auth, calculate, materials, orders, payment, upload

__all__ = ["upload", "calculate", "materials", "orders", "payment", "admin", "auth"]
