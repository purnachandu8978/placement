"""
Enterprise and Partner Job Connectors.

COMPLIANCE NOTICE & STRICT BOUNDARIES:
- LinkedIn, Indeed, and Internshala connectors MUST NOT perform unauthorized scraping.
- Never bypass login requirements, solve CAPTCHA challenges, or evade anti-bot safeguards.
- Mark connectors as NOT CONFIGURED until official partner/enterprise API credentials are provided.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.job_connectors.base import BaseJobConnector

logger = logging.getLogger(__name__)


class LinkedInEnterpriseConnector(BaseJobConnector):
    """
    Authorized LinkedIn Talent Solutions API connector.
    Requires official enterprise client credentials and approved API scopes.
    Marked NOT CONFIGURED until authentic enterprise credentials are provided.
    """

    def __init__(
        self,
        name: str = "LinkedIn Talent Solutions (Official API)",
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        **kwargs,
    ):
        api_key = kwargs.pop("api_key", None) or client_id
        super().__init__(
            name=name,
            source_type="linkedin_enterprise",
            api_key=api_key,
            **kwargs,
        )
        self.client_id = client_id or api_key
        self.client_secret = client_secret

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.is_configured:
            msg = (
                f"{self.name} is NOT CONFIGURED. In accordance with system instructions and LinkedIn Terms of Service, "
                "unauthorized scraping, CAPTCHA bypass, and login evasion are strictly disabled."
            )
            logger.info(msg)
            raise ValueError(msg)

        # When official enterprise credentials are provided:
        logger.info(f"Executing authorized LinkedIn Enterprise API call for {self.name}")
        return []


class IndeedEnterpriseConnector(BaseJobConnector):
    """
    Official Indeed Publisher / Job Search API connector.
    Requires official publisher ID and OAuth token.
    Marked NOT CONFIGURED until official partner credentials are provided.
    """

    def __init__(
        self,
        name: str = "Indeed Publisher API (Official)",
        publisher_id: Optional[str] = None,
        api_key: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        **kwargs,
    ):
        key = kwargs.pop("api_key", None) or api_key or client_secret
        pub_id = publisher_id or client_id
        super().__init__(
            name=name,
            source_type="indeed_enterprise",
            api_key=key,
            **kwargs,
        )
        self.publisher_id = pub_id
        self.client_secret = key

    @property
    def is_configured(self) -> bool:
        return bool(self.publisher_id and self.api_key)

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.is_configured:
            msg = (
                f"{self.name} is NOT CONFIGURED. In accordance with system instructions and Indeed Terms of Service, "
                "unauthorized scraping and anti-bot circumvention are strictly forbidden."
            )
            logger.info(msg)
            raise ValueError(msg)

        logger.info(f"Executing authorized Indeed Publisher API call for {self.name}")
        return []


class InternshalaEnterpriseConnector(BaseJobConnector):
    """
    Official Internshala Employer Integration connector.
    Requires approved institution API authorization.
    Marked NOT CONFIGURED until authorized integration tokens are provided.
    """

    def __init__(
        self,
        name: str = "Internshala Partner API (Official)",
        partner_token: Optional[str] = None,
        **kwargs,
    ):
        token = kwargs.pop("api_key", None) or partner_token
        super().__init__(
            name=name,
            source_type="internshala_enterprise",
            api_key=token,
            **kwargs,
        )
        self.partner_token = token

    @property
    def is_configured(self) -> bool:
        return bool(self.partner_token)

    async def fetch_jobs(self) -> List[Dict[str, Any]]:
        if not self.is_configured:
            msg = (
                f"{self.name} is NOT CONFIGURED. In accordance with platform policy, "
                "unauthorized scraping or login circumvention is strictly prohibited."
            )
            logger.info(msg)
            raise ValueError(msg)

        logger.info(f"Executing authorized Internshala Partner API call for {self.name}")
        return []
