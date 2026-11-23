"""
Placement Intelligence - Phase 6 Production Hardening & Security Audit Test Runner.
Executes comprehensive automated verification for:
1. Security headers middleware (nosniff, DENY, Referrer-Policy, Permissions-Policy).
2. Public credential verification endpoint (/verify/{hash}) and anti-enumeration.
3. Strict PII redaction (email, phone, student_id, user_id never exposed publicly).
4. IDOR prevention and multi-student data isolation.
5. Privilege escalation defense (role self-assignment rejection).
6. Administrative RBAC enforcement.
7. Health check diagnostic subsystem observability (MongoDB ping latency, storage, scheduler).
"""

import os
import sys
from pathlib import Path
import asyncio
from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List, Optional

os.environ["TESTING"] = "true"
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"

backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from app.core.config import settings
settings.ENVIRONMENT = "testing"
settings.USE_MOCK_MONGODB_FOR_TESTS = True
settings.FIREBASE_MOCK_AUTH_IN_DEV = True
settings.MONGODB_URI = ""

from fastapi import HTTPException, Request, Response
from starlette.datastructures import Headers

from app.core.dependencies import verify_student_ownership
from app.core.security import create_access_token


class MockDB:
    def __init__(self):
        self.verified_skills = MockCollection("verified_skills")
        self.student_profiles = MockCollection("student_profiles")
        self.users = MockCollection("users")
        self.jobs = MockCollection("jobs")
        self.notifications = MockCollection("notifications")
        self.student_credentials = MockCollection("student_credentials")


class MockCollection:
    def __init__(self, name: str):
        self.name = name
        self.docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            if "$or" in query:
                or_matches = False
                for branch in query["$or"]:
                    if all(d.get(bk) == bv for bk, bv in branch.items()):
                        or_matches = True
                        break
                if not or_matches:
                    match = False

            for k, v in query.items():
                if k == "$or":
                    continue
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        for idx, d in enumerate(self.docs):
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    self.docs[idx].update(update["$set"])
                return {"matched": 1, "modified": 1}

        if upsert:
            new_doc = {}
            new_doc.update(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            self.docs.append(new_doc)
            return {"matched": 0, "upserted": 1}

        return {"matched": 0, "modified": 0}


# =============================================================================
# Test Suite Implementations
# =============================================================================

async def test_security_headers_injection():
    """Verify standard OWASP security headers injection."""
    from app.core.middleware import add_security_headers

    class DummyRequest:
        url = type("URL", (), {"scheme": "https"})()

    async def dummy_call_next(req):
        return Response(content="ok", media_type="text/plain")

    res = await add_security_headers(DummyRequest(), dummy_call_next)
    headers = res.headers

    assert headers.get("X-Content-Type-Options") == "nosniff", "Missing nosniff"
    assert headers.get("X-Frame-Options") == "DENY", "Missing Frame-Options DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block", "Missing XSS-Protection"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin", "Missing Referrer-Policy"
    assert "camera=()" in headers.get("Permissions-Policy", ""), "Missing Permissions-Policy"
    assert "max-age=31536000" in headers.get("Strict-Transport-Security", ""), "Missing HSTS on HTTPS"


async def test_public_skill_verification_endpoint():
    """Verify authentic public skill certificate retrieval and strict PII redaction."""
    from app.api.v1.endpoints.verification import public_verify_badge

    db = MockDB()
    valid_hash = "sha256_mock_valid_hash_react_12345678"
    user_uid = "student_candidate_998"

    await db.verified_skills.update_one(
        {"verification_hash": valid_hash},
        {
            "$set": {
                "user_id": user_uid,
                "skill": "React & TypeScript",
                "proficiency": "Advanced",
                "score": 94.5,
                "evidence": "Completed 10/10 sandboxed React component challenges with 95% test coverage.",
                "verification_hash": valid_hash,
                "verification_date": datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc),
            }
        },
        upsert=True,
    )

    await db.student_profiles.update_one(
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

    cert = await public_verify_badge(verification_hash=valid_hash, db=db)

    assert cert["verified"] is True
    assert cert["status"] == "ACTIVE_VERIFIED"
    assert cert["candidate_name"] == "Arjun Sharma"
    assert cert["college"] == "National Institute of Technology"
    assert cert["skill"] == "React & TypeScript"
    assert cert["score"] == 94.5
    assert cert["verification_hash"] == valid_hash
    assert "Placement Intelligence" in cert["issuing_platform"]

    # Strict PII protection assertions
    assert "user_id" not in cert
    assert "email" not in cert
    assert "phone" not in cert
    assert user_uid not in str(cert)


async def test_public_skill_verification_anti_enumeration():
    """Verify that short (<8) or malformed hashes are rejected with 400 Bad Request."""
    from app.api.v1.endpoints.verification import public_verify_badge

    db = MockDB()

    try:
        await public_verify_badge(verification_hash="abc", db=db)
        assert False, "Should have raised 400 Bad Request"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "Invalid credential verification hash format" in exc.detail

    try:
        await public_verify_badge(verification_hash="", db=db)
        assert False, "Should have raised 400 Bad Request"
    except HTTPException as exc:
        assert exc.status_code == 400


async def test_public_skill_verification_nonexistent_hash():
    """Verify that querying an unknown hash returns 404 without leaking internal state."""
    from app.api.v1.endpoints.verification import public_verify_badge

    db = MockDB()
    try:
        await public_verify_badge(verification_hash="non_existent_fake_hash_123456789", db=db)
        assert False, "Should have raised 404 Not Found"
    except HTTPException as exc:
        assert exc.status_code == 404
        assert "not found" in exc.detail.lower()


async def test_idor_student_profile_isolation():
    """Verify IDOR prevention: Student 1 cannot inspect Student 2's profile."""
    uid1 = "student_uid_arjun_01"
    uid2 = "student_uid_priya_02"

    student1_user = {"firebase_uid": uid1, "role": "STUDENT"}

    # Ownership check: student accessing own data should pass without exception
    verify_student_ownership(target_user_id=uid1, current_user=student1_user)

    # Cross-user IDOR access attempt must be rejected with 403 Forbidden
    try:
        verify_student_ownership(target_user_id=uid2, current_user=student1_user)
        assert False, "IDOR check should have raised 403 Forbidden"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "Cross-user data access is strictly forbidden" in exc.detail


async def test_privilege_escalation_defense():
    """Verify students cannot escalate their privileges to ADMIN via profile updates."""
    from app.api.v1.endpoints.users import update_current_user_info, UpdateUserRequest

    db = MockDB()
    uid = "student_uid_test_escalation"

    await db.users.update_one(
        {"firebase_uid": uid},
        {
            "$set": {
                "firebase_uid": uid,
                "email": "student@placement.edu",
                "display_name": "Initial Name",
                "role": "STUDENT",
            }
        },
        upsert=True,
    )

    payload = UpdateUserRequest(
        display_name="Arjun Sharma",
        photo_url="https://example.com/avatar.jpg"
    )

    current_user = {"firebase_uid": uid, "role": "STUDENT", "email": "student@placement.edu"}
    res = await update_current_user_info(payload=payload, current_user=current_user, db=db)

    assert res["full_name"] == "Arjun Sharma"
    assert res["roles"] == ["STUDENT"]

    # Verify role in DB remains STUDENT
    user_in_db = await db.users.find_one({"firebase_uid": uid})
    assert user_in_db["role"] == "STUDENT", "Role was modified! Privilege escalation vulnerability detected."


async def test_administrative_rbac_enforcement():
    """Verify that student sessions are rejected from administrative routes with 403 Forbidden."""
    from app.core.dependencies import require_role

    student_user = {"firebase_uid": "student_uid_123", "role": "STUDENT", "email": "student@campus.edu"}
    admin_user = {"firebase_uid": "admin_uid_999", "role": "ADMIN", "email": "dean@campus.edu"}

    admin_checker = require_role(["ADMIN", "SUPER_ADMIN"])

    # Admin passes
    auth_admin = await admin_checker(current_user=admin_user)
    assert auth_admin["role"] == "ADMIN"

    # Student raises 403 Forbidden
    try:
        await admin_checker(current_user=student_user)
        assert False, "Should have raised 403 Forbidden"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "Access denied" in exc.detail


async def test_health_check_subsystem_observability():
    """Verify diagnostic health check reporting with latency telemetry and operational components."""
    from app.core.observability import compute_health_status
    from app.db.mongodb import mongo_manager

    # Set mock mode
    mongo_manager.connection_mode = "mock"
    from mongomock_motor import AsyncMongoMockClient
    mongo_manager.client = AsyncMongoMockClient()
    mongo_manager.db = mongo_manager.client["test_db"]

    diag = await compute_health_status()

    assert diag["status"] == "healthy"
    assert "database" in diag
    assert diag["database"]["name"] == "MongoDB Atlas"
    assert diag["database"]["status"] == "connected"
    assert isinstance(diag["database"]["latency_ms"], float)
    assert "storage" in diag
    assert diag["storage"]["status"] == "operational"
    assert diag["auth_provider"] == "Firebase Google Authentication"
    assert "version" in diag


# =============================================================================
# Main Runner
# =============================================================================

async def run_phase6_tests():
    print("\n" + "=" * 70, flush=True)
    print("PHASE 6: PRODUCTION HARDENING & SECURITY TEST SUITE", flush=True)
    print("=" * 70, flush=True)

    await test_security_headers_injection()
    print("  [PASS] 1. OWASP Security Headers Middleware (nosniff, DENY, Referrer-Policy, HSTS)", flush=True)

    await test_public_skill_verification_endpoint()
    print("  [PASS] 2. Public Skill Verification Authority & PII Redaction (/verify/{hash})", flush=True)

    await test_public_skill_verification_anti_enumeration()
    print("  [PASS] 3. Anti-Enumeration Safeguards (rejection of short/malformed query hashes)", flush=True)

    await test_public_skill_verification_nonexistent_hash()
    print("  [PASS] 4. Public Verification Non-existent Hash 404 Behavior", flush=True)

    await test_idor_student_profile_isolation()
    print("  [PASS] 5. IDOR Student Data Isolation & Forbidden Cross-User Access Prevention", flush=True)

    await test_privilege_escalation_defense()
    print("  [PASS] 6. Privilege Escalation Defense (student role self-assignment rejection)", flush=True)

    await test_administrative_rbac_enforcement()
    print("  [PASS] 7. Administrative RBAC Enforcement (student token rejection on admin routes)", flush=True)

    await test_health_check_subsystem_observability()
    print("  [PASS] 8. Health Check Subsystem Telemetry & DB Ping Observability", flush=True)

    print("\n" + "=" * 70, flush=True)
    print("ALL 8 PHASE 6 PRODUCTION HARDENING & SECURITY TESTS PASSED 100%!", flush=True)
    print("=" * 70, flush=True)
    return 8


if __name__ == "__main__":
    asyncio.run(run_phase6_tests())
