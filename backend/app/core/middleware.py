"""
Production Security & HTTP Headers Middleware.
Applies OWASP-recommended security response headers and provides
server-side platform maintenance mode with administrator bypass.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.security import decode_token

logger = logging.getLogger("placement_intelligence.middleware")

# Runtime maintenance toggle cache (can be toggled dynamically by administrators)
_DYNAMIC_MAINTENANCE_MODE: Optional[bool] = None


def set_dynamic_maintenance_mode(status: bool) -> None:
    """Dynamically activates or deactivates maintenance mode in-memory."""
    global _DYNAMIC_MAINTENANCE_MODE
    _DYNAMIC_MAINTENANCE_MODE = status
    logger.info(f"Dynamic maintenance mode updated: status={status}")


def is_maintenance_mode_active() -> bool:
    """Evaluates whether maintenance mode is currently enabled."""
    if _DYNAMIC_MAINTENANCE_MODE is not None:
        return _DYNAMIC_MAINTENANCE_MODE
    return getattr(settings, "MAINTENANCE_MODE", False)


async def maintenance_mode_middleware(request: Request, call_next):
    """
    Enforces server-side platform maintenance mode:
    - Bypasses health check endpoints (/health, /api/v1/health).
    - Bypasses API documentation (/docs, /redoc, /openapi.json).
    - Bypasses administrator authentication routes (/api/v1/auth/admin/*).
    - Bypasses authenticated ADMIN / SUPER_ADMIN users with valid session JWTs.
    - All other requests return HTTP 503 Service Unavailable with Retry-After header.
    """
    if not is_maintenance_mode_active():
        return await call_next(request)

    path = request.url.path

    # Whitelisted endpoints during maintenance
    whitelisted_prefixes = [
        "/health",
        f"{settings.API_V1_STR}/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        f"{settings.API_V1_STR}/openapi.json",
        f"{settings.API_V1_STR}/auth/admin",
        f"{settings.API_V1_STR}/admin/maintenance",
    ]

    for prefix in whitelisted_prefixes:
        if path.startswith(prefix):
            return await call_next(request)

    # Allow authenticated administrators through via JWT claims
    auth_header = request.headers.get("Authorization") or ""
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "access_token" in request.cookies:
        token = request.cookies.get("access_token") or ""

    if token:
        claims = decode_token(token)
        if claims and claims.get("role") in ("ADMIN", "SUPER_ADMIN"):
            return await call_next(request)

    # Return 503 Service Unavailable
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "maintenance": True,
            "message": "Placement Intelligence is currently undergoing scheduled platform maintenance. Candidate services will resume shortly.",
            "retry_after": 300,
        },
        headers={"Retry-After": "300"}
    )


async def add_security_headers(request: Request, call_next):
    """Injects essential defense-in-depth HTTP security headers (OWASP Recommended)."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: https: blob:; "
        "connect-src 'self' https: wss:; "
        "frame-ancestors 'none';"
    )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response
