"""
Remotive Official Public Developer Jobs API Connector.
Fetches verified remote engineering roles via https://remotive.com/api/remote-jobs?category=software-dev
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
from app.services.skill_normalizer import normalize_skill

logger = logging.getLogger(__name__)


class RemotiveConnector(BaseJobConnector):
    """Authorized connector for Remotive official public developer jobs API."""

    def __init__(
        self,
        name: str = "Remotive: Remote Software Dev",
        endpoint_url: str = "https://remotive.com/api/remote-jobs?category=software-dev&limit=40",
        **kwargs,
    ):
        super().__init__(
            name=name,
            source_type="remotive",
            endpoint_url=endpoint_url,
            **kwargs,
        )

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        url = self.endpoint_url or "https://remotive.com/api/remote-jobs?category=software-dev&limit=40"
        resp = await self._http_get_with_retry(url)
        data = resp.json()
        jobs_list = data.get("jobs", [])

        results: List[Dict[str, Any]] = []

        for j in jobs_list:
            source_id = str(j.get("id"))
            title = j.get("title", "").strip()
            company = j.get("company_name", "").strip() or "Tech Employer"
            if not title:
                continue

            raw_desc = j.get("description", "")
            description = clean_html_to_text(raw_desc) or f"{title} at {company}"

            location = j.get("candidate_required_location") or "Worldwide (Remote)"
            work_mode = "Remote"
            salary = j.get("salary") or None

            job_url = j.get("url") or f"https://remotive.com/remote-jobs/software-dev/{source_id}"

            # Combine tags with extracted skills
            tags = [normalize_skill(t) for t in (j.get("tags") or []) if t]
            text_skills = extract_skills_from_text(f"{title} {description}")
            combined_skills = list(dict.fromkeys(tags + text_skills))

            pub_date_str = j.get("publication_date")
            posted_at = datetime.now(timezone.utc)
            if pub_date_str:
                try:
                    posted_at = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            content_hash = compute_job_content_hash(title, company, description)

            results.append({
                "source_job_id": source_id,
                "title": title,
                "company": company,
                "employer": company,
                "description": description,
                "required_skills": combined_skills[:8],
                "preferred_skills": combined_skills[8:14],
                "location": location,
                "work_mode": work_mode,
                "salary": salary,
                "package_lpa": None,
                "employment_type": j.get("job_type", "Full-time").capitalize(),
                "original_job_url": job_url,
                "original_apply_url": job_url,
                "posted_at": posted_at,
                "expires_at": None,
                "content_hash": content_hash,
                "source_name": self.name,
                "source_type": "remotive",
            })

        logger.info(f"Remotive connector {self.name} fetched {len(results)} jobs")
        return results
