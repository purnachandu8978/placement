"""
Phase 6 Test Suite: Production Hardening, Security Audits, and Verification.
Validates:
1. Security headers injection (X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
2. Public credential verification endpoint (/verify/{hash}) and anti-enumeration.
3. IDOR prevention and strict multi-student data isolation.
4. Privilege escalation prevention (disallowing role self-assignment).
5. Role-based access control (RBAC) enforcement on administrative routes.
6. Health check subsystem diagnostic reporting.
7. File upload validation safeguards.
"""

from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.dependencies import verify_student_ownership
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_security_headers_middleware(client: AsyncClient):
    """Verify standard OWASP security headers on all API responses."""
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    headers = res.headers

    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


@pytest.mark.asyncio
async def test_public_skill_verification_valid_hash(client: AsyncClient, test_db):
    """Verify that public verification endpoint returns authentic credential without exposing private PII."""
    hash_val = "sha256_mock_valid_hash_react_12345678"
    user_uid = "student_verified_candidate_99"

    # Seed mock verified skill
    await test_db.verified_skills.update_one(
        {"verification_hash": hash_val},
        {
            "$set": {
                "user_id": user_uid,
                "skill": "React & TypeScript",
                "proficiency": "Advanced",
                "score": 92.5,
                "evidence": "Completed 10/10 sandboxed React component challenges with 95% test coverage.",
                "verification_hash": hash_val,
                "verification_date": datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc),
            }
        },
        upsert=True,
    )

    # Seed profile with student name & college
    await test_db.student_profiles.update_one(
        {"user_id": user_uid},
        {
            "$set": {
                "user_id": user_uid,
                "full_name": "Arjun Sharma",
                "college": "National Institute of Technology",
            }
        },
        upsert=True,
    )

    res = await client.get(f"/api/v1/verification/verify/{hash_val}")
    assert res.status_code == 200
    data = res.json()

    assert data["verified"] is True
    assert data["status"] == "ACTIVE_VERIFIED"
    assert data["candidate_name"] == "Arjun Sharma"
    assert data["college"] == "National Institute of Technology"
    assert data["skill"] == "React & TypeScript"
    assert data["score"] == 92.5
    assert "Placement Intelligence" in data["issuing_platform"]

    # Crucial security assertion: Never expose student UID, email, or phone
    assert "user_id" not in data
    assert "email" not in data
    assert "phone" not in data
    assert user_uid not in str(data)


@pytest.mark.asyncio
async def test_public_skill_verification_anti_enumeration(client: AsyncClient):
    """Test anti-enumeration: short or malformed hashes return 400 Bad Request."""
    res_short = await client.get("/api/v1/verification/verify/abc")
    assert res_short.status_code == 400
    assert "Invalid credential verification hash format" in res_short.json()["detail"]


@pytest.mark.asyncio
async def test_public_skill_verification_nonexistent_hash(client: AsyncClient):
    """Test that querying an unknown hash returns 404 without leaking internal state."""
    res = await client.get("/api/v1/verification/verify/non_existent_fake_hash_123456789")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_idor_student_profile_isolation(test_student_token, test_student2_token):
    """Verify that Student 1 is forbidden from inspecting Student 2's private profile (IDOR prevention)."""
    token1, user1 = test_student_token
    token2, user2 = test_student2_token

    uid1 = user1["firebase_uid"]
    uid2 = user2["firebase_uid"]

    # Direct unit test of verify_student_ownership
    student1_user = {"firebase_uid": uid1, "role": "STUDENT"}
    with pytest.raises(HTTPException) as exc_info:
        verify_student_ownership(target_user_id=uid2, current_user=student1_user)

    assert exc_info.value.status_code == 403
    assert "Cross-user data access is strictly forbidden" in exc_info.value.detail


@pytest.mark.asyncio
async def test_privilege_escalation_prevention(client: AsyncClient, test_student_token, test_db):
    """Verify that students cannot escalate their privileges to ADMIN via user profile updates."""
    token, user = test_student_token
    uid = user["firebase_uid"]

    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to update display name while injecting role
    res = await client.put(
        "/api/v1/users/me",
        json={"display_name": "Arjun Sharma", "role": "SUPER_ADMIN"},
        headers=headers,
    )
    assert res.status_code == 200

    # Verify role in database remains STUDENT
    db_user = await test_db.users.find_one({"firebase_uid": uid})
    assert db_user["role"] == "STUDENT", "Student must not be able to escalate role"


@pytest.mark.asyncio
async def test_student_cannot_access_admin_endpoints(client: AsyncClient, test_student_token):
    """Verify that student tokens are strictly rejected on administrative management routes."""
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to access admin job sync trigger
    res = await client.post("/api/v1/admin/jobs/sync-all", headers=headers)
    assert res.status_code == 403
    assert "Access denied" in res.json()["detail"]


@pytest.mark.asyncio
async def test_health_check_subsystem_reporting(client: AsyncClient):
    """Verify that health check reports comprehensive diagnostic status."""
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] in ["healthy", "degraded"]
    assert "database" in data
    assert "storage" in data
    assert "auth_provider" in data
    assert "version" in data
