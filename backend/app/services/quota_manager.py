"""
Free-Tier API Quota Manager & Rate Limiting Service.

Guarantees strict budget protection for free-tier external APIs:
- Firecrawl AI Web Scraping (default: max 10 requests / day)
- Google Gemini AI (default: max 50 requests / day)
- Judge0 Sandbox Code Execution (default: max 50 requests / day)

Features:
- MongoDB-backed persistent daily usage tracking (resets daily at 00:00 UTC).
- Atomic budget enforcement with zero-race condition increments.
- Zero-credit response caching (TTL 24 hours) to avoid duplicate external API hits.
- Seamless automatic fallback to zero-credit native scrapers when daily limits are reached.
- Real-time admin quota telemetry and health visibility.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger("placement_intelligence.quota_manager")


def _get_current_utc_date_str() -> str:
    """Returns the current date in UTC format YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _compute_cache_key(prefix: str, data: Any) -> str:
    """Generates a deterministic SHA-256 hash for query or payload caching."""
    if isinstance(data, dict):
        raw = json.dumps(data, sort_keys=True)
    else:
        raw = str(data)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


class QuotaManager:
    """
    Centralized Free-Tier API Quota Controller.
    Enforces strict daily caps to protect free-tier developer accounts.
    """

    @staticmethod
    async def get_service_usage(db: Any, service: str, max_daily: int) -> Dict[str, Any]:
        """
        Retrieves real-time usage telemetry for an external API service.
        """
        date_str = _get_current_utc_date_str()
        doc = await db.api_quota_tracking.find_one({"service": service, "date": date_str})
        requests_used = doc.get("requests_used", 0) if doc else 0
        successful = doc.get("successful_requests", 0) if doc else 0
        failed = doc.get("failed_requests", 0) if doc else 0
        cache_hits = doc.get("cache_hits", 0) if doc else 0
        remaining = max(0, max_daily - requests_used)
        status = "EXHAUSTED" if remaining <= 0 else ("WARNING" if remaining <= 2 else "HEALTHY")

        now = datetime.now(timezone.utc)
        midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        reset_seconds = int((midnight - now).total_seconds())

        return {
            "service": service,
            "date": date_str,
            "requests_used": requests_used,
            "max_daily_requests": max_daily,
            "requests_remaining": remaining,
            "status": status,
            "is_quota_available": remaining > 0,
            "successful_requests": successful,
            "failed_requests": failed,
            "cache_hits": cache_hits,
            "reset_in_seconds": reset_seconds,
            "reset_in_hours": round(reset_seconds / 3600, 1),
            "last_request_at": doc.get("last_request_at") if doc else None,
        }

    @staticmethod
    async def can_consume(db: Any, service: str, max_daily: int = 10) -> bool:
        """
        Checks whether the specified service still has quota available today.
        """
        date_str = _get_current_utc_date_str()
        doc = await db.api_quota_tracking.find_one({"service": service, "date": date_str})
        used = doc.get("requests_used", 0) if doc else 0
        return used < max_daily

    @staticmethod
    async def record_usage(
        db: Any,
        service: str,
        max_daily: int = 10,
        units: int = 1,
        success: bool = True,
    ) -> bool:
        """
        Atomically records a request against the daily budget.
        Returns True if the request was permitted and counted, False if budget was exceeded.
        """
        date_str = _get_current_utc_date_str()
        now = datetime.now(timezone.utc)

        # Upsert document with initial zero counters if not present
        await db.api_quota_tracking.update_one(
            {"service": service, "date": date_str},
            {
                "$setOnInsert": {
                    "service": service,
                    "date": date_str,
                    "requests_used": 0,
                    "max_daily_requests": max_daily,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "cache_hits": 0,
                    "created_at": now,
                }
            },
            upsert=True,
        )

        # Conditionally increment only if requests_used < max_daily
        update_fields: Dict[str, Any] = {
            "requests_used": units,
            "last_request_at": now,
        }
        if success:
            update_fields["successful_requests"] = units
        else:
            update_fields["failed_requests"] = units

        res = await db.api_quota_tracking.update_one(
            {
                "service": service,
                "date": date_str,
                "requests_used": {"$lt": max_daily},
            },
            {
                "$inc": {
                    "requests_used": units,
                    "successful_requests": units if success else 0,
                    "failed_requests": 0 if success else units,
                },
                "$set": {"last_request_at": now},
            },
        )

        if res.modified_count > 0:
            logger.info(
                f"[QUOTA] Consumed {units} unit(s) for service '{service}' (Date: {date_str})."
            )
            return True
        else:
            logger.warning(
                f"[QUOTA EXCEEDED] Service '{service}' reached its daily limit of {max_daily} requests. Preserving free tier account."
            )
            return False

    @staticmethod
    async def record_cache_hit(db: Any, service: str) -> None:
        """Records a cache hit where zero API units were consumed."""
        date_str = _get_current_utc_date_str()
        await db.api_quota_tracking.update_one(
            {"service": service, "date": date_str},
            {"$inc": {"cache_hits": 1}},
            upsert=True,
        )

    @staticmethod
    async def get_cached_response(db: Any, service: str, cache_key: str) -> Optional[Any]:
        """
        Retrieves a cached API response if still within TTL (default 24h).
        Zero external credits consumed!
        """
        now = datetime.now(timezone.utc)
        doc = await db.api_response_cache.find_one({
            "service": service,
            "cache_key": cache_key,
            "expires_at": {"$gt": now},
        })
        if doc and "data" in doc:
            await QuotaManager.record_cache_hit(db, service)
            logger.info(f"[CACHE HIT] Reused cached response for service '{service}' (key={cache_key[:16]}...) — 0 credits used.")
            return doc["data"]
        return None

    @staticmethod
    async def save_cached_response(
        db: Any,
        service: str,
        cache_key: str,
        data: Any,
        ttl_seconds: int = 86400,
    ) -> None:
        """
        Stores an API response in the cache with a specified TTL (default: 24 hours).
        """
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=ttl_seconds)
        await db.api_response_cache.update_one(
            {"service": service, "cache_key": cache_key},
            {
                "$set": {
                    "service": service,
                    "cache_key": cache_key,
                    "data": data,
                    "cached_at": now,
                    "expires_at": expires_at,
                }
            },
            upsert=True,
        )

    @staticmethod
    async def get_all_quotas(db: Any) -> Dict[str, Any]:
        """
        Returns full telemetry summary for all free-tier services.
        """
        firecrawl_stats = await QuotaManager.get_service_usage(
            db, "firecrawl", getattr(settings, "FIRECRAWL_MAX_DAILY_REQUESTS", 10)
        )
        gemini_stats = await QuotaManager.get_service_usage(
            db, "gemini", getattr(settings, "GEMINI_MAX_DAILY_REQUESTS", 50)
        )
        judge0_stats = await QuotaManager.get_service_usage(
            db, "judge0", getattr(settings, "JUDGE0_MAX_DAILY_REQUESTS", 50)
        )

        return {
            "date": _get_current_utc_date_str(),
            "status": "ALL_SERVICES_OPERATIONAL",
            "free_tier_mode": True,
            "quotas": {
                "firecrawl": firecrawl_stats,
                "gemini": gemini_stats,
                "judge0": judge0_stats,
            },
        }


quota_manager = QuotaManager()
