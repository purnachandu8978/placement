"""
Authorized RSS & Atom Developer Feed Connector.
Parses verified XML syndication feeds for developer positions.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
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


class RSSFeedConnector(BaseJobConnector):
    """Connector for authorized RSS/Atom developer feeds."""

    def __init__(
        self,
        name: str = "Authorized Developer RSS Feed",
        endpoint_url: str = "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        **kwargs,
    ):
        super().__init__(
            name=name,
            source_type="rss",
            endpoint_url=endpoint_url,
            **kwargs,
        )

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.endpoint_url:
            raise ValueError(f"Endpoint URL required for RSS connector {self.name}")

        resp = await self._http_get_with_retry(self.endpoint_url)
        xml_content = resp.text.strip()

        results: List[Dict[str, Any]] = []
        try:
            root = ET.fromstring(xml_content)
            # Support both RSS 2.0 (<item>) and Atom (<entry>)
            items = root.findall(".//item")
            if not items:
                # Atom namespace
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                items = root.findall(".//atom:entry", ns)

            for idx, item in enumerate(items):
                title_elem = item.find("title")
                if title_elem is None:
                    title_elem = item.find("{http://www.w3.org/2005/Atom}title")
                title = title_elem.text.strip() if (title_elem is not None and title_elem.text) else ""
                if not title:
                    continue

                link_elem = item.find("link")
                if link_elem is None:
                    link_elem = item.find("{http://www.w3.org/2005/Atom}link")
                if link_elem is not None and "href" in link_elem.attrib:
                    link = link_elem.attrib["href"]
                elif link_elem is not None and link_elem.text:
                    link = link_elem.text.strip()
                else:
                    link = f"{self.endpoint_url}#item-{idx}"

                guid_elem = item.find("guid")
                if guid_elem is None:
                    guid_elem = item.find("{http://www.w3.org/2005/Atom}id")
                guid_val = guid_elem.text.strip() if (guid_elem is not None and guid_elem.text) else None

                desc_elem = item.find("description")
                if desc_elem is None:
                    desc_elem = item.find("{http://www.w3.org/2005/Atom}summary")
                if desc_elem is None:
                    desc_elem = item.find("{http://www.w3.org/2005/Atom}content")
                raw_desc = desc_elem.text if (desc_elem is not None and desc_elem.text) else ""
                description = clean_html_to_text(raw_desc) or title

                # Heuristic company extraction if title contains "at Company" or "Company: Title"
                company = getattr(self, "employer_name", None) or "Engineering Employer"
                if " at " in title:
                    parts = title.split(" at ")
                    company = parts[-1].strip()
                    title = parts[0].strip()
                elif ":" in title:
                    parts = title.split(":")
                    company = parts[0].strip()
                    title = parts[1].strip()

                skills = extract_skills_from_text(f"{title} {description}")
                content_hash = compute_job_content_hash(title, company, description)
                source_id = guid_val or f"rss-{idx}-{content_hash[:8]}"

                results.append({
                    "source_job_id": source_id,
                    "title": title,
                    "company": company,
                    "employer": company,
                    "description": description,
                    "required_skills": skills[:8],
                    "preferred_skills": skills[8:14],
                    "location": "Remote",
                    "work_mode": "Remote",
                    "salary": None,
                    "package_lpa": None,
                    "employment_type": "Full-time",
                    "original_job_url": link,
                    "original_apply_url": link,
                    "posted_at": datetime.now(timezone.utc),
                    "expires_at": None,
                    "content_hash": content_hash,
                    "source_name": self.name,
                    "source_type": "rss",
                })
        except Exception as exc:
            logger.error(f"Error parsing RSS XML from {self.endpoint_url}: {exc}")
            raise RuntimeError(f"RSS feed parsing error: {exc}")

        logger.info(f"RSS connector {self.name} fetched {len(results)} jobs")
        return results
