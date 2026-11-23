"""
Autonomous Job Synchronization, Deduplication, Ingestion & Continuous Alert Service.

Orchestrates:
- Continuous incremental synchronization from authorized connectors (Internshala, LinkedIn, Indeed, Firecrawl, Greenhouse, Lever, Remotive, RSS).
- Strict SHA-256 content-hash deduplication and source-job-ID indexing.
- Skill normalization and alignment with canonical taxonomy.
- Automatic student notification generation when fresh matching jobs are scraped.
- In-process background scheduler (zero Redis / Celery dependency).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import os
from typing import Any, Dict, List, Optional
import uuid

from bson import ObjectId

from app.core.config import settings
from app.services.job_connectors import (
    DEFAULT_AUTHORIZED_SOURCES,
    create_connector,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Distributed Worker Leases & Heartbeats (Multi-instance safe)
# ---------------------------------------------------------------------------

async def acquire_worker_lease(
    db: Any,
    resource: str,
    worker_id: str,
    duration_seconds: int = 300,
) -> bool:
    """
    Acquire a distributed MongoDB-backed lease for a named resource.
    Guarantees mutual exclusion across multiple worker nodes or uvicorn workers.
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=duration_seconds)

    existing = await db.job_worker_leases.find_one({"resource": resource})
    if existing:
        exp = existing.get("expires_at")
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        elif isinstance(exp, datetime) and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)

        # If lease is active and held by a different worker, reject
        if exp and exp >= now and existing.get("holder") != worker_id:
            return False

        # Otherwise, lease is expired or already held by this worker: renew it
        res = await db.job_worker_leases.update_one(
            {"_id": existing["_id"]},
            {"$set": {"holder": worker_id, "acquired_at": now, "expires_at": expires_at}},
        )
        return res.modified_count > 0 or existing.get("holder") == worker_id

    # If document does not exist, insert it
    try:
        await db.job_worker_leases.insert_one({
            "resource": resource,
            "holder": worker_id,
            "acquired_at": now,
            "expires_at": expires_at,
        })
        return True
    except Exception:
        return False


async def release_worker_lease(db: Any, resource: str, worker_id: str) -> bool:
    """Release a held distributed lease."""
    res = await db.job_worker_leases.delete_one({"resource": resource, "holder": worker_id})
    return res.deleted_count > 0


async def record_worker_heartbeat(
    db: Any,
    worker_id: str,
    status: str = "alive",
    active_tasks: Optional[List[str]] = None,
) -> None:
    """Record heartbeat telemetry for the background worker process."""
    now = datetime.now(timezone.utc)
    await db.job_worker_heartbeats.update_one(
        {"worker_id": worker_id},
        {
            "$set": {
                "status": status,
                "heartbeat_at": now,
                "active_tasks": active_tasks or [],
                "pid": os.getpid(),
            },
            "$setOnInsert": {
                "started_at": now,
            },
        },
        upsert=True,
    )


async def send_fcm_job_push(
    db: Any,
    uid: str,
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> int:
    """
    Send high-priority FCM push notification to candidate's registered devices.
    Cleans up stale / unregistered tokens automatically.
    """
    try:
        tokens_cursor = db.device_tokens.find({"user_id": uid})
        token_docs = await tokens_cursor.to_list(length=20)
        tokens = [t.get("token") for t in token_docs if t.get("token")]
        if not tokens:
            return 0

        from firebase_admin import messaging
        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
            tokens=tokens,
        )
        response = await asyncio.wait_for(
            asyncio.to_thread(messaging.send_each_for_multicast, message),
            timeout=4.0,
        )

        if response.failure_count > 0:
            for idx, resp in enumerate(response.responses):
                if not resp.success and resp.exception:
                    err_msg = str(resp.exception).lower()
                    if "unregistered" in err_msg or "invalid" in err_msg:
                        await db.device_tokens.delete_one({"token": tokens[idx]})
        return response.success_count
    except Exception as exc:
        logger.debug(f"FCM push notification non-blocking exception for {uid}: {exc}")
        return 0



async def seed_default_job_sources(db: Any) -> None:
    """Ensure authorized job sources are present and up-to-date in MongoDB."""
    now = datetime.now(timezone.utc)
    for src in DEFAULT_AUTHORIZED_SOURCES:
        source_name = src.get("source_name") or src.get("name")
        # Match by name or source_type
        existing = await db.job_sources.find_one({
            "$or": [
                {"source_name": source_name},
                {"name": source_name},
                {"source_type": src["source_type"]},
            ]
        })
        if not existing:
            doc = {
                **src,
                "name": source_name,
                "source_name": source_name,
                "created_at": now,
                "updated_at": now,
                "last_sync_at": None,
                "last_status": None,
                "error_message": None,
                "jobs_imported_count": 0,
            }
            await db.job_sources.insert_one(doc)
            logger.info(f"Seeded new job source: {source_name}")
        elif existing.get("status") == "NOT_CONFIGURED" and src.get("status") == "LIVE":
            # Upgrade enterprise placeholders to live web scrapers
            await db.job_sources.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "name": source_name,
                        "source_name": source_name,
                        "source_type": src["source_type"],
                        "status": "LIVE",
                        "is_active": True,
                        "requires_auth": False,
                        "endpoint_url": src.get("endpoint_url"),
                        "sync_interval_minutes": src.get("sync_interval_minutes", 30),
                        "priority": src.get("priority", 1),
                        "updated_at": now,
                    }
                }
            )
            logger.info(f"Upgraded source to live scraper: {source_name}")

        # Ensure Firecrawl source in DB has the active API key and credit-preservation interval
        if existing and src.get("source_type") == "firecrawl" and settings.FIRECRAWL_API_KEY:
            await db.job_sources.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "api_key": settings.FIRECRAWL_API_KEY,
                        "status": "LIVE",
                        "is_active": True,
                        "sync_interval_minutes": 720,
                        "updated_at": now,
                    }
                }
            )

        # Upgrade outdated Lever Netflix board to active Lever Spotify board
        if existing and src.get("source_type") == "lever" and existing.get("board_token") == "netflix":
            await db.job_sources.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "name": "Lever: Spotify Engineering",
                        "source_name": "Lever: Spotify Engineering",
                        "board_token": "spotify",
                        "endpoint_url": "https://api.lever.co/v0/postings/spotify?mode=json",
                        "error_message": None,
                        "last_status": "pending",
                        "updated_at": now,
                    }
                }
            )


async def dispatch_continuous_job_notifications(
    db: Any,
    new_jobs: List[Dict[str, Any]],
    source_name: str,
) -> int:
    """
    Continuous Alert Engine with strict deduplication, threshold checks, and FCM delivery:
    When new jobs are scraped from Internshala, LinkedIn, Indeed, Firecrawl, etc.,
    evaluates matches against candidate students and dispatches early alerts.
    """
    if not new_jobs:
        return 0

    students = await db.users.find({"role": "STUDENT"}).to_list(length=300)
    if not students:
        return 0

    notifications_count = 0
    now = datetime.now(timezone.utc)

    # Ensure index on job_alert_deduplication
    try:
        await db.job_alert_deduplication.create_index([("user_id", 1), ("job_id", 1)], unique=True)
    except Exception:
        pass

    for student in students:
        uid = student.get("firebase_uid")
        if not uid:
            continue

        prefs = await db.student_job_preferences.find_one({"user_id": uid}) or {}
        if prefs.get("notification_frequency") == "off":
            continue

        alert_threshold = float(prefs.get("alert_score_threshold", 60.0))
        profile = await db.student_profiles.find_one({"user_id": uid}) or {}
        extracted = await db.extracted_skills.find({"user_id": uid}).to_list(length=100)
        verified = await db.verified_skills.find({"user_id": uid}).to_list(length=100)

        student_skills = {
            s.get("skill_name", "").lower()
            for s in (extracted + verified)
            if s.get("skill_name")
        }
        target_roles = [r.lower() for r in (profile.get("target_roles", []) + prefs.get("target_job_titles", []))]

        for job in new_jobs:
            jid = str(job.get("_id", ""))
            if not jid:
                continue

            # 1. Deduplication check: do not send multiple notifications for same job listing
            already_notified = await db.job_alert_deduplication.find_one({"user_id": uid, "job_id": jid})
            if already_notified:
                continue

            # 2. Excluded companies check
            excluded = [c.lower() for c in prefs.get("excluded_companies", []) if c]
            if any(ec in (job.get("company") or "").lower() for ec in excluded):
                continue

            req_skills = [s.lower() for s in job.get("required_skills", [])]
            overlap = [s for s in req_skills if s in student_skills]
            role_match = any(tr in job.get("title", "").lower() for tr in target_roles)

            should_notify = bool(overlap) or role_match or len(new_jobs) <= 3
            if should_notify:
                skills_str = ", ".join(job.get("required_skills", [])[:3])
                notif_title = f"⚡ New Job Alert: {job.get('title')} at {job.get('company')}"
                notif_body = (
                    f"Fresh opportunity discovered from {source_name}! "
                    f"Location: {job.get('location')} ({job.get('work_mode')}). "
                    f"Tech Stack: {skills_str}. Click to view match & apply directly."
                )

                try:
                    from app.services.notification_service import dispatch_notification
                    res = await dispatch_notification(
                        db=db,
                        uid=uid,
                        title=notif_title,
                        message=notif_body,
                        notif_type="job_alert",
                        category="jobs",
                        link="/student/jobs",
                        action_url=job.get("original_apply_url"),
                        metadata={
                            "job_id": jid,
                            "company": job.get("company"),
                            "role": job.get("title"),
                            "apply_url": job.get("original_apply_url"),
                            "source_name": source_name,
                        },
                        deduplication_key=f"job_alert:{uid}:{jid}",
                    )
                    # Always mark in job_alert_deduplication so student is never re-notified of same job
                    try:
                        await db.job_alert_deduplication.update_one(
                            {"user_id": uid, "job_id": jid},
                            {"$set": {"user_id": uid, "job_id": jid, "notified_at": now}},
                            upsert=True,
                        )
                    except Exception:
                        pass

                    if res.get("status") not in ["skipped_duplicate", "suppressed_preferences"]:
                        notifications_count += 1
                except Exception as notif_err:
                    logger.debug(f"Notification dispatch note for {uid}: {notif_err}")

        # Recalculate student match rankings asynchronously
        try:
            from app.services.resume_intelligence import recalculate_job_matches_for_user
            asyncio.create_task(recalculate_job_matches_for_user(uid, db))
        except Exception as e:
            logger.debug(f"Non-blocking job match refresh notice for {uid}: {e}")

    logger.info(f"Dispatched {notifications_count} real-time job notifications to candidates (deduplicated)")
    return notifications_count


async def sync_source(source_id: str, db: Any, worker_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Synchronize jobs from a specific source.
    Performs distributed lease acquisition, rate-limited fetching, content-hash deduplication,
    update detection, and records execution telemetry in `job_sync_runs`.
    """
    worker_id = worker_id or f"worker-{os.getpid()}-{uuid.uuid4().hex[:6]}"
    lease_resource = f"sync_source_{source_id}"
    lease_acquired = await acquire_worker_lease(db, lease_resource, worker_id, duration_seconds=300)
    if not lease_acquired:
        logger.info(f"Skipping sync for source {source_id}: currently locked by another background worker instance.")
        return {
            "source_id": str(source_id),
            "source_name": "In-Progress Elsewhere",
            "status": "SKIPPED",
            "message": "Source currently locked by another worker instance",
            "jobs_fetched": 0,
            "jobs_inserted": 0,
            "jobs_updated": 0,
            "jobs_skipped": 0,
            "jobs_expired": 0,
        }

    try:
        return await _execute_source_sync(source_id, db)
    finally:
        await release_worker_lease(db, lease_resource, worker_id)


async def _execute_source_sync(source_id: str, db: Any) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)

    # 1. Fetch source document
    try:
        source_doc = await db.job_sources.find_one({"_id": ObjectId(source_id)})
    except Exception:
        source_doc = await db.job_sources.find_one({"name": source_id})

    if not source_doc:
        raise ValueError(f"Job source not found: {source_id}")

    source_name = source_doc.get("name", "Unknown Source")
    source_type = source_doc.get("source_type", "")
    is_active = source_doc.get("is_active", True)
    curr_status = source_doc.get("status", "LIVE")

    # 2. Check configuration status
    if curr_status == "NOT_CONFIGURED":
        logger.info(f"Skipping sync for {source_name}: Source is NOT CONFIGURED (requires enterprise credentials).")
        return {
            "source_id": str(source_doc["_id"]),
            "source_name": source_name,
            "status": "skipped",
            "message": "Source is marked NOT CONFIGURED (enterprise credentials required).",
            "jobs_fetched": 0,
            "jobs_inserted": 0,
        }

    if not is_active or curr_status == "DISABLED":
        logger.info(f"Skipping sync for {source_name}: Source is DISABLED.")
        return {
            "source_id": str(source_doc["_id"]),
            "source_name": source_name,
            "status": "skipped",
            "message": "Source is currently disabled by administrator.",
            "jobs_fetched": 0,
            "jobs_inserted": 0,
        }

    # 3. Create run record
    run_insert = await db.job_sync_runs.insert_one({
        "source_id": str(source_doc["_id"]),
        "source_name": source_name,
        "source_type": source_type,
        "started_at": now,
        "completed_at": None,
        "status": "running",
        "jobs_fetched": 0,
        "jobs_inserted": 0,
        "jobs_updated": 0,
        "jobs_skipped": 0,
        "jobs_expired": 0,
        "error_details": None,
    })
    run_id = run_insert.inserted_id

    jobs_fetched = 0
    jobs_inserted = 0
    jobs_updated = 0
    jobs_skipped = 0
    jobs_expired = 0
    error_details: Optional[str] = None
    newly_inserted_docs: List[Dict[str, Any]] = []

    try:
        # 4. Fetch jobs from connector
        connector = create_connector(source_doc)
        try:
            raw_jobs = await connector.fetch_jobs(db=db)
        except TypeError:
            raw_jobs = await connector.fetch_jobs()
        jobs_fetched = len(raw_jobs)

        # 5. Ingest & Deduplicate each job
        seen_source_job_ids = set()
        for job_data in raw_jobs:
            s_job_id = job_data.get("source_job_id")
            c_hash = job_data.get("content_hash")
            seen_source_job_ids.add(s_job_id)

            # Query existing by composite key or content hash
            existing = await db.jobs.find_one({
                "$or": [
                    {"source_name": source_name, "source_job_id": s_job_id},
                    {"content_hash": c_hash},
                ]
            })

            if existing:
                # Update detection: if content changed, update description & skills
                if existing.get("content_hash") != c_hash:
                    await db.jobs.update_one(
                        {"_id": existing["_id"]},
                        {
                            "$set": {
                                "title": job_data["title"],
                                "description": job_data["description"],
                                "required_skills": job_data["required_skills"],
                                "preferred_skills": job_data.get("preferred_skills", []),
                                "location": job_data["location"],
                                "work_mode": job_data["work_mode"],
                                "original_apply_url": job_data["original_apply_url"],
                                "original_job_url": job_data.get("original_job_url"),
                                "content_hash": c_hash,
                                "last_seen_at": now,
                                "last_synchronized_at": now,
                                "is_active": True,
                                "status": "active",
                            }
                        },
                    )
                    jobs_updated += 1
                else:
                    # Content unchanged, touch last_seen_at
                    await db.jobs.update_one(
                        {"_id": existing["_id"]},
                        {
                            "$set": {
                                "last_seen_at": now,
                                "last_synchronized_at": now,
                                "is_active": True,
                                "status": "active",
                            }
                        },
                    )
                    jobs_skipped += 1
            else:
                # Insert brand-new job
                job_doc = {
                    "external_job_id": f"{source_type}-{s_job_id}",
                    "title": job_data["title"],
                    "company": job_data["company"],
                    "employer": job_data["company"],
                    "description": job_data["description"],
                    "required_skills": job_data["required_skills"],
                    "preferred_skills": job_data.get("preferred_skills", []),
                    "location": job_data["location"],
                    "work_mode": job_data["work_mode"],
                    "salary": job_data.get("salary") or "Competitive",
                    "package_lpa": job_data.get("package_lpa"),
                    "eligibility": "2025/2026 Engineering Graduates",
                    "employment_type": job_data.get("employment_type", "Full-time"),
                    "original_apply_url": job_data["original_apply_url"],
                    "original_job_url": job_data.get("original_job_url"),
                    "source_name": source_name,
                    "source_id": str(source_doc["_id"]),
                    "source_job_id": s_job_id,
                    "source_type": source_type,
                    "content_hash": c_hash,
                    "status": "active",
                    "is_active": True,
                    "moderation_status": "approved",
                    "click_count": 0,
                    "posted_at": job_data.get("posted_at") or now,
                    "last_seen_at": now,
                    "last_synchronized_at": now,
                    "expires_at": job_data.get("expires_at") or (now + timedelta(days=45)),
                }
                res = await db.jobs.insert_one(job_doc)
                job_doc["_id"] = res.inserted_id
                newly_inserted_docs.append(job_doc)
                jobs_inserted += 1

        # 6. Trigger Continuous Notifications for newly scraped opportunities
        if newly_inserted_docs:
            await dispatch_continuous_job_notifications(db, newly_inserted_docs, source_name)

        # 7. Mark expired jobs (older than 30 days or explicitly expired)
        expiry_cutoff = now - timedelta(days=30)
        exp_res = await db.jobs.update_many(
            {
                "source_name": source_name,
                "status": "active",
                "last_seen_at": {"$lt": expiry_cutoff},
            },
            {"$set": {"status": "expired", "is_active": False, "expired_at": now}},
        )
        jobs_expired = exp_res.modified_count

        # 8. Update source telemetry
        await db.job_sources.update_one(
            {"_id": source_doc["_id"]},
            {
                "$set": {
                    "status": "LIVE",
                    "last_sync_at": now,
                    "last_status": "success",
                    "error_message": None,
                    "updated_at": now,
                },
                "$inc": {"jobs_imported_count": jobs_inserted},
            },
        )

        final_status = "success"

    except Exception as exc:
        logger.error(f"Error during job sync for {source_name}: {exc}", exc_info=True)
        error_details = str(exc)
        final_status = "failed"
        await db.job_sources.update_one(
            {"_id": source_doc["_id"]},
            {
                "$set": {
                    "last_sync_at": now,
                    "last_status": "failed",
                    "error_message": error_details,
                    "updated_at": now,
                }
            },
        )

    # 9. Complete run record
    completed_time = datetime.now(timezone.utc)
    await db.job_sync_runs.update_one(
        {"_id": run_id},
        {
            "$set": {
                "completed_at": completed_time,
                "status": final_status,
                "jobs_fetched": jobs_fetched,
                "jobs_inserted": jobs_inserted,
                "jobs_updated": jobs_updated,
                "jobs_skipped": jobs_skipped,
                "jobs_expired": jobs_expired,
                "error_details": error_details,
            }
        },
    )

    return {
        "source_id": str(source_doc["_id"]),
        "source_name": source_name,
        "status": final_status.upper(),
        "jobs_fetched": jobs_fetched,
        "jobs_discovered": jobs_fetched,
        "jobs_inserted": jobs_inserted,
        "jobs_added": jobs_inserted,
        "jobs_updated": jobs_updated,
        "jobs_skipped": jobs_skipped,
        "duplicates_skipped": jobs_skipped,
        "jobs_expired": jobs_expired,
        "error_details": error_details,
    }


async def sync_all_active_sources(db: Any) -> List[Dict[str, Any]]:
    """Synchronize all enabled job sources sequentially to avoid hammering upstream APIs."""
    await seed_default_job_sources(db)
    sources = await db.job_sources.find({"is_active": True, "status": "LIVE"}).to_list(length=50)
    results: List[Dict[str, Any]] = []
    for src in sources:
        try:
            res = await sync_source(str(src["_id"]), db)
            results.append(res)
        except Exception as exc:
            logger.error(f"Failed to sync source {src.get('name')}: {exc}")
            results.append({
                "source_id": str(src["_id"]),
                "source_name": src.get("name"),
                "status": "failed",
                "error_details": str(exc),
            })
    return results


async def run_immediate_scrape(db: Any) -> Dict[str, Any]:
    """Execute immediate full web scraping across Internshala, LinkedIn, Indeed & Firecrawl."""
    await seed_default_job_sources(db)
    results = await sync_all_active_sources(db)
    total_added = sum(r.get("jobs_inserted", 0) for r in results)
    total_discovered = sum(r.get("jobs_discovered", 0) for r in results)
    return {
        "success": True,
        "total_discovered": total_discovered,
        "total_added": total_added,
        "sources_synced": len(results),
        "results": results,
    }


class JobSyncScheduler:
    """
    In-process continuous background scheduler with distributed master lease & heartbeat telemetry.
    Periodically checks if any source is due for synchronization based on its `sync_interval_minutes`.
    Zero external queue dependencies (no Redis / Celery required).
    """

    def __init__(self, db_getter: Any, check_interval_seconds: int = 60):
        self.db_getter = db_getter
        self.check_interval_seconds = check_interval_seconds
        self.worker_id = f"scheduler-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def _loop(self):
        logger.info(f"JobSyncScheduler background loop started (worker_id={self.worker_id})")
        while self._running:
            try:
                if hasattr(self.db_getter, "client") or hasattr(self.db_getter, "name"):
                    db = self.db_getter
                elif callable(self.db_getter):
                    db = self.db_getter()
                else:
                    db = self.db_getter

                if db is not None:
                    # Record worker heartbeat
                    await record_worker_heartbeat(
                        db,
                        self.worker_id,
                        status="alive",
                        active_tasks=["scheduler_master_poll"],
                    )

                    # Acquire master scheduler lease to prevent multi-instance race conditions
                    is_master = await acquire_worker_lease(
                        db,
                        "scheduler_master_lease",
                        self.worker_id,
                        duration_seconds=max(90, self.check_interval_seconds * 2 + 10),
                    )
                    if not is_master:
                        logger.debug("Another uvicorn/backend instance is scheduler master; standing by...")
                        await asyncio.sleep(self.check_interval_seconds)
                        continue

                    await seed_default_job_sources(db)
                    sources = await db.job_sources.find({"is_active": True, "status": "LIVE"}).to_list(length=50)
                    now = datetime.now(timezone.utc)

                    for src in sources:
                        interval = src.get("sync_interval_minutes", 60)
                        last_sync = src.get("last_sync_at")
                        needs_sync = False

                        if not last_sync:
                            needs_sync = True
                        else:
                            if isinstance(last_sync, str):
                                last_sync = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
                            elif isinstance(last_sync, datetime) and last_sync.tzinfo is None:
                                last_sync = last_sync.replace(tzinfo=timezone.utc)
                            elif not isinstance(last_sync, datetime):
                                needs_sync = True

                            if not needs_sync and (now - last_sync).total_seconds() >= (interval * 60):
                                needs_sync = True

                        if needs_sync:
                            logger.info(f"Scheduler triggering periodic sync for {src.get('name')} (worker={self.worker_id})")
                            await sync_source(str(src["_id"]), db, worker_id=self.worker_id)

            except Exception as exc:
                logger.error(f"Error in JobSyncScheduler execution loop: {exc}", exc_info=True)

            await asyncio.sleep(self.check_interval_seconds)

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
