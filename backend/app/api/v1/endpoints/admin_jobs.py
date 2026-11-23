"""
Admin Job Intelligence Console Endpoints.

Provides administrative controls for:
- Configuring authorized job discovery sources (Greenhouse, Lever, Remotive, RSS, Enterprise).
- Manual sync triggers (single source or all sources).
- Synchronization history and failure telemetry.
- Ingestion metrics and deduplication statistics.
- Job moderation (approve, reject, expire).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.dependencies import require_role
from app.db.mongodb import get_database
from app.schemas.job_discovery import (
    JobIngestionStats,
    JobSourceCreate,
    JobSourceResponse,
    JobSourceUpdate,
    JobSyncRunResponse,
    WorkerHealthResponse,
)
from app.services.job_sync_service import (
    seed_default_job_sources,
    sync_all_active_sources,
    sync_source,
)

router = APIRouter()


class ModerationRequest(BaseModel):
    status: str = Field(description="'active', 'rejected', or 'archived'")
    reason: Optional[str] = None


@router.get("/sources", response_model=List[JobSourceResponse])
async def list_job_sources(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """List all registered job discovery sources and their live status."""
    # Ensure default sources exist
    await seed_default_job_sources(db)

    sources = await db.job_sources.find().sort("priority", 1).to_list(length=100)
    result = []
    for s in sources:
        sid = str(s["_id"])
        result.append(
            JobSourceResponse(
                id=sid,
                name=s.get("name", "Unknown Source"),
                source_type=s.get("source_type", "rss"),
                endpoint_url=s.get("endpoint_url"),
                board_token=s.get("board_token"),
                sync_interval_minutes=s.get("sync_interval_minutes", 60),
                priority=s.get("priority", 1),
                status=s.get("status", "LIVE"),
                is_active=s.get("is_active", True),
                requires_auth=s.get("requires_auth", False),
                last_sync_at=s["last_sync_at"].isoformat() if isinstance(s.get("last_sync_at"), datetime) else s.get("last_sync_at"),
                last_status=s.get("last_status"),
                error_message=s.get("error_message"),
                jobs_imported_count=s.get("jobs_imported_count", 0),
                created_at=s["created_at"].isoformat() if isinstance(s.get("created_at"), datetime) else s.get("created_at"),
            )
        )
    return result


@router.post("/sources", response_model=JobSourceResponse)
async def create_job_source(
    req: JobSourceCreate,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Register a new authorized job discovery connector."""
    now = datetime.now(timezone.utc)
    # If connector requires auth and no api_key provided, mark NOT_CONFIGURED
    initial_status = "NOT_CONFIGURED" if (req.requires_auth and not req.api_key) else "LIVE"

    doc = {
        "name": req.name,
        "source_type": req.source_type,
        "endpoint_url": req.endpoint_url,
        "board_token": req.board_token,
        "api_key": req.api_key,
        "sync_interval_minutes": req.sync_interval_minutes,
        "priority": req.priority,
        "is_active": req.is_active,
        "requires_auth": req.requires_auth,
        "status": initial_status,
        "jobs_imported_count": 0,
        "created_by": admin.get("email"),
        "created_at": now,
        "last_sync_at": None,
        "last_status": None,
        "error_message": None,
    }
    res = await db.job_sources.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc["created_at"] = now.isoformat()
    return JobSourceResponse(**doc)


@router.put("/sources/{source_id}", response_model=JobSourceResponse)
async def update_job_source(
    source_id: str,
    req: JobSourceUpdate,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Update source configuration, board token, sync interval, or enable/disable."""
    try:
        oid = ObjectId(source_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid source ID format")

    existing = await db.job_sources.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Job source not found")

    updates: Dict[str, Any] = {}
    for field, val in req.dict(exclude_unset=True).items():
        if val is not None:
            updates[field] = val

    # If updating api_key for auth-required connector, update status to LIVE
    if updates.get("api_key") and existing.get("requires_auth"):
        updates["status"] = "LIVE"

    if updates:
        await db.job_sources.update_one({"_id": oid}, {"$set": updates})

    updated = await db.job_sources.find_one({"_id": oid})
    return JobSourceResponse(
        id=str(updated["_id"]),
        name=updated.get("name"),
        source_type=updated.get("source_type"),
        endpoint_url=updated.get("endpoint_url"),
        board_token=updated.get("board_token"),
        sync_interval_minutes=updated.get("sync_interval_minutes", 60),
        priority=updated.get("priority", 1),
        status=updated.get("status", "LIVE"),
        is_active=updated.get("is_active", True),
        requires_auth=updated.get("requires_auth", False),
        last_sync_at=updated["last_sync_at"].isoformat() if isinstance(updated.get("last_sync_at"), datetime) else updated.get("last_sync_at"),
        last_status=updated.get("last_status"),
        error_message=updated.get("error_message"),
        jobs_imported_count=updated.get("jobs_imported_count", 0),
        created_at=updated["created_at"].isoformat() if isinstance(updated.get("created_at"), datetime) else updated.get("created_at"),
    )


@router.delete("/sources/{source_id}")
async def delete_job_source(
    source_id: str,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Remove a job source from automatic synchronization."""
    try:
        oid = ObjectId(source_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid source ID format")

    res = await db.job_sources.delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job source not found")

    return {"message": "Job source removed successfully", "source_id": source_id}


@router.post("/sources/{source_id}/sync")
async def trigger_source_sync(
    source_id: str,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Manually initiate synchronization for a single job source."""
    result = await sync_source(source_id, db)
    return result


@router.post("/sync-all")
async def trigger_sync_all_sources(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Manually trigger discovery and ingestion across all active authorized sources."""
    results = await sync_all_active_sources(db)
    return {
        "message": f"Synchronized {len(results)} authorized sources",
        "results": results,
    }


@router.get("/sync-history", response_model=List[JobSyncRunResponse])
async def get_sync_history(
    limit: int = Query(default=30, ge=1, le=100),
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Retrieve telemetry log of recent synchronization runs, error traces, and counts."""
    runs = await db.job_sync_runs.find().sort("started_at", -1).to_list(length=limit)
    res: List[JobSyncRunResponse] = []
    for r in runs:
        res.append(
            JobSyncRunResponse(
                id=str(r["_id"]),
                source_id=str(r.get("source_id")),
                source_name=r.get("source_name", "Unknown Source"),
                status=r.get("status", "SUCCESS"),
                jobs_discovered=r.get("jobs_discovered", 0),
                jobs_added=r.get("jobs_added", 0),
                jobs_updated=r.get("jobs_updated", 0),
                jobs_expired=r.get("jobs_expired", 0),
                duplicates_skipped=r.get("duplicates_skipped", 0),
                duration_seconds=float(r.get("duration_seconds", 0.0)),
                error_message=r.get("error_message"),
                started_at=r["started_at"].isoformat() if isinstance(r.get("started_at"), datetime) else str(r.get("started_at")),
                completed_at=r["completed_at"].isoformat() if isinstance(r.get("completed_at"), datetime) else (str(r.get("completed_at")) if r.get("completed_at") else None),
            )
        )
    return res


@router.get("/stats", response_model=JobIngestionStats)
async def get_job_ingestion_stats(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Aggregate discovery statistics: total active jobs, sources by status, and sync counts."""
    total_active_jobs = await db.jobs.count_documents({"status": "active"})
    total_expired_jobs = await db.jobs.count_documents({"status": {"$in": ["expired", "closed"]}})

    sources = await db.job_sources.find().to_list(length=100)
    sources_count = len(sources)
    live_sources_count = sum(1 for s in sources if s.get("status") == "LIVE" and s.get("is_active"))
    not_configured_count = sum(1 for s in sources if s.get("status") == "NOT_CONFIGURED")

    total_applications = await db.job_applications.count_documents({})
    total_matches = await db.job_matches.count_documents({})

    last_run = await db.job_sync_runs.find_one(sort=[("started_at", -1)])
    last_sync_timestamp = None
    last_sync_status = "IDLE"
    if last_run:
        if isinstance(last_run.get("started_at"), datetime):
            last_sync_timestamp = last_run["started_at"].isoformat()
        else:
            last_sync_timestamp = str(last_run.get("started_at"))
        last_sync_status = last_run.get("status", "SUCCESS")

    return JobIngestionStats(
        total_active_jobs=total_active_jobs,
        total_expired_jobs=total_expired_jobs,
        sources_count=sources_count,
        live_sources_count=live_sources_count,
        not_configured_count=not_configured_count,
        total_applications_recorded=total_applications,
        total_matches_calculated=total_matches,
        last_sync_timestamp=last_sync_timestamp,
        last_sync_status=last_sync_status,
    )


@router.put("/{job_id}/moderation")
async def moderate_job(
    job_id: str,
    req: ModerationRequest,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin moderation: Approve, reject, or archive an ingested job."""
    if req.status not in ("active", "rejected", "archived", "expired"):
        raise HTTPException(status_code=400, detail="Invalid moderation status")

    try:
        oid = ObjectId(job_id)
        job_doc = await db.jobs.find_one({"_id": oid})
    except Exception:
        job_doc = await db.jobs.find_one({"external_job_id": job_id})

    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)
    await db.jobs.update_one(
        {"_id": job_doc["_id"]},
        {
            "$set": {
                "status": req.status,
                "moderated_by": admin.get("email"),
                "moderated_at": now,
                "moderation_reason": req.reason,
            }
        },
    )

    return {
        "message": f"Job status updated to {req.status}",
        "job_id": str(job_doc["_id"]),
        "status": req.status,
    }


@router.get("/worker-health", response_model=WorkerHealthResponse)
async def get_worker_health(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Telemetry endpoint returning live worker heartbeats, distributed leases, and scheduler status."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=3)

    # Active workers with recent heartbeats
    active_workers = await db.job_worker_heartbeats.find({
        "heartbeat_at": {"$gte": cutoff},
        "status": "alive",
    }).to_list(length=20)

    serialized_workers = []
    for w in active_workers:
        serialized_workers.append({
            "worker_id": w.get("worker_id"),
            "status": w.get("status"),
            "pid": w.get("pid"),
            "active_tasks": w.get("active_tasks", []),
            "heartbeat_at": w["heartbeat_at"].isoformat() if isinstance(w.get("heartbeat_at"), datetime) else str(w.get("heartbeat_at")),
            "started_at": w["started_at"].isoformat() if isinstance(w.get("started_at"), datetime) else str(w.get("started_at")),
        })

    # Active distributed leases
    leases = await db.job_worker_leases.find({
        "expires_at": {"$gte": now},
    }).to_list(length=30)

    serialized_leases = []
    for l in leases:
        serialized_leases.append({
            "resource": l.get("resource"),
            "holder": l.get("holder"),
            "acquired_at": l["acquired_at"].isoformat() if isinstance(l.get("acquired_at"), datetime) else str(l.get("acquired_at")),
            "expires_at": l["expires_at"].isoformat() if isinstance(l.get("expires_at"), datetime) else str(l.get("expires_at")),
        })

    master_lease = await db.job_worker_leases.find_one({
        "resource": "scheduler_master_lease",
        "expires_at": {"$gte": now},
    })

    status_str = "HEALTHY" if active_workers else "STANDBY"

    return WorkerHealthResponse(
        status=status_str,
        active_workers_count=len(active_workers),
        active_leases_count=len(leases),
        active_workers=serialized_workers,
        active_leases=serialized_leases,
        last_scheduler_heartbeat=master_lease["acquired_at"].isoformat() if (master_lease and isinstance(master_lease.get("acquired_at"), datetime)) else None,
    )

