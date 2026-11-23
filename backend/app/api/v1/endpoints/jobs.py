"""
Live Job Discovery, Real Match Scoring, Saved Jobs, Applications, and Admin Job Publishing routes.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import urllib.parse

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user, get_optional_user, require_role
from app.db.mongodb import get_database
from app.schemas.job_discovery import (
    JobApplicationStatusUpdate,
    StudentJobPreferences,
)
from app.services.resume_intelligence import (
    compute_and_store_readiness,
    recalculate_job_matches_for_user,
)

router = APIRouter()


class CreateJobRequest(BaseModel):
    title: str
    company: str
    location: str = "Remote"
    work_mode: str = "Hybrid"
    salary: str = "12 - 18 LPA"
    description: str
    required_skills: List[str]
    preferred_skills: List[str] = Field(default_factory=list)
    eligibility: str = "2025/2026 Graduates"
    employment_type: str = "Full-time"
    original_apply_url: str = "https://placements.edu/apply"
    original_job_url: Optional[str] = None


class ClickTrackRequest(BaseModel):
    click_type: str = Field(default="apply", description="'apply' or 'view_listing'")


@router.post("/scrape-now")
async def trigger_live_job_scrape(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """
    Trigger immediate continuous web scraping across Internshala, LinkedIn, Indeed & Firecrawl.
    Dispatches notifications to relevant candidates and recalculates matches.
    """
    from app.services.job_sync_service import run_immediate_scrape
    result = await run_immediate_scrape(db)
    return result


@router.get("")
async def list_jobs(
    location: Optional[str] = None,
    work_mode: Optional[str] = None,
    search: Optional[str] = None,
    employment_type: Optional[str] = None,
    min_match_score: Optional[float] = Query(default=None, ge=0.0, le=100.0),
    is_saved_only: Optional[bool] = None,
    has_applied_only: Optional[bool] = None,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """List curated active jobs enriched with authentic match percentages, explainable breakdown, and apply/save state."""
    uid = current_user.get("firebase_uid") if current_user else None
    query: Dict[str, Any] = {"status": "active"}

    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if work_mode:
        query["work_mode"] = {"$regex": f"^{work_mode}$", "$options": "i"}
    if employment_type:
        query["employment_type"] = {"$regex": f"^{employment_type}$", "$options": "i"}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"company": {"$regex": search, "$options": "i"}},
            {"required_skills": {"$regex": search, "$options": "i"}},
            {"preferred_skills": {"$regex": search, "$options": "i"}},
        ]

    jobs_docs = await db.jobs.find(query).to_list(length=150)
    match_map: Dict[str, Any] = {}
    app_set = set()
    saved_set = set()

    if uid:
        matches = await db.job_matches.find({"user_id": uid}).to_list(length=250)
        if len(matches) < len(jobs_docs):
            try:
                matches = await recalculate_job_matches_for_user(uid, db)
            except Exception:
                pass
        match_map = {str(m.get("job_id")): m for m in matches}

        apps = await db.job_applications.find({"user_id": uid}).to_list(length=250)
        app_set = {str(a.get("job_id")) for a in apps}

        saved = await db.saved_jobs.find({"user_id": uid}).to_list(length=250)
        saved_set = {str(s.get("job_id")) for s in saved}

    result: List[Dict[str, Any]] = []
    for doc in jobs_docs:
        jid = str(doc["_id"])
        m = match_map.get(jid, {})
        has_applied = jid in app_set
        is_saved = jid in saved_set
        match_score = float(m.get("match_score", 0.0))

        if min_match_score is not None and match_score < min_match_score:
            continue
        if is_saved_only and not is_saved:
            continue
        if has_applied_only and not has_applied:
            continue

        result.append({
            "id": jid,
            "title": doc.get("title"),
            "company": doc.get("company"),
            "location": doc.get("location", "Remote"),
            "work_mode": doc.get("work_mode", "Remote"),
            "salary": doc.get("salary"),
            "package_lpa": doc.get("package_lpa"),
            "description": doc.get("description"),
            "required_skills": doc.get("required_skills", []),
            "preferred_skills": doc.get("preferred_skills", []),
            "eligibility": doc.get("eligibility"),
            "employment_type": doc.get("employment_type", "Full-time"),
            "source_name": doc.get("source_name", "Direct Posting"),
            "source_type": doc.get("source_type"),
            "source_job_id": doc.get("source_job_id") or doc.get("external_job_id"),
            "original_apply_url": doc.get("original_apply_url"),
            "original_job_url": doc.get("original_job_url") or doc.get("original_apply_url"),
            "posted_at": doc["posted_at"].isoformat() if isinstance(doc.get("posted_at"), datetime) else doc.get("posted_at"),
            "expires_at": doc["expires_at"].isoformat() if isinstance(doc.get("expires_at"), datetime) else doc.get("expires_at"),
            "match_score": match_score,
            "matched_skills": m.get("matched_skills", []),
            "verified_matched_skills": m.get("verified_matched_skills", []),
            "resume_skills_matched": m.get("resume_skills_matched", []),
            "missing_skills": m.get("missing_skills", doc.get("required_skills", [])),
            "readiness_status": m.get("readiness_status", "upload_resume_first"),
            "recommendation": m.get("recommendation", ""),
            "role_relevance_summary": m.get("role_relevance_summary", ""),
            "eligibility_concerns": m.get("eligibility_concerns", []),
            "recommended_preparation": m.get("recommended_preparation", []),
            "formula_breakdown": m.get("formula_breakdown", {}),
            "has_applied": has_applied,
            "is_saved": is_saved,
        })

    result.sort(key=lambda j: (-j["match_score"], j["title"] or ""))
    return result


@router.get("/preferences", response_model=StudentJobPreferences)
async def get_student_job_preferences(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """Retrieve personalized job preferences for the authenticated student, with automatic resume-based defaults."""
    uid = current_user.get("firebase_uid") if current_user else "guest"
    prefs = await db.student_job_preferences.find_one({"user_id": uid}) if uid != "guest" else None
    if prefs:
        return StudentJobPreferences(
            target_job_titles=prefs.get("target_job_titles", []),
            preferred_career_paths=prefs.get("preferred_career_paths", []),
            skills_of_interest=prefs.get("skills_of_interest", []),
            preferred_cities=prefs.get("preferred_cities", []),
            work_modes=prefs.get("work_modes", ["Remote", "Hybrid", "Onsite"]),
            employment_types=prefs.get("employment_types", ["Full-time", "Internship"]),
            fresher_or_experienced=prefs.get("fresher_or_experienced", "all"),
            min_salary_lpa=prefs.get("min_salary_lpa"),
            min_stipend_monthly=prefs.get("min_stipend_monthly"),
            preferred_companies=prefs.get("preferred_companies", []),
            excluded_companies=prefs.get("excluded_companies", []),
            notification_frequency=prefs.get("notification_frequency", "immediate"),
            alert_score_threshold=float(prefs.get("alert_score_threshold", 60.0)),
            updated_at=prefs["updated_at"].isoformat() if isinstance(prefs.get("updated_at"), datetime) else prefs.get("updated_at"),
        )

    # Intelligent zero-config sensible defaults derived from profile and resume
    profile = await db.student_profiles.find_one({"user_id": uid}) or {}
    extracted = await db.extracted_skills.find({"user_id": uid}).to_list(length=30)
    skills = [s.get("skill_name") for s in extracted if s.get("skill_name")]

    target_titles = profile.get("target_roles", [])
    if not target_titles and skills:
        if any(s.lower() in ["react", "vue", "angular", "html", "css"] for s in skills):
            target_titles.append("Frontend Developer")
        if any(s.lower() in ["python", "django", "fastapi", "node.js", "java"] for s in skills):
            target_titles.append("Backend Developer")
        if any(s.lower() in ["machine learning", "pytorch", "nlp", "pandas"] for s in skills):
            target_titles.append("AI / ML Engineer")
        if not target_titles:
            target_titles.append("Software Development Engineer")

    grad_year = profile.get("graduation_year")
    fresher_mode = "fresher" if (grad_year and int(grad_year) >= 2025) else "all"

    return StudentJobPreferences(
        target_job_titles=target_titles,
        preferred_career_paths=["Software Engineering", "Full-stack Development"],
        skills_of_interest=skills[:5],
        preferred_cities=profile.get("preferred_locations", ["Bengaluru", "Hyderabad", "Pune", "Remote"]),
        work_modes=profile.get("preferred_work_modes", ["Remote", "Hybrid", "Onsite"]),
        employment_types=["Full-time", "Internship"],
        fresher_or_experienced=fresher_mode,
        min_salary_lpa=6.0,
        min_stipend_monthly=20000.0,
        preferred_companies=[],
        excluded_companies=[],
        notification_frequency="immediate",
        alert_score_threshold=60.0,
    )


@router.put("/preferences", response_model=StudentJobPreferences)
async def update_student_job_preferences(
    req: StudentJobPreferences,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Update personalized job search and early alert preferences, triggering instant re-matching."""
    uid = current_user["firebase_uid"]
    now = datetime.now(timezone.utc)

    doc = {
        "user_id": uid,
        "target_job_titles": req.target_job_titles,
        "preferred_career_paths": req.preferred_career_paths,
        "skills_of_interest": req.skills_of_interest,
        "preferred_cities": req.preferred_cities,
        "work_modes": req.work_modes,
        "employment_types": req.employment_types,
        "fresher_or_experienced": req.fresher_or_experienced,
        "min_salary_lpa": req.min_salary_lpa,
        "min_stipend_monthly": req.min_stipend_monthly,
        "preferred_companies": req.preferred_companies,
        "excluded_companies": req.excluded_companies,
        "notification_frequency": req.notification_frequency,
        "alert_score_threshold": req.alert_score_threshold,
        "updated_at": now,
    }

    await db.student_job_preferences.replace_one({"user_id": uid}, doc, upsert=True)

    try:
        await recalculate_job_matches_for_user(uid, db)
    except Exception:
        pass

    req.updated_at = now.isoformat()
    return req


@router.get("/applications")
async def list_student_applications(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """List all application tracker records for the current student."""
    if not current_user:
        return []
    uid = current_user["firebase_uid"]
    apps = await db.job_applications.find({"user_id": uid}).sort("applied_at", -1).to_list(length=100)
    res = []
    for a in apps:
        a["id"] = str(a.pop("_id"))
        if isinstance(a.get("applied_at"), datetime):
            a["applied_at"] = a["applied_at"].isoformat()
        if isinstance(a.get("updated_at"), datetime):
            a["updated_at"] = a["updated_at"].isoformat()
        res.append(a)
    return res


@router.post("/{job_id}/application-status")
async def update_application_status(
    job_id: str,
    req: JobApplicationStatusUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Update application lifecycle stage (Interested, Applied, Interview, Offer, Rejected) and notes."""
    uid = current_user["firebase_uid"]
    try:
        oid = ObjectId(job_id)
        job_doc = await db.jobs.find_one({"_id": oid})
    except Exception:
        job_doc = await db.jobs.find_one({"external_job_id": job_id})

    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    canonical_job_id = str(job_doc["_id"])
    now = datetime.now(timezone.utc)

    # Calculate match score if not yet present
    match = await db.job_matches.find_one({"user_id": uid, "job_id": canonical_job_id})
    match_score = float(match.get("match_score", 0.0)) if match else 0.0

    update_doc = {
        "$set": {
            "status": req.status,
            "notes": req.notes,
            "interview_date": req.interview_date,
            "application_method": req.application_method,
            "updated_at": now,
        },
        "$setOnInsert": {
            "user_id": uid,
            "job_id": canonical_job_id,
            "job_title": job_doc.get("title"),
            "company": job_doc.get("company"),
            "match_score": match_score,
            "applied_at": now,
        },
    }

    await db.job_applications.update_one(
        {"user_id": uid, "job_id": canonical_job_id},
        update_doc,
        upsert=True,
    )

    return {
        "message": f"Application status updated to {req.status}",
        "job_id": canonical_job_id,
        "status": req.status,
        "notes": req.notes,
        "updated_at": now.isoformat(),
    }



@router.get("/applications/me")
async def get_my_applications(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return jobs applied to by this student."""
    uid = current_user["firebase_uid"]
    docs = await db.job_applications.find({"user_id": uid}).sort("applied_at", -1).to_list(length=100)
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if isinstance(d.get("applied_at"), datetime):
            d["applied_at"] = d["applied_at"].isoformat()
    return docs


@router.post("/{job_id}/apply")
async def apply_to_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Submit a student's application to an active job with authentic match telemetry."""
    uid = current_user["firebase_uid"]
    try:
        oid = ObjectId(job_id)
        job_doc = await db.jobs.find_one({"_id": oid})
    except Exception:
        job_doc = await db.jobs.find_one({"external_job_id": job_id})

    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    canonical_job_id = str(job_doc["_id"])
    existing = await db.job_applications.find_one({"user_id": uid, "job_id": canonical_job_id})
    if existing:
        raise HTTPException(status_code=400, detail="You have already applied to this role")

    match = await db.job_matches.find_one({"user_id": uid, "job_id": canonical_job_id})
    if not match:
        await recalculate_job_matches_for_user(uid, db)
        match = await db.job_matches.find_one({"user_id": uid, "job_id": canonical_job_id})

    match_score = float(match.get("match_score", 0.0)) if match else 0.0
    now = datetime.now(timezone.utc)

    await db.job_applications.insert_one({
        "user_id": uid,
        "job_id": canonical_job_id,
        "job_title": job_doc.get("title"),
        "company": job_doc.get("company"),
        "match_score": match_score,
        "status": "applied",
        "applied_at": now,
    })

    await db.notifications.insert_one({
        "user_id": uid,
        "title": f"Application Recorded: {job_doc.get('company')}",
        "message": f"Applied for {job_doc.get('title')} (Profile Match: {match_score}%).",
        "type": "job",
        "is_read": False,
        "created_at": now,
    })

    await compute_and_store_readiness(uid, db)
    return {
        "message": "Job application recorded",
        "job_id": canonical_job_id,
        "match_score": match_score,
        "status": "applied",
    }


@router.post("/{job_id}/save")
async def toggle_save_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Bookmark or unbookmark a job for the student."""
    uid = current_user["firebase_uid"]
    existing = await db.saved_jobs.find_one({"user_id": uid, "job_id": job_id})
    if existing:
        await db.saved_jobs.delete_one({"_id": existing["_id"]})
        return {"job_id": job_id, "is_saved": False}

    await db.saved_jobs.insert_one({
        "user_id": uid,
        "job_id": job_id,
        "saved_at": datetime.now(timezone.utc),
    })
    return {"job_id": job_id, "is_saved": True}


@router.post("/{job_id}/track-click")
async def track_job_click(
    job_id: str,
    req: ClickTrackRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Privacy-safe telemetry recording when a student opens an authentic external employer link.
    Strictly records student ID, job ID, click type, and timestamp without transmitting personal data to third parties.
    """
    uid = current_user["firebase_uid"]
    try:
        oid = ObjectId(job_id)
        job_doc = await db.jobs.find_one({"_id": oid})
    except Exception:
        job_doc = await db.jobs.find_one({"external_job_id": job_id})

    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)
    await db.job_clicks.insert_one({
        "user_id": uid,
        "job_id": str(job_doc["_id"]),
        "company": job_doc.get("company"),
        "title": job_doc.get("title"),
        "click_type": req.click_type,
        "timestamp": now,
    })

    return {"status": "recorded", "job_id": str(job_doc["_id"]), "click_type": req.click_type}


@router.get("/{job_id}/application-url")
async def get_job_application_url(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Retrieve validated direct employer application or listing URL.
    Validates URL scheme to prevent javascript: or malformed redirects.
    """
    try:
        oid = ObjectId(job_id)
        job_doc = await db.jobs.find_one({"_id": oid})
    except Exception:
        job_doc = await db.jobs.find_one({"external_job_id": job_id})

    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    is_closed = job_doc.get("status") == "expired" or job_doc.get("status") == "closed"
    apply_url = job_doc.get("original_apply_url") or job_doc.get("original_job_url") or ""

    # Validate URL
    parsed = urllib.parse.urlparse(apply_url)
    is_valid_url = parsed.scheme in ("http", "https") and bool(parsed.netloc)

    return {
        "job_id": str(job_doc["_id"]),
        "title": job_doc.get("title"),
        "company": job_doc.get("company"),
        "is_closed": is_closed,
        "has_apply_url": bool(apply_url and is_valid_url),
        "application_url": apply_url if is_valid_url else None,
        "listing_url": job_doc.get("original_job_url"),
        "action_label": "Closed" if is_closed else ("Apply on Employer Site" if apply_url else "View Listing"),
    }


@router.post("")
async def create_job_admin(
    req: CreateJobRequest,
    admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin-only: Publish a new verified placement job opportunity."""
    now = datetime.now(timezone.utc)
    doc = {
        "external_job_id": f"admin-{int(now.timestamp())}",
        "title": req.title,
        "company": req.company,
        "location": req.location,
        "work_mode": req.work_mode,
        "salary": req.salary,
        "description": req.description,
        "required_skills": req.required_skills,
        "preferred_skills": req.preferred_skills,
        "eligibility": req.eligibility,
        "employment_type": req.employment_type,
        "original_apply_url": req.original_apply_url,
        "original_job_url": req.original_job_url or req.original_apply_url,
        "source_name": "Admin Direct Posting",
        "source_type": "direct",
        "status": "active",
        "posted_by": admin.get("email"),
        "posted_at": now,
        "last_seen_at": now,
        "expires_at": now + timedelta(days=60),
    }
    res = await db.jobs.insert_one(doc)
    return {"id": str(res.inserted_id), "message": "Job opportunity published", "title": req.title}
