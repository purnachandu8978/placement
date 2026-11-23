"""
Job Source Connectors Registry and Factory.
"""

from typing import Any, Dict, List, Optional

from app.services.job_connectors.base import BaseJobConnector, set_connector_mock_handler
from app.services.job_connectors.greenhouse import GreenhouseConnector
from app.services.job_connectors.lever import LeverConnector
from app.services.job_connectors.remotive import RemotiveConnector
from app.services.job_connectors.rss_connector import RSSFeedConnector
from app.services.job_connectors.web_scraper import (
    InternshalaScraperConnector,
    LinkedInScraperConnector,
    IndeedScraperConnector,
)
from app.services.job_connectors.firecrawl import FirecrawlJobConnector
from app.services.job_connectors.enterprise_connectors import (
    LinkedInEnterpriseConnector,
    IndeedEnterpriseConnector,
    InternshalaEnterpriseConnector,
)

DEFAULT_AUTHORIZED_SOURCES: List[Dict[str, Any]] = [
    {
        "name": "Internshala: Software & Developer Internships",
        "source_type": "internshala_scraper",
        "endpoint_url": "https://internshala.com/internships/software-development-internship/",
        "sync_interval_minutes": 30,
        "priority": 1,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "LinkedIn: Software Engineering Opportunities",
        "source_type": "linkedin_scraper",
        "endpoint_url": "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Software%20Engineer&location=India",
        "sync_interval_minutes": 30,
        "priority": 1,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Indeed: Tech & Developer Jobs",
        "source_type": "indeed_scraper",
        "endpoint_url": "https://in.indeed.com/jobs?q=Software+Engineer&l=India",
        "sync_interval_minutes": 60,
        "priority": 2,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Firecrawl: Multi-Platform AI Web Scraper",
        "source_type": "firecrawl",
        "endpoint_url": "https://api.firecrawl.dev/v1",
        "sync_interval_minutes": 720,
        "priority": 2,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Greenhouse: Figma Careers",
        "source_type": "greenhouse",
        "board_token": "figma",
        "endpoint_url": "https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true",
        "sync_interval_minutes": 60,
        "priority": 3,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Greenhouse: GitHub Careers",
        "source_type": "greenhouse",
        "board_token": "github",
        "endpoint_url": "https://boards-api.greenhouse.io/v1/boards/github/jobs?content=true",
        "sync_interval_minutes": 60,
        "priority": 3,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Lever: Spotify Engineering",
        "source_type": "lever",
        "board_token": "spotify",
        "endpoint_url": "https://api.lever.co/v0/postings/spotify?mode=json",
        "sync_interval_minutes": 60,
        "priority": 3,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "Remotive: Remote Software Engineering",
        "source_type": "remotive",
        "endpoint_url": "https://remotive.com/api/remote-jobs?category=software-dev&limit=40",
        "sync_interval_minutes": 120,
        "priority": 4,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "WeWorkRemotely RSS Feed",
        "source_type": "rss",
        "endpoint_url": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        "sync_interval_minutes": 120,
        "priority": 4,
        "status": "LIVE",
        "is_active": True,
        "requires_auth": False,
    },
    {
        "name": "LinkedIn Talent Solutions (Official API)",
        "source_type": "linkedin_enterprise",
        "endpoint_url": "https://api.linkedin.com/v2/jobs",
        "sync_interval_minutes": 360,
        "priority": 6,
        "status": "NOT_CONFIGURED",
        "is_active": False,
        "requires_auth": True,
    },
    {
        "name": "Indeed Publisher API (Official)",
        "source_type": "indeed_enterprise",
        "endpoint_url": "https://api.indeed.com/ads/apisearch",
        "sync_interval_minutes": 360,
        "priority": 6,
        "status": "NOT_CONFIGURED",
        "is_active": False,
        "requires_auth": True,
    },
    {
        "name": "Internshala Partner API (Official)",
        "source_type": "internshala_enterprise",
        "endpoint_url": "https://internshala.com/api/v2/jobs",
        "sync_interval_minutes": 360,
        "priority": 6,
        "status": "NOT_CONFIGURED",
        "is_active": False,
        "requires_auth": True,
    },
]


def create_connector(source_doc: Dict[str, Any]) -> BaseJobConnector:
    """Instantiate the appropriate connector instance from source configuration."""
    stype = source_doc.get("source_type", "")
    name = source_doc.get("name", "Job Source")
    endpoint = source_doc.get("endpoint_url")
    token = source_doc.get("board_token")
    api_key = source_doc.get("api_key")

    if stype == "internshala_scraper" or stype == "internshala":
        return InternshalaScraperConnector(name=name, endpoint_url=endpoint or "https://internshala.com/internships/software-development-internship/")
    elif stype == "linkedin_scraper" or stype == "linkedin":
        return LinkedInScraperConnector(name=name, endpoint_url=endpoint or "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Software%20Engineer&location=India")
    elif stype == "indeed_scraper" or stype == "indeed":
        return IndeedScraperConnector(name=name, endpoint_url=endpoint or "https://in.indeed.com/jobs?q=Software+Engineer&l=India")
    elif stype == "firecrawl":
        return FirecrawlJobConnector(name=name, api_key=api_key, api_url=endpoint)
    elif stype == "greenhouse":
        return GreenhouseConnector(name=name, board_token=token or "figma", endpoint_url=endpoint)
    elif stype == "lever":
        return LeverConnector(name=name, board_token=token or "netflix", endpoint_url=endpoint)
    elif stype == "remotive":
        return RemotiveConnector(name=name, endpoint_url=endpoint or "https://remotive.com/api/remote-jobs?category=software-dev&limit=40")
    elif stype == "rss":
        return RSSFeedConnector(name=name, endpoint_url=endpoint or "")
    elif stype == "linkedin_enterprise":
        return LinkedInEnterpriseConnector(name=name, client_id=api_key)
    elif stype == "indeed_enterprise":
        return IndeedEnterpriseConnector(name=name, api_key=api_key)
    elif stype == "internshala_enterprise":
        return InternshalaEnterpriseConnector(name=name, partner_token=api_key)
    else:
        raise ValueError(f"Unsupported job source type: {stype}")


__all__ = [
    "BaseJobConnector",
    "GreenhouseConnector",
    "LeverConnector",
    "RemotiveConnector",
    "RSSFeedConnector",
    "InternshalaScraperConnector",
    "LinkedInScraperConnector",
    "IndeedScraperConnector",
    "FirecrawlJobConnector",
    "LinkedInEnterpriseConnector",
    "IndeedEnterpriseConnector",
    "InternshalaEnterpriseConnector",
    "DEFAULT_AUTHORIZED_SOURCES",
    "create_connector",
    "set_connector_mock_handler",
]
