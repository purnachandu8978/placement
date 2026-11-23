"""
India Startup Discovery & Interactive Map Endpoints.
Provides startup directory search, geospatial hub aggregation,
personalized startup recommendations, direct application tracking,
student watchlists, and admin moderation & outreach.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import urllib.parse

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user, get_optional_user, require_role
from app.db.mongodb import get_database
from app.schemas.startup import (
    ApplicationStatus,
    ApplicationStatusUpdateRequest,
    ApplicationTrackRequest,
    CompanyClassification,
    CompanyVerificationStatus,
    DpiitStatus,
    HiringStatus,
    StartupCreateRequest,
    StartupJobResponse,
    StartupMapDataResponse,
    StartupOutreachCreate,
    StartupOutreachResponse,
    StartupResponse,
    StartupUpdateRequest,
    StudentJobApplicationResponse,
    WatchlistResponse,
    WatchlistToggleRequest,
)
from app.services.startup_discovery_service import (
    admin_create_startup,
    admin_update_startup,
    create_outreach_record,
    get_india_states_geojson,
    get_state_detail,
    get_student_saved_watchlist,
    get_startup_map_data,
    get_startup_recommendations,
    list_outreach_records,
    seed_default_startups,
    toggle_student_watchlist,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Geospatial India Map Data
# ---------------------------------------------------------------------------

@router.get("/geo/india-states")
async def get_india_states_boundary_geojson():
    """
    Returns authentic Survey of India / DataMeet administrative boundary GeoJSON
    covering all 36 Indian States and Union Territories.
    """
    geojson = get_india_states_geojson()
    return geojson


@router.get("/states/{state_name}")
async def get_state_intelligence(state_name: str, db=Depends(get_database)):
    """
    Returns state-level analytics, verified counts, district distribution,
    tech stack breakdown, and companies in that state.
    """
    return await get_state_detail(state_name, db)


# ---------------------------------------------------------------------------
# Student & Public Discovery Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[StartupResponse])
async def list_startups(
    state: Optional[str] = Query(None, description="Filter by Indian State (e.g. Karnataka, Maharashtra)"),
    city: Optional[str] = Query(None, description="Filter by City (e.g. Bengaluru, Hyderabad, Pune)"),
    district: Optional[str] = Query(None, description="Filter by District"),
    sector: Optional[str] = Query(None, description="Filter by Sector"),
    classification: Optional[str] = Query(None, description="Filter by company classification (STARTUP, PRODUCT_COMPANY, etc.)"),
    verification_status: Optional[str] = Query(None, description="Filter by verification status"),
    dpiit_status: Optional[str] = Query(None, description="Filter by DPIIT recognition status"),
    tech_stack: Optional[str] = Query(None, description="Filter by technology (e.g. Python, React, Go)"),
    internship_only: Optional[bool] = Query(False, description="Filter companies with active internships"),
    fresher_only: Optional[bool] = Query(False, description="Filter companies hiring freshers"),
    hiring_status: Optional[str] = Query(None, description="Filter by hiring status"),
    dpiit_only: Optional[bool] = Query(False, description="Filter by DPIIT-recognized startups only"),
    emerging_only: Optional[bool] = Query(False, description="Filter by recently emerging startups"),
    search: Optional[str] = Query(None, description="Search by name, legal name, or description"),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """
    Explore multi-source Indian startups and technology companies with comprehensive filters.
    """
    await seed_default_startups(db)

    query: Dict[str, Any] = {}
    if isinstance(state, str) and state.lower() != "all":
        query["hq_state"] = {"$regex": f"^{state}$", "$options": "i"}
    if isinstance(city, str) and city.lower() != "all":
        query["hq_city"] = {"$regex": f"^{city}$", "$options": "i"}
    if isinstance(district, str) and district.lower() != "all":
        query["district"] = {"$regex": f"^{district}$", "$options": "i"}
    if isinstance(sector, str) and sector.lower() != "all":
        query["sector"] = {"$regex": f"^{sector}$", "$options": "i"}
    if isinstance(classification, str) and classification.lower() != "all":
        query["company_classification"] = classification
    if isinstance(verification_status, str) and verification_status.lower() != "all":
        query["verification_status"] = verification_status
    if isinstance(dpiit_status, str) and dpiit_status.lower() != "all":
        query["dpiit_status"] = dpiit_status
    if isinstance(tech_stack, str) and tech_stack.lower() != "all":
        query["tech_stack"] = {"$regex": f"^{tech_stack}$", "$options": "i"}
    if bool(internship_only) and not hasattr(internship_only, "default"):
        query["internship_available"] = True
    if bool(fresher_only) and not hasattr(fresher_only, "default"):
        query["fresher_hiring"] = True
    if isinstance(hiring_status, str) and hiring_status.lower() != "all":
        query["hiring_status"] = hiring_status
    if bool(dpiit_only) and not hasattr(dpiit_only, "default"):
        query["dpiit_recognized"] = True
    if bool(emerging_only) and not hasattr(emerging_only, "default"):
        query["is_emerging"] = True
    if isinstance(search, str) and search.strip():
        term = search.strip()
        search_or = [
            {"name": {"$regex": term, "$options": "i"}},
            {"legal_name": {"$regex": term, "$options": "i"}},
            {"description": {"$regex": term, "$options": "i"}},
            {"sector": {"$regex": term, "$options": "i"}},
            {"industry": {"$regex": term, "$options": "i"}},
            {"hq_city": {"$regex": term, "$options": "i"}},
            {"tech_stack": {"$regex": term, "$options": "i"}},
        ]
        if "$or" in query:
            query = {"$and": [query, {"$or": search_or}]}
        else:
            query["$or"] = search_or

    docs = await db.startups.find(query).skip(skip).limit(limit).to_list(length=limit)

    # Check user watchlisted set if logged in
    saved_ids = set()
    if current_user and current_user.get("firebase_uid"):
        uid = current_user["firebase_uid"]
        watchlist = await db.student_startup_watchlist.find({"user_id": uid}).to_list(length=100)
        saved_ids = {w["startup_id"] for w in watchlist}

    result = []
    for d in docs:
        d["id"] = str(d.get("_id"))
        d["is_saved_watchlist"] = d.get("startup_id") in saved_ids
        result.append(d)

    return result


@router.get("/map-data", response_model=StartupMapDataResponse)
async def get_india_map_clusters(db=Depends(get_database)):
    """
    Aggregated geospatial hubs across India, state counts, and sector breakdown for map rendering.
    """
    map_data = await get_startup_map_data(db)
    return map_data


@router.get("/recommendations", response_model=List[StartupResponse])
async def get_personalized_recommendations(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Personalized startup recommendations matching student's skills, verified portfolio,
    and college verification level.
    """
    uid = current_user["firebase_uid"]
    recs = await get_startup_recommendations(uid, db)
    return recs


@router.get("/jobs", response_model=List[StartupJobResponse])
async def list_startup_jobs(
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    work_mode: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    experience_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db=Depends(get_database),
):
    """List active job openings at verified Indian startups."""
    query: Dict[str, Any] = {"status": "active"}
    if city and city.lower() != "all":
        query["city"] = {"$regex": f"^{city}$", "$options": "i"}
    if state and state.lower() != "all":
        query["state"] = {"$regex": f"^{state}$", "$options": "i"}
    if work_mode and work_mode.lower() != "all":
        query["work_mode"] = {"$regex": f"^{work_mode}$", "$options": "i"}
    if employment_type and employment_type.lower() != "all":
        query["employment_type"] = {"$regex": f"^{employment_type}$", "$options": "i"}
    if experience_level and experience_level.lower() != "all":
        query["experience_level"] = {"$regex": f"^{experience_level}$", "$options": "i"}
    if search and search.strip():
        term = search.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"company_name": {"$regex": term, "$options": "i"}},
            {"required_skills": {"$regex": term, "$options": "i"}},
        ]

    docs = await db.startup_jobs.find(query).limit(limit).to_list(length=limit)
    result = []
    for d in docs:
        d["id"] = str(d.get("_id"))
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Student Watchlist & Express Interest
# ---------------------------------------------------------------------------

@router.post("/watchlist/toggle", response_model=WatchlistResponse)
async def toggle_watchlist(
    payload: WatchlistToggleRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Save or remove a company from the student's career watchlist, or express recruitment interest."""
    uid = current_user["firebase_uid"]
    return await toggle_student_watchlist(
        user_id=uid,
        startup_id=payload.startup_id,
        express_interest=payload.express_interest,
        preferred_role=payload.preferred_role,
        db=db,
    )


@router.get("/watchlist/my")
async def list_my_watchlist(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve all startups saved or targeted by the student."""
    uid = current_user["firebase_uid"]
    return await get_student_saved_watchlist(user_id=uid, db=db)


# ---------------------------------------------------------------------------
# Startup Profile Details
# ---------------------------------------------------------------------------

@router.get("/{startup_id}")
async def get_startup_detail(startup_id: str, db=Depends(get_database)):
    """Fetch complete startup profile, verification status, and open roles."""
    s = await db.startups.find_one({"startup_id": startup_id})
    if not s:
        try:
            s = await db.startups.find_one({"_id": ObjectId(startup_id)})
        except Exception:
            pass
    if not s:
        raise HTTPException(status_code=404, detail="Startup not found")

    s["id"] = str(s.get("_id"))

    # Fetch jobs
    jobs = await db.startup_jobs.find({"startup_id": s["startup_id"], "status": "active"}).to_list(length=50)
    for j in jobs:
        j["id"] = str(j.get("_id"))

    s["jobs"] = jobs
    return s


# ---------------------------------------------------------------------------
# Direct Apply & Student Application Tracker Endpoints
# ---------------------------------------------------------------------------

@router.post("/jobs/{job_id}/apply")
async def track_startup_application_click(
    job_id: str,
    payload: Optional[ApplicationTrackRequest] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Validates destination URL, records student application click,
    and initializes tracking in student application dashboard.
    """
    uid = current_user["firebase_uid"]
    job = await db.startup_jobs.find_one({"job_id": job_id})
    if not job:
        try:
            job = await db.startup_jobs.find_one({"_id": ObjectId(job_id)})
        except Exception:
            pass
    if not job:
        raise HTTPException(status_code=404, detail="Job opening not found")

    apply_url = job.get("apply_url") or "https://placementintelligence.edu/jobs"

    parsed = urllib.parse.urlparse(apply_url)
    if not parsed.netloc or not (apply_url.startswith("http://") or apply_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid application destination URL")

    now = datetime.now(timezone.utc)
    app_doc = {
        "user_id": uid,
        "job_id": job.get("job_id", str(job.get("_id"))),
        "job_title": job.get("title"),
        "startup_id": job.get("startup_id"),
        "company_name": job.get("company_name"),
        "company_logo": job.get("company_logo"),
        "location": job.get("location"),
        "apply_url": apply_url,
        "status": "APPLYING",
        "applied_at": now,
        "updated_at": now,
        "notes": payload.notes if payload else "Redirected to official careers portal.",
    }

    await db.student_job_applications.update_one(
        {"user_id": uid, "job_id": app_doc["job_id"]},
        {"$set": app_doc, "$setOnInsert": {"created_at": now}},
        upsert=True
    )

    return {
        "success": True,
        "apply_url": apply_url,
        "status": "APPLYING",
        "message": f"Application tracking registered for {job.get('title')} at {job.get('company_name')}."
    }


@router.get("/applications/my", response_model=List[StudentJobApplicationResponse])
async def list_my_startup_applications(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve all startup job applications tracked by the student."""
    uid = current_user["firebase_uid"]
    apps = await db.student_job_applications.find({"user_id": uid}).sort("updated_at", -1).to_list(length=100)
    result = []
    for a in apps:
        a["id"] = str(a.get("_id"))
        if isinstance(a.get("applied_at"), datetime):
            a["applied_at"] = a["applied_at"].isoformat()
        if isinstance(a.get("updated_at"), datetime):
            a["updated_at"] = a["updated_at"].isoformat()
        result.append(a)
    return result


@router.patch("/applications/{application_id}/status")
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Update student application status (APPLIED, ASSESSMENT, INTERVIEW, OFFER, etc.)."""
    uid = current_user["firebase_uid"]
    try:
        obj_id = ObjectId(application_id)
        query = {"_id": obj_id, "user_id": uid}
    except Exception:
        query = {"job_id": application_id, "user_id": uid}

    existing = await db.student_job_applications.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="Application record not found")

    status_str = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
    updates: Dict[str, Any] = {
        "status": status_str,
        "updated_at": datetime.now(timezone.utc),
    }
    if payload.notes:
        updates["notes"] = payload.notes

    await db.student_job_applications.update_one({"_id": existing["_id"]}, {"$set": updates})
    return {"success": True, "status": status_str}


# ---------------------------------------------------------------------------
# Admin Startup Management Console Endpoints
# ---------------------------------------------------------------------------

@router.post("/admin/create")
async def admin_add_startup(
    payload: StartupCreateRequest,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin endpoint to manually register and verify an Indian tech company."""
    created = await admin_create_startup(payload.model_dump(), admin.get("firebase_uid", "admin"), db)
    return created


@router.put("/admin/{startup_id}")
async def admin_edit_startup(
    startup_id: str,
    payload: StartupUpdateRequest,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin endpoint to update startup verification status, classification, and details."""
    updated = await admin_update_startup(startup_id, payload.model_dump(exclude_unset=True), admin.get("firebase_uid", "admin"), db)
    if not updated:
        raise HTTPException(status_code=404, detail="Startup not found")
    return updated


@router.post("/admin/outreach", response_model=StartupOutreachResponse)
async def admin_add_outreach(
    payload: StartupOutreachCreate,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Log an outreach engagement / placement drive initiative with a company."""
    return await create_outreach_record(payload.model_dump(), admin.get("firebase_uid", "admin"), db)


@router.get("/admin/outreach", response_model=List[StartupOutreachResponse])
async def admin_list_outreach(
    startup_id: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """List all campus outreach and partnership engagement records."""
    return await list_outreach_records(db, startup_id)


@router.post("/sync")
async def trigger_startup_sync(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Manually trigger startup synchronization and registry refresh."""
    count = await seed_default_startups(db)
    now = datetime.now(timezone.utc)
    await db.startup_sync_runs.insert_one({
        "admin_uid": admin.get("firebase_uid"),
        "timestamp": now,
        "synced_count": count,
        "status": "COMPLETED",
    })
    return {"success": True, "synced_startups": count, "timestamp": now.isoformat()}


@router.get("/analytics")
async def get_startup_discovery_analytics(
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Discovery metrics for the Admin Startup Intelligence Console."""
    total_startups = await db.startups.count_documents({})
    dpiit_count = await db.startups.count_documents({"dpiit_recognized": True})
    hiring_count = await db.startups.count_documents({"hiring_status": HiringStatus.OPEN_ROLES_VERIFIED.value})
    total_jobs = await db.startup_jobs.count_documents({"status": "active"})
    total_applications = await db.student_job_applications.count_documents({})
    total_watchlists = await db.student_startup_watchlist.count_documents({})

    return {
        "total_startups": total_startups,
        "dpiit_recognized": dpiit_count,
        "actively_hiring": hiring_count,
        "total_active_jobs": total_jobs,
        "student_applications": total_applications,
        "total_watchlists": total_watchlists,
        "dpiit_percentage": round((dpiit_count / total_startups * 100.0), 1) if total_startups > 0 else 0.0,
    }
