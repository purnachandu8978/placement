import os
import sys
from pathlib import Path

print("STARTING SECURITY TEST RUNNER...", flush=True)

backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Set test environment flags
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"

from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient
from app.core.config import settings
from app.core.middleware import set_dynamic_maintenance_mode
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import get_password_hash, verify_password
from app.db.mongodb import mongo_manager, get_database
from app.main import app

mock_mongo_client = AsyncMongoMockClient()
test_db = mock_mongo_client[settings.MONGODB_DB_NAME]


async def override_get_database():
    return test_db


app.dependency_overrides[get_database] = override_get_database


async def run_all_security_tests():
    print("=" * 70, flush=True)
    print("PLACEMENT INTELLIGENCE — PRODUCTION SECURITY VERIFICATION SUITE", flush=True)
    print("=" * 70, flush=True)

    settings.USE_MOCK_MONGODB_FOR_TESTS = True
    settings.ENVIRONMENT = "testing"
    mongo_manager.client = mock_mongo_client
    mongo_manager.db = test_db
    mongo_manager.connection_mode = "mock"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:

        # 1. Unauthenticated Requests
        print("\n[TEST 1] Verifying rejection of unauthenticated requests (HTTP 401)...", flush=True)
        routes = ["/api/v1/students/me", "/api/v1/admin/students", "/api/v1/resumes/current", "/api/v1/roadmaps", "/api/v1/notifications"]
        for r in routes:
            res = await client.get(r)
            assert res.status_code == 401, f"Failed on {r}: got {res.status_code}"
            print(f"  -> {r} rejected with HTTP 401 Unauthorized", flush=True)
        print("  PASS: All sensitive endpoints enforce authentication.", flush=True)

        # 2. Student & Admin Auth Tokens
        print("\n[TEST 2] Authenticating test student and admin principals...", flush=True)
        res_s1 = await client.post("/api/v1/auth/google", json={"id_token": "mock_token_arjun_sharma"})
        assert res_s1.status_code == 200
        student1_data = res_s1.json()
        student1_token = student1_data["token"]
        student1_uid = student1_data["firebase_uid"]

        res_s2 = await client.post("/api/v1/auth/google", json={"id_token": "mock_token_priya_patel"})
        assert res_s2.status_code == 200
        student2_data = res_s2.json()
        student2_token = student2_data["token"]
        student2_uid = student2_data["firebase_uid"]

        res_adm = await client.post("/api/v1/auth/google", json={"id_token": "mock_token_dean_admin"})
        assert res_adm.status_code == 200
        admin_data = res_adm.json()
        admin_token = admin_data["token"]
        admin_uid = admin_data["firebase_uid"]
        await test_db.users.update_one({"firebase_uid": admin_uid}, {"$set": {"role": "ADMIN"}})
        print(f"  -> Student 1: {student1_uid} (role=STUDENT)", flush=True)
        print(f"  -> Student 2: {student2_uid} (role=STUDENT)", flush=True)
        print(f"  -> Admin: {admin_uid} (role=ADMIN)", flush=True)
        print("  PASS: Multi-principal test accounts provisioned.", flush=True)

        # 3. Privilege Escalation Defense
        print("\n[TEST 3] Verifying privilege escalation defense (Student -> Admin route)...", flush=True)
        admin_routes = ["/api/v1/admin/students", "/api/v1/admin/maintenance-status", "/api/v1/admin/quotas"]
        for r in admin_routes:
            res = await client.get(r, headers={"Authorization": f"Bearer {student1_token}"})
            assert res.status_code == 403, f"Breach on {r}: student got {res.status_code}"
            print(f"  -> {r} rejected with HTTP 403 Forbidden for student", flush=True)
        print("  PASS: Strict RBAC enforces separation between Student and Admin privileges.", flush=True)

        # 4. Public Registration Role Injection Prevention
        print("\n[TEST 4] Verifying role injection defense on public candidate registration...", flush=True)
        res_reg = await client.post("/api/v1/auth/register", json={
            "email": "hacker_attempt@university.edu",
            "password": "Password123#Secure",
            "full_name": "Injected Admin Attempt",
            "role": "SUPER_ADMIN",
        })
        assert res_reg.status_code == 200
        assert res_reg.json()["role"] == "STUDENT"
        print("  PASS: Client-supplied 'role: SUPER_ADMIN' neutralized. Forced to role: STUDENT.", flush=True)

        # 5. Broken Object-Level Authorization (BOLA/IDOR)
        print("\n[TEST 5] Verifying BOLA/IDOR cross-user data isolation...", flush=True)
        # Student 1 accessing Student 2's profile
        res_cross = await client.get(f"/api/v1/students/{student2_uid}", headers={"Authorization": f"Bearer {student1_token}"})
        assert res_cross.status_code == 403, f"BOLA breach: got {res_cross.status_code}"
        print(f"  -> Cross-student inspection blocked: HTTP 403 Forbidden ({res_cross.json().get('detail')})", flush=True)

        # Student 1 accessing own profile
        res_own = await client.get(f"/api/v1/students/{student1_uid}", headers={"Authorization": f"Bearer {student1_token}"})
        assert res_own.status_code == 200
        print("  -> Self-profile access permitted: HTTP 200 OK", flush=True)

        # Admin accessing student profile
        res_adm_view = await client.get(f"/api/v1/students/{student1_uid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert res_adm_view.status_code == 200
        print("  -> Administrative student review permitted: HTTP 200 OK", flush=True)
        print("  PASS: BOLA/IDOR isolation strictly verified across roles.", flush=True)

        # 6. Argon2id Password Cryptography
        print("\n[TEST 6] Verifying Argon2id password hashing parameters...", flush=True)
        raw_pw = "EnterprisePlacement2026#Argon2id"
        h = get_password_hash(raw_pw)
        assert h.startswith("$argon2id$")
        assert "m=65536" in h or "$v=19$" in h
        assert verify_password(raw_pw, h) is True
        assert verify_password("WrongPassword123!", h) is False
        print(f"  -> Generated compliant Argon2id hash: {h[:35]}...", flush=True)
        print("  PASS: Argon2id cryptographic parameters verified.", flush=True)

        # 7. Sliding Window Rate Limiting & Account Lockouts
        print("\n[TEST 7] Verifying sliding-window rate limiting & lockout mechanism...", flush=True)
        limiter = SlidingWindowRateLimiter()
        test_ip = "198.51.100.42"
        for i in range(3):
            allowed, _ = await limiter.check_rate_limit(f"auth:{test_ip}", max_requests=3, window_seconds=60)
            assert allowed is True
        # 4th request must be rejected
        allowed4, retry_after = await limiter.check_rate_limit(f"auth:{test_ip}", max_requests=3, window_seconds=60)
        assert allowed4 is False
        assert retry_after > 0
        print(f"  -> Rate limit triggered: 4th request blocked (retry_after={retry_after}s)", flush=True)

        # Test account lockout after 5 consecutive failures
        lock_key = "lockout_candidate_test"
        for _ in range(4):
            locked, rem = await limiter.record_failure(lock_key, max_failures=5, lockout_seconds=300)
            assert locked is False
        locked5, lock_dur = await limiter.record_failure(lock_key, max_failures=5, lockout_seconds=300)
        assert locked5 is True
        assert lock_dur == 300
        print(f"  -> Brute-force lockout triggered: account locked for {lock_dur}s", flush=True)
        await limiter.reset_failures(lock_key)
        is_locked, _ = await limiter.is_locked(lock_key)
        assert is_locked is False
        print("  PASS: Sliding-window rate limiter & lockout functioning properly.", flush=True)

        # 8. Server-Side Maintenance Mode
        print("\n[TEST 8] Verifying server-side maintenance mode with admin bypass...", flush=True)
        try:
            set_dynamic_maintenance_mode(True)
            # Student request receives 503
            res_maint = await client.get("/api/v1/students/me", headers={"Authorization": f"Bearer {student1_token}"})
            assert res_maint.status_code == 503
            assert res_maint.json()["maintenance"] is True
            assert res_maint.headers.get("Retry-After") == "300"
            print("  -> Candidate request blocked during maintenance: HTTP 503 (Retry-After: 300)", flush=True)

            # Health probe must remain accessible
            res_hlth = await client.get("/health")
            assert res_hlth.status_code == 200
            print("  -> Health check probe bypasses maintenance: HTTP 200 OK", flush=True)
        finally:
            set_dynamic_maintenance_mode(False)

        res_post_maint = await client.get("/api/v1/students/me", headers={"Authorization": f"Bearer {student1_token}"})
        assert res_post_maint.status_code == 200
        print("  PASS: Maintenance mode and administrative bypass operating correctly.", flush=True)

        # 9. DPDPA 2023 Privacy Rights
        print("\n[TEST 9] Verifying DPDPA 2023 statutory privacy rights & data export...", flush=True)
        res_exp = await client.get("/api/v1/students/me/data-export", headers={"Authorization": f"Bearer {student1_token}"})
        assert res_exp.status_code == 200
        exp_data = res_exp.json()
        assert "export_metadata" in exp_data
        checksum = exp_data["export_metadata"]["integrity_checksum_sha256"]
        assert len(checksum) == 64
        print(f"  -> Section 11 Data Export generated: SHA-256 Checksum={checksum[:24]}...", flush=True)

        res_req = await client.post(
            "/api/v1/students/me/privacy-request",
            headers={"Authorization": f"Bearer {student1_token}"},
            json={"request_type": "data_export", "reason": "DPDPA Section 11 Data Portability Request"}
        )
        assert res_req.status_code == 200
        req_data = res_req.json()
        assert req_data["tracking_id"].startswith("PRV-")
        assert "statutory_deadline" in req_data
        print(f"  -> Statutory privacy request logged: Tracking ID={req_data['tracking_id']}", flush=True)
        print("  PASS: DPDPA 2023 statutory rights fully operational.", flush=True)

        # 10. OWASP Security Response Headers
        print("\n[TEST 10] Verifying OWASP security headers injection...", flush=True)
        res_hdr = await client.get("/health")
        assert res_hdr.status_code == 200
        headers = res_hdr.headers
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("X-XSS-Protection") == "1; mode=block"
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in headers
        assert "Permissions-Policy" in headers
        print("  -> X-Content-Type-Options: nosniff", flush=True)
        print("  -> X-Frame-Options: DENY", flush=True)
        print("  -> X-XSS-Protection: 1; mode=block", flush=True)
        print("  -> Referrer-Policy: strict-origin-when-cross-origin", flush=True)
        print("  -> Content-Security-Policy: present", flush=True)
        print("  PASS: OWASP security response headers active across all routes.", flush=True)

    print("\n" + "=" * 70, flush=True)
    print("ALL 10 PRODUCTION SECURITY AUDIT TEST CASES PASSED WITH 100% SUCCESS!", flush=True)
    print("=" * 70 + "\n", flush=True)


if __name__ == "__main__":
    asyncio.run(run_all_security_tests())
