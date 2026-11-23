import os
import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

# Set test environment
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"

from app.core.config import settings

settings.ENVIRONMENT = "testing"
settings.USE_MOCK_MONGODB_FOR_TESTS = True
settings.FIREBASE_MOCK_AUTH_IN_DEV = True
settings.MONGODB_URI = ""
from app.db.mongodb import mongo_manager, get_database
from app.db.seed import seed_mongodb_data
from app.main import app

# Use isolated mock MongoDB for test suite
mock_mongo_client = AsyncMongoMockClient()
test_db = mock_mongo_client[settings.MONGODB_DB_NAME]


async def override_get_database():
    return test_db


app.dependency_overrides[get_database] = override_get_database


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db():
    settings.USE_MOCK_MONGODB_FOR_TESTS = True
    settings.ENVIRONMENT = "testing"
    mongo_manager.client = mock_mongo_client
    mongo_manager.db = test_db
    mongo_manager.connection_mode = "mock"
    await mongo_manager.create_indexes()
    await seed_mongodb_data(test_db)
    yield
    await mock_mongo_client.drop_database(settings.MONGODB_DB_NAME)


@pytest.fixture
def test_db_fixture():
    return test_db


@pytest.fixture(name="test_db")
def _test_db():
    return test_db


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def test_student_token(client: AsyncClient):
    """Authenticates Student 1 via Firebase Google Login token and seeds active resume."""
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": "mock_token_arjun_sharma"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    uid = data["firebase_uid"]
    await test_db.resumes.update_one(
        {"user_id": uid, "is_active": True},
        {
            "$set": {
                "user_id": uid,
                "is_active": True,
                "filename": "arjun_resume.pdf",
                "detected_skills": [
                    {"skill_name": "Python"},
                    {"skill_name": "JavaScript"},
                    {"skill_name": "Java"},
                    {"skill_name": "C++"},
                    {"skill_name": "React"},
                    {"skill_name": "TypeScript"},
                ],
                "uploaded_at": "2026-11-23T00:00:00Z",
            }
        },
        upsert=True
    )
    return data["token"], data


@pytest_asyncio.fixture
async def test_student2_token(client: AsyncClient):
    """Authenticates Student 2 for multi-user isolation verification and seeds active resume."""
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": "mock_token_priya_patel"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    uid = data["firebase_uid"]
    await test_db.resumes.update_one(
        {"user_id": uid, "is_active": True},
        {
            "$set": {
                "user_id": uid,
                "is_active": True,
                "filename": "priya_resume.pdf",
                "detected_skills": [
                    {"skill_name": "Python"},
                    {"skill_name": "JavaScript"},
                    {"skill_name": "React"},
                ],
                "uploaded_at": "2026-11-23T00:00:00Z",
            }
        },
        upsert=True
    )
    return data["token"], data


@pytest_asyncio.fixture
async def test_admin_token(client: AsyncClient):
    """Authenticates an ADMIN user with Firebase custom claims."""
    res = await client.post(
        "/api/v1/auth/google",
        json={"id_token": "mock_token_dean_admin"}
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # Ensure admin role in MongoDB
    await test_db.users.update_one(
        {"firebase_uid": data["firebase_uid"]},
        {"$set": {"role": "ADMIN"}}
    )
    data["role"] = "ADMIN"
    return data["token"], data
