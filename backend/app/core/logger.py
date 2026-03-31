"""
Logger configuration for LaserHub
"""

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Dict

import structlog


def add_log_level(logger: Any, method_name: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Add log level to event dictionary"""
    event_dict["level"] = method_name.upper()
    return event_dict


def setup_logging(debug: bool = False, log_dir: str = "logs") -> None:
    """
    Setup structured logging with structlog
    
    Args:
        debug: Whether to enable debug logging
        log_dir: Directory to store log files
    """

    # Create logs directory
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)

    # Configure log levels
    log_level = logging.DEBUG if debug else logging.INFO

    # Configure standard library logging to integrate with structlog
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.handlers.RotatingFileHandler(
                log_path / "laserhub.log",
                maxBytes=10 * 1024 * 1024,  # 10MB
                backupCount=5
            )
        ]
    )

    # Configure structlog
    timestamper = structlog.processors.TimeStamper(fmt="iso")

    processors = [
        structlog.stdlib.filter_by_level,
        add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.ExceptionPrettyPrinter(),
    ]

    if debug:
        # In debug mode, include more detailed information
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        # In production, use JSON format for better parsing
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    """Get a configured logger instance"""
    return structlog.get_logger(name)
