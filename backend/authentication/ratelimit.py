"""Rate limiting utilities for authentication endpoints."""

import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, JsonResponse

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit."""

    requests: int  # Number of requests allowed
    window: int  # Time window in seconds
    block_duration: int = 0  # How long to block after limit exceeded (0 = just reject)


# Default rate limit configurations for auth endpoints
RATE_LIMITS = {
    # Login: 5 attempts per minute per IP, 10 per 15 minutes per account
    "login_ip": RateLimitConfig(requests=5, window=60, block_duration=300),
    "login_account": RateLimitConfig(requests=10, window=900, block_duration=900),
    # Registration: 3 per hour per IP
    "register": RateLimitConfig(requests=3, window=3600, block_duration=3600),
    # Password reset: 3 per hour per IP, 3 per hour per email
    "password_reset_ip": RateLimitConfig(requests=3, window=3600, block_duration=0),
    "password_reset_email": RateLimitConfig(requests=3, window=3600, block_duration=0),
    # 2FA verification: 5 attempts per 5 minutes
    "2fa_verify": RateLimitConfig(requests=5, window=300, block_duration=300),
    # Email verification: 5 requests per hour
    "email_verify": RateLimitConfig(requests=5, window=3600, block_duration=0),
    "resend_verification": RateLimitConfig(requests=3, window=3600, block_duration=0),
    # Passkey discovery auth: 10 per minute per IP
    "passkey_discover": RateLimitConfig(requests=10, window=60, block_duration=60),
    # OAuth dynamic client registration: 10 per hour per IP
    "oauth_register": RateLimitConfig(requests=10, window=3600, block_duration=3600),
    # API general: 100 requests per minute
    "api_general": RateLimitConfig(requests=100, window=60, block_duration=0),
}


def get_cache_key(prefix: str, identifier: str) -> str:
    """Generate a cache key for rate limiting."""
    # Hash the identifier to avoid issues with special characters
    id_hash = hashlib.sha256(identifier.encode()).hexdigest()[:16]
    return f"ratelimit:{prefix}:{id_hash}"


def get_client_ip(request: HttpRequest) -> str:
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


class RateLimitExceededError(Exception):
    """Exception raised when rate limit is exceeded."""

    def __init__(self, retry_after: int = 0, message: str = "Rate limit exceeded") -> None:
        self.retry_after = retry_after
        self.message = message
        super().__init__(message)


def check_rate_limit(
    key: str,
    config: RateLimitConfig,
) -> tuple[bool, int, int]:
    """
    Check if a rate limit has been exceeded.

    Args:
        key: The cache key for this rate limit
        config: The rate limit configuration

    Returns:
        Tuple of (is_allowed, remaining_requests, retry_after_seconds)
    """
    try:
        now = time.time()

        # Check if currently blocked
        block_key = f"{key}:blocked"
        blocked_until = cache.get(block_key)
        if blocked_until and now < blocked_until:
            retry_after = int(blocked_until - now)
            return False, 0, retry_after

        # Get current request timestamps
        timestamps_key = f"{key}:timestamps"
        timestamps: list[float] = cache.get(timestamps_key, [])

        # Remove expired timestamps
        window_start = now - config.window
        timestamps = [ts for ts in timestamps if ts > window_start]

        # Check if limit exceeded
        if len(timestamps) >= config.requests:
            # Calculate when the oldest request will expire
            oldest = min(timestamps)
            retry_after = int(config.window - (now - oldest)) + 1

            # Block if configured
            if config.block_duration > 0:
                cache.set(block_key, now + config.block_duration, config.block_duration)
                retry_after = config.block_duration
                logger.warning("Rate limit exceeded and blocked for key: %s", key)

            return False, 0, retry_after

        # Add current request
        timestamps.append(now)
        cache.set(timestamps_key, timestamps, config.window + 60)  # Extra buffer

        remaining = config.requests - len(timestamps)
        return True, remaining, 0
    except Exception as e:
        logger.exception("Rate limit check error: %s", e)
        # On error, allow the request through to avoid blocking legitimate traffic
        return True, 0, 0


def rate_limit(
    limit_type: str,
    get_identifier: Callable[[HttpRequest], str] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator for rate limiting views.

    Args:
        limit_type: The type of rate limit (key in RATE_LIMITS)
        get_identifier: Optional function to get identifier from request.
                       Defaults to client IP.

    Usage:
        @rate_limit("login_ip")
        def login_view(request):
            ...

        @rate_limit("login_account", lambda r: r.POST.get("email", ""))
        def login_view(request):
            ...
    """

    def decorator(view_func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args: Any, **kwargs: Any) -> Any:
            # Skip rate limiting in debug mode if configured
            if getattr(settings, "RATE_LIMIT_DISABLED", False):
                return view_func(request, *args, **kwargs)

            config = RATE_LIMITS.get(limit_type)
            if not config:
                logger.warning("Unknown rate limit type: %s", limit_type)
                return view_func(request, *args, **kwargs)

            # Get identifier
            if get_identifier:
                identifier = get_identifier(request)
            else:
                identifier = get_client_ip(request)

            if not identifier:
                return view_func(request, *args, **kwargs)

            key = get_cache_key(limit_type, identifier)
            is_allowed, remaining, retry_after = check_rate_limit(key, config)

            if not is_allowed:
                logger.warning(
                    "Rate limit exceeded for %s: %s (retry after %ds)",
                    limit_type,
                    identifier,
                    retry_after,
                )
                response = JsonResponse(
                    {
                        "success": False,
                        "message": "Too many requests. Please try again later.",
                        "retry_after": retry_after,
                        "code": "rate_limit_exceeded",
                    },
                    status=429,
                )
                response["Retry-After"] = str(retry_after)
                return response

            # Add rate limit headers to response
            response = view_func(request, *args, **kwargs)
            if hasattr(response, "__setitem__"):
                response["X-RateLimit-Limit"] = str(config.requests)
                response["X-RateLimit-Remaining"] = str(remaining)
                response["X-RateLimit-Reset"] = str(int(time.time()) + config.window)

            return response

        return wrapper

    return decorator


def check_rate_limit_for_request(
    request: HttpRequest,
    limit_type: str,
    identifier: str | None = None,
) -> tuple[bool, str, int]:
    """
    Check rate limit for a request without blocking.

    Useful for checking limits before expensive operations.

    Args:
        request: The HTTP request
        limit_type: The type of rate limit
        identifier: Optional identifier (defaults to IP)

    Returns:
        Tuple of (is_allowed, message, retry_after)
    """
    if getattr(settings, "RATE_LIMIT_DISABLED", False):
        return True, "", 0

    config = RATE_LIMITS.get(limit_type)
    if not config:
        return True, "", 0

    if not identifier:
        identifier = get_client_ip(request)

    key = get_cache_key(limit_type, identifier)
    is_allowed, _, retry_after = check_rate_limit(key, config)

    if not is_allowed:
        return False, "Too many requests. Please try again later.", retry_after

    return True, "", 0


def record_failed_attempt(
    limit_type: str,
    identifier: str,
) -> None:
    """
    Record a failed attempt for rate limiting.

    This can be used to count failed login attempts without waiting
    for the view to complete.

    Args:
        limit_type: The type of rate limit
        identifier: The identifier to rate limit on
    """
    config = RATE_LIMITS.get(limit_type)
    if not config:
        return

    key = get_cache_key(limit_type, identifier)
    now = time.time()

    timestamps_key = f"{key}:timestamps"
    timestamps: list[float] = cache.get(timestamps_key, [])

    # Remove expired
    window_start = now - config.window
    timestamps = [ts for ts in timestamps if ts > window_start]

    timestamps.append(now)
    cache.set(timestamps_key, timestamps, config.window + 60)


def reset_rate_limit(limit_type: str, identifier: str) -> None:
    """
    Reset rate limit for an identifier.

    Useful after successful authentication to clear failed attempt counts.

    Args:
        limit_type: The type of rate limit
        identifier: The identifier to reset
    """
    key = get_cache_key(limit_type, identifier)
    cache.delete(f"{key}:timestamps")
    cache.delete(f"{key}:blocked")
