"""
Rate Limiting & Brute Force Defense Module.
Provides high-performance sliding window rate limiting and account lockout protection
for critical authentication, OTP verification, and high-compute endpoints.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import logging
from typing import Dict, List, Optional, Tuple
from fastapi import HTTPException, Request, status

logger = logging.getLogger("placement_intelligence.rate_limit")


class SlidingWindowRateLimiter:
    """Thread-safe in-memory sliding window rate limiter."""

    def __init__(self) -> None:
        self._records: Dict[str, List[float]] = defaultdict(list)
        self._lockouts: Dict[str, float] = {}
        self._failures: Dict[str, List[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Validates whether the rate limit is exceeded for a given key.
        Returns (is_allowed, retry_after_seconds).
        """
        async with self._lock:
            now = datetime.now(timezone.utc).timestamp()

            # Check if key is currently locked out
            if key in self._lockouts:
                lock_expiry = self._lockouts[key]
                if now < lock_expiry:
                    retry_after = int(lock_expiry - now) + 1
                    return False, retry_after
                else:
                    del self._lockouts[key]
                    self._failures.pop(key, None)

            # Evict timestamps outside the window
            cutoff = now - window_seconds
            self._records[key] = [ts for ts in self._records[key] if ts > cutoff]

            if len(self._records[key]) >= max_requests:
                oldest = self._records[key][0]
                retry_after = int((oldest + window_seconds) - now) + 1
                return False, max(retry_after, 1)

            # Record this valid request
            self._records[key].append(now)
            return True, 0

    async def record_failure(
        self,
        key: str,
        max_failures: int = 5,
        lockout_seconds: int = 900
    ) -> Tuple[bool, int]:
        """
        Tracks failed login attempts. Triggers temporary account/IP lockout
        when max_failures is reached within the lockout window.
        """
        async with self._lock:
            now = datetime.now(timezone.utc).timestamp()
            cutoff = now - lockout_seconds
            self._failures[key] = [ts for ts in self._failures[key] if ts > cutoff]
            self._failures[key].append(now)

            if len(self._failures[key]) >= max_failures:
                self._lockouts[key] = now + lockout_seconds
                logger.warning(
                    f"Rate limiter: Key '{key}' locked out for {lockout_seconds}s "
                    f"after {len(self._failures[key])} failed attempts."
                )
                return True, lockout_seconds

            remaining = max_failures - len(self._failures[key])
            return False, remaining

    async def reset_failures(self, key: str) -> None:
        """Clears failure history upon successful authentication."""
        async with self._lock:
            self._failures.pop(key, None)
            self._lockouts.pop(key, None)

    async def is_locked(self, key: str) -> Tuple[bool, int]:
        """Checks if a key is locked out."""
        async with self._lock:
            now = datetime.now(timezone.utc).timestamp()
            if key in self._lockouts:
                expiry = self._lockouts[key]
                if now < expiry:
                    return True, int(expiry - now) + 1
                del self._lockouts[key]
            return False, 0


# Global singleton instance
rate_limiter = SlidingWindowRateLimiter()


def get_client_identifier(request: Request) -> str:
    """Extracts client IP address, supporting standard reverse proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


async def enforce_auth_rate_limit(
    request: Request,
    max_requests: int = 10,
    window_seconds: int = 60,
    prefix: str = "auth"
) -> None:
    """Dependency that enforces sliding window rate limiting on authentication routes."""
    ip = get_client_identifier(request)
    key = f"{prefix}:ip:{ip}"
    allowed, retry_after = await rate_limiter.check_rate_limit(
        key=key,
        max_requests=max_requests,
        window_seconds=window_seconds
    )
    if not allowed:
        logger.warning(f"Rate limit exceeded on {request.url.path} from IP {ip}. Retry after {retry_after}s.")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Please wait {retry_after} seconds before trying again.",
            headers={"Retry-After": str(retry_after)}
        )
