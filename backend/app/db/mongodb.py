import logging
import re
from typing import Any, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import pymongo
from app.core.config import settings

logger = logging.getLogger("placement_intelligence.mongodb")


def _is_real_mongodb_uri(uri: str | None) -> bool:
    """Checks if a configured MongoDB URI is non-empty and not an unedited placeholder."""
    if not uri or not uri.strip():
        return False
    cleaned = uri.strip()
    if "<username>" in cleaned or "<password>" in cleaned or "<cluster>" in cleaned:
        return False
    if cleaned == "mongodb+srv://cluster0.mongodb.net/?retryWrites=true&w=majority":
        return False
    return cleaned.startswith("mongodb://") or cleaned.startswith("mongodb+srv://")


def _mask_mongodb_uri(uri: str | None) -> str:
    """Masks database password before returning URI telemetry to authorized admins."""
    if not uri or not uri.strip():
        return ""
    return re.sub(r"(mongodb(?:\+srv)?://[^:]+:)([^@]+)(@)", r"\1****\3", uri.strip())


class MongoDBManager:
    """Manages asynchronous connections to MongoDB Atlas with connection pooling,
    automatic retries, health checking, and collection indexing.
    """
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    connection_mode: str = "disconnected"
    last_error: str = ""

    async def connect(self, strict: bool = False):
        """Establishes connection to MongoDB Atlas (or in-memory mock when unconfigured/testing)."""
        if self.client is not None and not strict:
            return

        uri = (settings.MONGODB_URI or "").strip()
        self.last_error = ""

        try:
            if settings.USE_MOCK_MONGODB_FOR_TESTS or not _is_real_mongodb_uri(uri):
                logger.info("MONGODB_URI not set or test mode active; initializing local async mock client.")
                from mongomock_motor import AsyncMongoMockClient
                self.client = AsyncMongoMockClient()
                self.connection_mode = "mock"
                if not settings.USE_MOCK_MONGODB_FOR_TESTS and not uri:
                    self.last_error = "MONGODB_URI is empty; running in local in-memory mode."
            else:
                try:
                    live_client = AsyncIOMotorClient(
                        uri,
                        maxPoolSize=settings.MONGODB_MAX_POOL_SIZE,
                        minPoolSize=settings.MONGODB_MIN_POOL_SIZE,
                        maxIdleTimeMS=settings.MONGODB_MAX_IDLE_TIME_MS,
                        waitQueueTimeoutMS=settings.MONGODB_WAIT_QUEUE_TIMEOUT_MS,
                        serverSelectionTimeoutMS=20000,
                        connectTimeoutMS=20000,
                        socketTimeoutMS=20000,
                        retryWrites=True,
                        w="majority"
                    )
                    await live_client.admin.command("ping")
                    self.client = live_client
                    self.connection_mode = "atlas"
                    logger.info("Successfully connected to live MongoDB cluster.")
                except Exception as live_err:
                    self.last_error = str(live_err)
                    if strict:
                        raise live_err
                    logger.warning(
                        f"Live MongoDB unreachable ({live_err}). Falling back to local mock client for development."
                    )
                    from mongomock_motor import AsyncMongoMockClient
                    self.client = AsyncMongoMockClient()
                    self.connection_mode = "mock"

            self.db = self.client[settings.MONGODB_DB_NAME]
            await self.create_indexes()
            logger.info(f"Connected to MongoDB database '{settings.MONGODB_DB_NAME}' ({self.connection_mode}).")
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"MongoDB connection failed: {e}")
            raise e

    async def reconnect(self, strict: bool = True):
        """Closes any existing client and establishes a fresh connection using updated settings."""
        await self.close()
        await self.connect(strict=strict)

    async def close(self):
        """Closes MongoDB connection pool."""
        if self.client:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None
            self.db = None
            self.connection_mode = "disconnected"
            logger.info("MongoDB connection closed.")

    async def ping(self) -> bool:
        """Health check verifying database responsiveness."""
        if self.db is None or self.client is None:
            return False
        if self.connection_mode == "mock" or type(self.client).__name__ == "AsyncMongoMockClient":
            return True
        try:
            await self.client.admin.command("ping")
            return True
        except Exception as e:
            self.last_error = str(e)
            return False

    async def get_status(self) -> Dict[str, Any]:
        """Returns masked MongoDB status for admin diagnostics."""
        uri = (settings.MONGODB_URI or "").strip()
        ping_ok = await self.ping()
        return {
            "configured": _is_real_mongodb_uri(uri),
            "connection_mode": self.connection_mode,
            "database_name": settings.MONGODB_DB_NAME,
            "uri_masked": _mask_mongodb_uri(uri),
            "ping_ok": ping_ok,
            "last_error": self.last_error,
        }

    async def create_indexes(self):
        """Ensures all mandatory indexes exist across collections without letting one index note abort others."""
        db = self.db
        if db is None:
            return

        index_specs = [
            # 1. users: auth identities (students & admins)
            (db.users, [("firebase_uid", pymongo.ASCENDING)], {"unique": True}),
            (db.users, [("email", pymongo.ASCENDING)], {"unique": True}),
            (db.users, [("role", pymongo.ASCENDING)], {}),
            # 2. student_profiles: users academic/career information (clean zero-state on new signup)
            (db.student_profiles, [("user_id", pymongo.ASCENDING)], {"unique": True}),
            (db.student_profiles, [("college", pymongo.ASCENDING)], {}),
            (db.student_profiles, [("graduation_year", pymongo.ASCENDING)], {}),
            # 3. user_logins: dedicated logins & session audit collection
            (db.user_logins, [("user_id", pymongo.ASCENDING), ("logged_in_at", pymongo.DESCENDING)], {}),
            (db.user_logins, [("email", pymongo.ASCENDING), ("logged_in_at", pymongo.DESCENDING)], {}),
            (db.user_logins, [("logged_in_at", pymongo.DESCENDING)], {}),
            (db.user_logins, [("auth_method", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], {}),
            # 4. resumes
            (db.resumes, [("user_id", pymongo.ASCENDING), ("uploaded_at", pymongo.DESCENDING)], {}),
            (db.resumes, [("user_id", pymongo.ASCENDING), ("is_active", pymongo.ASCENDING)], {}),
            # 5. extracted_skills
            (db.extracted_skills, [("user_id", pymongo.ASCENDING), ("skill_name", pymongo.ASCENDING)], {}),
            # 6. assessments
            (db.assessments, [("skill_id", pymongo.ASCENDING)], {}),
            (db.assessments, [("published_status", pymongo.ASCENDING)], {}),
            # 7. assessment_attempts
            (db.assessment_attempts, [("user_id", pymongo.ASCENDING), ("assessment_id", pymongo.ASCENDING)], {}),
            (db.assessment_attempts, [("start_time", pymongo.DESCENDING)], {}),
            # 8. skill_performance
            (db.skill_performance, [("user_id", pymongo.ASCENDING), ("skill_name", pymongo.ASCENDING)], {"unique": True}),
            # 9. roadmaps
            (db.roadmaps, [("user_id", pymongo.ASCENDING)], {}),
            # 10. assignments, allocations & submissions
            (db.assignments, [("user_id", pymongo.ASCENDING)], {}),
            (db.assignments, [("status", pymongo.ASCENDING)], {}),
            (db.assignments, [("created_at", pymongo.DESCENDING)], {}),
            (db.assignment_allocations, [("assignment_id", pymongo.ASCENDING), ("user_id", pymongo.ASCENDING)], {"unique": True}),
            (db.assignment_allocations, [("user_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], {}),
            (db.assignment_allocations, [("assignment_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], {}),
            (db.assignment_submissions, [("assignment_id", pymongo.ASCENDING), ("user_id", pymongo.ASCENDING)], {}),
            (db.assignment_submissions, [("user_id", pymongo.ASCENDING), ("submitted_at", pymongo.DESCENDING)], {}),
            (db.assignment_submissions, [("status", pymongo.ASCENDING)], {}),
            # 11. verified_skills
            (db.verified_skills, [("user_id", pymongo.ASCENDING), ("skill", pymongo.ASCENDING)], {"unique": True}),
            # 12. jobs & sources & matches
            (db.jobs, [("source_id", pymongo.ASCENDING), ("external_job_id", pymongo.ASCENDING)], {"unique": True}),
            (db.jobs, [("status", pymongo.ASCENDING), ("posted_at", pymongo.DESCENDING)], {}),
            (db.job_sources, [("source_name", pymongo.ASCENDING)], {"unique": True}),
            (db.job_matches, [("user_id", pymongo.ASCENDING), ("job_id", pymongo.ASCENDING)], {"unique": True}),
            (db.job_matches, [("user_id", pymongo.ASCENDING), ("match_score", pymongo.DESCENDING)], {}),
            # 13. notifications & device_tokens & job_sync_runs
            (db.notifications, [("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], {}),
            (db.notifications, [("user_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)], {}),
            (db.notifications, [("category", pymongo.ASCENDING)], {}),
            (db.notification_preferences, [("user_id", pymongo.ASCENDING)], {"unique": True}),
            (db.notification_deduplications, [("dedup_key", pymongo.ASCENDING)], {"unique": True}),
            (db.device_tokens, [("user_id", pymongo.ASCENDING), ("token", pymongo.ASCENDING)], {"unique": True}),
            (db.device_tokens, [("token", pymongo.ASCENDING)], {}),
            (db.notification_deliveries, [("timestamp", pymongo.DESCENDING)], {}),
            (db.job_sync_runs, [("source_id", pymongo.ASCENDING), ("started_at", pymongo.DESCENDING)], {}),
            # 14. placement_readiness, verification_requests, admin_audit_logs
            (db.placement_readiness, [("user_id", pymongo.ASCENDING)], {"unique": True}),
            (db.verification_requests, [("user_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], {}),
            (db.admin_audit_logs, [("admin_uid", pymongo.ASCENDING)], {}),
            (db.admin_audit_logs, [("timestamp", pymongo.DESCENDING)], {}),
            # 15. coding_questions & coding_submissions
            (db.coding_questions, [("id", pymongo.ASCENDING)], {"unique": True}),
            (db.coding_questions, [("skill_id", pymongo.ASCENDING), ("approval_status", pymongo.ASCENDING)], {}),
            (db.coding_submissions, [("attempt_id", pymongo.ASCENDING), ("question_id", pymongo.ASCENDING), ("submitted_at", pymongo.DESCENDING)], {}),
            (db.coding_submissions, [("user_id", pymongo.ASCENDING), ("submitted_at", pymongo.DESCENDING)], {}),
            # 16. student_groups & announcements
            (db.student_groups, [("name", pymongo.ASCENDING)], {}),
            (db.student_groups, [("created_at", pymongo.DESCENDING)], {}),
            (db.announcements, [("created_at", pymongo.DESCENDING)], {}),
            (db.announcements, [("target_type", pymongo.ASCENDING)], {}),
            # 17. student_credentials & verification_attempts
            (db.student_credentials, [("credential_id", pymongo.ASCENDING)], {"unique": True}),
            (db.student_credentials, [("serial_number", pymongo.ASCENDING)], {"unique": True, "sparse": True}),
            (db.student_credentials, [("credential_hash", pymongo.ASCENDING)], {"unique": True}),
            (db.student_credentials, [("user_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], {}),
            (db.verification_attempts, [("user_id", pymongo.ASCENDING), ("started_at", pymongo.DESCENDING)], {}),
            # 18. student_registration_ids & certificate_templates
            (db.student_registration_ids, [("registration_id", pymongo.ASCENDING)], {"unique": True}),
            (db.student_registration_ids, [("user_id", pymongo.ASCENDING)], {}),
            (db.certificate_templates, [("template_id", pymongo.ASCENDING)], {"unique": True}),
            (db.certificate_templates, [("status", pymongo.ASCENDING)], {}),
            # 19. startups, startup_jobs & student_job_applications
            (db.startups, [("startup_id", pymongo.ASCENDING)], {"unique": True}),
            (db.startups, [("hq_state", pymongo.ASCENDING), ("hq_city", pymongo.ASCENDING)], {}),
            (db.startups, [("sector", pymongo.ASCENDING)], {}),
            (db.startup_jobs, [("job_id", pymongo.ASCENDING)], {"unique": True}),
            (db.startup_jobs, [("startup_id", pymongo.ASCENDING)], {}),
            (db.student_job_applications, [("user_id", pymongo.ASCENDING), ("job_id", pymongo.ASCENDING)], {"unique": True}),
            # 20. api_quota_tracking & api_response_cache (Free-tier budget preservation)
            (db.api_quota_tracking, [("service", pymongo.ASCENDING), ("date", pymongo.ASCENDING)], {"unique": True}),
            (db.api_response_cache, [("service", pymongo.ASCENDING), ("cache_key", pymongo.ASCENDING)], {"unique": True}),
            (db.api_response_cache, [("expires_at", pymongo.ASCENDING)], {"expireAfterSeconds": 0}),
            # 21. password_resets (Single-use OTP code verification with TTL)
            (db.password_resets, [("email", pymongo.ASCENDING), ("used", pymongo.ASCENDING)], {}),
            (db.password_resets, [("expires_at", pymongo.ASCENDING)], {"expireAfterSeconds": 0}),
        ]

        for coll, keys, kwargs in index_specs:
            try:
                await coll.create_index(keys, **kwargs)
            except Exception as idx_err:
                logger.warning(f"Index creation note for {coll.name}: {idx_err}")


# Global instance
mongo_manager = MongoDBManager()


async def get_database() -> AsyncIOMotorDatabase:
    """FastAPI dependency to retrieve active MongoDB database instance."""
    if mongo_manager.db is None:
        await mongo_manager.connect()
    return mongo_manager.db
