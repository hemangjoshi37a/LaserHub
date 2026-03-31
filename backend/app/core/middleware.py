"""
Error handling utilities and middleware for LaserHub
"""

import time
import uuid
from typing import Callable

from fastapi import Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from app.core.errors import LaserHubError
from app.core.logger import get_logger

logger = get_logger(__name__)


class RequestTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track requests and responses with logging"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate request ID for tracking
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Add request ID to logger context
        log = logger.bind(request_id=request_id, path=request.url.path, method=request.method)

        # Log request start
        log.info("request_started")

        start_time = time.time()

        try:
            response = await call_next(request)

            # Calculate duration
            duration = time.time() - start_time

            # Log successful response
            log.info(
                "request_completed",
                status_code=response.status_code,
                duration_ms=round(duration * 1000, 2)
            )

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id

            return response

        except Exception as exc:
            # Calculate duration
            duration = time.time() - start_time

            # Log error
            log.error(
                "request_failed",
                error=str(exc),
                error_type=type(exc).__name__,
                duration_ms=round(duration * 1000, 2)
            )

            raise


class ErrorTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to catch and track errors globally"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            response = await call_next(request)
            return response

        except Exception as exc:
            # Log the error with full context
            logger.error(
                "unhandled_exception",
                error=str(exc),
                error_type=type(exc).__name__,
                path=request.url.path,
                method=request.method,
                request_id=getattr(request.state, "request_id", "unknown"),
                traceback=True
            )

            # Re-raise to let FastAPI handle it
            raise


# Error handlers for FastAPI

async def laserhub_error_handler(request: Request, exc: LaserHubError) -> JSONResponse:
    """Handle custom LaserHub errors"""
    logger.warning(
        "laserhub_error_handled",
        error_code=exc.code,
        error_message=exc.message,
        path=request.url.path,
        status_code=exc.status_code,
        request_id=getattr(request.state, "request_id", "unknown")
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details
            },
            "request_id": getattr(request.state, "request_id", "unknown")
        }
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle validation errors with detailed information"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(map(str, error.get("loc", []))),
            "message": error.get("msg", ""),
            "type": error.get("type", "")
        })

    logger.warning(
        "validation_error",
        path=request.url.path,
        method=request.method,
        errors=errors,
        request_id=getattr(request.state, "request_id", "unknown")
    )

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Validation failed",
                "details": {"errors": errors}
            },
            "request_id": getattr(request.state, "request_id", "unknown")
        }
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all other unhandled exceptions"""
    request_id = getattr(request.state, "request_id", "unknown")

    logger.error(
        "unhandled_error",
        error=str(exc),
        error_type=type(exc).__name__,
        path=request.url.path,
        method=request.method,
        request_id=request_id,
        traceback=True
    )

    # In production, don't expose internal details
    is_debug = False  # This should come from settings

    if is_debug:
        import traceback
        error_details = {
            "error": str(exc),
            "type": type(exc).__name__,
            "traceback": traceback.format_exc()
        }
    else:
        error_details = {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred"
        }

    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": error_details,
            "request_id": request_id
        }
    )
