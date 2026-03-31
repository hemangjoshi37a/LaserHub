"""
Request/Response logging middleware with structlog
"""

import time
import uuid

import structlog
from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("api")


class LoggingMiddleware(BaseHTTPMiddleware):
    """Comprehensive request/response logging middleware"""

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.ENABLE_REQUEST_LOGGING:
            return await call_next(request)

        # Generate request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Start timer
        start_time = time.time()

        # Extract request details
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        content_type = request.headers.get("content-type", "")
        content_length = int(request.headers.get("content-length", 0))

        # Check request size
        if content_length > settings.MAX_REQUEST_SIZE_MB * 1024 * 1024:
            logger.warning(
                "request_too_large",
                request_id=request_id,
                client_ip=client_ip,
                content_length_mb=content_length / (1024 * 1024),
                max_allowed_mb=settings.MAX_REQUEST_SIZE_MB
            )
            raise HTTPException(status_code=413, detail="Request too large")

        # Log request
        log_data = {
            "event": "request_started",
            "request_id": request_id,
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "client_ip": client_ip,
            "user_agent": user_agent,
            "content_type": content_type,
            "content_length": content_length,
        }

        # Add user info if authenticated
        auth_header = request.headers.get("authorization", "")
        api_key = request.headers.get(settings.API_KEY_HEADER_NAME, "")
        if api_key:
            log_data["auth_type"] = "api_key"
            log_data["api_client"] = "external_integration"
        elif auth_header.startswith("Bearer "):
            log_data["auth_type"] = "jwt"

        # Conditionally log request body (disabled by default for security)
        if settings.LOG_REQUEST_BODY and content_type.startswith("application/json") and content_length < 10240:
            try:
                body = await request.body()
                log_data["body_preview"] = body[:200].decode('utf-8', errors='ignore')
            except Exception:
                pass

        logger.info(**log_data)

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration = time.time() - start_time

            # Log response
            logger.info(
                "request_completed",
                event="request_completed",
                request_id=request_id,
                status_code=response.status_code,
                duration_ms=round(duration * 1000, 2),
                response_size=int(response.headers.get("content-length", 0)),
            )

            # Add security headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

            return response

        except Exception as exc:
            # Log exception
            duration = time.time() - start_time
            logger.error(
                "request_failed",
                event="request_failed",
                request_id=request_id,
                error=str(exc),
                error_type=type(exc).__name__,
                duration_ms=round(duration * 1000, 2),
            )
            raise


class SizeLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce request size limits"""

    async def dispatch(self, request: Request, call_next) -> Response:
        content_length = int(request.headers.get("content-length", 0))

        if content_length > settings.MAX_REQUEST_SIZE_MB * 1024 * 1024:
            return Response(
                status_code=413,
                content=f"Request too large. Maximum size: {settings.MAX_REQUEST_SIZE_MB}MB",
                media_type="text/plain"
            )

        return await call_next(request)
