"""
API versioning and deprecation middleware
"""

from typing import Optional
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.config import settings
import warnings


class APIVersioningMiddleware(BaseHTTPMiddleware):
    """Handles API versioning via headers and path prefixes"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # Extract version from path
        path = request.url.path
        version = None
        
        if path.startswith("/api/v"):
            parts = path.split("/")
            if len(parts) >= 3:
                version = parts[2]
                # Rewrite path to remove version for internal routing
                new_path = "/" + "/".join(parts[3:])
                request.scope["path"] = f"/api{new_path}"
        
        # Check version header as fallback
        version_header = request.headers.get("X-API-Version")
        if version_header and not version:
            version = version_header
        
        # Default to latest version
        if not version:
            version = settings.LATEST_API_VERSION
        
        # Validate version
        if version != settings.LATEST_API_VERSION:
            warnings.warn(
                f"API version {version} is deprecated. Use {settings.LATEST_API_VERSION}",
                DeprecationWarning
            )
        
        # Store version in request state
        request.state.api_version = version
        
        response = await call_next(request)
        
        # Add version info to response headers
        response.headers["X-API-Version"] = version
        response.headers["X-API-Latest-Version"] = settings.LATEST_API_VERSION
        
        return response


class DeprecationMiddleware(BaseHTTPMiddleware):
    """Handles deprecated endpoints"""
    
    DEPRECATED_ENDPOINTS = {
        # "old_path": {"new_path": "/new/path", "deprecated_version": "v1"}
    }
    
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        
        if path in self.DEPRECATED_ENDPOINTS:
            deprecation_info = self.DEPRECATED_ENDPOINTS[path]
            response = await call_next(request)
            response.headers["Deprecation"] = f"version={deprecation_info['deprecated_version']}"
            response.headers["Sunset"] = "Mon, 1 Jan 2025 00:00:00 GMT"  # Example sunset date
            
            if "new_path" in deprecation_info:
                response.headers["Link"] = f'<{deprecation_info["new_path"}>; rel="alternate"'
            
            return response
        
        return await call_next(request)