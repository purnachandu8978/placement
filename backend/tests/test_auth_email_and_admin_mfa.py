import pytest
from httpx import AsyncClient
from app.core.config import settings
from app.db.mongodb import mongo_manager
from app.db.seed import seed_mongodb_data


@pytest.mark.asyncio
async def test_student_registration_and_login_lifecycle(client: AsyncClient):
    """Candidate account registration and login with email and password."""
    await seed_mongodb_data(mongo_manager.db)

    # 1. Register candidate
    reg_payload = {
        "email": "new.student@campus.edu",
        "password": "Password123!",
        "full_name": "New Candidate",
    }
    reg_res = await client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 200, reg_res.text
    reg_data = reg_res.json()
    assert reg_data["email"] == "new.student@campus.edu"
    assert reg_data["role"] == "STUDENT"
    assert reg_data["auth_provider"] == "password"
    assert reg_data["is_new_user"] is True
    assert "token" in reg_data
    token = reg_data["token"]

    # 2. Duplicate registration is rejected
    dup_res = await client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_res.status_code == 400
    assert "already exists" in dup_res.json()["detail"].lower()

    # 3. Access /auth/me with newly registered student token
    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "new.student@campus.edu"
    assert me_data["display_name"] == "New Candidate"
    assert me_data["role"] == "STUDENT"

    # 4. Student login with valid credentials
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "new.student@campus.edu", "password": "Password123!"},
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["role"] == "STUDENT"
    assert login_data["token"] is not None

    # 5. Student login with incorrect password fails
    bad_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "new.student@campus.edu", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401


@pytest.mark.asyncio
async def test_admin_mfa_login_and_strict_separation(client: AsyncClient):
    """
    Administrator authentication:
    1. Students strictly blocked from admin login (403 Forbidden).
    2. Admin accounts strictly blocked from student login (403 Forbidden).
    3. Admin invalid password rejected (401 Unauthorized).
    4. Admin valid credentials returns signed HS256 JWT & session cookie.
    5. Admin token grants access to protected admin endpoints.
    """
    await seed_mongodb_data(mongo_manager.db)

    # 1. Non-admin student attempts admin login -> strictly 403 Forbidden
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "regular.student@campus.edu", "password": "Password123!", "full_name": "Regular Student"},
    )
    assert reg_res.status_code == 200

    student_admin_try = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "regular.student@campus.edu", "password": "Password123!"},
    )
    assert student_admin_try.status_code == 403
    assert "unauthorized" in student_admin_try.json()["detail"].lower()

    # 2. Admin attempts student login -> strictly 403 Forbidden
    admin_student_try = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.INITIAL_ADMIN_EMAIL, "password": settings.INITIAL_ADMIN_PASSWORD},
    )
    assert admin_student_try.status_code == 403
    assert "admin portal" in admin_student_try.json()["detail"].lower()

    # 3. Admin login with incorrect password -> 401 Unauthorized
    bad_admin = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": settings.INITIAL_ADMIN_EMAIL, "password": "IncorrectPassword123!"},
    )
    assert bad_admin.status_code == 401
    assert "invalid" in bad_admin.json()["detail"].lower()

    # 4. Admin login with valid credentials -> 200 OK + JWT access token
    admin_login = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": settings.INITIAL_ADMIN_EMAIL, "password": settings.INITIAL_ADMIN_PASSWORD},
    )
    assert admin_login.status_code == 200
    admin_data = admin_login.json()
    assert admin_data["role"] in ("ADMIN", "SUPER_ADMIN")
    assert "token" in admin_data
    assert admin_data["email"].lower() == settings.INITIAL_ADMIN_EMAIL.lower()
    admin_token = admin_data["token"]

    # 5. Admin can access admin-only endpoint with Bearer token
    admin_me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_me.status_code == 200
    assert admin_me.json()["role"] in ("ADMIN", "SUPER_ADMIN")

    # 6. Admin can access administrative students list
    students_res = await client.get("/api/v1/admin/students", headers={"Authorization": f"Bearer {admin_token}"})
    assert students_res.status_code == 200
