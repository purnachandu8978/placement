"""
Assessment attempt tracking routes backed by MongoDB Atlas.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

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

router = APIRouter()


class StartAttemptRequest(BaseModel):
    assessment_id: str
    resume: bool = False


class AnswerRequest(BaseModel):
    question_id: str
    answer: Union[int, str]


class CodeSubmitRequest(BaseModel):
    question_id: str
    code: str
    language: str = "python"


class CodeRunRequest(BaseModel):
    question_id: str
    code: str
    language: str = "python"
    custom_input: Optional[str] = None


@router.post("/start")
async def start_attempt(
    req: StartAttemptRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Create or resume an assessment attempt owned exclusively by current user."""
    asmt = await find_or_generate_assessment(req.assessment_id, db)
    if not asmt:
        raise HTTPException(status_code=404, detail="Assessment not found")

    uid = current_user["firebase_uid"]
    role = str(current_user.get("role", "STUDENT")).upper()

    # Enforce resume insertion and discovered skill requirement for students
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

    # If resume requested and student already has an active in-progress attempt, resume it smoothly
    if req.resume:
        existing = await db.assessment_attempts.find_one(
            {
                "user_id": uid,
                "assessment_id": asmt["id"],
                "status": "in_progress",
            },
            sort=[("start_time", -1)],
        )
        if existing:
            attempt_id = existing.get("attempt_id") or str(existing["_id"])
            return {
                "attempt_id": attempt_id,
                "assessment_id": asmt["id"],
                "skill_name": asmt.get("skill_name", "Technical Skill"),
                "title": asmt.get("title"),
                "duration_minutes": asmt.get("duration_minutes", 30),
                "questions": sanitize_questions_for_student(
                    asmt.get("questions", []),
                    asmt.get("skill_name", "Software Engineering"),
                ),
                "answers": existing.get("answers", {}),
                "status": "in_progress",
                "resumed": True,
            }

    attempt_doc = {
        "user_id": uid,
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
        "questions": sanitize_questions_for_student(
            asmt.get("questions", []),
            asmt.get("skill_name", "Software Engineering"),
        ),
        "status": "in_progress",
        "resumed": False,
    }


@router.post("/{attempt_id}/answer")
async def save_answer(
    attempt_id: str,
    req: AnswerRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Save an MCQ response onto the student's MongoDB attempt document."""
    try:
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt_id format")

    attempt = await db.assessment_attempts.find_one({"_id": oid})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["user_id"] != current_user["firebase_uid"]:
        raise HTTPException(status_code=403, detail="Unauthorized access to this attempt")

    await db.assessment_attempts.update_one(
        {"_id": oid},
        {"$set": {f"answers.{req.question_id}": req.answer}},
    )
    return {"message": "Answer saved cleanly", "question_id": req.question_id}


@router.post("/{attempt_id}/run")
async def run_sample_code(
    attempt_id: str,
    req: CodeRunRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Run code in the isolated sandbox against PUBLIC sample cases (or optional custom stdin) only."""
    run_mode = "custom" if req.custom_input is not None else "sample"
    return await execute_attempt_code(
        attempt_id=attempt_id,
        question_id=req.question_id,
        code=req.code,
        language=req.language,
        run_type=run_mode,
        custom_input=req.custom_input,
        current_user=current_user,
        db=db,
    )


@router.post("/{attempt_id}/code")
@router.post("/{attempt_id}/submit")
async def submit_code(
    attempt_id: str,
    req: CodeSubmitRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Execute code inside isolated sandbox against ALL (public + hidden) test cases and save score."""
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


@router.get("/{attempt_id}/submissions")
async def get_attempt_code_submissions(
    attempt_id: str,
    question_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return student-safe submission history for an attempt (hidden inputs/outputs always redacted)."""
    try:
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt_id format")

    attempt = await db.assessment_attempts.find_one({"_id": oid})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    role = str(current_user.get("role", "STUDENT")).upper()
    if attempt.get("user_id") != current_user["firebase_uid"] and role not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(status_code=403, detail="Unauthorized access to this attempt's submissions")

    query: Dict[str, Any] = {"attempt_id": attempt_id}
    if question_id:
        query["question_id"] = question_id

    docs = await db.coding_submissions.find(query).sort("submitted_at", -1).to_list(length=50)
    history = []
    for d in docs:
        history.append(
            {
                "submission_id": d.get("submission_id"),
                "question_id": d.get("question_id"),
                "language": d.get("language"),
                "run_type": d.get("run_type", "submit"),
                "status": d.get("status"),
                "passed_test_cases": d.get("passed_test_cases", 0),
                "total_test_cases": d.get("total_test_cases", 0),
                "score_percentage": d.get("score_percentage", 0.0),
                "earned_points": d.get("earned_points", 0.0),
                "max_points": d.get("max_points", 0.0),
                "execution_time_ms": d.get("execution_time_ms", 0.0),
                "compile_error": d.get("compile_error", ""),
                "runtime_error": d.get("runtime_error", ""),
                "hidden_summary": d.get("hidden_summary", {"passed": 0, "total": 0}),
                "source_code": d.get("source_code", ""),
                "submitted_at": d["submitted_at"].isoformat() if isinstance(d.get("submitted_at"), datetime) else d.get("submitted_at"),
            }
        )
    return history
