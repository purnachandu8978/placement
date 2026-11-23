"""
Skills intelligence routes backed by MongoDB Atlas extracted_skills, verified_skills, and skill_performance.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.question_bank import build_assessment_for_skill
from app.services.resume_intelligence import (
    compute_and_store_readiness,
    normalize_skill_name,
    recalculate_job_matches_for_user,
)

router = APIRouter()


class AddSkillRequest(BaseModel):
    skill_name: str
    category: str = "Technical Skills"


@router.get("/student")
async def get_student_skills(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return user's true extracted and verified skills from MongoDB (strictly requires active uploaded resume)."""
    uid = current_user["firebase_uid"]

    active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
    extracted = (active_resume or {}).get("detected_skills", []) if active_resume else []
    manual_skills = await db.extracted_skills.find({"user_id": uid}).to_list(length=100)

    if not extracted and not manual_skills:
        return []

    verified = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    performances = await db.skill_performance.find({"user_id": uid}).to_list(length=100)

    verified_map = {
        (v.get("skill") or v.get("skill_name", "")).lower(): v
        for v in verified
        if v.get("skill") or v.get("skill_name")
    }
    perf_map = {
        p.get("skill_name", "").lower(): p
        for p in performances
        if p.get("skill_name")
    }

    combined: List[Dict[str, Any]] = []
    seen = set()

    for item in extracted:
        name = item.get("skill_name")
        if not name:
            continue
        key = name.lower()
        seen.add(key)
        ver = verified_map.get(key)
        perf = perf_map.get(key)
        score = float(perf.get("score", 0.0)) if perf else (85.0 if ver else 0.0)
        combined.append({
            "skill_name": name,
            "category": item.get("category", "Technical Skills"),
            "source_evidence": item.get("source_evidence", "Extracted from resume"),
            "confidence": item.get("confidence", 0.8),
            "assessment_status": "verified" if ver else item.get("assessment_status", "unverified"),
            "score": round(score, 1),
            "proficiency": (ver.get("proficiency") if ver else None) or (perf.get("proficiency") if perf else "Unverified"),
            "verification_hash": ver.get("verification_hash") if ver else None,
        })

    for ms in manual_skills:
        name = ms.get("skill_name")
        if name and name.lower() not in seen:
            key = name.lower()
            seen.add(key)
            ver = verified_map.get(key)
            perf = perf_map.get(key)
            score = float(perf.get("score", 0.0)) if perf else (85.0 if ver else 0.0)
            combined.append({
                "skill_name": name,
                "category": ms.get("category", "Technical Skills"),
                "source_evidence": ms.get("source_evidence", "Manually added by student"),
                "confidence": ms.get("confidence", 0.9),
                "assessment_status": "verified" if ver else ms.get("assessment_status", "unverified"),
                "score": round(score, 1),
                "proficiency": (ver.get("proficiency") if ver else None) or (perf.get("proficiency") if perf else "Unverified"),
                "verification_hash": ver.get("verification_hash") if ver else None,
            })

    for key, ver in verified_map.items():
        if key not in seen:
            skill_name = ver.get("skill") or ver.get("skill_name")
            perf = perf_map.get(key)
            combined.append({
                "skill_name": skill_name,
                "category": "Verified Assessment",
                "source_evidence": ver.get("evidence", "Verified via platform assessment"),
                "confidence": 1.0,
                "assessment_status": "verified",
                "score": round(float(perf.get("score", 85.0)) if perf else 85.0, 1),
                "proficiency": ver.get("proficiency", "Proficient"),
                "verification_hash": ver.get("verification_hash"),
            })

    return combined


@router.get("/gaps")
async def get_skill_gaps(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Compute real strengths, unverified skills, and missing job-market skills for this student."""
    uid = current_user["firebase_uid"]

    active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
    if not active_resume or not active_resume.get("detected_skills"):
        return {
            "has_skills": False,
            "strengths": [],
            "unverified_skills": [],
            "missing_market_skills": [],
            "role_focus": "Software Engineer",
            "message": "Upload your resume in Resume Intelligence to automatically extract your skills and analyze market gaps.",
        }

    extracted = active_resume.get("detected_skills", [])
    verified = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    performances = await db.skill_performance.find({"user_id": uid}).to_list(length=100)
    job_matches = await db.job_matches.find({"user_id": uid}).to_list(length=100)

    if not job_matches:
        job_matches = await recalculate_job_matches_for_user(uid, db)

    verified_names = {(v.get("skill") or v.get("skill_name", "")).lower() for v in verified}
    perf_map = {p.get("skill_name", "").lower(): p for p in performances}

    strengths: List[Dict[str, Any]] = []
    unverified_skills: List[Dict[str, Any]] = []

    for item in extracted:
        sname = item["skill_name"]
        perf = perf_map.get(sname.lower())
        if sname.lower() in verified_names:
            strengths.append({
                "skill": sname,
                "category": item.get("category", "Technical Skills"),
                "score": round(float(perf.get("score", 80.0)) if perf else 80.0, 1),
                "proficiency": perf.get("proficiency", "Verified") if perf else "Verified",
            })
        else:
            unverified_skills.append({
                "skill": sname,
                "category": item.get("category", "Technical Skills"),
                "reason": "Extracted from resume but not yet verified via assessment",
            })

    missing_freq: Dict[str, int] = {}
    for jm in job_matches:
        for ms in jm.get("missing_skills", []):
            norm = normalize_skill_name(ms)
            if norm:
                missing_freq[norm] = missing_freq.get(norm, 0) + 1

    market_gaps = [
        {"skill": skill, "job_demand_count": count, "priority": "High" if count >= 2 else "Medium"}
        for skill, count in sorted(missing_freq.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    return {
        "has_skills": len(extracted) > 0 or len(verified) > 0,
        "total_extracted": len(extracted),
        "total_verified": len(verified),
        "strengths": strengths,
        "unverified_skills": unverified_skills,
        "market_gaps": market_gaps,
    }


@router.post("/student")
async def add_student_skill(
    req: AddSkillRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Manually add a skill and auto-provision its assessments + recalculate matches & readiness."""
    uid = current_user["firebase_uid"]
    canonical = normalize_skill_name(req.skill_name)
    if not canonical:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skill name cannot be empty")

    existing = await db.extracted_skills.find_one({
        "user_id": uid,
        "skill_name": {"$regex": f"^{canonical}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(status_code=400, detail="Skill already exists on your profile")

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": uid,
        "skill_name": canonical,
        "category": req.category,
        "source_evidence": "Manually added by student",
        "confidence": 0.9,
        "assessment_status": "unverified",
        "extracted_at": now,
    }
    await db.extracted_skills.insert_one(doc)
    await db.resumes.update_one(
        {"user_id": uid, "is_active": True},
        {"$addToSet": {"detected_skills": {"skill_name": canonical, "category": req.category or "Other"}}}
    )

    for size in (5, 10):
        asmt_id = f"test-{canonical.lower().replace(' ', '-').replace('/', '-')}-{size}"
        if not await db.assessments.find_one({"id": asmt_id}):
            await db.assessments.insert_one({
                **build_assessment_for_skill(canonical, req.category, size),
                "created_at": now,
                "updated_at": now,
            })

    await recalculate_job_matches_for_user(uid, db)
    await compute_and_store_readiness(uid, db)
    return {"message": f"Added skill '{canonical}'", "skill_name": canonical}


@router.delete("/student/{skill_name}")
async def remove_student_skill(
    skill_name: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Remove an extracted skill and recalculate downstream matches & readiness."""
    uid = current_user["firebase_uid"]
    res = await db.extracted_skills.delete_many({
        "user_id": uid,
        "skill_name": {"$regex": f"^{skill_name}$", "$options": "i"},
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Skill not found")

    await recalculate_job_matches_for_user(uid, db)
    await compute_and_store_readiness(uid, db)
    return {"message": f"Removed skill '{skill_name}'"}
