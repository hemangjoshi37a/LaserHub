"""
Custom exceptions for LaserHub
"""


class LaserHubError(Exception):
    """Base exception for all LaserHub errors"""
    def __init__(self, message: str, code: str = "GENERAL_ERROR", status_code: int = 500, details: dict = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


class ValidationError(LaserHubError):
    """Validation error"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="VALIDATION_ERROR", status_code=400, details=details)


class AuthenticationError(LaserHubError):
    """Authentication error"""
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, code="AUTH_ERROR", status_code=401)


class AuthorizationError(LaserHubError):
    """Authorization error"""
    def __init__(self, message: str = "Not authorized"):
        super().__init__(message, code="FORBIDDEN_ERROR", status_code=403)


class NotFoundError(LaserHubError):
    """Resource not found error"""
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, code="NOT_FOUND_ERROR", status_code=404)


class FileProcessingError(LaserHubError):
    """File processing error"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="FILE_PROCESSING_ERROR", status_code=400, details=details)


class PaymentError(LaserHubError):
    """Payment processing error"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="PAYMENT_ERROR", status_code=400, details=details)


class RateLimitError(LaserHubError):
    """Rate limit exceeded error"""
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, code="RATE_LIMIT_ERROR", status_code=429)
