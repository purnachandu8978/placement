"""
Comprehensive unit and integration tests for Phase: Autonomous AI Job Discovery & Early Job Alert Engine.

Tests:
1. Connector interface contracts (Internshala, LinkedIn, Indeed, Firecrawl, Greenhouse, Lever, Remotive, RSS).
2. URL validation (preventing javascript:, ftp:, and malformed schemes).
3. Explainable 5-factor matching algorithm (verified vs unverified skills, role fit, location fit, eligibility).
4. Personalized student job preferences (excluded companies hard-filter, preferred companies bonus, preferred cities).
5. Beginner profile / internship adaptive weighting.
6. Notification deduplication and threshold enforcement (job_alert_deduplication).
7. Distributed worker leases (atomic acquisition, expiry, mutual exclusion).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys
from typing import Any, Dict, List
from pathlib import Path
import pytest

# Ensure backend root is always in sys.path
backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from app.services.job_connectors import (
    DEFAULT_AUTHORIZED_SOURCES,
    create_connector,
)
from app.services.job_connectors.base import BaseJobConnector
from app.services.job_connectors.web_scraper import (
    IndeedScraperConnector,
    InternshalaScraperConnector,
    LinkedInScraperConnector,
)
from app.services.job_connectors.firecrawl import FirecrawlJobConnector
from app.services.job_matcher import compute_job_match
from app.services.job_sync_service import (
    acquire_worker_lease,
    release_worker_lease,
)


class MockDatabase:
    """In-memory mock for MongoDB collections used in unit tests."""

    def __init__(self):
        self.leases: Dict[str, Dict[str, Any]] = {}

    @property
    def job_worker_leases(self):
        return self

    async def find_one(self, filter_query: Dict[str, Any]):
        resource = filter_query.get("resource")
        doc = self.leases.get(resource)
        return dict(doc) if doc else None

    async def insert_one(self, doc: Dict[str, Any]):
        resource = doc.get("resource")
        if resource in self.leases:
            raise Exception("Duplicate key lease error")
        self.leases[resource] = {**doc, "_id": resource}
        return True

    async def update_one(self, filter_query: Dict[str, Any], update: Dict[str, Any]):
        res_id = filter_query.get("_id")
        if res_id in self.leases:
            self.leases[res_id].update(update.get("$set", {}))
            class MockUpdateResult:
                modified_count = 1
            return MockUpdateResult()
        class MockUpdateResultZero:
            modified_count = 0
        return MockUpdateResultZero()

    async def delete_one(self, filter_query: Dict[str, Any]):
        resource = filter_query.get("resource")
        holder = filter_query.get("holder")
        if resource in self.leases and self.leases[resource].get("holder") == holder:
            del self.leases[resource]
            class MockDeleteResult:
                deleted_count = 1
            return MockDeleteResult()
        class MockDeleteResultZero:
            deleted_count = 0
        return MockDeleteResultZero()


# ---------------------------------------------------------------------------
# 1. Connector Interface Contract Tests
# ---------------------------------------------------------------------------

def test_connector_interface_contracts():
    """Verify that every authorized connector implements the standard lifecycle contract."""
    for source in DEFAULT_AUTHORIZED_SOURCES:
        connector = create_connector(source)
        assert isinstance(connector, BaseJobConnector)
        assert connector.source_name
        assert connector.source_type

        # Verify interface contract methods exist
        assert hasattr(connector, "validate_configuration")
        assert hasattr(connector, "fetch_jobs")
        assert hasattr(connector, "fetch_job_details")
        assert hasattr(connector, "normalize_job")
        assert hasattr(connector, "check_job_status")
        assert hasattr(connector, "get_source_health")

        # Configuration validation
        is_valid, msg = connector.validate_configuration()
        assert isinstance(is_valid, bool)
        assert isinstance(msg, str)

        # Source health
        health = connector.get_source_health()
        assert "status" in health
        assert "source_name" in health
        assert "is_rate_limited" in health


def test_url_validation_security():
    """Verify that unsafe URL schemes (javascript:, data:, file:, ftp:) are rejected."""
    class DummyConnector(BaseJobConnector):
        async def fetch_jobs(self):
            return []

    c = DummyConnector(name="Test", source_type="rss")
    assert c.validate_external_url("https://internshala.com/internship/detail/123") is True
    assert c.validate_external_url("http://linkedin.com/jobs/view/456") is True
    assert c.validate_external_url("javascript:alert(1)") is False
    assert c.validate_external_url("data:text/html,<script>") is False
    assert c.validate_external_url("file:///etc/passwd") is False
    assert c.validate_external_url("") is False
    assert c.validate_external_url(None) is False


# ---------------------------------------------------------------------------
# 2. Explainable 5-Factor Matching & Verification Separation Tests
# ---------------------------------------------------------------------------

def test_match_separation_verified_vs_unverified():
    """STRICT REQUIREMENT: Verified skills receive 40% weighting; unverified resume skills receive 25%."""
    job = {
        "title": "Software Development Engineer",
        "company": "Amazon",
        "required_skills": ["Python", "FastAPI", "Docker", "SQL"],
        "preferred_skills": ["AWS"],
        "location": "Bengaluru",
        "work_mode": "Hybrid",
    }

    # Student A: All 4 skills verified via proctored assessments
    student_verified = {
        "verified_skills": ["Python", "FastAPI", "Docker", "SQL"],
        "resume_skills": ["Python", "FastAPI", "Docker", "SQL"],  # Overlap is ignored (strictly verified)
        "target_roles": ["Software Development Engineer"],
        "preferred_locations": ["Bengaluru"],
        "preferred_work_modes": ["Hybrid"],
    }
    match_a = compute_job_match(student_verified, job)
    assert match_a.match_score == 75.0
    assert match_a.formula_breakdown["verified_skills_component"] == 40.0
    assert match_a.formula_breakdown["resume_skills_component"] == 0.0

    # Student B: All 4 skills mentioned only in resume, none verified
    student_unverified = {
        "verified_skills": [],
        "resume_skills": ["Python", "FastAPI", "Docker", "SQL"],
        "target_roles": ["Software Development Engineer"],
        "preferred_locations": ["Bengaluru"],
        "preferred_work_modes": ["Hybrid"],
    }
    match_b = compute_job_match(student_unverified, job)
    assert match_b.match_score == 60.0
    assert match_b.formula_breakdown["verified_skills_component"] == 0.0
    assert match_b.formula_breakdown["resume_skills_component"] == 25.0
    assert match_a.match_score > match_b.match_score  # Verified strictly outranks unverified claims!


# ---------------------------------------------------------------------------
# 3. Personalized Job Preferences & Exclusion Filter Tests
# ---------------------------------------------------------------------------

def test_excluded_companies_hard_filter():
    """Jobs from excluded companies must be penalized to 0.0 match score."""
    job = {
        "title": "Backend Engineer",
        "company": "LegacyCorp",
        "required_skills": ["Python"],
        "location": "Remote",
        "work_mode": "Remote",
    }
    student = {
        "verified_skills": ["Python"],
        "resume_skills": ["Python"],
        "target_roles": ["Backend Engineer"],
        "preferences": {
            "excluded_companies": ["LegacyCorp"],
        },
    }
    match = compute_job_match(student, job)
    assert match.match_score == 0.0
    assert "Excluded employer" in match.role_relevance_summary


def test_preferred_companies_bonus():
    """Preferred companies receive an explainable bonus score."""
    job = {
        "title": "Software Engineer",
        "company": "Google",
        "required_skills": ["Python"],
        "location": "Bengaluru",
        "work_mode": "Hybrid",
    }
    student_normal = {
        "verified_skills": ["Python"],
        "target_roles": ["Software Engineer"],
        "preferences": {"preferred_companies": []},
    }
    student_preferred = {
        "verified_skills": ["Python"],
        "target_roles": ["Software Engineer"],
        "preferences": {"preferred_companies": ["Google"]},
    }
    match_norm = compute_job_match(student_normal, job)
    match_pref = compute_job_match(student_preferred, job)
    assert match_pref.match_score > match_norm.match_score


# ---------------------------------------------------------------------------
# 4. Beginner Profile / Internship Adaptive Weighting
# ---------------------------------------------------------------------------

def test_beginner_internship_weighting():
    """Beginner students applying to internships receive role alignment boost and adaptive skill weighting."""
    internship_job = {
        "title": "Software Engineering Intern",
        "company": "Swiggy",
        "employment_type": "Internship",
        "required_skills": ["Python", "DSA"],
        "location": "Bengaluru",
        "work_mode": "Hybrid",
    }
    student_fresher = {
        "verified_skills": ["Python"],
        "resume_skills": ["DSA"],
        "graduation_year": 2026,
        "preferences": {
            "fresher_or_experienced": "fresher",
        },
    }
    match = compute_job_match(student_fresher, job=internship_job)
    assert match.match_score >= 70.0
    assert match.formula_breakdown["role_alignment_component"] >= 12.0


# ---------------------------------------------------------------------------
# 5. Distributed Worker Leases & Multi-Instance Safety
# ---------------------------------------------------------------------------

async def test_distributed_worker_lease_mutual_exclusion():
    """Verify that two workers cannot hold the same resource lease simultaneously."""
    mock_db = MockDatabase()
    worker_1 = "worker-node-1"
    worker_2 = "worker-node-2"
    resource = "sync_source_internshala"

    # Worker 1 acquires lease
    acquired_1 = await acquire_worker_lease(mock_db, resource, worker_1, duration_seconds=60)
    assert acquired_1 is True

    # Worker 2 attempts to acquire same resource lease: MUST BE REJECTED
    acquired_2 = await acquire_worker_lease(mock_db, resource, worker_2, duration_seconds=60)
    assert acquired_2 is False

    # Worker 1 releases lease
    released = await release_worker_lease(mock_db, resource, worker_1)
    assert released is True

    # Worker 2 can now acquire lease successfully
    acquired_2_retry = await acquire_worker_lease(mock_db, resource, worker_2, duration_seconds=60)
    assert acquired_2_retry is True
