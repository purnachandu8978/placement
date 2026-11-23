"""
Assessments routes backed by MongoDB Atlas & multi-skill question_bank.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.assessment_utils import (
    execute_attempt_code,
    find_or_generate_assessment,
    sanitize_questions_for_student,
)
from app.services.question_bank import build_assessment_for_skill

router = APIRouter()


class StartAssessmentRequest(BaseModel):
    assessment_id: str


class SubmitCodeRequest(BaseModel):
    question_id: str
    code: str
    language: str = "python"
    custom_input: Optional[str] = None


@router.get("")
async def list_assessments(
    skill: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """List published assessments cleanly without exposing answer keys."""
    query: Dict[str, Any] = {"published_status": "published"}
    if skill:
        query["skill_name"] = {"$regex": f"^{re.escape(skill)}$", "$options": "i"}

    cursor = db.assessments.find(query)
    items = []
    async for doc in cursor:
        items.append({
            "id": doc.get("id") or str(doc["_id"]),
            "skill_id": doc.get("skill_id"),
            "skill_name": doc.get("skill_name"),
            "category": doc.get("category", "Technical Skills"),
            "title": doc.get("title"),
            "assessment_size": doc.get("assessment_size", 5),
            "duration_minutes": doc.get("duration_minutes", 30),
            "pass_score_percentage": doc.get("pass_score_percentage", 75),
            "question_distribution": doc.get("question_distribution", {}),
        })
    return items


@router.get("/for-student")
async def get_student_assessments(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return personalized skill assessments mapped strictly to the student's real resume-discovered skills."""
    uid = current_user["firebase_uid"]

    # 1. Require active resume: everything starts from insertion of resume for the respective student
    active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
    if not active_resume:
        return []

    discovered_skills = active_resume.get("detected_skills", [])
    if not discovered_skills:
        return []

    attempts = await db.assessment_attempts.find({"user_id": uid, "status": "completed"}).to_list(length=200)
    verified = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    verified_set = {(v.get("skill") or v.get("skill_name", "")).lower() for v in verified}

    best_by_assessment: Dict[str, Dict[str, Any]] = {}
    for att in attempts:
        aid = att.get("assessment_id", "")
        prev = best_by_assessment.get(aid)
        if not prev or float(att.get("score", 0.0)) > float(prev.get("score", 0.0)):
            best_by_assessment[aid] = att

    now = datetime.now(timezone.utc)
    result: List[Dict[str, Any]] = []

    # Iterate over ALL skills discovered in this resume (no truncation, strictly discovered skills)
    seen_skills = set()
    for sk in discovered_skills:
        sname = sk.get("skill_name")
        if not sname or sname.lower() in seen_skills:
            continue
        seen_skills.add(sname.lower())

        slug = sname.lower().replace(" ", "-").replace("/", "-")
        for size in (5, 10):
            aid = f"test-{slug}-{size}"
            doc = await db.assessments.find_one({"id": aid})
            if not doc:
                built = build_assessment_for_skill(skill_name=sname, category=sk.get("category", "Technical Skills"), size=size)
                built["id"] = aid
                await db.assessments.insert_one({**built, "created_at": now, "updated_at": now})
                doc = built

            best = best_by_assessment.get(aid)
            result.append({
                "id": aid,
                "skill_id": doc.get("skill_id", slug),
                "skill_name": doc.get("skill_name", sname),
                "category": doc.get("category", sk.get("category", "Technical Skills")),
                "title": doc.get("title"),
                "assessment_size": doc.get("assessment_size", size),
                "duration_minutes": doc.get("duration_minutes", 30 if size == 5 else 60),
                "pass_score_percentage": doc.get("pass_score_percentage", 75),
                "question_distribution": doc.get("question_distribution", {}),
                "attempt_status": "completed" if best else "not_started",
                "best_score": round(float(best.get("score", 0.0)), 1) if best else None,
                "passed": bool(best.get("result") == "passed") if best else False,
                "is_verified": sname.lower() in verified_set,
                "last_attempt_id": best.get("attempt_id") if best else None,
            })

    return result


@router.get("/submissions/me")
async def get_my_assessment_submissions(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return this student's completed assessment history."""
    uid = current_user["firebase_uid"]
    docs = (
        await db.assessment_attempts.find({"user_id": uid, "status": "completed"})
        .sort("end_time", -1)
        .to_list(length=100)
    )
    items = []
    for d in docs:
        items.append({
            "attempt_id": d.get("attempt_id"),
            "assessment_id": d.get("assessment_id"),
            "skill_name": d.get("skill_name", "Technical Skill"),
            "score": round(float(d.get("score", 0.0)), 1),
            "result": d.get("result", "completed"),
            "earned_points": d.get("earned_points", 0),
            "total_points": d.get("total_points", 100),
            "completed_at": d["end_time"].isoformat() if isinstance(d.get("end_time"), datetime) else d.get("end_time"),
        })
    return items


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return assessment details with sanitized student questions."""
    doc = await find_or_generate_assessment(assessment_id, db)
    if not doc:
        raise HTTPException(status_code=404, detail="Assessment not found")

    uid = current_user["firebase_uid"]
    role = str(current_user.get("role", "STUDENT")).upper()
    if role == "STUDENT":
        active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
        if not active_resume or not active_resume.get("detected_skills"):
            raise HTTPException(
                status_code=400,
                detail="You must upload your resume in Resume Intelligence before taking technical assessments. Assessments are generated exclusively for your discovered skills.",
            )
        discovered_names = {
            s.get("skill_name", "").strip().lower()
            for s in active_resume.get("detected_skills", [])
            if s.get("skill_name")
        }
        skill_name = (doc.get("skill_name") or "").strip().lower()
        if skill_name and skill_name not in discovered_names:
            raise HTTPException(
                status_code=400,
                detail=f"Skill '{doc.get('skill_name')}' was not discovered in your active resume. Technical assessments are personalized exclusively to your discovered resume skills.",
            )

    return {
        **doc,
        "questions": sanitize_questions_for_student(doc.get("questions", []), doc.get("skill_name", "Software Engineering")),
    }


@router.post("/start")
async def start_assessment(
    req: StartAssessmentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Start a persisted assessment attempt in MongoDB."""
    asmt = await find_or_generate_assessment(req.assessment_id, db)
    if not asmt:
        raise HTTPException(status_code=404, detail="Assessment not found")

    uid = current_user["firebase_uid"]
    role = str(current_user.get("role", "STUDENT")).upper()
    if role == "STUDENT":
        active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
        if not active_resume or not active_resume.get("detected_skills"):
            raise HTTPException(
                status_code=400,
                detail="You must upload your resume in Resume Intelligence before taking technical assessments. Assessments are generated exclusively for your discovered skills.",
            )
        discovered_names = {
            s.get("skill_name", "").strip().lower()
            for s in active_resume.get("detected_skills", [])
            if s.get("skill_name")
        }
        skill_name = (asmt.get("skill_name") or "").strip().lower()
        if skill_name and skill_name not in discovered_names:
            raise HTTPException(
                status_code=400,
                detail=f"Skill '{asmt.get('skill_name')}' was not discovered in your active resume. Technical assessments are personalized exclusively to your discovered resume skills.",
            )

    attempt_doc = {
        "user_id": current_user["firebase_uid"],
        "assessment_id": asmt["id"],
        "skill_name": asmt.get("skill_name", "Technical Skill"),
        "assessment_size": asmt.get("assessment_size", 5),
        "answers": {},
        "code_submissions": {},
        "status": "in_progress",
        "start_time": datetime.now(timezone.utc),
    }
    res = await db.assessment_attempts.insert_one(attempt_doc)
    attempt_id = str(res.inserted_id)
    await db.assessment_attempts.update_one({"_id": res.inserted_id}, {"$set": {"attempt_id": attempt_id}})

    return {
        "attempt_id": attempt_id,
        "assessment_id": asmt["id"],
        "skill_name": asmt.get("skill_name", "Technical Skill"),
        "title": asmt.get("title"),
        "duration_minutes": asmt.get("duration_minutes", 30),
        "questions": sanitize_questions_for_student(asmt.get("questions", []), asmt.get("skill_name", "Software Engineering")),
        "status": "in_progress",
    }


@router.post("/{attempt_id}/code")
async def submit_code_in_assessment(
    attempt_id: str,
    req: SubmitCodeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Execute code inside isolated sandbox against ALL test cases and record authoritative verdict."""
    return await execute_attempt_code(
        attempt_id=attempt_id,
        question_id=req.question_id,
        code=req.code,
        language=req.language,
        run_type="submit",
        custom_input=None,
        current_user=current_user,
        db=db,
    )
