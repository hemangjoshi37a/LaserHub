"""
API routers initialization
"""

from . import upload
from . import calculate
from . import materials
from . import orders
from . import payment
from . import admin

__all__ = ["upload", "calculate", "materials", "orders", "payment", "admin"]
