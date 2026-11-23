"""
Greenhouse Public Job Board API Connector.
Fetches real career listings from official Greenhouse boards (e.g. Figma, GitHub, Stripe, Databricks)
via public JSON endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
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


class GreenhouseConnector(BaseJobConnector):
    """Authorized connector for public Greenhouse boards."""

    def __init__(
        self,
        name: str = "Greenhouse: Tech",
        board_token: str = "figma",
        endpoint_url: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(
            name=name,
            source_type="greenhouse",
            endpoint_url=endpoint_url or f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
            board_token=board_token,
            **kwargs,
        )

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.board_token:
            raise ValueError(f"Greenhouse board_token is required for {self.name}")

        url = self.endpoint_url or f"https://boards-api.greenhouse.io/v1/boards/{self.board_token}/jobs?content=true"
        resp = await self._http_get_with_retry(url)
        data = resp.json()

        jobs_list = data.get("jobs", [])
        results: List[Dict[str, Any]] = []

        employer_name = getattr(self, "employer_name", None) or self.name.split(":")[-1].strip() or self.board_token.title()

        for j in jobs_list:
            source_id = str(j.get("id"))
            title = j.get("title", "").strip()
            if not title:
                continue

            raw_content = j.get("content", "")
            description = clean_html_to_text(raw_content) or f"{title} at {employer_name}"

            loc_data = j.get("location") or {}
            location = loc_data.get("name") if isinstance(loc_data, dict) else str(loc_data)
            location = location or "Remote"

            loc_lower = location.lower()
            work_mode = "Remote" if "remote" in loc_lower else ("Hybrid" if "hybrid" in loc_lower else "Onsite")

            job_url = j.get("absolute_url") or f"https://boards.greenhouse.io/{self.board_token}/jobs/{source_id}"
            apply_url = f"{job_url}#app" if "#" not in job_url else job_url

            # Extract canonical skills from text
            skills = extract_skills_from_text(f"{title} {description}")

            # Parse posted_at date
            updated_at_str = j.get("updated_at")
            posted_at = datetime.now(timezone.utc)
            if updated_at_str:
                try:
                    posted_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                except Exception:
                    pass

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
                "source_type": "greenhouse",
            })

        logger.info(f"Greenhouse connector {self.name} fetched {len(results)} jobs from board '{self.board_token}'")
        return results
