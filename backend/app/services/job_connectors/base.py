"""
Base Job Source Connector Interface, Normalization Standards & Clean Text Utilities.

Defines the contract for all authorized job discovery connectors:
Greenhouse, Lever, Remotive, RSS, Internshala, LinkedIn, Indeed, Firecrawl, and Enterprise APIs.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import html
import logging
from html.parser import HTMLParser
import random
import re
from typing import Any, Callable, Dict, List, Optional, Tuple
import urllib.parse

import httpx

from app.services.skill_normalizer import normalize_skill
from app.services.resume_intelligence import SKILLS_TAXONOMY, _keyword_matches

logger = logging.getLogger(__name__)

# Mock handler hook for deterministic offline testing
_mock_connector_handlers: Dict[str, Callable[[str], Any]] = {}


def set_connector_mock_handler(source_type: str, handler: Optional[Callable[[str], Any]]) -> None:
    """Register or remove a mock handler for a specific connector type."""
    if handler is None:
        _mock_connector_handlers.pop(source_type, None)
    else:
        _mock_connector_handlers[source_type] = handler


def clear_connector_mock_handler(source_type: Optional[str] = None) -> None:
    """Clear registered mock handlers."""
    if source_type:
        _mock_connector_handlers.pop(source_type, None)
    else:
        _mock_connector_handlers.clear()


class HTMLTextExtractor(HTMLParser):
    """Cleanly strip HTML tags and extract readable plaintext without external dependencies."""

    def __init__(self):
        super().__init__()
        self.result: List[str] = []

    def handle_data(self, data: str):
        text = data.strip()
        if text:
            self.result.append(text)

    def get_text(self) -> str:
        return " ".join(self.result)


def clean_html_to_text(raw_html: str) -> str:
    """Convert HTML job descriptions to clean, formatted plaintext."""
    if not raw_html:
        return ""
    parser = HTMLTextExtractor()
    try:
        parser.feed(html.unescape(raw_html))
        text = parser.get_text()
        return re.sub(r"\s+", " ", text).strip()
    except Exception:
        return re.sub(r"<[^>]+>", " ", raw_html).strip()


def validate_external_url(url: Optional[str]) -> Tuple[bool, str]:
    """
    Validates that a URL is safe and authentic:
    - Must use http or https scheme.
    - Must possess a valid domain netloc.
    - Rejects dangerous schemes (javascript:, data:, vbscript:, file:).
    """
    if not url or not isinstance(url, str):
        return False, "URL is empty or invalid type"
    trimmed = url.strip()
    if not trimmed:
        return False, "URL is blank"

    # Reject known malicious patterns
    lowered = trimmed.lower()
    for bad_prefix in ("javascript:", "data:", "vbscript:", "file:"):
        if lowered.startswith(bad_prefix):
            return False, f"Unsafe URL scheme: {bad_prefix}"

    try:
        parsed = urllib.parse.urlparse(trimmed)
        if parsed.scheme not in ("http", "https"):
            return False, f"Invalid URL protocol '{parsed.scheme}'. Only HTTP/HTTPS allowed."
        if not parsed.netloc:
            return False, "Missing network location (domain) in URL."
        return True, trimmed
    except Exception as exc:
        return False, f"Malformed URL: {exc}"


def extract_skills_from_text(text: str) -> List[str]:
    """Scan job title and description against canonical taxonomy and return normalized skill list."""
    if not text:
        return []
    lower = text.lower()
    detected: List[str] = []
    for canonical, _cat, aliases in SKILLS_TAXONOMY:
        if any(_keyword_matches(lower, a) for a in aliases):
            norm = normalize_skill(canonical, text)
            if norm and norm not in detected:
                detected.append(norm)
    return detected


def compute_job_content_hash(title: str, company: str, description: str) -> str:
    """Generate SHA-256 content hash over normalized job text for deduplication."""
    norm_text = f"{title.strip().lower()}|{company.strip().lower()}|{description.strip().lower()[:500]}"
    return hashlib.sha256(norm_text.encode("utf-8")).hexdigest()


class BaseJobConnector:
    """
    Standard base class for all job source connectors.
    Provides lifecycle hooks, configuration validation, retries, and normalization.
    """

    def __init__(
        self,
        name: str,
        source_type: str,
        endpoint_url: Optional[str] = None,
        board_token: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_seconds: float = 20.0,
        max_retries: int = 3,
        employer_name: Optional[str] = None,
        sync_interval_minutes: int = 60,
        **kwargs,
    ):
        self.name = name
        self.source_type = source_type
        self.endpoint_url = endpoint_url
        self.board_token = board_token
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.employer_name = employer_name or name.split(":")[-1].strip()
        self.sync_interval_minutes = sync_interval_minutes
        self.last_sync_at: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.rate_limit_info: Dict[str, Any] = {"requests_remaining": 100, "reset_epoch": None}

    @property
    def source_name(self) -> str:
        return self.name

    @staticmethod
    def validate_external_url(url: Optional[str]) -> bool:
        valid, _ = validate_external_url(url)
        return valid

    def validate_configuration(self) -> Tuple[bool, str]:
        """
        Validates whether connector configuration and necessary credentials exist.
        Default checks for endpoint or board token.
        """
        if self.endpoint_url:
            valid, msg = validate_external_url(self.endpoint_url)
            if not valid:
                return False, f"Invalid endpoint URL: {msg}"
        return True, "Configuration valid"

    async def fetch_jobs(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Fetch and parse jobs from the source.
        Returns a list of standardized job dictionaries.
        """
        raise NotImplementedError("Subclasses must implement fetch_jobs()")

    async def fetch_job_details(self, external_job_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch expanded details for a specific opportunity if supported by upstream API.
        Default implementation returns None (details included in main fetch).
        """
        return None

    def normalize_job(self, raw_job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ensures raw job data conforms strictly to the unified platform schema.
        """
        now = datetime.now(timezone.utc)
        title = raw_job.get("title") or raw_job.get("job_title") or "Engineering Opportunity"
        company = raw_job.get("company") or raw_job.get("company_name") or self.employer_name
        desc = raw_job.get("description") or raw_job.get("job_description") or ""
        clean_desc = clean_html_to_text(desc)

        skills = raw_job.get("required_skills") or extract_skills_from_text(f"{title} {clean_desc}")
        if not skills:
            skills = ["Problem Solving", "Computer Science Fundamentals"]

        apply_url = raw_job.get("original_apply_url") or raw_job.get("original_job_url") or ""
        valid_apply, sanitized_apply = validate_external_url(apply_url)
        if not valid_apply:
            sanitized_apply = ""

        c_hash = raw_job.get("content_hash") or compute_job_content_hash(title, company, clean_desc)

        return {
            "title": title,
            "company": company,
            "company_name": company,
            "company_logo": raw_job.get("company_logo"),
            "location": raw_job.get("location") or "Remote",
            "country": raw_job.get("country") or "India",
            "work_mode": raw_job.get("work_mode") or raw_job.get("remote_type") or "Remote",
            "remote_type": raw_job.get("remote_type") or raw_job.get("work_mode") or "Remote",
            "salary": raw_job.get("salary"),
            "salary_min": raw_job.get("salary_min"),
            "salary_max": raw_job.get("salary_max"),
            "salary_currency": raw_job.get("salary_currency") or "INR",
            "package_lpa": raw_job.get("package_lpa"),
            "stipend": raw_job.get("stipend"),
            "description": clean_desc,
            "required_skills": skills,
            "preferred_skills": raw_job.get("preferred_skills") or [],
            "experience_required": raw_job.get("experience_required") or "Fresher / 0-2 Yrs",
            "education_requirements": raw_job.get("education_requirements") or "B.Tech / B.E. / MCA",
            "eligibility": raw_job.get("eligibility") or "2025/2026 Engineering Graduates",
            "employment_type": raw_job.get("employment_type") or "Full-time",
            "original_apply_url": sanitized_apply,
            "original_job_url": raw_job.get("original_job_url") or sanitized_apply,
            "source_name": self.name,
            "source_type": self.source_type,
            "source_job_id": raw_job.get("source_job_id") or raw_job.get("external_job_id") or c_hash[:12],
            "content_hash": c_hash,
            "published_at": raw_job.get("published_at") or raw_job.get("posted_at") or now,
            "first_seen_at": raw_job.get("first_seen_at") or now,
            "last_seen_at": now,
            "application_deadline": raw_job.get("application_deadline") or raw_job.get("expires_at"),
            "job_status": raw_job.get("job_status") or "NEW",
            "verification_status": raw_job.get("verification_status") or "verified",
        }

    async def check_job_status(self, external_job_id: str, original_url: str) -> str:
        """
        Checks whether an external opportunity remains active or has closed/expired.
        Returns 'active', 'expired', or 'closed'.
        """
        valid, url = validate_external_url(original_url)
        if not valid:
            return "closed"

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.head(url)
                if resp.status_code == 404 or resp.status_code == 410:
                    return "closed"
                if resp.status_code >= 400:
                    return "expired"
                return "active"
        except Exception:
            # If network check fails, preserve active status rather than incorrectly expiring
            return "active"

    def get_source_health(self) -> Dict[str, Any]:
        """Returns health telemetry for worker monitoring."""
        is_valid, msg = self.validate_configuration()
        status = "LIVE" if is_valid else "NOT_CONFIGURED"
        if self.last_error:
            status = "FAILED"

        return {
            "source_name": self.name,
            "source_type": self.source_type,
            "status": status,
            "integration_status": status,
            "last_successful_sync": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "sync_interval_minutes": self.sync_interval_minutes,
            "rate_limit_info": self.rate_limit_info,
            "is_rate_limited": bool(self.rate_limit_info.get("is_rate_limited", False)),
            "error_details": self.last_error,
            "authorization_status": "authorized" if is_valid else "requires_credentials",
        }

    async def _http_get_with_retry(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> httpx.Response:
        """Execute HTTP GET with exponential backoff, jitter, and timeout handling."""
        handler = _mock_connector_handlers.get(self.source_type) or _mock_connector_handlers.get("*")
        if handler is not None:
            result = handler(url)
            if asyncio.iscoroutine(result):
                result = await result
            if isinstance(result, httpx.Response):
                return result
            elif isinstance(result, (dict, list)):
                import json
                return httpx.Response(200, content=json.dumps(result).encode("utf-8"), headers={"content-type": "application/json"})
            elif isinstance(result, str):
                content_type = "application/xml" if result.strip().startswith("<") else "text/plain"
                return httpx.Response(200, text=result, headers={"content-type": content_type})

        req_headers = {"User-Agent": "PlacementIntelligence/2.0 (+https://placement.edu)"}
        if headers:
            req_headers.update(headers)

        last_exc: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                    resp = await client.get(url, headers=req_headers, params=params)
                if resp.status_code == 200:
                    self.last_sync_at = datetime.now(timezone.utc)
                    self.last_error = None
                    return resp
                elif resp.status_code in (429, 500, 502, 503, 504):
                    logger.warning(
                        f"Connector {self.name} attempt {attempt}/{self.max_retries} received HTTP {resp.status_code}"
                    )
                    last_exc = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:150]}")
                else:
                    resp.raise_for_status()
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                logger.warning(f"Connector {self.name} attempt {attempt}/{self.max_retries} error: {exc}")
                last_exc = exc

            if attempt < self.max_retries:
                sleep_time = (2 ** (attempt - 1)) + random.uniform(0.1, 0.5)
                await asyncio.sleep(sleep_time)

        self.last_error = str(last_exc)
        raise RuntimeError(f"Connector {self.name} failed after {self.max_retries} attempts: {last_exc}")
