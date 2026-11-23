"""
Tests for India Startup Discovery, Geospatial Map Hubs,
Personalized Recommendations, and Direct Apply Experience.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_01_seed_and_list_startups(client: AsyncClient):
    """Test 1: Startups directory seeds authentic Indian startups and returns paginated list."""
    res = await client.get("/api/v1/startups")
    assert res.status_code == 200, res.text
    startups = res.json()
    assert isinstance(startups, list)
    assert len(startups) >= 5

    sample = startups[0]
    assert "startup_id" in sample
    assert "name" in sample
    assert "hq_city" in sample
    assert "hq_state" in sample
    assert "lat" in sample and "lng" in sample
    assert "careers_url" in sample
    assert "dpiit_recognized" in sample


@pytest.mark.asyncio
async def test_02_startup_filters_by_state_and_sector(client: AsyncClient):
    """Test 2: Can filter startups by Indian state, city, and sector."""
    # Filter by Karnataka
    ka_res = await client.get("/api/v1/startups?state=Karnataka")
    assert ka_res.status_code == 200
    ka_startups = ka_res.json()
    assert len(ka_startups) >= 1
    assert all(s["hq_state"].lower() == "karnataka" for s in ka_startups)

    # Filter by Fintech
    fin_res = await client.get("/api/v1/startups?sector=Fintech")
    assert fin_res.status_code == 200
    fin_startups = fin_res.json()
    assert len(fin_startups) >= 1
    assert all(s["sector"].lower() == "fintech" for s in fin_startups)


@pytest.mark.asyncio
async def test_03_startup_map_data_aggregation(client: AsyncClient):
    """Test 3: Map data endpoint aggregates geographic clusters across India with lat/lng coordinates."""
    res = await client.get("/api/v1/startups/map-data")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "total_startups" in data
    assert "hubs" in data
    assert "state_counts" in data
    assert "sector_counts" in data

    hubs = data["hubs"]
    assert len(hubs) >= 3

    # Check that Bengaluru, Hyderabad, and Pune are represented
    cities = [h["city"].lower() for h in hubs]
    assert "bengaluru" in cities
    assert "hyderabad" in cities

    bengaluru_hub = [h for h in hubs if h["city"].lower() == "bengaluru"][0]
    assert bengaluru_hub["lat"] > 12.0 and bengaluru_hub["lng"] > 77.0
    assert bengaluru_hub["startup_count"] >= 2


@pytest.mark.asyncio
async def test_04_personalized_recommendations(client: AsyncClient):
    """Test 4: Personalized recommendations endpoint calculates match scores based on student profile."""
    headers = {"Authorization": "Bearer mock_token_student_startup_rec_01"}
    res = await client.get("/api/v1/startups/recommendations", headers=headers)
    assert res.status_code == 200, res.text
    recs = res.json()
    assert isinstance(recs, list)
    assert len(recs) >= 1

    sample = recs[0]
    assert sample["match_score"] is not None
    assert sample["match_score"] >= 60.0
    assert "match_reasons" in sample


@pytest.mark.asyncio
async def test_05_direct_apply_tracking(client: AsyncClient):
    """Test 5: Clicking Apply validates destination URL and registers application tracking."""
    headers = {"Authorization": "Bearer mock_token_student_startup_apply_01"}

    # Get a job opening
    jobs_res = await client.get("/api/v1/startups/jobs")
    assert jobs_res.status_code == 200
    jobs = jobs_res.json()
    assert len(jobs) >= 1
    job_id = jobs[0]["job_id"]

    apply_res = await client.post(
        f"/api/v1/startups/jobs/{job_id}/apply",
        json={"notes": "Interested in distributed systems track."},
        headers=headers,
    )
    assert apply_res.status_code == 200, apply_res.text
    apply_data = apply_res.json()
    assert apply_data["success"] is True
    assert apply_data["status"] == "APPLYING"
    assert apply_data["apply_url"].startswith("http")

    # Check student's application tracking list
    my_apps = await client.get("/api/v1/startups/applications/my", headers=headers)
    assert my_apps.status_code == 200
    tracked = my_apps.json()
    assert len(tracked) >= 1
    assert tracked[0]["job_id"] == job_id
    assert tracked[0]["status"] == "APPLYING"


@pytest.mark.asyncio
async def test_06_student_update_application_status(client: AsyncClient):
    """Test 6: Student can update tracked application status (e.g. APPLIED, INTERVIEW, OFFER)."""
    headers = {"Authorization": "Bearer mock_token_student_startup_apply_02"}
    jobs = (await client.get("/api/v1/startups/jobs")).json()
    job_id = jobs[0]["job_id"]

    await client.post(f"/api/v1/startups/jobs/{job_id}/apply", headers=headers)

    # Update status to INTERVIEW
    upd_res = await client.patch(
        f"/api/v1/startups/applications/{job_id}/status",
        json={"status": "INTERVIEW", "notes": "Technical round scheduled for Tuesday."},
        headers=headers,
    )
    assert upd_res.status_code == 200, upd_res.text
    assert upd_res.json()["status"] == "INTERVIEW"

    my_apps = (await client.get("/api/v1/startups/applications/my", headers=headers)).json()
    matched = [a for a in my_apps if a["job_id"] == job_id][0]
    assert matched["status"] == "INTERVIEW"
    assert "Technical round" in matched["notes"]
