"""
Tests for College-Verified Student Identity, Digital Credential Assessments,
Certificate PDF Generation, and Public Credential Verification.
"""

from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from app.db.mongodb import mongo_manager
from app.services.college_verification_service import (
    LEVEL_1_BLUE_QUESTIONS,
    LEVEL_2_GREEN_QUESTIONS,
)


async def seed_verification_prerequisites(uid: str, all_green: bool = True):
    """Seeds active resume, passed assessment, and completed assignments to satisfy competency matrix."""
    db = mongo_manager.db
    score = 100.0 if all_green else 70.0

    # 1. Active resume with detected skill
    await db.resumes.update_one(
        {"user_id": uid, "is_active": True},
        {
            "$set": {
                "user_id": uid,
                "is_active": True,
                "filename": "verified_candidate_resume.pdf",
                "detected_skills": [{"skill_name": "Full Stack & Core CS"}],
                "uploaded_at": "2026-11-23T00:00:00Z",
            }
        },
        upsert=True,
    )

    # 2. Passed skill assessment attempt
    await db.assessment_attempts.update_one(
        {"user_id": uid, "skill_name": "Full Stack & Core CS"},
        {
            "$set": {
                "user_id": uid,
                "skill_name": "Full Stack & Core CS",
                "score": score,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )

    # 3. Passed assignment submissions
    assignments = await db.assignments.find({}).to_list(length=50)
    for asg in assignments:
        aid = str(asg.get("_id"))
        tkey = asg.get("template_key") or aid
        await db.assignment_submissions.update_one(
            {"user_id": uid, "assignment_id": aid},
            {
                "$set": {
                    "user_id": uid,
                    "assignment_id": aid,
                    "template_key": tkey,
                    "score": score,
                    "status": "completed",
                    "submitted_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )


@pytest.mark.asyncio
async def test_01_student_verification_status_initial(client: AsyncClient):
    """Test 1: Fresh zero-state student has NOT_VERIFIED status and NO_RESUME prerequisite lock."""
    headers = {"Authorization": "Bearer mock_token_student_verif_01"}
    res = await client.get("/api/v1/verification/status", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["current_level"] == "NOT_VERIFIED"
    assert data["active_credential"] is None
    assert data["certification_percentage"] == 0
    assert data["certification_status"] == "NO_RESUME"
    assert data["level_1_eligible"] is False
    assert data["level_2_eligible"] is False

    # Attempting to start before completing prerequisites strictly returns 400
    start_attempt = await client.post(
        "/api/v1/verification/assessment/start",
        json={"level": "LEVEL_1_BLUE"},
        headers=headers,
    )
    assert start_attempt.status_code == 400
    assert "complete your pending items" in start_attempt.json()["detail"].lower()


@pytest.mark.asyncio
async def test_02_start_level_1_blue_assessment_sanitized(client: AsyncClient):
    """Test 2: Starting Level 1 (5-min) returns 300s duration and questions without answer keys."""
    headers = {"Authorization": "Bearer mock_token_student_verif_02"}
    await seed_verification_prerequisites("student_verif_02", all_green=True)

    payload = {"level": "LEVEL_1_BLUE", "skill_focus": "Core Web & CS"}
    res = await client.post("/api/v1/verification/assessment/start", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["level"] == "LEVEL_1_BLUE"
    assert data["duration_seconds"] == 300
    assert data["time_limit_minutes"] == 5
    assert len(data["questions"]) >= 5

    # Security check: verify answer keys are NOT exposed
    for q in data["questions"]:
        assert "correct_option" not in q
        assert "explanation" not in q
        assert "rubric" not in q


@pytest.mark.asyncio
async def test_03_submit_level_1_fails_below_threshold(client: AsyncClient):
    """Test 3: Submitting failing answers does NOT award a credential badge."""
    headers = {"Authorization": "Bearer mock_token_student_verif_03"}
    await seed_verification_prerequisites("student_verif_03", all_green=True)

    # Start session
    start_res = await client.post(
        "/api/v1/verification/assessment/start",
        json={"level": "LEVEL_1_BLUE"},
        headers=headers,
    )
    assert start_res.status_code == 200
    attempt_id = start_res.json()["attempt_id"]

    # Submit intentionally wrong answers (all option 3)
    wrong_answers = [{"question_id": f"v1_q{i}", "selected_option": 3} for i in range(1, 6)]
    sub_res = await client.post(
        "/api/v1/verification/assessment/submit",
        json={"attempt_id": attempt_id, "answers": wrong_answers},
        headers=headers,
    )
    assert sub_res.status_code == 200, sub_res.text
    sub_data = sub_res.json()
    assert sub_data["passed"] is False
    assert sub_data["status"] == "FAILED"
    assert sub_data["credential_id"] is None
    assert sub_data["badge_type"] is None


@pytest.mark.asyncio
async def test_04_submit_level_1_passes_awards_blue_credential(client: AsyncClient):
    """Test 4: Submitting correct answers (>=70%) awards Level 1 Blue Verified credential."""
    headers = {"Authorization": "Bearer mock_token_student_verif_04"}
    await seed_verification_prerequisites("student_verif_04", all_green=True)

    start_res = await client.post(
        "/api/v1/verification/assessment/start",
        json={"level": "LEVEL_1_BLUE"},
        headers=headers,
    )
    assert start_res.status_code == 200
    attempt_id = start_res.json()["attempt_id"]

    # Provide correct answers from server knowledge
    correct_answers = [
        {"question_id": q["id"], "selected_option": q["correct_option"]}
        for q in LEVEL_1_BLUE_QUESTIONS
    ]

    sub_res = await client.post(
        "/api/v1/verification/assessment/submit",
        json={"attempt_id": attempt_id, "answers": correct_answers},
        headers=headers,
    )
    assert sub_res.status_code == 200, sub_res.text
    data = sub_res.json()
    assert data["passed"] is True
    assert data["status"] == "PASSED_BLUE"
    assert data["badge_type"] == "BLUE_VERIFIED"
    assert data["title"] == "College Verified"
    assert data["credential_id"] is not None
    assert data["credential_id"].startswith("PI-CRED-2026-")
    assert data["credential_hash"] is not None

    # Check verification status endpoint reflects the award
    st_res = await client.get("/api/v1/verification/status", headers=headers)
    st_data = st_res.json()
    assert st_data["current_level"] == "LEVEL_1_BLUE"
    assert st_data["active_credential"]["badge_type"] == "BLUE_VERIFIED"
    assert st_data["trust_score"] >= 80.0


@pytest.mark.asyncio
async def test_05_start_and_pass_level_2_green_supersedes_blue(client: AsyncClient):
    """Test 5: Passing Level 2 Green assessment awards Green Fully Verified badge and supersedes Blue."""
    headers = {"Authorization": "Bearer mock_token_student_verif_05"}
    await seed_verification_prerequisites("student_verif_05", all_green=True)

    # First award Level 1 Blue
    start1 = await client.post("/api/v1/verification/assessment/start", json={"level": "LEVEL_1_BLUE"}, headers=headers)
    assert start1.status_code == 200
    att1 = start1.json()["attempt_id"]
    ans1 = [{"question_id": q["id"], "selected_option": q["correct_option"]} for q in LEVEL_1_BLUE_QUESTIONS]
    await client.post("/api/v1/verification/assessment/submit", json={"attempt_id": att1, "answers": ans1}, headers=headers)

    # Now attempt Level 2 Green (10-minute)
    start2 = await client.post("/api/v1/verification/assessment/start", json={"level": "LEVEL_2_GREEN"}, headers=headers)
    assert start2.status_code == 200
    att2 = start2.json()["attempt_id"]
    assert start2.json()["duration_seconds"] == 600

    ans2 = [{"question_id": q["id"], "selected_option": q["correct_option"]} for q in LEVEL_2_GREEN_QUESTIONS]
    sub2 = await client.post("/api/v1/verification/assessment/submit", json={"attempt_id": att2, "answers": ans2}, headers=headers)
    assert sub2.status_code == 200
    sub2_data = sub2.json()
    assert sub2_data["passed"] is True
    assert sub2_data["badge_type"] == "GREEN_FULLY_VERIFIED"
    assert sub2_data["title"] == "College Fully Verified"

    # Status check confirms Level 2 Green is active and prior Blue is superseded
    overview_res = await client.get("/api/v1/verification/status", headers=headers)
    overview = overview_res.json()
    assert overview["current_level"] == "LEVEL_2_GREEN"
    assert overview["active_credential"]["badge_type"] == "GREEN_FULLY_VERIFIED"
    assert len(overview["history"]) >= 2
    # Check that older credential is marked superseded
    older = [c for c in overview["history"] if c["level"] == "LEVEL_1_BLUE"][0]
    assert older["is_superseded"] is True


@pytest.mark.asyncio
async def test_06_download_credential_pdf_certificate(client: AsyncClient):
    """Test 6: PDF certificate endpoint streams valid A4 landscape PDF bytes."""
    headers = {"Authorization": "Bearer mock_token_student_verif_06"}
    await seed_verification_prerequisites("student_verif_06", all_green=True)

    start = await client.post("/api/v1/verification/assessment/start", json={"level": "LEVEL_1_BLUE"}, headers=headers)
    assert start.status_code == 200
    att = start.json()["attempt_id"]
    ans = [{"question_id": q["id"], "selected_option": q["correct_option"]} for q in LEVEL_1_BLUE_QUESTIONS]
    sub = await client.post("/api/v1/verification/assessment/submit", json={"attempt_id": att, "answers": ans}, headers=headers)
    cred_id = sub.json()["credential_id"]

    pdf_res = await client.get(f"/api/v1/verification/credentials/{cred_id}/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")
    assert len(pdf_res.content) > 1000


@pytest.mark.asyncio
async def test_07_public_credential_verification_no_auth_safe(client: AsyncClient):
    """Test 7: Public verify endpoint resolves credential without auth and hides private student info."""
    headers = {"Authorization": "Bearer mock_token_student_verif_07"}
    await seed_verification_prerequisites("student_verif_07", all_green=True)

    start = await client.post("/api/v1/verification/assessment/start", json={"level": "LEVEL_1_BLUE"}, headers=headers)
    assert start.status_code == 200
    att = start.json()["attempt_id"]
    ans = [{"question_id": q["id"], "selected_option": q["correct_option"]} for q in LEVEL_1_BLUE_QUESTIONS]
    sub = await client.post("/api/v1/verification/assessment/submit", json={"attempt_id": att, "answers": ans}, headers=headers)
    cred_id = sub.json()["credential_id"]

    # Call public verification without ANY Authorization header
    pub_res = await client.get(f"/api/v1/verification/verify/{cred_id}")
    assert pub_res.status_code == 200, pub_res.text
    pub_data = pub_res.json()
    assert pub_data["verified"] is True
    assert pub_data["status"] == "ACTIVE_VERIFIED"
    assert pub_data["credential_id"] == cred_id
    assert "score" in pub_data

    # Security verification: no private data leaks
    assert "email" not in pub_data
    assert "phone" not in pub_data
    assert "answers" not in pub_data
    assert "roll_number" not in pub_data


@pytest.mark.asyncio
async def test_08_public_credential_visibility_toggle(client: AsyncClient):
    """Test 8: Student can toggle credential to private, causing public verify to hide details."""
    headers = {"Authorization": "Bearer mock_token_student_verif_08"}
    await seed_verification_prerequisites("student_verif_08", all_green=True)

    start = await client.post("/api/v1/verification/assessment/start", json={"level": "LEVEL_1_BLUE"}, headers=headers)
    assert start.status_code == 200
    att = start.json()["attempt_id"]
    ans = [{"question_id": q["id"], "selected_option": q["correct_option"]} for q in LEVEL_1_BLUE_QUESTIONS]
    sub = await client.post("/api/v1/verification/assessment/submit", json={"attempt_id": att, "answers": ans}, headers=headers)
    cred_id = sub.json()["credential_id"]

    # Toggle to private
    tog_res = await client.patch(
        f"/api/v1/verification/credentials/{cred_id}/visibility",
        json={"public_visibility": False},
        headers=headers,
    )
    assert tog_res.status_code == 200
    assert tog_res.json()["public_visibility"] is False

    # Public verify now shows PRIVATE
    pub_res = await client.get(f"/api/v1/verification/verify/{cred_id}")
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "PRIVATE"
    assert pub_res.json()["candidate_name"] == "Private Candidate Profile"
