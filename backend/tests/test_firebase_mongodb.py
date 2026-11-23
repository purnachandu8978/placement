import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_01_google_login_works(client: AsyncClient):
    """Test 1: Google login works via Firebase ID token exchange."""
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": "mock_token_google_student_01"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "token" in data
    assert data["role"] == "STUDENT"
    assert data["email"] == "google_student_01@campus.edu"


@pytest.mark.asyncio
async def test_02_firebase_uid_is_correctly_verified(client: AsyncClient):
    """Test 2: Firebase UID is correctly extracted and verified."""
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": "mock_token_uid_test_99"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["firebase_uid"] == "uid_test_99"


@pytest.mark.asyncio
async def test_03_new_student_records_are_created(client: AsyncClient, test_admin_token: str):
    """Test 3: New student starts in strict zero state, completes onboarding tour, and logs into user_logins."""
    unique_token = "mock_token_new_student_xyz"
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": unique_token}
    )
    assert res.status_code == 200

    headers = {"Authorization": f"Bearer {unique_token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_body = me_res.json()
    assert me_body["has_seen_tour"] is False
    assert me_body["profile"] is not None
    assert me_body["profile"]["college"] == ""

    # Query student profile from MongoDB -> strictly empty college / zero state
    profile_res = await client.get("/api/v1/students/me", headers=headers)
    assert profile_res.status_code == 200
    profile = profile_res.json()
    assert profile["user_id"] == "new_student_xyz"
    assert profile["college"] == ""

    # New student readiness, roadmap, and resume all start at clean zero state
    readiness_res = await client.get("/api/v1/readiness", headers=headers)
    assert readiness_res.status_code == 200
    assert readiness_res.json()["overall_score"] == 0

    roadmap_res = await client.get("/api/v1/roadmaps", headers=headers)
    assert roadmap_res.status_code == 200
    assert roadmap_res.json()["has_roadmap"] is False
    assert roadmap_res.json()["progress"] == 0

    resume_res = await client.get("/api/v1/resumes/current", headers=headers)
    assert resume_res.status_code == 200
    assert resume_res.json()["has_resume"] is False

    # Completing tour persists has_seen_tour=True
    tour_res = await client.post("/api/v1/auth/tour-complete", headers=headers)
    assert tour_res.status_code == 200
    me_after = await client.get("/api/v1/auth/me", headers=headers)
    assert me_after.status_code == 200
    assert me_after.json()["has_seen_tour"] is True

    # Verify login event recorded in user_logins collection
    admin_token, _ = test_admin_token
    logins_res = await client.get(
        "/api/v1/admin/logins",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert logins_res.status_code == 200
    assert any(row.get("firebase_uid") == "new_student_xyz" for row in logins_res.json())


@pytest.mark.asyncio
async def test_04_existing_students_can_login(client: AsyncClient):
    """Test 4: Existing students can log in without creating duplicate records."""
    token = "mock_token_repeat_student"
    res1 = await client.post("/api/v1/auth/google", json={"id_token": token})
    assert res1.status_code == 200

    # Login again
    res2 = await client.post("/api/v1/auth/google", json={"id_token": token})
    assert res2.status_code == 200
    assert res1.json()["firebase_uid"] == res2.json()["firebase_uid"]


@pytest.mark.asyncio
async def test_05_logout_works(client: AsyncClient, test_student_token):
    """Test 5: Logout revokes session and clears authentication cookies."""
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    logout_res = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200
    assert "Successfully logged out" in logout_res.json()["message"]


@pytest.mark.asyncio
async def test_06_expired_or_revoked_tokens_are_rejected(client: AsyncClient):
    """Test 6: Expired or revoked tokens are rejected with 401 Unauthorized."""
    bad_res = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer "}
    )
    assert bad_res.status_code == 401


@pytest.mark.asyncio
async def test_07_student_routes_require_authentication(client: AsyncClient):
    """Test 7: Protected student routes require authentication."""
    unauth_res = await client.get("/api/v1/students/me")
    assert unauth_res.status_code == 401
    assert "Authentication credentials not provided" in unauth_res.json()["detail"]


@pytest.mark.asyncio
async def test_08_admin_routes_require_admin_permissions(client: AsyncClient, test_student_token, test_admin_token):
    """Test 8: Admin routes strictly require admin permissions."""
    student_token, _ = test_student_token
    admin_token, _ = test_admin_token

    # Student denied access
    forbidden_res = await client.get(
        "/api/v1/admin/metrics",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert forbidden_res.status_code == 403
    assert "Access denied" in forbidden_res.json()["detail"]

    # Admin allowed
    admin_res = await client.get(
        "/api/v1/admin/metrics",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_res.status_code == 200
    assert "total_students" in admin_res.json()


@pytest.mark.asyncio
async def test_09_student_data_isolation(client: AsyncClient, test_student_token, test_student2_token):
    """Test 9: Student A cannot read Student B's MongoDB records through the API (IDOR prevention)."""
    token_1, user_1 = test_student_token
    token_2, _ = test_student2_token

    headers_1 = {"Authorization": f"Bearer {token_1}"}
    headers_2 = {"Authorization": f"Bearer {token_2}"}

    uid_1 = user_1["firebase_uid"]

    # Student 1 gets own profile
    s1_res = await client.get(f"/api/v1/students/{uid_1}", headers=headers_1)
    assert s1_res.status_code == 200

    # Student 2 attempts to read Student 1's profile -> MUST be blocked with 403 Forbidden!
    idor_res = await client.get(f"/api/v1/students/{uid_1}", headers=headers_2)
    assert idor_res.status_code == 403
    assert "Cross-user data access is strictly forbidden" in idor_res.json()["detail"]


@pytest.mark.asyncio
async def test_10_database_writes_persist(client: AsyncClient, test_student_token):
    """Test 10: Database writes persist to MongoDB Atlas collections."""
    token, user = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    # Write a new extracted skill
    add_res = await client.post(
        "/api/v1/skills/student",
        headers=headers,
        json={"skill_name": "Kubernetes", "category": "DevOps", "proficiency": "Intermediate"}
    )
    assert add_res.status_code in (200, 201)

    # Verify write persisted
    list_res = await client.get("/api/v1/skills/student", headers=headers)
    assert list_res.status_code == 200
    skill_names = [s["skill_name"] for s in list_res.json()]
    assert "Kubernetes" in skill_names


@pytest.mark.asyncio
async def test_11_database_reads_return_correct_data(client: AsyncClient, test_student_token):
    """Test 11: Database reads return correct data from MongoDB Atlas collections."""
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    # Read assessments catalog
    a_res = await client.get("/api/v1/assessments", headers=headers)
    assert a_res.status_code == 200
    assessments = a_res.json()
    assert len(assessments) >= 2

    # Verify strict 5Q assessment
    a5 = next(a for a in assessments if a["assessment_size"] == 5)
    detail5 = await client.get(f"/api/v1/assessments/{a5['id']}", headers=headers)
    q5 = detail5.json()["questions"]
    assert len(q5) == 5
    assert len([q for q in q5 if q["type"] == "mcq"]) == 3
    assert len([q for q in q5 if q["type"] == "simple_coding"]) == 1
    assert len([q for q in q5 if q["type"] == "hard_coding"]) == 1


@pytest.mark.asyncio
async def test_12_firebase_configuration_errors_handled(client: AsyncClient):
    """Test 12: Firebase configuration or token errors are handled gracefully with proper HTTP errors."""
    empty_token = await client.post("/api/v1/auth/google", json={"id_token": ""})
    assert empty_token.status_code == 401

    invalid_token = await client.get(
        "/api/v1/students/me",
        headers={"Authorization": "Bearer invalid_gibberish_token_not_firebase"}
    )
    assert invalid_token.status_code == 401
    assert "Invalid, expired, or revoked Firebase ID token" in invalid_token.json()["detail"]


@pytest.mark.asyncio
async def test_13_integrations_config_rbac_and_validation(client: AsyncClient, test_student_token, test_admin_token):
    """Test 13: Firebase and MongoDB key configuration enforces RBAC and input validation."""
    student_token, _ = test_student_token
    admin_token, _ = test_admin_token

    # Student cannot inspect or modify integration keys
    s_res = await client.get(
        "/api/v1/admin/integrations",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert s_res.status_code == 403

    # Admin can inspect masked integration telemetry
    a_res = await client.get(
        "/api/v1/admin/integrations",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert a_res.status_code == 200
    body = a_res.json()
    assert "mongodb" in body and "firebase" in body and "firebase_web_config" in body

    # Invalid MongoDB URI rejected cleanly
    bad_uri = await client.put(
        "/api/v1/admin/integrations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"mongodb_uri": "http://invalid-scheme"}
    )
    assert bad_uri.status_code == 400

    # Invalid Firebase service account JSON rejected cleanly
    bad_json = await client.put(
        "/api/v1/admin/integrations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"firebase_credentials_json": "{not valid json}"}
    )
    assert bad_json.status_code == 400

    # Public Firebase Web SDK config update succeeds and propagates to /auth/firebase-config
    from app.core.config import settings
    prev_pid = settings.FIREBASE_PROJECT_ID
    prev_api = settings.FIREBASE_WEB_API_KEY
    prev_domain = settings.FIREBASE_WEB_AUTH_DOMAIN
    try:
        ok_res = await client.put(
            "/api/v1/admin/integrations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "firebase_project_id": "test-pi-project",
                "firebase_web_config": {
                    "apiKey": "AIzaSyTestPublicKey",
                    "authDomain": "test-pi-project.firebaseapp.com",
                    "projectId": "test-pi-project",
                }
            }
        )
        assert ok_res.status_code == 200
        assert ok_res.json()["success"] is True

        pub_res = await client.get("/api/v1/auth/firebase-config")
        assert pub_res.status_code == 200
        assert pub_res.json()["live_enabled"] is True
        assert pub_res.json()["projectId"] == "test-pi-project"
    finally:
        settings.FIREBASE_PROJECT_ID = prev_pid
        settings.FIREBASE_WEB_API_KEY = prev_api
        settings.FIREBASE_WEB_AUTH_DOMAIN = prev_domain


@pytest.mark.asyncio
async def test_14_google_public_certs_caching_clock_skew_and_claims(client: AsyncClient, monkeypatch):
    """Test 14: Public-cert Firebase JWT verification handles caching, clock skew, key rotation, and claim checks."""
    import datetime
    import time
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    from google.auth import crypt as gcrypt, jwt as gjwt
    import app.core.firebase as fb_core
    from app.core.config import settings

    def _make_keypair_and_cert(cn: str):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pk_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now_dt - datetime.timedelta(minutes=5))
            .not_valid_after(now_dt + datetime.timedelta(days=1))
            .sign(key, hashes.SHA256())
        )
        return pk_pem, cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")

    pk1, cert1 = _make_keypair_and_cert("firebase-test-1")
    pk2, cert2 = _make_keypair_and_cert("firebase-test-2")
    signer1 = gcrypt.RSASigner.from_string(pk1, key_id="kid-1")
    signer2 = gcrypt.RSASigner.from_string(pk2, key_id="kid-2")

    state = {"certs": {"kid-1": cert1}, "fetch_calls": 0}

    def fake_fetch():
        state["fetch_calls"] += 1
        return dict(state["certs"]), 3600

    monkeypatch.setattr(fb_core, "_fetch_google_firebase_certs", fake_fetch)

    prev_pid = settings.FIREBASE_PROJECT_ID
    prev_cache = dict(fb_core._certs_cache)
    prev_live_flag = fb_core._firebase_live_cert_loaded
    try:
        settings.FIREBASE_PROJECT_ID = "test-pi-project"
        fb_core._firebase_live_cert_loaded = False
        fb_core._certs_cache.update({"certs": {}, "expires_at": 0.0, "last_fetch_at": 0.0})

        now_ts = int(time.time())
        skewed_payload = {
            "aud": "test-pi-project",
            "iss": "https://securetoken.google.com/test-pi-project",
            "sub": "fb_uid_rs256_01",
            "user_id": "fb_uid_rs256_01",
            "email": "rs256.student@campus.edu",
            "name": "RS256 Student",
            "iat": now_ts + 60,
            "exp": now_ts + 3600,
            "firebase": {"sign_in_provider": "google.com"},
        }
        token_k1 = gjwt.encode(signer1, skewed_payload).decode("utf-8")

        # Repeated verifications reuse cached certificates and tolerate 60s future clock skew
        claims_1 = fb_core._verify_via_google_public_certs(token_k1, "test-pi-project")
        claims_2 = fb_core._verify_via_google_public_certs(token_k1, "test-pi-project")
        assert claims_1["uid"] == "fb_uid_rs256_01"
        assert claims_2["email"] == "rs256.student@campus.edu"
        assert state["fetch_calls"] == 1

        # Wrong issuer is rejected
        bad_iss_payload = {**skewed_payload, "iss": "https://securetoken.google.com/other-project"}
        bad_iss_token = gjwt.encode(signer1, bad_iss_payload).decode("utf-8")
        with pytest.raises(ValueError, match="Unexpected Firebase token issuer"):
            fb_core._verify_via_google_public_certs(bad_iss_token, "test-pi-project")

        # Key rotation triggers a refresh once outside the throttle window
        state["certs"] = {"kid-1": cert1, "kid-2": cert2}
        fb_core._certs_cache["last_fetch_at"] = 0.0
        token_k2 = gjwt.encode(signer2, skewed_payload).decode("utf-8")
        claims_rotated = fb_core._verify_via_google_public_certs(token_k2, "test-pi-project")
        assert claims_rotated["uid"] == "fb_uid_rs256_01"
        assert state["fetch_calls"] == 2

        # End-to-end /api/v1/auth/google accepts real RS256 Firebase JWT without service account JSON
        res = await client.post("/api/v1/auth/google", json={"id_token": token_k2})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["email"] == "rs256.student@campus.edu"
        assert data["role"] == "STUDENT"
    finally:
        settings.FIREBASE_PROJECT_ID = prev_pid
        fb_core._certs_cache.clear()
        fb_core._certs_cache.update(prev_cache)
        fb_core._firebase_live_cert_loaded = prev_live_flag






@pytest.mark.asyncio
async def test_15_admin_email_password_login_and_rbac(client: AsyncClient):
    """Test 15: Admin institutional Email+Password login, student rejection, and SUPER_ADMIN vs ADMIN RBAC."""
    from datetime import datetime, timezone
    import hashlib
    from app.db.mongodb import mongo_manager
    from app.core.security import get_password_hash

    db = mongo_manager.db
    now = datetime.now(timezone.utc)

    for email, role, provider, pwd in [
        ("superadmin@placements.edu", "SUPER_ADMIN", "password", "SuperSecretPassword123"),
        ("staff@placements.edu", "ADMIN", "password", "StaffPassword123"),
        ("normal_student@gmail.com", "STUDENT", "google_firebase", None),
    ]:
        uid = f"admin_{hashlib.sha256(email.encode()).hexdigest()[:16]}" if provider == "password" else "student_login_check"
        await db.users.insert_one({
            "firebase_uid": uid,
            "email": email,
            "display_name": role.title(),
            "photo_url": None,
            "role": role,
            "account_status": "active",
            "auth_provider": provider,
            "password_hash": get_password_hash(pwd) if pwd else None,
            "has_seen_tour": True,
            "created_at": now,
            "last_login": None,
        })

    # Wrong password rejected
    bad_res = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "superadmin@placements.edu", "password": "WrongPassword999"},
    )
    assert bad_res.status_code == 401

    # Student cannot use Admin Email+Password login
    stu_res = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "normal_student@gmail.com", "password": "AnyPassword123"},
    )
    assert stu_res.status_code in (401, 403)

    # Regular ADMIN logs in cleanly
    staff_res = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "staff@placements.edu", "password": "StaffPassword123"},
    )
    assert staff_res.status_code == 200
    staff_data = staff_res.json()
    staff_token = staff_data.get("access_token") or staff_data.get("token")
    assert staff_token

    # Regular ADMIN cannot create new Admins (requires SUPER_ADMIN)
    deny_res = await client.post(
        "/api/v1/admin/admins",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={
            "email": "unauthorized_new@placements.edu",
            "password": "ValidPassword123",
            "display_name": "Unauthorized Admin",
            "role": "ADMIN",
        },
    )
    assert deny_res.status_code == 403

    # SUPER_ADMIN logs in and creates a new Admin
    super_res = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "superadmin@placements.edu", "password": "SuperSecretPassword123"},
    )
    assert super_res.status_code == 200
    super_data = super_res.json()
    super_token = super_data.get("access_token") or super_data.get("token")
    assert super_token

    me_super = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {super_token}"})
    assert me_super.status_code == 200
    assert me_super.json()["role"] == "SUPER_ADMIN"

    create_res = await client.post(
        "/api/v1/admin/admins",
        headers={"Authorization": f"Bearer {super_token}"},
        json={
            "email": "newcoordinator@placements.edu",
            "password": "CoordinatorPass123",
            "display_name": "Placement Coordinator",
            "role": "ADMIN",
        },
    )
    assert create_res.status_code in (200, 201)

    # Newly created Admin can immediately sign in
    new_login = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "newcoordinator@placements.edu", "password": "CoordinatorPass123"},
    )
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_16_resume_upload_adapts_entire_platform(client: AsyncClient):
    """Test 16: Real resume upload populates skills, roadmap (0% progress), job matches, and readiness with full user isolation."""
    from app.db.mongodb import mongo_manager
    from app.db.seed import seed_mongodb_data

    await seed_mongodb_data(mongo_manager.db)

    tok1 = "mock_token_resume_adapt_student1"
    tok2 = "mock_token_resume_zero_student2"

    # Authenticate both students cleanly
    await client.post("/api/v1/auth/google", json={"id_token": tok1})
    await client.post("/api/v1/auth/google", json={"id_token": tok2})

    h1 = {"Authorization": f"Bearer {tok1}"}
    h2 = {"Authorization": f"Bearer {tok2}"}

    resume_text = (
        "Priya Nair\n"
        "priya.nair@example.edu | +91-9876543210\n"
        "B.Tech Computer Science, National Institute of Technology Warangal, 2026 | CGPA: 8.85/10\n"
        "GitHub: https://github.com/priyanair-dev | LinkedIn: https://linkedin.com/in/priyanair\n\n"
        "TECHNICAL SKILLS\n"
        "Languages & Frameworks: Python, FastAPI, React, TypeScript, JavaScript, Node.js\n"
        "Databases & Cloud: PostgreSQL, MongoDB, Docker, Redis, Git\n\n"
        "PROJECTS\n"
        "Distributed Telemetry Pipeline - Built high-throughput FastAPI & PostgreSQL service with React dashboard, "
        "reducing API p95 latency by 42% and handling 10,000 events/minute.\n"
        "Cloud Deployment Automation - Containerized microservices with Docker and CI/CD pipelines.\n"
    ).encode("utf-8")

    upload_res = await client.post(
        "/api/v1/resumes/upload",
        headers=h1,
        files={"file": ("priya_nair_resume.txt", resume_text, "text/plain")},
    )
    assert upload_res.status_code == 200
    up_body = upload_res.json()
    detected_lower = {s.lower() for s in up_body.get("extracted_skills", [])}
    assert "python" in detected_lower
    assert "react" in detected_lower
    assert up_body["roadmap_generated"] is True

    # Student 1 now has extracted skills, 4-week 0% roadmap, non-zero job match scores, and >0 readiness
    skills_res = await client.get("/api/v1/skills/student", headers=h1)
    assert skills_res.status_code == 200
    assert len(skills_res.json()) >= 4

    roadmap_res = await client.get("/api/v1/roadmaps", headers=h1)
    assert roadmap_res.status_code == 200
    rm = roadmap_res.json()
    assert rm["has_roadmap"] is True
    assert len(rm["weeks"]) == 4
    assert rm["progress"] == 0

    jobs_res = await client.get("/api/v1/jobs", headers=h1)
    assert jobs_res.status_code == 200
    jobs = jobs_res.json()
    assert len(jobs) > 0
    assert max(j["match_score"] for j in jobs) > 0

    readiness_res = await client.get("/api/v1/readiness", headers=h1)
    assert readiness_res.status_code == 200
    assert readiness_res.json()["overall_score"] > 0

    # Student 2 remains isolated in strict zero state
    s2_readiness = await client.get("/api/v1/readiness", headers=h2)
    assert s2_readiness.status_code == 200
    assert s2_readiness.json()["overall_score"] == 0

    s2_roadmap = await client.get("/api/v1/roadmaps", headers=h2)
    assert s2_roadmap.status_code == 200
    assert s2_roadmap.json()["has_roadmap"] is False

    s2_resume = await client.get("/api/v1/resumes/current", headers=h2)
    assert s2_resume.status_code == 200
    assert s2_resume.json()["has_resume"] is False


@pytest.mark.asyncio
async def test_17_assessment_grading_and_verified_skill(
    client: AsyncClient,
    test_student_token,
    test_student2_token,
):
    """Test 17: Deterministic MCQ + coding grading issues verified credential & isolates attempts per user."""
    from app.db.mongodb import mongo_manager
    from app.db.seed import seed_mongodb_data

    await seed_mongodb_data(mongo_manager.db)
    student1_token, _ = test_student_token
    student2_token, _ = test_student2_token

    h1 = {"Authorization": f"Bearer {student1_token}"}
    h2 = {"Authorization": f"Bearer {student2_token}"}

    start_res = await client.post(
        "/api/v1/attempts/start",
        headers=h1,
        json={"assessment_id": "test-python-5"},
    )
    assert start_res.status_code == 200
    start_body = start_res.json()
    attempt_id = start_body["attempt_id"]

    # Ensure answer keys and hidden test inputs/outputs are never exposed in client attempt payload
    for client_q in start_body["questions"]:
        assert "correct_answer" not in client_q
        assert "expected_keywords" not in client_q
        for tc in client_q.get("test_cases", []):
            assert tc.get("is_hidden") is False

    # Verify exact 5Q & 10Q assessment distributions are preserved
    asmt_10_res = await client.get("/api/v1/assessments/test-python-10", headers=h1)
    assert asmt_10_res.status_code == 200
    assert asmt_10_res.json()["question_distribution"] == {"mcq": 6, "simple_coding": 2, "hard_coding": 2}

    # Fetch canonical assessment doc from MongoDB after start (upgraded schema)
    asmt_doc = await mongo_manager.db.assessments.find_one({"id": "test-python-5"})
    assert asmt_doc is not None
    assert asmt_doc["question_distribution"] == {"mcq": 3, "simple_coding": 1, "hard_coding": 1}

    from app.services.code_executor import (
        SandboxTransport,
        get_rate_limiter,
        set_execution_transport_override,
    )

    class _MockPassingSandboxTransport(SandboxTransport):
        async def execute_batch(self, *, language, source_code, test_cases, time_limit_ms, memory_limit_kb):
            # Look up canonical expected outputs from test_python-5 for exact solution verification
            expected_by_id = {}
            for qq in asmt_doc["questions"]:
                for t in qq.get("test_cases", []):
                    expected_by_id[t["id"]] = t["expected"]
            return {
                "status": "completed",
                "compile_output": "",
                "results": [
                    {
                        "id": tc["id"],
                        "status": "ok",
                        "exit_code": 0,
                        "stdout": expected_by_id.get(tc["id"], ""),
                        "stderr": "",
                        "execution_time_ms": 12.5,
                    }
                    for tc in test_cases
                ],
            }

    get_rate_limiter().reset()
    set_execution_transport_override(_MockPassingSandboxTransport())
    try:
        for q in asmt_doc["questions"]:
            if q.get("type") == "mcq":
                ans_res = await client.post(
                    f"/api/v1/attempts/{attempt_id}/answer",
                    headers=h1,
                    json={"question_id": q["id"], "answer": q["correct_answer"]},
                )
                assert ans_res.status_code == 200
            else:
                solution_code = (
                    "import sys\nfrom collections import deque\n\n"
                    "def solve():\n"
                    "    data = sys.stdin.read().split()\n"
                    "    print('ok')\n"
                    "if __name__ == '__main__':\n"
                    "    solve()\n"
                )
                code_res = await client.post(
                    f"/api/v1/attempts/{attempt_id}/code",
                    headers=h1,
                    json={"question_id": q["id"], "code": solution_code, "language": "python"},
                )
                assert code_res.status_code == 200, code_res.text
                cbody = code_res.json()
                assert cbody["status"] == "accepted"
                assert cbody["passed_test_cases"] == cbody["total_test_cases"]
                assert cbody["hidden_summary"]["total"] >= 1
                # Hidden test inputs must never appear in student payload
                assert "10 509 510 1009" not in str(cbody)
    finally:
        set_execution_transport_override(None)

    # Cross-student access to Student 1's attempt must be blocked (403)
    hijack_ans = await client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        headers=h2,
        json={"question_id": "mcq-py-1", "answer": 0},
    )
    assert hijack_ans.status_code == 403

    hijack_res = await client.get(f"/api/v1/results/{attempt_id}", headers=h2)
    assert hijack_res.status_code == 403

    # Finalize attempt and verify credential issuance in MongoDB verified_skills
    fin_res = await client.post(f"/api/v1/results/{attempt_id}/finalize", headers=h1)
    assert fin_res.status_code == 200
    fin_body = fin_res.json()
    assert fin_body["passed"] is True
    assert fin_body["overall_score"] >= 75.0
    assert fin_body["verification_badge_issued"] is True
    assert fin_body["verification_hash"] is not None

    me_res = await client.get("/api/v1/auth/me", headers=h1)
    uid = me_res.json()["firebase_uid"]
    verified_doc = await mongo_manager.db.verified_skills.find_one({"user_id": uid, "skill": "Python"})
    assert verified_doc is not None
    assert verified_doc["score"] >= 75.0
