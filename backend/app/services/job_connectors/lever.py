"""
Lever Public Career Postings API Connector.
Fetches real career listings from official Lever postings (e.g. Netflix, Spotify, Palantir)
via public JSON endpoint: https://api.lever.co/v0/postings/{site}?mode=json
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.job_connectors.base import (
    BaseJobConnector,
    clean_html_to_text,
    compute_job_content_hash,
    extract_skills_from_text,
    _mock_connector_handlers,
)

logger = logging.getLogger(__name__)


class LeverConnector(BaseJobConnector):
    """Authorized connector for public Lever career sites."""

    def __init__(
        self,
        name: str = "Lever: Tech",
        board_token: str = "spotify",
        endpoint_url: Optional[str] = None,
        **kwargs,
    ):
        token = board_token or "spotify"
        super().__init__(
            name=name,
            source_type="lever",
            endpoint_url=endpoint_url or f"https://api.lever.co/v0/postings/{token}?mode=json",
            board_token=token,
            **kwargs,
        )

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.board_token:
            raise ValueError(f"Lever site identifier (board_token) is required for {self.name}")

        url = self.endpoint_url or f"https://api.lever.co/v0/postings/{self.board_token}?mode=json"
        try:
            resp = await self._http_get_with_retry(url)
            postings = resp.json()
        except Exception as exc:
            err_msg = str(exc)
            if "404" in err_msg or "Not Found" in err_msg:
                logger.warning(f"Lever site '{self.board_token}' is no longer active or moved (404 Not Found); returning 0 jobs.")
                return []
            raise

        if not isinstance(postings, list):
            logger.warning(f"Lever response for {self.board_token} was not a list: {type(postings)}")
            return []

        results: List[Dict[str, Any]] = []
        employer_name = getattr(self, "employer_name", None) or self.name.split(":")[-1].strip() or self.board_token.title()

        for p in postings:
            source_id = str(p.get("id"))
            title = p.get("text", "").strip()
            if not title:
                continue

            raw_desc = p.get("descriptionPlain") or p.get("description") or ""
            description = clean_html_to_text(raw_desc) or f"{title} at {employer_name}"

            categories = p.get("categories") or {}
            location = categories.get("location") or "Remote"
            workplace = p.get("workplaceType", "").lower()

            loc_lower = location.lower()
            if workplace == "remote" or "remote" in loc_lower:
                work_mode = "Remote"
            elif workplace == "hybrid" or "hybrid" in loc_lower:
                work_mode = "Hybrid"
            else:
                work_mode = "Onsite"

            job_url = p.get("hostedUrl") or f"https://jobs.lever.co/{self.board_token}/{source_id}"
            apply_url = p.get("applyUrl") or f"{job_url}/apply"

            skills = extract_skills_from_text(f"{title} {description}")

            # Lever createdAt is in epoch milliseconds
            created_at_ms = p.get("createdAt")
            if created_at_ms and isinstance(created_at_ms, (int, float)):
                posted_at = datetime.fromtimestamp(created_at_ms / 1000.0, tz=timezone.utc)
            else:
                posted_at = datetime.now(timezone.utc)

            content_hash = compute_job_content_hash(title, employer_name, description)

            results.append({
                "source_job_id": source_id,
                "title": title,
                "company": employer_name,
                "employer": employer_name,
                "description": description,
                "required_skills": skills[:8],
                "preferred_skills": skills[8:14],
                "location": location,
                "work_mode": work_mode,
                "salary": None,
                "package_lpa": None,
                "employment_type": "Full-time",
                "original_job_url": job_url,
                "original_apply_url": apply_url,
                "posted_at": posted_at,
                "expires_at": None,
                "content_hash": content_hash,
                "source_name": self.name,
                "source_type": "lever",
            })

        logger.info(f"Lever connector {self.name} fetched {len(results)} jobs from site '{self.board_token}'")
        return results
