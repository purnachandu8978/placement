"""
Comprehensive Test Suite for Phase 4:
Autonomous Job Discovery, Ingestion, Deduplication, and Explainable Matching Engine.
"""

import pytest
from httpx import AsyncClient

from app.services.job_connectors.base import set_connector_mock_handler, clear_connector_mock_handler
from app.services.job_connectors.greenhouse import GreenhouseConnector
from app.services.job_connectors.lever import LeverConnector
from app.services.job_connectors.remotive import RemotiveConnector
from app.services.job_connectors.rss_connector import RSSFeedConnector
from app.services.job_connectors.enterprise_connectors import (
    LinkedInEnterpriseConnector,
    IndeedEnterpriseConnector,
    InternshalaEnterpriseConnector,
)
from app.services.job_matcher import compute_job_match, recalculate_all_job_matches_for_student
from app.services.job_sync_service import seed_default_job_sources, sync_source


# Mock Feed Payloads
MOCK_GREENHOUSE_PAYLOAD = {
    "jobs": [
        {
            "id": 101,
            "title": "Software Engineer, Distributed Systems",
            "location": {"name": "Bengaluru, India (Hybrid)"},
            "content": "<p>We are hiring a Software Engineer with expertise in Python, PostgreSQL, and Docker. Experience with Kubernetes is preferred.</p>",
            "absolute_url": "https://boards.greenhouse.io/figma/jobs/101",
            "updated_at": "2026-11-01T10:00:00Z",
        },
        {
            "id": 102,
            "title": "Frontend Engineer, React",
            "location": {"name": "Remote"},
            "content": "<p>Build delightful interfaces using React, TypeScript, and Tailwind CSS.</p>",
            "absolute_url": "https://boards.greenhouse.io/figma/jobs/102",
            "updated_at": "2026-11-01T10:00:00Z",
        },
    ]
}

MOCK_LEVER_PAYLOAD = [
    {
        "id": "lever-201",
        "text": "Full Stack Engineer",
        "description": "<div>Looking for developers proficient in Node.js, React, and MongoDB to join our core team.</div>",
        "hostedUrl": "https://jobs.lever.co/postman/lever-201",
        "applyUrl": "https://jobs.lever.co/postman/lever-201/apply",
        "categories": {
            "location": "Bengaluru",
            "commitment": "Full-time",
            "workplaceType": "hybrid",
        },
        "createdAt": 1730000000000,
    }
]

MOCK_REMOTIVE_PAYLOAD = {
    "jobs": [
        {
            "id": 301,
            "title": "Backend Python Developer",
            "company_name": "CloudScale Inc",
            "url": "https://remotive.com/jobs/cloudscale-backend-301",
            "category": "Software Development",
            "job_type": "full_time",
            "candidate_required_location": "Worldwide",
            "salary": "$90,000 - $120,000",
            "description": "<p>Develop high-throughput REST APIs using FastAPI, Python, Redis, and PostgreSQL.</p>",
            "tags": ["python", "fastapi", "postgresql", "redis"],
            "publication_date": "2026-11-10T12:00:00Z",
        }
    ]
}

MOCK_RSS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Authorized Tech Careers Feed</title>
    <link>https://careers.techcorp.com</link>
    <item>
      <title>DevOps Engineer (Kubernetes, AWS)</title>
      <link>https://careers.techcorp.com/jobs/devops-401</link>
      <guid>techcorp-401</guid>
      <description>Manage cloud infrastructure with Terraform, AWS, and Kubernetes clusters.</description>
      <pubDate>Mon, 10 Nov 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""


# -------------------------------------------------------------------------
# Workstream 2 & 3: Connector Architecture and Compliance Verification
# -------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_greenhouse_connector_discovery():
    """Verify Greenhouse connector extracts jobs, parses skills, and appends #app direct apply anchor."""
    async def mock_handler(url):
        assert "boards-api.greenhouse.io" in url
        return MOCK_GREENHOUSE_PAYLOAD

    set_connector_mock_handler("greenhouse", mock_handler)
    try:
        connector = GreenhouseConnector(board_token="figma", employer_name="Figma")
        jobs = await connector.fetch_jobs()

        assert len(jobs) == 2
        j1 = jobs[0]
        assert j1["source_job_id"] == "101"
        assert j1["title"] == "Software Engineer, Distributed Systems"
        assert j1["employer"] == "Figma"
        assert "Python" in j1["required_skills"]
        assert "PostgreSQL" in j1["required_skills"]
        assert j1["original_apply_url"] == "https://boards.greenhouse.io/figma/jobs/101#app"
        assert j1["content_hash"] != ""
    finally:
        clear_connector_mock_handler()


@pytest.mark.asyncio
async def test_lever_connector_discovery():
    """Verify Lever connector extracts postings, maps applyUrl, and detects required skills."""
    async def mock_handler(url):
        assert "api.lever.co" in url
        return MOCK_LEVER_PAYLOAD

    set_connector_mock_handler("lever", mock_handler)
    try:
        connector = LeverConnector(board_token="postman", employer_name="Postman")
        jobs = await connector.fetch_jobs()

        assert len(jobs) == 1
        j = jobs[0]
        assert j["source_job_id"] == "lever-201"
        assert j["title"] == "Full Stack Engineer"
        assert j["employer"] == "Postman"
        assert "React" in j["required_skills"]
        assert j["original_apply_url"] == "https://jobs.lever.co/postman/lever-201/apply"
    finally:
        clear_connector_mock_handler()


@pytest.mark.asyncio
async def test_remotive_connector_discovery():
    """Verify Remotive connector parses developer JSON and preserves genuine apply links."""
    async def mock_handler(url):
        assert "remotive.com" in url
        return MOCK_REMOTIVE_PAYLOAD

    set_connector_mock_handler("remotive", mock_handler)
    try:
        connector = RemotiveConnector()
        jobs = await connector.fetch_jobs()

        assert len(jobs) == 1
        j = jobs[0]
        assert j["source_job_id"] == "301"
        assert j["employer"] == "CloudScale Inc"
        assert j["work_mode"] == "Remote"
        assert "FastAPI" in j["required_skills"]
        assert j["original_apply_url"] == "https://remotive.com/jobs/cloudscale-backend-301"
    finally:
        clear_connector_mock_handler()


@pytest.mark.asyncio
async def test_rss_feed_connector_discovery():
    """Verify XML RSS feed connector parses standard channel items."""
    async def mock_handler(url):
        return MOCK_RSS_XML

    set_connector_mock_handler("rss", mock_handler)
    try:
        connector = RSSFeedConnector(name="TechCorp RSS", endpoint_url="https://careers.techcorp.com/rss.xml", employer_name="TechCorp")
        jobs = await connector.fetch_jobs()

        assert len(jobs) == 1
        j = jobs[0]
        assert j["source_job_id"] == "techcorp-401"
        assert "Kubernetes" in j["required_skills"]
        assert j["original_apply_url"] == "https://careers.techcorp.com/jobs/devops-401"
    finally:
        clear_connector_mock_handler()


@pytest.mark.asyncio
async def test_enterprise_connectors_strict_compliance():
    """
    CRITICAL COMPLIANCE TEST:
    Verify LinkedIn, Indeed, and Internshala connectors throw ValueError / return NOT_CONFIGURED
    when partner API credentials are not provided.
    Never bypass login gates, solve CAPTCHAs, or scrape in violation of Terms.
    """
    # 1. LinkedIn without API key
    lk = LinkedInEnterpriseConnector(api_key=None)
    with pytest.raises(ValueError) as excinfo:
        await lk.fetch_jobs()
    assert "NOT CONFIGURED" in str(excinfo.value)

    # 2. Indeed without client secret
    ind = IndeedEnterpriseConnector(client_id=None, client_secret=None)
    with pytest.raises(ValueError) as excinfo:
        await ind.fetch_jobs()
    assert "NOT CONFIGURED" in str(excinfo.value)

    # 3. Internshala without partner token
    ish = InternshalaEnterpriseConnector(partner_token=None)
    with pytest.raises(ValueError) as excinfo:
        await ish.fetch_jobs()
    assert "NOT CONFIGURED" in str(excinfo.value)


# -------------------------------------------------------------------------
# Workstream 3: Deduplication and Ingestion Pipeline
# -------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_deduplication_and_update_detection(setup_test_db):
    """
    Verify SHA-256 content-hash deduplication:
    - 1st sync inserts 2 jobs.
    - 2nd sync with same content skips both as duplicates.
    - 3rd sync with updated description updates the job rather than creating duplicate.
    """
    from tests.conftest import test_db

    # Seed default sources
    await seed_default_job_sources(test_db)
    source = await test_db.job_sources.find_one({"source_type": "greenhouse"})
    assert source is not None
    source_id = str(source["_id"])

    # 1st Run
    async def mock_handler_1(url):
        return MOCK_GREENHOUSE_PAYLOAD

    set_connector_mock_handler("greenhouse", mock_handler_1)
    run1 = await sync_source(source_id, test_db)
    assert run1["status"] == "SUCCESS"
    assert run1["jobs_added"] == 2
    assert run1["duplicates_skipped"] == 0

    # 2nd Run: Identical content -> Duplicates skipped
    run2 = await sync_source(source_id, test_db)
    assert run2["status"] == "SUCCESS"
    assert run2["jobs_added"] == 0
    assert run2["duplicates_skipped"] == 2

    # 3rd Run: One job changed content
    modified_payload = {
        "jobs": [
            {
                "id": 101,
                "title": "Senior Distributed Systems Engineer (Updated)",
                "location": {"name": "Bengaluru, India (Hybrid)"},
                "content": "<p>Updated requirements: Python, Go, Kubernetes, PostgreSQL.</p>",
                "absolute_url": "https://boards.greenhouse.io/figma/jobs/101",
                "updated_at": "2026-11-12T10:00:00Z",
            },
            MOCK_GREENHOUSE_PAYLOAD["jobs"][1],
        ]
    }

    async def mock_handler_2(url):
        return modified_payload

    set_connector_mock_handler("greenhouse", mock_handler_2)
    run3 = await sync_source(source_id, test_db)
    assert run3["status"] == "SUCCESS"
    assert run3["jobs_updated"] == 1
    assert run3["duplicates_skipped"] == 1

    clear_connector_mock_handler()


# -------------------------------------------------------------------------
# Workstream 4: Explainable Matching Engine (Strict Verification Separation)
# -------------------------------------------------------------------------

def test_explainable_job_matcher_strict_separation():
    """
    CRITICAL ALGORITHM TEST:
    Strictly enforce: 'Never treat resume-mentioned skills as verified skills.'
    Candidate A: Python is VERIFIED (passed proctored test).
    Candidate B: Python is only UNVERIFIED (extracted from resume text).
    Candidate A must receive full verified points (40%), while Candidate B receives resume points (25%).
    """
    job = {
        "title": "Backend Python Engineer",
        "company": "FastTech",
        "required_skills": ["Python"],
        "preferred_skills": ["Docker"],
        "location": "Remote",
        "work_mode": "Remote",
        "eligibility": "2025/2026 Batch",
        "allowed_grad_years": [2025, 2026],
        "min_cgpa": 7.0,
    }

    # Candidate A: Verified Python
    cand_a = {
        "verified_skills": ["Python"],
        "resume_skills": ["Python"],
        "target_roles": ["Backend Engineer"],
        "preferred_locations": ["Remote"],
        "preferred_work_modes": ["Remote"],
        "graduation_year": 2025,
        "cgpa": 8.5,
    }
    match_a = compute_job_match(cand_a, job)
    assert "Python" in match_a.verified_skills_matched
    assert "Python" not in match_a.resume_skills_matched
    assert match_a.formula_breakdown["verified_skills_component"] == 40.0
    assert match_a.formula_breakdown["resume_skills_component"] == 0.0

    # Candidate B: Resume-only Python (Unverified)
    cand_b = {
        "verified_skills": [],
        "resume_skills": ["Python"],
        "target_roles": ["Backend Engineer"],
        "preferred_locations": ["Remote"],
        "preferred_work_modes": ["Remote"],
        "graduation_year": 2025,
        "cgpa": 8.5,
    }
    match_b = compute_job_match(cand_b, job)
    assert "Python" not in match_b.verified_skills_matched
    assert "Python" in match_b.resume_skills_matched
    assert match_b.formula_breakdown["verified_skills_component"] == 0.0
    assert match_b.formula_breakdown["resume_skills_component"] == 25.0

    # Verified score must strictly exceed unverified resume score
    assert match_a.match_score > match_b.match_score


def test_explainable_matcher_eligibility_concerns():
    """Verify that CGPA shortfall or graduation year mismatch produces structured eligibility concerns."""
    job = {
        "title": "Associate Software Engineer",
        "company": "Nexus Corp",
        "required_skills": ["Java", "SQL"],
        "allowed_grad_years": [2025],
        "min_cgpa": 8.0,
        "work_mode": "Remote",
    }
    ineligible_candidate = {
        "verified_skills": ["Java"],
        "resume_skills": ["SQL"],
        "graduation_year": 2027,  # Mismatch: 2027 != 2025
        "cgpa": 6.8,  # Shortfall: 6.8 < 8.0
    }
    match = compute_job_match(ineligible_candidate, job)
    assert len(match.eligibility_concerns) >= 2
    assert any("CGPA" in c for c in match.eligibility_concerns)
    assert any("batch" in c or "grad year" in c for c in match.eligibility_concerns)
    assert match.formula_breakdown["academic_eligibility_component"] < 10.0


# -------------------------------------------------------------------------
# Workstream 5: Endpoints, Privacy-Safe Click Tracking, and Isolation
# -------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_job_endpoints_and_click_tracking(client: AsyncClient, test_student_token):
    """Test job listing, application URL retrieval, and privacy-safe click telemetry."""
    from tests.conftest import test_db
    from datetime import datetime, timezone

    # Ensure at least one active job in database
    job_count = await test_db.jobs.count_documents({"status": "active"})
    if job_count == 0:
        await test_db.jobs.insert_one({
            "title": "Software Engineer, Frontend",
            "company": "Stripe",
            "location": "Remote",
            "work_mode": "Remote",
            "salary": "18 - 24 LPA",
            "description": "Build high-throughput developer portals.",
            "required_skills": ["React", "TypeScript"],
            "eligibility": "2025/2026 Batch",
            "status": "active",
            "original_apply_url": "https://stripe.com/jobs/101",
            "posted_at": datetime.now(timezone.utc),
        })

    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    # 1. List jobs
    res = await client.get("/api/v1/jobs", headers=headers)
    assert res.status_code == 200
    jobs = res.json()
    assert len(jobs) > 0

    first_job = jobs[0]
    job_id = first_job["id"]

    # 2. Get validated application URL
    url_res = await client.get(f"/api/v1/jobs/{job_id}/application-url", headers=headers)
    assert url_res.status_code == 200
    url_data = url_res.json()
    assert "has_apply_url" in url_data
    assert "action_label" in url_data

    # 3. Privacy-safe click tracking
    track_res = await client.post(
        f"/api/v1/jobs/{job_id}/track-click",
        json={"click_type": "apply"},
        headers=headers,
    )
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["status"] == "recorded"


@pytest.mark.asyncio
async def test_admin_job_sources_crud_and_stats(client: AsyncClient, test_admin_token):
    """Test admin source registry CRUD, stats endpoint, and sync history."""
    token, _ = test_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get stats
    stats_res = await client.get("/api/v1/admin/jobs/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "total_active_jobs" in stats
    assert "sources_count" in stats

    # 2. List sources
    sources_res = await client.get("/api/v1/admin/jobs/sources", headers=headers)
    assert sources_res.status_code == 200
    sources = sources_res.json()
    assert len(sources) >= 5

    # 3. Create a new source
    create_res = await client.post(
        "/api/v1/admin/jobs/sources",
        json={
            "name": "Greenhouse: TestCo",
            "source_type": "greenhouse",
            "board_token": "testco",
            "sync_interval_minutes": 30,
            "priority": 2,
            "is_active": True,
        },
        headers=headers,
    )
    assert create_res.status_code == 200
    new_source = create_res.json()
    new_id = new_source["id"]

    # 4. Update source
    up_res = await client.put(
        f"/api/v1/admin/jobs/sources/{new_id}",
        json={"is_active": False, "priority": 5},
        headers=headers,
    )
    assert up_res.status_code == 200
    assert up_res.json()["is_active"] is False

    # 5. Get sync history
    hist_res = await client.get("/api/v1/admin/jobs/sync-history", headers=headers)
    assert hist_res.status_code == 200
    assert isinstance(hist_res.json(), list)

    # 6. Delete source
    del_res = await client.delete(f"/api/v1/admin/jobs/sources/{new_id}", headers=headers)
    assert del_res.status_code == 200
