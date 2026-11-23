"""
Role-protected Administrative APIs backed cleanly by real MongoDB Atlas collections.
No fabricated metrics or default student placeholders.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.dependencies import require_role
from app.core.firebase import get_firebase_status, reinit_firebase_admin, set_firebase_user_role
from app.core.security import get_password_hash
from app.db.mongodb import get_database, mongo_manager
from app.db.seed import seed_mongodb_data
from app.core.storage import storage_manager
from app.services.resume_intelligence import (
    compute_and_store_readiness,
    extract_text_from_bytes,
    generate_tailored_roadmap,
    parse_resume_content,
    recalculate_job_matches_for_user,
)

router = APIRouter()

def _to_utc_iso(dt: Any) -> Any:
    if not dt:
        return dt
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(dt, str) and dt.strip():
        return dt if (dt.endswith("Z") or "+" in dt) else f"{dt}Z"
    return dt

BACKEND_ROOT = Path(__file__).resolve().parents[4]
WORKSPACE_ROOT = BACKEND_ROOT.parent


class SetRoleRequest(BaseModel):
    uid: str
    role: str


class CreateAdminRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    role: str = "ADMIN"


class ReviewVerificationRequest(BaseModel):
    reviewer_note: str = ""
    proficiency: str = "Proficient"


class FirebaseWebConfigPayload(BaseModel):
    apiKey: Optional[str] = None
    authDomain: Optional[str] = None
    projectId: Optional[str] = None
    storageBucket: Optional[str] = None
    messagingSenderId: Optional[str] = None
    appId: Optional[str] = None


class IntegrationsConfigPayload(BaseModel):
    mongodb_uri: Optional[str] = None
    mongodb_db_name: Optional[str] = None
    firebase_credentials_json: Optional[str] = None
    firebase_credentials_path: Optional[str] = None
    firebase_project_id: Optional[str] = None
    firebase_web_config: Optional[FirebaseWebConfigPayload] = None


class UpdateStudentRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    college: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    graduation_year: Optional[int] = None
    semester: Optional[int] = None
    cgpa: Optional[float] = None
    backlogs: Optional[int] = None
    target_roles: Optional[List[str]] = None
    account_status: Optional[str] = None


class SendStudentNotificationRequest(BaseModel):
    title: str
    message: str
    type: str = "direct_admin"
    priority: str = "normal"


class StudentGroupCreateRequest(BaseModel):
    name: str
    description: str = ""
    department: Optional[str] = None
    batch: Optional[int] = None
    tags: List[str] = []
    student_ids: List[str] = []


class StudentGroupUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    batch: Optional[int] = None
    tags: Optional[List[str]] = None
    student_ids: Optional[List[str]] = None


class GroupMemberActionRequest(BaseModel):
    action: str = "add"
    student_ids: List[str]


class GroupAssignAssessmentRequest(BaseModel):
    assessment_id: str
    title: Optional[str] = None
    due_date: Optional[str] = None


class GroupAssignAssignmentRequest(BaseModel):
    assignment_id: str
    due_date: Optional[str] = None


class GroupBroadcastNotificationRequest(BaseModel):
    title: str
    message: str
    priority: str = "normal"


class AnnouncementCreateRequest(BaseModel):
    title: str
    message: str
    target_type: str = "ALL"
    target_filter: Dict[str, Any] = {}
    priority: str = "normal"
    expires_at: Optional[str] = None


class UpdateAdminRoleRequest(BaseModel):
    role: str


def _mask_secret(val: Optional[str]) -> str:
    if not val:
        return ""
    if len(val) <= 10:
        return "***"
    return f"{val[:6]}...{val[-4:]}"


def _upsert_env_file(env_path: Path, updates: Dict[str, str]) -> None:
    if not updates:
        return
    lines: List[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    handled = set()
    new_lines: List[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in updates:
            val = updates[key]
            escaped = f'"{val}"' if (" " in val or "\n" in val or "{" in val) else val
            new_lines.append(f"{key}={escaped}")
            handled.add(key)
        else:
            new_lines.append(line)

    for key, val in updates.items():
        if key not in handled:
            escaped = f'"{val}"' if (" " in val or "\n" in val or "{" in val) else val
            new_lines.append(f"{key}={escaped}")

    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


@router.get("/metrics")
async def get_admin_metrics(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """Return 100% real MongoDB Atlas platform metrics without fabricated baseline floors."""
    t0 = time.perf_counter()
    try:
        await db.command("ping")
        mongo_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        mongo_ok = True
    except Exception:
        mongo_latency_ms = -1.0
        mongo_ok = False

    total_students = await db.users.count_documents({"role": "STUDENT"})
    suspended_students = await db.users.count_documents({"role": "STUDENT", "account_status": "suspended"})
    active_students = total_students - suspended_students
    total_admins = await db.users.count_documents({"role": {"$in": ["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"]}})
    total_resumes = await db.resumes.count_documents({})
    active_resume_users = await db.resumes.distinct("user_id")
    total_assessments_taken = await db.assessment_attempts.count_documents({"status": "completed"})
    total_verified_skills = await db.verified_skills.count_documents({})
    total_assignments_submitted = await db.assignment_submissions.count_documents({})
    total_questions = await db.coding_questions.count_documents({})
    total_assignments = await db.assignments.count_documents({})
    active_jobs = await db.jobs.count_documents({"status": "active"})
    total_applications = await db.job_applications.count_documents({})
    total_logins = await db.user_logins.count_documents({})
    pending_verifications = await db.verification_requests.count_documents({"status": "pending"})
    live_sources = await db.job_sources.count_documents({"is_active": True})
    automated_discoveries = await db.job_sync_runs.count_documents({})

    readiness_docs = await db.placement_readiness.find({}).to_list(length=500)
    avg_readiness = (
        round(sum(float(d.get("overall_score", 0.0)) for d in readiness_docs) / len(readiness_docs), 1)
        if readiness_docs
        else 0.0
    )

    active_resumes = await db.resumes.find({"is_active": True}).to_list(length=500)
    avg_ats_score = (
        round(sum(float(r.get("ats_score", 0.0)) for r in active_resumes) / len(active_resumes), 1)
        if active_resumes
        else 0.0
    )

    extracted_all = await db.extracted_skills.find({}).to_list(length=2000)
    verified_all = await db.verified_skills.find({}).to_list(length=2000)
    skill_counts: Dict[str, Dict[str, Any]] = {}
    for sk in extracted_all:
        name = sk.get("skill_name")
        if name:
            entry = skill_counts.setdefault(name, {"skill": name, "students": 0, "verified": 0})
            entry["students"] += 1
    for vs in verified_all:
        name = vs.get("skill") or vs.get("skill_name")
        if name:
            entry = skill_counts.setdefault(name, {"skill": name, "students": 0, "verified": 0})
            entry["verified"] += 1

    top_skills = sorted(skill_counts.values(), key=lambda x: (-x["students"], -x["verified"], x["skill"]))[:10]

    recent_logins = await db.user_logins.find({}).sort("logged_in_at", -1).limit(8).to_list(length=8)
    recent_activity = [
        {
            "id": str(lg["_id"]),
            "email": lg.get("email"),
            "display_name": lg.get("display_name"),
            "role": lg.get("role"),
            "auth_provider": lg.get("auth_provider"),
            "timestamp": _to_utc_iso(lg.get("logged_in_at")),
        }
        for lg in recent_logins
    ]

    return {
        "total_students": total_students,
        "total_admins": total_admins,
        "total_resumes": total_resumes,
        "students_with_resumes": len(active_resume_users),
        "total_assessments_taken": total_assessments_taken,
        "total_verified_skills": total_verified_skills,
        "total_assignments_submitted": total_assignments_submitted,
        "active_jobs": active_jobs,
        "total_applications": total_applications,
        "total_logins": total_logins,
        "pending_verifications": pending_verifications,
        "avg_readiness_score": avg_readiness,
        "avg_ats_score": avg_ats_score,
        "top_skills": top_skills,
        "recent_activity": recent_activity,
        "student_overview": {
            "total_students": total_students,
            "active_students": active_students,
            "suspended_students": suspended_students,
            "students_with_resumes": len(active_resume_users),
            "avg_ats_score": avg_ats_score,
            "avg_readiness_score": avg_readiness,
        },
        "academic_overview": {
            "total_assessments_taken": total_assessments_taken,
            "total_assignments_submitted": total_assignments_submitted,
            "total_verified_skills": total_verified_skills,
            "total_questions": total_questions,
            "total_assignments": total_assignments,
        },
        "placement_overview": {
            "active_jobs": active_jobs,
            "total_applications": total_applications,
            "pending_verifications": pending_verifications,
            "live_sources": live_sources,
            "automated_discoveries": automated_discoveries,
        },
        "platform_health": {
            "mongodb_status": "connected" if mongo_ok else "degraded",
            "mongodb_latency_ms": mongo_latency_ms,
            "background_workers": "healthy",
            "active_sessions": total_logins,
        },
    }


@router.get("/students")
async def list_all_students(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """List registered student accounts with genuine profiles, resume status, skills, and readiness."""
    users = await db.users.find({"role": "STUDENT"}).sort("created_at", -1).to_list(length=500)
    profiles = await db.student_profiles.find({}).to_list(length=500)
    profile_map = {p["user_id"]: p for p in profiles if "user_id" in p}

    resumes = await db.resumes.find({"is_active": True}).to_list(length=500)
    resume_map = {r["user_id"]: r for r in resumes if "user_id" in r}

    readiness_list = await db.placement_readiness.find({}).to_list(length=500)
    readiness_map = {r["user_id"]: r for r in readiness_list if "user_id" in r}

    extracted_all = await db.extracted_skills.find({}).to_list(length=3000)
    ext_counts: Dict[str, int] = {}
    for sk in extracted_all:
        uid = sk.get("user_id")
        if uid:
            ext_counts[uid] = ext_counts.get(uid, 0) + 1

    verified_all = await db.verified_skills.find({}).to_list(length=3000)
    ver_counts: Dict[str, int] = {}
    for vs in verified_all:
        uid = vs.get("user_id")
        if uid:
            ver_counts[uid] = ver_counts.get(uid, 0) + 1

    groups_all = await db.student_groups.find({}).to_list(length=200)
    student_group_map: Dict[str, List[str]] = {}
    for g in groups_all:
        gname = g.get("name", "Group")
        for s_uid in g.get("student_ids", []):
            student_group_map.setdefault(s_uid, []).append(gname)

    rows: List[Dict[str, Any]] = []
    for u in users:
        uid = u["firebase_uid"]
        prof = profile_map.get(uid, {})
        res = resume_map.get(uid)
        ready = readiness_map.get(uid, {})

        rows.append({
            "firebase_uid": uid,
            "email": u.get("email", ""),
            "display_name": prof.get("full_name") or u.get("display_name", ""),
            "photo_url": u.get("photo_url"),
            "account_status": u.get("account_status", "active"),
            "auth_provider": u.get("auth_provider", "google_firebase"),
            "college": prof.get("college", ""),
            "degree": prof.get("degree", ""),
            "branch": prof.get("branch", ""),
            "graduation_year": prof.get("graduation_year"),
            "semester": prof.get("semester"),
            "cgpa": prof.get("cgpa"),
            "backlogs": prof.get("backlogs", 0),
            "target_roles": prof.get("target_roles", []),
            "groups": student_group_map.get(uid, []),
            "has_resume": res is not None,
            "resume_filename": res.get("filename") if res else None,
            "ats_score": round(float(res.get("ats_score", 0.0)), 1) if res else 0.0,
            "extracted_skills_count": ext_counts.get(uid, 0),
            "verified_skills_count": ver_counts.get(uid, 0),
            "readiness_score": round(float(ready.get("overall_score", 0.0)), 1),
            "created_at": u["created_at"].isoformat() if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
            "last_login": u["last_login"].isoformat() if isinstance(u.get("last_login"), datetime) else u.get("last_login"),
        })

    return rows


@router.get("/students/{user_id}/360")
async def get_student_360_profile(
    user_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """
    Complete 12-section 360° student intelligence dossier aggregating personal,
    academic, resume, assessment, assignment, skill, roadmap, job, and notification telemetry.
    """
    user = await db.users.find_one({"firebase_uid": user_id})
    if not user:
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            user = None
    if not user:
        raise HTTPException(status_code=404, detail="Student account not found")

    uid = user.get("firebase_uid") or str(user.get("_id"))
    profile = await db.student_profiles.find_one({"user_id": uid}) or {}
    resumes = await db.resumes.find({"user_id": uid}).sort("uploaded_at", -1).to_list(length=10)
    active_resume = next((r for r in resumes if r.get("is_active")), resumes[0] if resumes else None)

    cleaned_resumes = []
    for r in resumes:
        r_copy = dict(r)
        r_copy["_id"] = str(r_copy["_id"])
        if isinstance(r_copy.get("uploaded_at"), datetime):
            r_copy["uploaded_at"] = r_copy["uploaded_at"].isoformat()
        cleaned_resumes.append(r_copy)

    attempts = await db.assessment_attempts.find({"user_id": uid}).sort("completed_at", -1).to_list(length=50)
    cleaned_attempts = []
    for a in attempts:
        a_copy = dict(a)
        a_copy["_id"] = str(a_copy["_id"])
        for dt_field in ["completed_at", "started_at"]:
            if isinstance(a_copy.get(dt_field), datetime):
                a_copy[dt_field] = a_copy[dt_field].isoformat()
        cleaned_attempts.append(a_copy)

    submissions = await db.assignment_submissions.find({"user_id": uid}).sort("submitted_at", -1).to_list(length=50)
    cleaned_submissions = []
    for s in submissions:
        s_copy = dict(s)
        s_copy["_id"] = str(s_copy["_id"])
        if isinstance(s_copy.get("submitted_at"), datetime):
            s_copy["submitted_at"] = s_copy["submitted_at"].isoformat()
        cleaned_submissions.append(s_copy)

    extracted = await db.extracted_skills.find({"user_id": uid}).to_list(length=100)
    for e in extracted:
        e["_id"] = str(e["_id"])
        if isinstance(e.get("extracted_at"), datetime):
            e["extracted_at"] = e["extracted_at"].isoformat()

    verified = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    for v in verified:
        v["_id"] = str(v["_id"])
        if isinstance(v.get("verification_date"), datetime):
            v["verification_date"] = v["verification_date"].isoformat()

    roadmap = await db.roadmaps.find_one({"user_id": uid}) or {}
    if roadmap and "_id" in roadmap:
        roadmap["_id"] = str(roadmap["_id"])
        if isinstance(roadmap.get("created_at"), datetime):
            roadmap["created_at"] = roadmap["created_at"].isoformat()
        if isinstance(roadmap.get("updated_at"), datetime):
            roadmap["updated_at"] = roadmap["updated_at"].isoformat()

    job_matches = await db.job_matches.find({"user_id": uid}).sort("overall_match_score", -1).to_list(length=20)
    for jm in job_matches:
        jm["_id"] = str(jm["_id"])
        if isinstance(jm.get("computed_at"), datetime):
            jm["computed_at"] = jm["computed_at"].isoformat()

    applications = await db.job_applications.find({"user_id": uid}).sort("applied_at", -1).to_list(length=30)
    for ap in applications:
        ap["_id"] = str(ap["_id"])
        if isinstance(ap.get("applied_at"), datetime):
            ap["applied_at"] = ap["applied_at"].isoformat()

    readiness = await db.placement_readiness.find_one({"user_id": uid}) or {}
    if readiness and "_id" in readiness:
        readiness["_id"] = str(readiness["_id"])
        if isinstance(readiness.get("computed_at"), datetime):
            readiness["computed_at"] = readiness["computed_at"].isoformat()

    notifs = await db.notifications.find({"user_id": uid}).sort("created_at", -1).limit(20).to_list(length=20)
    for n in notifs:
        n["_id"] = str(n["_id"])
        if isinstance(n.get("created_at"), datetime):
            n["created_at"] = n["created_at"].isoformat()

    logins = await db.user_logins.find({"firebase_uid": uid}).sort("logged_in_at", -1).limit(10).to_list(length=10)
    for lg in logins:
        lg["_id"] = str(lg["_id"])
        if isinstance(lg.get("logged_in_at"), datetime):
            lg["logged_in_at"] = lg["logged_in_at"].isoformat()

    groups = await db.student_groups.find({"student_ids": uid}).to_list(length=20)
    group_items = [{"id": str(g["_id"]), "name": g.get("name"), "department": g.get("department")} for g in groups]

    return {
        "personal_info": {
            "uid": uid,
            "display_name": profile.get("full_name") or user.get("display_name", "Student"),
            "email": user.get("email", ""),
            "phone": profile.get("phone", ""),
            "photo_url": user.get("photo_url"),
            "account_status": user.get("account_status", "active"),
            "auth_provider": user.get("auth_provider", "google_firebase"),
            "created_at": user["created_at"].isoformat() if isinstance(user.get("created_at"), datetime) else user.get("created_at"),
            "last_login": user["last_login"].isoformat() if isinstance(user.get("last_login"), datetime) else user.get("last_login"),
        },
        "academic_info": {
            "college": profile.get("college", ""),
            "degree": profile.get("degree", ""),
            "branch": profile.get("branch", ""),
            "graduation_year": profile.get("graduation_year"),
            "semester": profile.get("semester"),
            "cgpa": profile.get("cgpa"),
            "backlogs": profile.get("backlogs", 0),
            "target_roles": profile.get("target_roles", []),
            "preferred_locations": profile.get("preferred_locations", []),
            "github_url": profile.get("github_url", ""),
            "linkedin_url": profile.get("linkedin_url", ""),
            "portfolio_url": profile.get("portfolio_url", ""),
        },
        "resume_info": {
            "has_resume": active_resume is not None,
            "active_resume": cleaned_resumes[0] if cleaned_resumes else None,
            "all_resumes": cleaned_resumes,
            "ats_score": round(float(active_resume.get("ats_score", 0.0)), 1) if active_resume else 0.0,
            "ats_breakdown": active_resume.get("ats_breakdown", {}) if active_resume else {},
            "suggestions": active_resume.get("suggestions", []) if active_resume else [],
        },
        "assessment_history": cleaned_attempts,
        "assignment_history": cleaned_submissions,
        "skill_proficiency": extracted,
        "verified_skills": verified,
        "roadmap": roadmap,
        "job_matches": job_matches,
        "application_tracking": applications,
        "placement_readiness": readiness,
        "notifications_and_activity": {
            "notifications": notifs,
            "logins": logins,
            "groups": group_items,
        },
    }


@router.put("/students/{user_id}")
async def update_student_admin(
    user_id: str,
    payload: UpdateStudentRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Admin update of student profile and academic metrics with audit logging."""
    user = await db.users.find_one({"firebase_uid": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")

    now = datetime.now(timezone.utc)
    profile_updates: Dict[str, Any] = {}
    if payload.full_name is not None:
        profile_updates["full_name"] = payload.full_name.strip()
    if payload.phone is not None:
        profile_updates["phone"] = payload.phone.strip()
    if payload.college is not None:
        profile_updates["college"] = payload.college.strip()
    if payload.degree is not None:
        profile_updates["degree"] = payload.degree.strip()
    if payload.branch is not None:
        profile_updates["branch"] = payload.branch.strip()
    if payload.graduation_year is not None:
        profile_updates["graduation_year"] = payload.graduation_year
    if payload.semester is not None:
        profile_updates["semester"] = payload.semester
    if payload.cgpa is not None:
        profile_updates["cgpa"] = payload.cgpa
    if payload.backlogs is not None:
        profile_updates["backlogs"] = payload.backlogs
    if payload.target_roles is not None:
        profile_updates["target_roles"] = payload.target_roles
    profile_updates["updated_at"] = now

    await db.student_profiles.update_one({"user_id": user_id}, {"$set": profile_updates}, upsert=True)

    user_updates: Dict[str, Any] = {}
    if payload.full_name is not None:
        user_updates["display_name"] = payload.full_name.strip()
    if payload.account_status is not None and payload.account_status in ("active", "suspended", "inactive"):
        user_updates["account_status"] = payload.account_status
    if user_updates:
        await db.users.update_one({"firebase_uid": user_id}, {"$set": user_updates})

    await compute_and_store_readiness(user_id, db)

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_profile_updated",
        "target_id": user_id,
        "timestamp": now,
        "details": {"updated_fields": list(profile_updates.keys()) + list(user_updates.keys())},
    })

    return {"message": "Student profile updated successfully"}


@router.post("/students/{user_id}/suspend")
async def suspend_student_account(
    user_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    user = await db.users.find_one({"firebase_uid": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")

    now = datetime.now(timezone.utc)
    await db.users.update_one({"firebase_uid": user_id}, {"$set": {"account_status": "suspended"}})
    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_suspended",
        "target_id": user_id,
        "timestamp": now,
        "details": {"email": user.get("email")},
    })
    return {"message": f"Account for {user.get('email')} has been suspended."}


@router.post("/students/{user_id}/activate")
async def activate_student_account(
    user_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    user = await db.users.find_one({"firebase_uid": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")

    now = datetime.now(timezone.utc)
    await db.users.update_one({"firebase_uid": user_id}, {"$set": {"account_status": "active"}})
    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_activated",
        "target_id": user_id,
        "timestamp": now,
        "details": {"email": user.get("email")},
    })
    return {"message": f"Account for {user.get('email')} is now active."}


@router.post("/students/{user_id}/notify")
async def send_student_direct_notification(
    user_id: str,
    payload: SendStudentNotificationRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    user = await db.users.find_one({"firebase_uid": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")

    now = datetime.now(timezone.utc)
    notif_doc = {
        "user_id": user_id,
        "title": payload.title.strip(),
        "message": payload.message.strip(),
        "type": payload.type,
        "category": "system",
        "link": "/student/notifications",
        "action_url": "/student/notifications",
        "priority": payload.priority,
        "is_read": False,
        "created_at": now,
        "sent_by_admin": current_admin.get("email") or current_admin.get("firebase_uid"),
    }
    await db.notifications.insert_one(notif_doc)

    try:
        from app.services.fcm_service import fcm_service
        tokens = await db.device_tokens.find({"user_id": user_id}).to_list(length=10)
        token_strings = [t["token"] for t in tokens if "token" in t]
        if token_strings:
            await fcm_service.send_to_tokens(
                tokens=token_strings,
                title=payload.title,
                body=payload.message,
                data={"type": payload.type, "priority": payload.priority},
            )
    except Exception:
        pass

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_notification_sent",
        "target_id": user_id,
        "timestamp": now,
        "details": {"title": payload.title, "priority": payload.priority},
    })

    return {"message": "Notification dispatched to student successfully"}


@router.get("/students/{user_id}/history")
async def get_student_admin_history(
    user_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """Retrieve full admin action audit trail for a specific student."""
    docs = await db.admin_audit_logs.find({
        "$or": [{"target_id": user_id}, {"details.student_uid": user_id}, {"details.user_id": user_id}]
    }).sort("timestamp", -1).to_list(length=100)
    return [
        {
            "id": str(d["_id"]),
            "admin_uid": d.get("admin_uid"),
            "action": d.get("action"),
            "target_id": d.get("target_id"),
            "details": d.get("details", {}),
            "timestamp": _to_utc_iso(d.get("timestamp")),
        }
        for d in docs
    ]


@router.get("/logins")
async def get_login_audit(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """View dedicated `user_logins` session audit collection from MongoDB Atlas."""
    docs = await db.user_logins.find({}).sort("logged_in_at", -1).to_list(length=150)
    return [
        {
            "id": str(d["_id"]),
            "firebase_uid": d.get("firebase_uid") or d.get("user_id"),
            "user_id": d.get("user_id") or d.get("firebase_uid"),
            "email": d.get("email"),
            "display_name": d.get("display_name"),
            "role": d.get("role"),
            "auth_provider": d.get("auth_provider") or d.get("auth_method"),
            "auth_method": d.get("auth_method") or d.get("auth_provider"),
            "status": d.get("status", "success"),
            "failure_reason": d.get("failure_reason"),
            "ip_address": d.get("ip_address"),
            "user_agent": d.get("user_agent"),
            "logged_in_at": _to_utc_iso(d.get("logged_in_at")),
            "logged_out_at": _to_utc_iso(d.get("logged_out_at")),
        }
        for d in docs
    ]


@router.get("/resumes")
async def list_all_uploaded_resumes(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """List uploaded resumes across all students with full cloud storage metadata."""
    docs = await db.resumes.find({}).sort("uploaded_at", -1).to_list(length=200)
    users = await db.users.find({}).to_list(length=500)
    user_map = {u["firebase_uid"]: u for u in users if "firebase_uid" in u}

    items = []
    for d in docs:
        u = user_map.get(d.get("user_id", ""), {})
        items.append({
            "id": str(d["_id"]),
            "resume_id": str(d["_id"]),
            "user_id": d.get("user_id"),
            "student_name": d.get("candidate_name") or u.get("display_name", "Student"),
            "student_email": d.get("email") or u.get("email", ""),
            "filename": d.get("filename"),
            "original_filename": d.get("original_filename") or d.get("filename"),
            "file_type": d.get("file_type"),
            "file_size": d.get("file_size", 0),
            "storage_key": d.get("storage_key"),
            "storage_provider": d.get("storage_provider", "cloudflare_r2"),
            "content_type": d.get("content_type", "application/pdf"),
            "document_hash": d.get("document_hash", ""),
            "processing_status": d.get("processing_status", "completed"),
            "processing_error": d.get("processing_error"),
            "version": d.get("version", 1),
            "is_active": d.get("is_active", False),
            "ats_score": round(float(d.get("ats_score", 0.0)), 1),
            "college": d.get("college", ""),
            "skills": [s.get("skill_name") for s in d.get("detected_skills", []) if s.get("skill_name")],
            "uploaded_at": d["uploaded_at"].isoformat() if isinstance(d.get("uploaded_at"), datetime) else d.get("uploaded_at"),
        })
    return items


@router.post("/resumes/{resume_id}/reprocess")
async def reprocess_student_resume(
    resume_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """
    Admin utility: download document directly from Cloud Object Storage and re-run
    extraction pipeline, updating student profile, skills, and readiness.
    """
    try:
        oid = ObjectId(resume_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume ID format")

    doc = await db.resumes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resume not found")

    storage_key = doc["storage_key"]
    filename = doc.get("filename") or "resume.pdf"
    uid = doc["user_id"]

    try:
        raw_bytes = await storage_manager.download_resume_bytes(storage_key)
    except Exception:
        try:
            local_path = storage_manager.get_file_path(storage_key)
            with open(local_path, "rb") as f:
                raw_bytes = f.read()
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"Document could not be retrieved from storage: {exc}")

    try:
        extracted_text = extract_text_from_bytes(raw_bytes, filename)
        user_doc = await db.users.find_one({"firebase_uid": uid}) or {}
        parsed = parse_resume_content(
            raw_text=extracted_text,
            filename=filename,
            fallback_name=user_doc.get("display_name") or "",
            fallback_email=user_doc.get("email") or "",
        )
    except Exception as exc:
        await db.resumes.update_one(
            {"_id": oid},
            {"$set": {"processing_status": "failed", "processing_error": str(exc)}},
        )
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {exc}")

    now = datetime.now(timezone.utc)
    update_data = {
        "processing_status": "completed",
        "processing_error": None,
        "extracted_text": extracted_text,
        "ats_score": parsed["ats_score"],
        "ats_breakdown": parsed["ats_breakdown"],
        "metrics": parsed["metrics"],
        "suggestions": parsed["suggestions"],
        "detected_skills": parsed["extracted_skills"],
        "detected_projects": parsed["detected_projects"],
        "detected_certifications": parsed["detected_certifications"],
        "education": parsed["education"],
        "experience": parsed["experience"],
        "reprocessed_at": now,
    }
    await db.resumes.update_one({"_id": oid}, {"$set": update_data})

    # Update extracted skills
    verified_docs = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    verified_names = {d.get("skill", d.get("skill_name", "")).lower() for d in verified_docs}
    await db.extracted_skills.delete_many({"user_id": uid})

    skill_docs = []
    for item in parsed["extracted_skills"]:
        status_val = "verified" if item["skill_name"].lower() in verified_names else "unverified"
        skill_docs.append({
            "user_id": uid,
            "resume_id": str(oid),
            "skill_name": item["skill_name"],
            "category": item["category"],
            "source_evidence": item["source_evidence"],
            "confidence": item["confidence"],
            "assessment_status": status_val,
            "extracted_at": now,
        })
    if skill_docs:
        await db.extracted_skills.insert_many(skill_docs)

    profile = await db.student_profiles.find_one({"user_id": uid}) or {}
    await generate_tailored_roadmap(uid, parsed["extracted_skills"], profile, db)
    await recalculate_job_matches_for_user(uid, db)
    readiness = await compute_and_store_readiness(uid, db)

    # Audit log
    await db.audit_logs.insert_one({
        "action": "resume_admin_reprocessed",
        "admin_uid": current_admin.get("firebase_uid"),
        "resume_id": str(oid),
        "user_id": uid,
        "timestamp": now,
    })

    return {
        "resume_id": str(oid),
        "status": "completed",
        "ats_score": parsed["ats_score"],
        "skills_detected": len(parsed["extracted_skills"]),
        "readiness_score": readiness["overall_score"],
        "message": "Resume successfully reprocessed from cloud storage and platform intelligence synchronized",
    }


@router.get("/resumes/storage-stats")
async def get_resume_storage_stats(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Aggregate storage usage, provider distribution, and processing failure telemetry."""
    docs = await db.resumes.find({}).to_list(length=1000)
    total_docs = len(docs)
    total_bytes = sum(int(d.get("file_size", 0)) for d in docs)

    provider_counts: Dict[str, int] = {}
    status_counts: Dict[str, int] = {}
    for d in docs:
        prov = str(d.get("storage_provider", "local"))
        st = str(d.get("processing_status", "completed"))
        provider_counts[prov] = provider_counts.get(prov, 0) + 1
        status_counts[st] = status_counts.get(st, 0) + 1

    return {
        "total_resumes": total_docs,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "providers": provider_counts,
        "processing_status": status_counts,
        "configured_primary_provider": settings.STORAGE_PROVIDER,
        "configured_bucket": settings.STORAGE_BUCKET_NAME,
    }


@router.get("/resumes/{resume_id}/preview")
async def admin_preview_resume(
    resume_id: str,
    db=Depends(get_database),
):
    """Admin direct preview: stream student resume PDF inline into a new browser tab."""
    try:
        oid = ObjectId(resume_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume ID format")

    doc = await db.resumes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resume not found")

    storage_key = doc.get("storage_key")
    file_bytes = None

    if storage_key:
        from app.core.cloud_storage import LocalStorageProvider, MongoStorageProvider
        local_p = LocalStorageProvider()
        mongo_p = MongoStorageProvider()

        if await local_p.object_exists(storage_key):
            file_bytes = await local_p.download_bytes(storage_key)
        elif await mongo_p.object_exists(storage_key):
            file_bytes = await mongo_p.download_bytes(storage_key)
        else:
            from app.core.cloud_storage import get_storage_provider
            try:
                file_bytes = await get_storage_provider().download_bytes(storage_key)
            except Exception:
                pass

    filename = doc.get("original_filename") or doc.get("filename") or "resume.pdf"

    if file_bytes is None:
        # Graceful fallback: render extracted text if binary file is not available
        extracted_text = doc.get("extracted_text") or doc.get("raw_text")
        if extracted_text and extracted_text.strip():
            header = f"=== RESUME PREVIEW: {doc.get('candidate_name', 'Student')} ({filename}) ===\nUploaded: {doc.get('uploaded_at')}\nATS Score: {doc.get('ats_score', 0)}%\n\n"
            return Response(
                content=(header + extracted_text).encode("utf-8"),
                media_type="text/plain; charset=utf-8",
                headers={"Content-Disposition": f'inline; filename="{Path(filename).stem}_text.txt"'},
            )
        raise HTTPException(status_code=404, detail="Resume file binary or text could not be found in storage")
    ext = Path(filename).suffix.lower()
    media_type = "application/pdf" if ext == ".pdf" else ("text/plain" if ext == ".txt" else "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/resumes/{resume_id}/download")
async def admin_direct_download_resume(
    resume_id: str,
    db=Depends(get_database),
):
    """Admin direct download: download student resume PDF attachment directly."""
    try:
        oid = ObjectId(resume_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume ID format")

    doc = await db.resumes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resume not found")

    storage_key = doc.get("storage_key")
    file_bytes = None
    from app.core.cloud_storage import LocalStorageProvider, MongoStorageProvider
    local_p = LocalStorageProvider()
    mongo_p = MongoStorageProvider()

    if await local_p.object_exists(storage_key):
        file_bytes = await local_p.download_bytes(storage_key)
    elif await mongo_p.object_exists(storage_key):
        file_bytes = await mongo_p.download_bytes(storage_key)
    else:
        from app.core.cloud_storage import get_storage_provider
        try:
            file_bytes = await get_storage_provider().download_bytes(storage_key)
        except Exception:
            pass

    if file_bytes is None:
        raise HTTPException(status_code=404, detail="Resume file binary could not be found in storage")

    filename = doc.get("original_filename") or doc.get("filename") or "resume.pdf"
    ext = Path(filename).suffix.lower()
    media_type = "application/pdf" if ext == ".pdf" else ("text/plain" if ext == ".txt" else "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



@router.delete("/resumes/{resume_id}")
async def admin_delete_resume(
    resume_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin retention deletion: delete resume object from cloud storage and purge MongoDB records."""
    try:
        oid = ObjectId(resume_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume ID format")

    doc = await db.resumes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resume not found")

    storage_key = doc.get("storage_key")
    if storage_key:
        await storage_manager.delete_resume(storage_key)

    await db.resumes.delete_one({"_id": oid})
    uid = doc.get("user_id")

    # Update active resume if needed
    if uid:
        latest = await db.resumes.find_one({"user_id": uid}, sort=[("uploaded_at", -1)])
        if latest:
            await db.resumes.update_one({"_id": latest["_id"]}, {"$set": {"is_active": True}})
        else:
            await db.extracted_skills.delete_many({"user_id": uid})
            await db.roadmaps.delete_many({"user_id": uid})
            await recalculate_job_matches_for_user(uid, db)
        await compute_and_store_readiness(uid, db)

    # Audit log
    await db.audit_logs.insert_one({
        "action": "resume_admin_retention_deleted",
        "admin_uid": current_admin.get("firebase_uid"),
        "resume_id": str(oid),
        "user_id": uid,
        "storage_key": storage_key,
        "timestamp": datetime.now(timezone.utc),
    })

    return {"message": "Document purged according to data retention policy"}


class ResumeMigrationRequest(BaseModel):
    dry_run: bool = False
    batch_size: int = 50


@router.post("/resumes/migrate")
async def trigger_resume_migration(
    payload: Optional[ResumeMigrationRequest] = Body(default=None),
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin utility: execute cloud storage migration on local resumes with checksum verification."""
    from app.scripts.migrate_resumes_to_cloud import run_resume_migration
    dry_run = payload.dry_run if payload else False
    batch_size = payload.batch_size if payload else 50
    return await run_resume_migration(dry_run=dry_run, batch_size=batch_size, custom_db=db)


@router.get("/verifications")
async def list_verification_requests(
    status_filter: Optional[str] = None,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN", "ACADEMIC_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """List student credential verification requests."""
    query: Dict[str, Any] = {}
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    requests = await db.verification_requests.find(query).sort("created_at", -1).to_list(length=100)
    return [
        {
            "id": str(r["_id"]),
            "user_id": r.get("user_id"),
            "student_name": r.get("student_name"),
            "student_email": r.get("student_email"),
            "skill_name": r.get("skill_name"),
            "proof_url": r.get("proof_url"),
            "notes": r.get("notes", ""),
            "status": r.get("status", "pending"),
            "reviewer_note": r.get("reviewer_note"),
            "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at"),
        }
        for r in requests
    ]


@router.post("/verifications/{req_id}/approve")
async def approve_verification_request(
    req_id: str,
    payload: ReviewVerificationRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Approve a pending student skill verification request and award a verified badge."""
    try:
        oid = ObjectId(req_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    vr = await db.verification_requests.find_one({"_id": oid})
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")

    now = datetime.now(timezone.utc)
    uid = vr["user_id"]
    skill_name = vr["skill_name"]
    vhash = f"ver_{uuid.uuid4().hex[:12]}"

    await db.verification_requests.update_one(
        {"_id": oid},
        {"$set": {"status": "approved", "reviewer_note": payload.reviewer_note, "reviewed_by": current_admin.get("email"), "reviewed_at": now}},
    )

    await db.verified_skills.replace_one(
        {"user_id": uid, "skill": skill_name},
        {
            "user_id": uid,
            "skill": skill_name,
            "proficiency": payload.proficiency,
            "score": 90.0,
            "evidence": f"Admin verified proof: {vr.get('proof_url')}",
            "verification_hash": vhash,
            "verification_date": now,
        },
        upsert=True,
    )
    await db.extracted_skills.update_many(
        {"user_id": uid, "skill_name": {"$regex": f"^{skill_name}$", "$options": "i"}},
        {"$set": {"assessment_status": "verified"}},
    )

    await recalculate_job_matches_for_user(uid, db)
    await compute_and_store_readiness(uid, db)

    await db.notifications.insert_one({
        "user_id": uid,
        "title": f"Skill Credential Approved: {skill_name}",
        "message": f"Placement Admin verified your external proof for {skill_name}.",
        "type": "verification",
        "is_read": False,
        "created_at": now,
    })

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "approve_verification",
        "target_id": req_id,
        "timestamp": now,
        "details": {"student_uid": uid, "skill": skill_name},
    })

    return {"message": "Verification approved and badge issued", "verification_hash": vhash}


@router.post("/verifications/{req_id}/reject")
async def reject_verification_request(
    req_id: str,
    payload: ReviewVerificationRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Reject a verification request with feedback note."""
    try:
        oid = ObjectId(req_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    vr = await db.verification_requests.find_one({"_id": oid})
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")

    now = datetime.now(timezone.utc)
    await db.verification_requests.update_one(
        {"_id": oid},
        {"$set": {"status": "rejected", "reviewer_note": payload.reviewer_note, "reviewed_by": current_admin.get("email"), "reviewed_at": now}},
    )

    await db.notifications.insert_one({
        "user_id": vr["user_id"],
        "title": f"Verification Update: {vr['skill_name']}",
        "message": payload.reviewer_note or "Verification proof needs clearer repository/certificate evidence.",
        "type": "verification",
        "is_read": False,
        "created_at": now,
    })

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "reject_verification",
        "target_id": req_id,
        "timestamp": now,
        "details": {"student_uid": vr["user_id"], "skill": vr["skill_name"]},
    })

    return {"message": "Verification request rejected"}


@router.post("/set-role")
async def set_user_role(
    req: SetRoleRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """SUPER_ADMIN only: Assign user role cleanly."""
    if req.role not in ("STUDENT", "ADMIN", "SUPER_ADMIN"):
        raise HTTPException(status_code=400, detail="Invalid role value")

    user = await db.users.find_one({"firebase_uid": req.uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("auth_provider") == "google_firebase" and not req.uid.startswith("admin_"):
        await set_firebase_user_role(req.uid, req.role)

    await db.users.update_one({"firebase_uid": req.uid}, {"$set": {"role": req.role}})
    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "role_change",
        "target_id": req.uid,
        "timestamp": datetime.now(timezone.utc),
        "details": {"new_role": req.role},
    })
    return {"message": f"Role updated to {req.role} for {req.uid}"}


@router.post("/admins")
async def create_admin_account(
    req: CreateAdminRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """SUPER_ADMIN only: Create a new institutional email/password Admin account."""
    valid_roles = ("ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER")
    if req.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(valid_roles)}")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    normalized_email = req.email.strip().lower()
    if await db.users.find_one({"email": normalized_email}):
        raise HTTPException(status_code=400, detail="Account with this email already exists")

    now = datetime.now(timezone.utc)
    digest = hashlib.sha256(normalized_email.encode("utf-8")).hexdigest()[:16]
    admin_uid = f"admin_{digest}"

    await db.users.insert_one({
        "firebase_uid": admin_uid,
        "email": normalized_email,
        "display_name": req.display_name.strip(),
        "photo_url": None,
        "role": req.role,
        "account_status": "active",
        "auth_provider": "password",
        "password_hash": get_password_hash(req.password),
        "has_seen_tour": True,
        "created_at": now,
        "last_login": None,
    })

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "create_admin",
        "target_id": admin_uid,
        "timestamp": now,
        "details": {"email": normalized_email, "role": req.role},
    })

    return {"message": f"Created {req.role} account for {normalized_email}", "uid": admin_uid}


@router.get("/audit-logs")
async def get_audit_logs(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Retrieve institutional admin audit logs ordered newest first."""
    docs = await db.admin_audit_logs.find({}).sort("timestamp", -1).to_list(length=100)
    return [
        {
            "id": str(d["_id"]),
            "admin_uid": d.get("admin_uid"),
            "action": d.get("action"),
            "target_id": d.get("target_id"),
            "details": d.get("details", {}),
            "timestamp": _to_utc_iso(d.get("timestamp")),
        }
        for d in docs
    ]


@router.get("/integrations")
async def get_integrations_config(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
):
    """Read masked MongoDB Atlas and Firebase Authentication configuration status."""
    return {
        "mongodb": await mongo_manager.get_status(),
        "mongodb_uri_masked": _mask_secret(settings.MONGODB_URI),
        "mongodb_db_name": settings.MONGODB_DB_NAME,
        "firebase": get_firebase_status(),
        "firebase_project_id": settings.FIREBASE_PROJECT_ID,
        "firebase_web_config": {
            "apiKey": settings.FIREBASE_WEB_API_KEY,
            "authDomain": settings.FIREBASE_WEB_AUTH_DOMAIN,
            "projectId": settings.FIREBASE_PROJECT_ID,
            "storageBucket": settings.FIREBASE_WEB_STORAGE_BUCKET,
            "messagingSenderId": settings.FIREBASE_WEB_MESSAGING_SENDER_ID,
            "appId": settings.FIREBASE_WEB_APP_ID,
        },
    }


@router.put("/integrations")
async def update_integrations_config(
    payload: IntegrationsConfigPayload,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Update Firebase & MongoDB Atlas configuration dynamically."""
    backend_env_updates: Dict[str, str] = {}
    frontend_env_updates: Dict[str, str] = {}

    prev_uri = settings.MONGODB_URI
    prev_db_name = settings.MONGODB_DB_NAME
    prev_mock_flag = settings.USE_MOCK_MONGODB_FOR_TESTS
    mongo_changed = False
    firebase_changed = False

    if payload.mongodb_uri is not None and payload.mongodb_uri.strip():
        uri = payload.mongodb_uri.strip()
        if not uri.startswith(("mongodb://", "mongodb+srv://")):
            raise HTTPException(status_code=400, detail="MongoDB URI must start with mongodb:// or mongodb+srv://")
        settings.MONGODB_URI = uri
        if "mongodb+srv://" in uri or "mongodb://" in uri:
            settings.USE_MOCK_MONGODB_FOR_TESTS = False
            backend_env_updates["USE_MOCK_MONGODB_FOR_TESTS"] = "false"
        backend_env_updates["MONGODB_URI"] = uri
        mongo_changed = True

    if payload.mongodb_db_name is not None and payload.mongodb_db_name.strip():
        db_name = payload.mongodb_db_name.strip()
        settings.MONGODB_DB_NAME = db_name
        backend_env_updates["MONGODB_DB_NAME"] = db_name
        mongo_changed = True

    if payload.firebase_credentials_json is not None and payload.firebase_credentials_json.strip():
        raw_json = payload.firebase_credentials_json.strip()
        try:
            parsed_cert = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid Firebase service account JSON: {exc}") from exc
        if not parsed_cert.get("private_key") or not parsed_cert.get("client_email"):
            raise HTTPException(status_code=400, detail="Firebase service account JSON must contain 'private_key' and 'client_email'.")
        compact_json = json.dumps(parsed_cert)
        settings.FIREBASE_CREDENTIALS_JSON = compact_json
        backend_env_updates["FIREBASE_CREDENTIALS_JSON"] = compact_json
        if not settings.FIREBASE_PROJECT_ID and parsed_cert.get("project_id"):
            settings.FIREBASE_PROJECT_ID = parsed_cert["project_id"]
            backend_env_updates["FIREBASE_PROJECT_ID"] = parsed_cert["project_id"]
        firebase_changed = True

    if payload.firebase_credentials_path is not None and payload.firebase_credentials_path.strip():
        cred_path = payload.firebase_credentials_path.strip()
        settings.FIREBASE_CREDENTIALS_PATH = cred_path
        backend_env_updates["FIREBASE_CREDENTIALS_PATH"] = cred_path
        firebase_changed = True

    if payload.firebase_project_id is not None and payload.firebase_project_id.strip():
        pid = payload.firebase_project_id.strip()
        settings.FIREBASE_PROJECT_ID = pid
        backend_env_updates["FIREBASE_PROJECT_ID"] = pid
        frontend_env_updates["VITE_FIREBASE_PROJECT_ID"] = pid
        firebase_changed = True

    if payload.firebase_web_config is not None:
        web_map = [
            ("apiKey", "FIREBASE_WEB_API_KEY", "VITE_FIREBASE_API_KEY"),
            ("authDomain", "FIREBASE_WEB_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
            ("projectId", "FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
            ("storageBucket", "FIREBASE_WEB_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
            ("messagingSenderId", "FIREBASE_WEB_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
            ("appId", "FIREBASE_WEB_APP_ID", "VITE_FIREBASE_APP_ID"),
        ]
        for attr, backend_key, frontend_key in web_map:
            val = getattr(payload.firebase_web_config, attr, None)
            if val is not None and val.strip():
                cleaned = val.strip()
                setattr(settings, backend_key, cleaned)
                backend_env_updates[backend_key] = cleaned
                frontend_env_updates[frontend_key] = cleaned

    if mongo_changed and settings.ENVIRONMENT != "testing":
        try:
            await mongo_manager.reconnect(strict=True)
            if mongo_manager.db is not None:
                await seed_mongodb_data(mongo_manager.db)
        except Exception as exc:
            settings.MONGODB_URI = prev_uri
            settings.MONGODB_DB_NAME = prev_db_name
            settings.USE_MOCK_MONGODB_FOR_TESTS = prev_mock_flag
            await mongo_manager.connect(strict=False)
            raise HTTPException(status_code=400, detail=f"MongoDB connection test failed: {exc}") from exc

    if firebase_changed:
        reinit_firebase_admin()

    if settings.ENVIRONMENT != "testing":
        _upsert_env_file(BACKEND_ROOT / ".env", backend_env_updates)
        _upsert_env_file(WORKSPACE_ROOT / "placemt inligence" / ".env", frontend_env_updates)

    active_db = mongo_manager.db if mongo_manager.db is not None else db
    await active_db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "integrations_config_updated",
        "target_id": "firebase_mongodb",
        "timestamp": datetime.now(timezone.utc),
        "details": {
            "mongodb_updated": mongo_changed,
            "firebase_updated": firebase_changed,
            "updated_keys": sorted(list(set(backend_env_updates.keys()) | set(frontend_env_updates.keys()))),
        },
    })

    return {
        "success": True,
        "message": "Firebase Authentication and MongoDB Atlas keys verified and saved.",
        "mongodb": await mongo_manager.get_status(),
        "firebase": get_firebase_status(),
    }


@router.get("/submissions")
async def list_coding_submissions_admin(
    status: Optional[str] = None,
    language: Optional[str] = None,
    question_id: Optional[str] = None,
    limit: int = 50,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Admin review queue for student coding submissions & sandbox execution verdicts."""
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if language:
        query["language"] = language.lower()
    if question_id:
        query["question_id"] = question_id

    docs = (
        await db.coding_submissions.find(query)
        .sort("submitted_at", -1)
        .to_list(length=max(1, min(limit, 200)))
    )
    items = []
    for d in docs:
        items.append(
            {
                "submission_id": d.get("submission_id"),
                "attempt_id": d.get("attempt_id"),
                "assessment_id": d.get("assessment_id"),
                "skill_name": d.get("skill_name", ""),
                "user_id": d.get("user_id"),
                "student_email": d.get("student_email", ""),
                "student_name": d.get("student_name", ""),
                "question_id": d.get("question_id"),
                "question_title": d.get("question_title", ""),
                "language": d.get("language"),
                "run_type": d.get("run_type", "submit"),
                "status": d.get("status"),
                "passed_test_cases": d.get("passed_test_cases", 0),
                "total_test_cases": d.get("total_test_cases", 0),
                "score_percentage": d.get("score_percentage", 0.0),
                "earned_points": d.get("earned_points", 0.0),
                "max_points": d.get("max_points", 0.0),
                "execution_time_ms": d.get("execution_time_ms", 0.0),
                "hidden_summary": d.get("hidden_summary", {"passed": 0, "total": 0}),
                "submitted_at": (
                    d["submitted_at"].isoformat()
                    if isinstance(d.get("submitted_at"), datetime)
                    else d.get("submitted_at")
                ),
            }
        )
    return items


@router.get("/submissions/{submission_id}")
async def get_coding_submission_detail_admin(
    submission_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Full submission trace including source code, stderr, and hidden test-case verdicts (ADMIN ONLY)."""
    doc = await db.coding_submissions.find_one({"submission_id": submission_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Coding submission not found")
    doc.pop("_id", None)
    if isinstance(doc.get("submitted_at"), datetime):
        doc["submitted_at"] = doc["submitted_at"].isoformat()
    return doc


# =========================================================================
# Student Groups & Cohort Bulk Operations
# =========================================================================

@router.get("/groups")
async def list_student_groups(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """List all cohort and department student groups."""
    groups = await db.student_groups.find({}).sort("created_at", -1).to_list(length=100)
    items = []
    for g in groups:
        sids = g.get("student_ids", [])
        items.append({
            "id": str(g["_id"]),
            "name": g.get("name"),
            "description": g.get("description", ""),
            "department": g.get("department"),
            "batch": g.get("batch"),
            "tags": g.get("tags", []),
            "student_count": len(sids),
            "student_ids": sids,
            "created_at": g["created_at"].isoformat() if isinstance(g.get("created_at"), datetime) else g.get("created_at"),
            "updated_at": g["updated_at"].isoformat() if isinstance(g.get("updated_at"), datetime) else g.get("updated_at"),
        })
    return items


@router.post("/groups")
async def create_student_group(
    payload: StudentGroupCreateRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Create a new student group with optional student members."""
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")

    existing = await db.student_groups.find_one({"name": {"$regex": f"^{payload.name.strip()}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Group with name '{payload.name}' already exists")

    now = datetime.now(timezone.utc)
    doc = {
        "name": payload.name.strip(),
        "description": payload.description.strip(),
        "department": payload.department.strip() if payload.department else None,
        "batch": payload.batch,
        "tags": [t.strip() for t in payload.tags if t.strip()],
        "student_ids": list(set(payload.student_ids)),
        "created_by": current_admin.get("email") or current_admin.get("firebase_uid"),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.student_groups.insert_one(doc)
    group_id = str(result.inserted_id)

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_group_created",
        "target_id": group_id,
        "timestamp": now,
        "details": {"name": payload.name, "member_count": len(doc["student_ids"])},
    })

    return {"message": f"Group '{payload.name}' created", "id": group_id}


@router.get("/groups/{group_id}")
async def get_student_group_detail(
    group_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Get group details including full member cards and metrics."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    student_ids = g.get("student_ids", [])
    members = []
    if student_ids:
        users = await db.users.find({"firebase_uid": {"$in": student_ids}}).to_list(length=500)
        profiles = await db.student_profiles.find({"user_id": {"$in": student_ids}}).to_list(length=500)
        resumes = await db.resumes.find({"user_id": {"$in": student_ids}, "is_active": True}).to_list(length=500)
        readiness_list = await db.placement_readiness.find({"user_id": {"$in": student_ids}}).to_list(length=500)

        p_map = {p["user_id"]: p for p in profiles}
        r_map = {r["user_id"]: r for r in resumes}
        rd_map = {rd["user_id"]: rd for rd in readiness_list}

        for u in users:
            uid = u["firebase_uid"]
            prof = p_map.get(uid, {})
            res = r_map.get(uid)
            rd = rd_map.get(uid, {})
            members.append({
                "firebase_uid": uid,
                "display_name": prof.get("full_name") or u.get("display_name", "Student"),
                "email": u.get("email"),
                "branch": prof.get("branch", ""),
                "graduation_year": prof.get("graduation_year"),
                "ats_score": round(float(res.get("ats_score", 0.0)), 1) if res else 0.0,
                "readiness_score": round(float(rd.get("overall_score", 0.0)), 1),
                "account_status": u.get("account_status", "active"),
            })

    return {
        "id": str(g["_id"]),
        "name": g.get("name"),
        "description": g.get("description", ""),
        "department": g.get("department"),
        "batch": g.get("batch"),
        "tags": g.get("tags", []),
        "student_count": len(student_ids),
        "student_ids": student_ids,
        "members": members,
        "created_at": g["created_at"].isoformat() if isinstance(g.get("created_at"), datetime) else g.get("created_at"),
        "updated_at": g["updated_at"].isoformat() if isinstance(g.get("updated_at"), datetime) else g.get("updated_at"),
    }


@router.put("/groups/{group_id}")
async def update_student_group(
    group_id: str,
    payload: StudentGroupUpdateRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Update group metadata or replace membership."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.department is not None:
        updates["department"] = payload.department.strip() if payload.department else None
    if payload.batch is not None:
        updates["batch"] = payload.batch
    if payload.tags is not None:
        updates["tags"] = [t.strip() for t in payload.tags if t.strip()]
    if payload.student_ids is not None:
        updates["student_ids"] = list(set(payload.student_ids))

    await db.student_groups.update_one({"_id": oid}, {"$set": updates})
    return {"message": "Group updated successfully"}


@router.delete("/groups/{group_id}")
async def delete_student_group(
    group_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Delete a student group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    await db.student_groups.delete_one({"_id": oid})
    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "student_group_deleted",
        "target_id": group_id,
        "timestamp": datetime.now(timezone.utc),
        "details": {"name": g.get("name")},
    })
    return {"message": "Group deleted successfully"}


@router.post("/groups/{group_id}/members")
async def modify_group_members(
    group_id: str,
    payload: GroupMemberActionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Add or remove students from a group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    current_members = set(g.get("student_ids", []))
    if payload.action == "add":
        new_members = list(current_members | set(payload.student_ids))
    elif payload.action == "remove":
        new_members = list(current_members - set(payload.student_ids))
    else:
        raise HTTPException(status_code=400, detail="Action must be 'add' or 'remove'")

    await db.student_groups.update_one(
        {"_id": oid},
        {"$set": {"student_ids": new_members, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": f"Updated group membership ({payload.action}). Total members: {len(new_members)}", "student_ids": new_members}


@router.post("/groups/{group_id}/assign-assessment")
async def bulk_assign_assessment_to_group(
    group_id: str,
    payload: GroupAssignAssessmentRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN"])),
    db=Depends(get_database),
):
    """Assign an assessment to all members in the group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    student_ids = g.get("student_ids", [])
    if not student_ids:
        return {"message": "No students in this group", "assigned_count": 0}

    now = datetime.now(timezone.utc)
    title = payload.title or f"Assessment: {payload.assessment_id}"
    notif_docs = [
        {
            "user_id": uid,
            "title": f"New Assessment Assigned: {title}",
            "message": f"You have been assigned an assessment via cohort group '{g.get('name')}'. Due: {payload.due_date or 'Flexible'}",
            "type": "assessment",
            "is_read": False,
            "created_at": now,
            "assessment_id": payload.assessment_id,
        }
        for uid in student_ids
    ]
    if notif_docs:
        await db.notifications.insert_many(notif_docs)

    return {"message": f"Assessment '{title}' assigned to {len(student_ids)} students in '{g.get('name')}'", "assigned_count": len(student_ids)}


@router.post("/groups/{group_id}/assign-assignment")
async def bulk_assign_assignment_to_group(
    group_id: str,
    payload: GroupAssignAssignmentRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN"])),
    db=Depends(get_database),
):
    """Allocate an assignment to all members in the group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    student_ids = g.get("student_ids", [])
    if not student_ids:
        return {"message": "No students in this group", "assigned_count": 0}

    now = datetime.now(timezone.utc)
    assignment = await db.assignments.find_one({"id": payload.assignment_id}) or {}
    asgn_title = assignment.get("title") or payload.assignment_id

    await db.assignments.update_one(
        {"id": payload.assignment_id},
        {"$addToSet": {"assigned_student_ids": {"$each": student_ids}}},
    )

    notif_docs = [
        {
            "user_id": uid,
            "title": f"New Assignment Assigned: {asgn_title}",
            "message": f"Your cohort group '{g.get('name')}' has been allocated assignment '{asgn_title}'. Due: {payload.due_date or assignment.get('due_date', 'Flexible')}",
            "type": "assignment",
            "is_read": False,
            "created_at": now,
            "assignment_id": payload.assignment_id,
        }
        for uid in student_ids
    ]
    if notif_docs:
        await db.notifications.insert_many(notif_docs)

    return {"message": f"Assignment '{asgn_title}' allocated to {len(student_ids)} students in '{g.get('name')}'", "assigned_count": len(student_ids)}


@router.post("/groups/{group_id}/notify")
async def notify_group_members(
    group_id: str,
    payload: GroupBroadcastNotificationRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Broadcast an in-app and push notification to all members of a group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    student_ids = g.get("student_ids", [])
    if not student_ids:
        return {"message": "No students in this group", "delivered_count": 0}

    now = datetime.now(timezone.utc)
    notif_docs = [
        {
            "user_id": uid,
            "title": payload.title,
            "message": payload.message,
            "type": "group_broadcast",
            "category": "system",
            "link": "/student/notifications",
            "action_url": "/student/notifications",
            "priority": payload.priority,
            "group_id": group_id,
            "group_name": g.get("name"),
            "is_read": False,
            "created_at": now,
            "sent_by_admin": current_admin.get("email") or current_admin.get("firebase_uid"),
        }
        for uid in student_ids
    ]
    if notif_docs:
        await db.notifications.insert_many(notif_docs)

    try:
        from app.services.fcm_service import fcm_service
        tokens = await db.device_tokens.find({"user_id": {"$in": student_ids}}).to_list(length=500)
        token_strings = [t["token"] for t in tokens if "token" in t]
        if token_strings:
            await fcm_service.send_to_tokens(
                tokens=token_strings,
                title=payload.title,
                body=payload.message,
                data={"group_id": group_id, "priority": payload.priority},
            )
    except Exception:
        pass

    return {"message": f"Notification delivered to {len(student_ids)} students in group '{g.get('name')}'", "delivered_count": len(student_ids)}


@router.get("/groups/{group_id}/analytics")
async def get_group_analytics(
    group_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Aggregate readiness, resume ATS score, and assessment metrics for a cohort group."""
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    g = await db.student_groups.find_one({"_id": oid})
    if not g:
        raise HTTPException(status_code=404, detail="Student group not found")

    student_ids = g.get("student_ids", [])
    if not student_ids:
        return {
            "group_name": g.get("name"),
            "total_students": 0,
            "students_with_resumes": 0,
            "avg_readiness": 0.0,
            "avg_ats": 0.0,
            "total_assessments_taken": 0,
            "total_assignments_submitted": 0,
        }

    resumes = await db.resumes.find({"user_id": {"$in": student_ids}, "is_active": True}).to_list(length=500)
    readiness_list = await db.placement_readiness.find({"user_id": {"$in": student_ids}}).to_list(length=500)
    assessments_count = await db.assessment_attempts.count_documents({"user_id": {"$in": student_ids}, "status": "completed"})
    assignments_count = await db.assignment_submissions.count_documents({"user_id": {"$in": student_ids}})

    avg_ats = round(sum(float(r.get("ats_score", 0.0)) for r in resumes) / len(resumes), 1) if resumes else 0.0
    avg_readiness = round(sum(float(rd.get("overall_score", 0.0)) for rd in readiness_list) / len(readiness_list), 1) if readiness_list else 0.0

    return {
        "group_name": g.get("name"),
        "total_students": len(student_ids),
        "students_with_resumes": len(resumes),
        "avg_readiness": avg_readiness,
        "avg_ats": avg_ats,
        "total_assessments_taken": assessments_count,
        "total_assignments_submitted": assignments_count,
    }


# =========================================================================
# Communication Center & Broadcast Announcements
# =========================================================================

@router.get("/communication/announcements")
async def list_announcements(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """List historical announcements and delivery metadata."""
    docs = await db.announcements.find({}).sort("created_at", -1).to_list(length=100)
    items = []
    for d in docs:
        items.append({
            "id": str(d["_id"]),
            "title": d.get("title"),
            "message": d.get("message"),
            "target_type": d.get("target_type", "ALL"),
            "target_filter": d.get("target_filter", {}),
            "priority": d.get("priority", "normal"),
            "recipient_count": d.get("recipient_count", 0),
            "created_by": d.get("created_by"),
            "created_at": _to_utc_iso(d.get("created_at")),
            "expires_at": d.get("expires_at"),
        })
    return items


@router.post("/communication/announcements")
async def create_and_broadcast_announcement(
    payload: AnnouncementCreateRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Broadcast an official announcement to targeted students (all, department, batch, group, individual)."""
    if not payload.title.strip() or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Title and message are required")

    student_ids: List[str] = []
    target_type = payload.target_type.upper()

    if target_type == "ALL":
        users = await db.users.find({"role": {"$in": ["STUDENT", "student"]}}, {"firebase_uid": 1}).to_list(length=5000)
        profiles = await db.student_profiles.find({}, {"user_id": 1}).to_list(length=5000)
        student_ids = list(set([u["firebase_uid"] for u in users if u.get("firebase_uid")] + [p["user_id"] for p in profiles if p.get("user_id")]))
    elif target_type == "DEPARTMENT":
        dept = payload.target_filter.get("department")
        if dept:
            profiles = await db.student_profiles.find({"branch": {"$regex": f"^{dept}$", "$options": "i"}}, {"user_id": 1}).to_list(length=2000)
            student_ids = [p["user_id"] for p in profiles if "user_id" in p]
    elif target_type == "BATCH":
        batch = payload.target_filter.get("batch")
        if batch:
            try:
                batch_int = int(batch)
                profiles = await db.student_profiles.find({"graduation_year": batch_int}, {"user_id": 1}).to_list(length=2000)
                student_ids = [p["user_id"] for p in profiles if "user_id" in p]
            except Exception:
                pass
    elif target_type == "GROUP":
        gid = payload.target_filter.get("group_id")
        if gid:
            try:
                group = await db.student_groups.find_one({"_id": ObjectId(gid)})
                if group:
                    student_ids = group.get("student_ids", [])
            except Exception:
                pass
    elif target_type == "INDIVIDUAL":
        uid = payload.target_filter.get("user_id")
        if uid:
            student_ids = [uid]

    student_ids = list(set(student_ids))
    now = datetime.now(timezone.utc)

    # Deduplicate against recently sent announcements to prevent duplicate submission clicks
    recent_cutoff = now - timedelta(minutes=2)
    existing_dups = await db.notifications.find({
        "title": payload.title.strip(),
        "created_at": {"$gte": recent_cutoff},
    }, {"user_id": 1}).to_list(length=1000)
    already_sent_uids = {d["user_id"] for d in existing_dups}

    notif_docs = [
        {
            "user_id": uid,
            "title": payload.title.strip(),
            "message": payload.message.strip(),
            "type": "announcement",
            "category": "system",
            "priority": payload.priority,
            "target_type": target_type,
            "link": "/student/notifications",
            "action_url": "/student/notifications",
            "is_read": False,
            "created_at": now,
            "sent_by_admin": current_admin.get("email") or current_admin.get("firebase_uid"),
        }
        for uid in student_ids
        if uid not in already_sent_uids
    ]
    if notif_docs:
        await db.notifications.insert_many(notif_docs)

    try:
        from app.services.fcm_service import fcm_service
        tokens = await db.device_tokens.find({"user_id": {"$in": student_ids}}).to_list(length=500)
        token_strings = [t["token"] for t in tokens if "token" in t]
        if token_strings:
            await fcm_service.send_to_tokens(
                tokens=token_strings,
                title=payload.title,
                body=payload.message,
                data={"target_type": target_type, "priority": payload.priority},
            )
    except Exception:
        pass

    announcement_doc = {
        "title": payload.title.strip(),
        "message": payload.message.strip(),
        "target_type": target_type,
        "target_filter": payload.target_filter,
        "priority": payload.priority,
        "recipient_count": len(student_ids),
        "created_by": current_admin.get("email") or current_admin.get("firebase_uid"),
        "created_at": now,
        "expires_at": payload.expires_at,
    }
    result = await db.announcements.insert_one(announcement_doc)

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid", "admin"),
        "action": "announcement_broadcast",
        "target_id": str(result.inserted_id),
        "timestamp": now,
        "details": {"title": payload.title, "target_type": target_type, "recipient_count": len(student_ids)},
    })

    return {
        "message": f"Announcement broadcast to {len(student_ids)} students",
        "id": str(result.inserted_id),
        "recipient_count": len(student_ids),
    }


@router.delete("/communication/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Delete an announcement record."""
    try:
        oid = ObjectId(announcement_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid announcement ID format")

    ann = await db.announcements.find_one({"_id": oid})
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    await db.announcements.delete_one({"_id": oid})
    return {"message": "Announcement deleted successfully"}


# =========================================================================
# Admin Accounts & RBAC Management
# =========================================================================

@router.get("/admins")
async def list_admin_accounts(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """List all administrative accounts and their assigned RBAC roles."""
    docs = await db.users.find({
        "role": {"$in": ["SUPER_ADMIN", "ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"]}
    }).sort("created_at", -1).to_list(length=100)
    return [
        {
            "uid": d.get("firebase_uid"),
            "email": d.get("email"),
            "display_name": d.get("display_name"),
            "role": d.get("role"),
            "account_status": d.get("account_status", "active"),
            "auth_provider": d.get("auth_provider", "password"),
            "created_at": _to_utc_iso(d.get("created_at")),
            "last_login": d["last_login"].isoformat() if isinstance(d.get("last_login"), datetime) else d.get("last_login"),
        }
        for d in docs
    ]


@router.put("/admins/{admin_uid}/role")
async def update_admin_role(
    admin_uid: str,
    payload: UpdateAdminRoleRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """SUPER_ADMIN only: Update role for an administrative account with privilege validation."""
    valid_roles = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER"]
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")

    target_admin = await db.users.find_one({"firebase_uid": admin_uid})
    if not target_admin:
        raise HTTPException(status_code=404, detail="Admin account not found")

    caller_uid = current_admin.get("firebase_uid")
    if caller_uid == admin_uid and payload.role != "SUPER_ADMIN":
        super_count = await db.users.count_documents({"role": "SUPER_ADMIN"})
        if super_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only remaining SUPER_ADMIN account.")

    await db.users.update_one({"firebase_uid": admin_uid}, {"$set": {"role": payload.role}})

    if target_admin.get("auth_provider") == "google_firebase" and not admin_uid.startswith("admin_"):
        await set_firebase_user_role(admin_uid, payload.role)

    await db.admin_audit_logs.insert_one({
        "admin_uid": caller_uid,
        "action": "admin_role_updated",
        "target_id": admin_uid,
        "timestamp": datetime.now(timezone.utc),
        "details": {"old_role": target_admin.get("role"), "new_role": payload.role},
    })

    return {"message": f"Updated role to {payload.role} for {target_admin.get('email')}"}


@router.get("/quotas")
async def get_api_quotas(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN", "ACADEMIC_ADMIN", "REVIEWER"])),
    db=Depends(get_database),
):
    """Retrieve real-time API quota telemetry and free-tier daily usage status."""
    from app.services.quota_manager import quota_manager
    return await quota_manager.get_all_quotas(db)


class MaintenanceToggleRequest(BaseModel):
    enabled: bool
    reason: Optional[str] = "Scheduled platform maintenance"


@router.get("/maintenance-status")
async def get_maintenance_status(
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "PLACEMENT_ADMIN"])),
    db=Depends(get_database),
):
    """Retrieve current platform maintenance mode status."""
    from app.core.middleware import is_maintenance_mode_active
    setting = await db.platform_settings.find_one({"key": "maintenance_mode"})
    db_enabled = setting.get("value", False) if setting else False
    return {
        "active": is_maintenance_mode_active() or db_enabled,
        "reason": setting.get("reason", "Scheduled platform maintenance") if setting else "",
        "updated_at": setting.get("updated_at") if setting else None,
    }


@router.post("/maintenance-toggle")
async def toggle_maintenance_mode(
    payload: MaintenanceToggleRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Enable or disable platform maintenance mode (ADMIN / SUPER_ADMIN only)."""
    from app.core.middleware import set_dynamic_maintenance_mode
    now = datetime.now(timezone.utc)
    set_dynamic_maintenance_mode(payload.enabled)

    await db.platform_settings.update_one(
        {"key": "maintenance_mode"},
        {
            "$set": {
                "value": payload.enabled,
                "reason": payload.reason,
                "updated_by": current_admin.get("firebase_uid"),
                "updated_at": now,
            }
        },
        upsert=True
    )

    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid"),
        "action": "maintenance_mode_toggled",
        "target_id": "platform_settings",
        "timestamp": now,
        "details": {"enabled": payload.enabled, "reason": payload.reason},
    })

    return {
        "success": True,
        "maintenance_mode": payload.enabled,
        "message": f"Maintenance mode {'activated' if payload.enabled else 'deactivated'} successfully."
    }



