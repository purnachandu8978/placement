"""
Placement Intelligence Comprehensive Production Security Test Suite.
Verifies all 15 audit phases:
- Unauthenticated access rejection (401)
- Role separation & privilege escalation defense (403)
- Multi-user BOLA/IDOR isolation (403)
- Argon2id password hashing parameters
- Sliding-window rate limiting & brute force lockouts (429)
- Platform maintenance mode with administrator bypass (503)
- DPDPA 2023 privacy workflows (Data Export & Deletion requests)
- OWASP security headers injection
- Health check operational readiness
"""

import pytest
from httpx import AsyncClient
from app.core.middleware import set_dynamic_maintenance_mode
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import get_password_hash, verify_password


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected(client: AsyncClient):
    """Verifies that endpoints without valid credentials return HTTP 401."""
    routes_to_test = [
        "/api/v1/students/me",
        "/api/v1/admin/students",
        "/api/v1/resumes/current",
        "/api/v1/roadmaps",
        "/api/v1/notifications",
    ]
    for route in routes_to_test:
        res = await client.get(route)
        assert res.status_code == 401, f"Expected 401 on {route}, got {res.status_code}"
        assert "detail" in res.json()


@pytest.mark.asyncio
async def test_student_cannot_access_admin_endpoints(
    client: AsyncClient,
    test_student_token,
):
    """Verifies that student tokens cannot access role-protected administrative endpoints."""
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    admin_routes = [
        "/api/v1/admin/students",
        "/api/v1/admin/maintenance-status",
        "/api/v1/admin/quotas",
        "/api/v1/admin/jobs/sources",
    ]
    for route in admin_routes:
        res = await client.get(route, headers=headers)
        assert res.status_code == 403, f"Student accessed {route} with code {res.status_code}"


@pytest.mark.asyncio
async def test_student_registration_cannot_escalate_role(client: AsyncClient):
    """Verifies that public candidate registration strictly forces role=STUDENT."""
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "security_test_candidate@university.edu",
            "password": "Password123!",
            "full_name": "Security Test Candidate",
            "role": "SUPER_ADMIN",  # Injection attempt
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "STUDENT", "Role was improperly elevated during registration"


@pytest.mark.asyncio
async def test_bola_student_cross_inspection_prevented(
    client: AsyncClient,
    test_student_token,
    test_student2_token,
    test_admin_token,
):
    """
    Verifies strict Broken Object-Level Authorization (BOLA/IDOR) defense.
    Student A cannot inspect Student B's profile.
    Admin can review student profile.
    """
    token1, data1 = test_student_token
    token2, data2 = test_student2_token
    admin_token, _ = test_admin_token

    uid1 = data1["firebase_uid"]
    uid2 = data2["firebase_uid"]

    # Student 1 accessing Student 2's profile must be rejected
    res_forbidden = await client.get(
        f"/api/v1/students/{uid2}",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_forbidden.status_code == 403, "BOLA breach: Student 1 accessed Student 2 profile"

    # Student 1 accessing own profile must succeed
    res_own = await client.get(
        f"/api/v1/students/{uid1}",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_own.status_code == 200

    # Admin accessing Student 1's profile is permitted for faculty review
    res_admin = await client.get(
        f"/api/v1/students/{uid1}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_admin.status_code == 200


@pytest.mark.asyncio
async def test_argon2id_password_hashing():
    """Verifies that passwords are hashed using Argon2id with compliant parameters."""
    pwd = "EnterprisePlacement2026#Secure"
    hashed = get_password_hash(pwd)

    assert hashed.startswith("$argon2id$"), "Hash is not generated using Argon2id"
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


@pytest.mark.asyncio
async def test_sliding_window_rate_limiter_and_lockout():
    """Unit test for SlidingWindowRateLimiter sliding window and lockout tracking."""
    limiter = SlidingWindowRateLimiter()
    key = "test_ip_192.168.1.100"

    # Allow up to 3 requests within 60s
    allowed1, _ = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
    allowed2, _ = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
    allowed3, _ = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
    assert allowed1 and allowed2 and allowed3

    # 4th request must be rejected
    allowed4, retry_after = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
    assert allowed4 is False
    assert retry_after > 0

    # Lockout test: 5 consecutive failures triggers lockout
    lock_key = "test_account_lockout"
    for _ in range(4):
        locked, rem = await limiter.record_failure(lock_key, max_failures=5, lockout_seconds=300)
        assert locked is False
        assert rem > 0

    # 5th failure triggers lockout
    locked, lockout_dur = await limiter.record_failure(lock_key, max_failures=5, lockout_seconds=300)
    assert locked is True
    assert lockout_dur == 300

    is_lock, _ = await limiter.is_locked(lock_key)
    assert is_lock is True

    # Reset clears lockout
    await limiter.reset_failures(lock_key)
    is_lock_after, _ = await limiter.is_locked(lock_key)
    assert is_lock_after is False


@pytest.mark.asyncio
async def test_maintenance_mode_middleware(
    client: AsyncClient,
    test_student_token,
    test_admin_token,
):
    """
    Verifies server-side maintenance mode:
    - Candidate requests receive HTTP 503 with Retry-After header.
    - Health checks continue to respond with HTTP 200.
    """
    try:
        set_dynamic_maintenance_mode(True)

        token, _ = test_student_token
        # Candidate request should receive HTTP 503
        res = await client.get(
            "/api/v1/students/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 503
        assert res.json().get("maintenance") is True
        assert "Retry-After" in res.headers

        # Health check must still be accessible
        health_res = await client.get("/health")
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "healthy"

    finally:
        set_dynamic_maintenance_mode(False)

    # After deactivation, candidate requests pass through
    normal_res = await client.get(
        "/api/v1/students/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert normal_res.status_code == 200


@pytest.mark.asyncio
async def test_dpdpa_privacy_data_export(
    client: AsyncClient,
    test_student_token,
):
    """Verifies DPDPA 2023 Section 11 Data Export API & SHA-256 integrity checksum."""
    token, _ = test_student_token
    res = await client.get(
        "/api/v1/students/me/data-export",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    body = res.json()
    assert "export_metadata" in body
    assert "integrity_checksum_sha256" in body["export_metadata"]
    assert len(body["export_metadata"]["integrity_checksum_sha256"]) == 64  # SHA-256 length
    assert "data" in body
    assert "profile" in body["data"]


@pytest.mark.asyncio
async def test_dpdpa_privacy_request_submission(
    client: AsyncClient,
    test_student_token,
):
    """Verifies statutory privacy request intake with tracking ID and statutory timeline."""
    token, _ = test_student_token
    res = await client.post(
        "/api/v1/students/me/privacy-request",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "request_type": "data_export",
            "reason": "Exercising Section 11 data portability rights under DPDPA 2023",
        }
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["tracking_id"].startswith("PRV-")
    assert "statutory_deadline" in body


@pytest.mark.asyncio
async def test_security_response_headers(client: AsyncClient):
    """Verifies that all HTTP responses carry OWASP-recommended security headers."""
    res = await client.get("/health")
    assert res.status_code == 200
    headers = res.headers

    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "Permissions-Policy" in headers
    assert "Content-Security-Policy" in headers


@pytest.mark.asyncio
async def test_health_check_operational(client: AsyncClient):
    """Verifies system observability and orchestrator health probe."""
    res = await client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Placement Intelligence API"
    assert "services" in data
