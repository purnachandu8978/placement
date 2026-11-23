"""
Assignments, student allocations, and practical submission routes backed by MongoDB Atlas.
Supports Question Bank integration (MCQ, Coding, Short Answer), student allocation targeting,
interactive student workstation taking, automated MCQ grading, faculty review, and analytics.
"""

from __future__ import annotations

import asyncio
import csv
import io
import uuid
import pymongo
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Optional, Union

from app.core.dependencies import get_current_user, require_role
from app.db.mongodb import get_database
from app.services.code_executor import SUPPORTED_LANGUAGES
from app.services.resume_intelligence import compute_and_store_readiness

router = APIRouter()

ASSIGNMENT_ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "FACULTY", "DEAN", "REVIEWER"]


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class AssignmentQuestionInput(BaseModel):
    question_id: Optional[str] = None
    title: Optional[str] = None
    question_text: str = ""
    problem_statement: Optional[str] = None
    type: str = "mcq"  # mcq, simple_coding, hard_coding, short_answer
    points: int = Field(default=10, ge=1, le=100)
    order: int = 0
    difficulty: str = "medium"
    estimated_minutes: int = 15
    instructions: Optional[str] = None
    tags: List[str] = []
    partial_credit: bool = True
    # MCQ
    options: List[str] = []
    correct_answer: Optional[int] = None
    explanation: Optional[str] = None
    # Coding
    input_format: Optional[str] = "Standard input (stdin)"
    output_format: Optional[str] = "Standard output (stdout)"
    constraints: List[str] = []
    starter_code: Dict[str, str] = {}
    supported_languages: List[str] = ["python", "javascript"]
    test_cases: List[Dict[str, Any]] = []
    time_limit_ms: int = 2000
    memory_limit_kb: int = 262144
    # Short Answer
    expected_answer: Optional[str] = None
    rubric: Optional[str] = None
    admin_feedback: Optional[str] = None

    @field_validator("options", mode="before")
    @classmethod
    def normalize_options(cls, v):
        if not v:
            return []
        norm: List[str] = []
        for item in v:
            if isinstance(item, dict):
                norm.append(str(item.get("option_text") or item.get("text") or item.get("label") or ""))
            elif item is not None:
                norm.append(str(item))
        return norm

    @field_validator("constraints", mode="before")
    @classmethod
    def normalize_constraints(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [v.strip()] if v.strip() else []
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return []

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return []

    @field_validator("test_cases", mode="before")
    @classmethod
    def normalize_test_cases(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            norm: List[Dict[str, Any]] = []
            for item in v:
                if isinstance(item, dict):
                    norm.append(item)
                elif hasattr(item, "__dict__"):
                    norm.append(vars(item))
                else:
                    norm.append({"input": str(item), "expected": "", "is_hidden": False})
            return norm
        return []

    @field_validator("correct_answer", mode="before")
    @classmethod
    def normalize_correct_answer(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except Exception:
            return None


class AllocationFilterPayload(BaseModel):
    target_type: str = "all"  # all, department, batch, skill, manual
    departments: List[str] = []
    batches: List[int] = []
    skills: List[str] = []
    student_uids: List[str] = []

    @field_validator("batches", mode="before")
    @classmethod
    def normalize_batches(cls, v):
        if not v:
            return []
        res: List[int] = []
        for x in v:
            try:
                res.append(int(x))
            except Exception:
                pass
        return res

    @field_validator("departments", mode="before")
    @classmethod
    def normalize_departments(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            return [d.strip() for d in v.split(",") if d.strip()]
        return [str(d).strip() for d in v if str(d).strip()]

    @field_validator("skills", mode="before")
    @classmethod
    def normalize_skills(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return [str(s).strip() for s in v if str(s).strip()]


class CreateAssignmentRequest(BaseModel):
    title: str
    description: str = ""
    instructions: Optional[str] = None
    category: str = "Technical"
    skill: str = "Software Engineering"
    difficulty: str = "Intermediate"
    total_marks: Optional[int] = None
    start_time: Optional[str] = None
    deadline: Optional[str] = None
    duration_minutes: Optional[int] = None
    late_submission_policy: str = "allow_penalty"  # allow_penalty, reject, allow_no_penalty
    late_penalty_percent: float = 10.0
    deliverables: List[str] = Field(default_factory=list)
    estimated_hours: int = 4
    due_in_days: int = 7
    week_number: int = 1
    max_score: int = 100
    status: str = "published"  # draft, published, scheduled, archived
    questions: List[AssignmentQuestionInput] = []
    allocation: Optional[AllocationFilterPayload] = None

    @field_validator("deliverables", mode="before")
    @classmethod
    def normalize_deliverables(cls, v):
        if not v:
            return ["GitHub Repository URL", "Design Architecture Notes"]
        if isinstance(v, str):
            return [d.strip() for d in v.split("\n") if d.strip()]
        return [str(d) for d in v if str(d).strip()]


class UpdateAssignmentRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    category: Optional[str] = None
    skill: Optional[str] = None
    difficulty: Optional[str] = None
    total_marks: Optional[int] = None
    start_time: Optional[str] = None
    deadline: Optional[str] = None
    duration_minutes: Optional[int] = None
    late_submission_policy: Optional[str] = None
    late_penalty_percent: Optional[float] = None
    deliverables: Optional[List[str]] = None
    estimated_hours: Optional[int] = None
    due_in_days: Optional[int] = None
    week_number: Optional[int] = None
    max_score: Optional[int] = None
    status: Optional[str] = None
    questions: Optional[List[AssignmentQuestionInput]] = None
    allocation: Optional[AllocationFilterPayload] = None


class SubmitAnswerItem(BaseModel):
    question_id: str
    type: str = "mcq"
    selected_option: Optional[int] = None
    code: Optional[str] = None
    language: Optional[str] = "python"
    text_answer: Optional[str] = None


class SubmitAssignmentRequest(BaseModel):
    github_url: Optional[str] = ""
    notes: str = ""
    code_snippet: str = ""
    live_url: Optional[str] = None
    answers: List[SubmitAnswerItem] = []


class SaveProgressRequest(BaseModel):
    github_url: Optional[str] = ""
    notes: str = ""
    code_snippet: str = ""
    live_url: Optional[str] = None
    answers: List[SubmitAnswerItem] = []


class GradeQuestionScoreItem(BaseModel):
    question_id: str
    awarded_marks: float
    feedback: Optional[str] = None


class GradeSubmissionRequest(BaseModel):
    score: Optional[float] = Field(default=None, ge=0, le=100)
    feedback: str = ""
    question_scores: List[GradeQuestionScoreItem] = []
    release_result: bool = True


class AllocationPreviewRequest(BaseModel):
    target_type: str = "all"
    departments: List[str] = []
    batches: List[int] = []
    skills: List[str] = []
    student_uids: List[str] = []


class UpdateStatusRequest(BaseModel):
    status: str  # draft, published, scheduled, archived


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _clean_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    val = url.strip()
    if not val:
        return None
    if not (val.startswith("http://") or val.startswith("https://")):
        val = "https://" + val
    try:
        parsed = urlparse(val)
        if not parsed.netloc or "." not in parsed.netloc:
            return None
        return val
    except Exception:
        return None


def _is_admin(user: Dict[str, Any]) -> bool:
    return str(user.get("role", "STUDENT")).upper() in ("ADMIN", "SUPER_ADMIN")


def _sanitize_question_for_student(q: Dict[str, Any], release_answers: bool = False) -> Dict[str, Any]:
    """Strip answer keys, hidden tests, and rubrics unless results are officially released."""
    clean = dict(q)
    if not release_answers:
        clean.pop("correct_answer", None)
        clean.pop("explanation", None)
        clean.pop("expected_answer", None)
        clean.pop("rubric", None)
        clean.pop("admin_feedback", None)

    # For coding test cases, only expose public samples to students before grading
    if "test_cases" in clean and isinstance(clean["test_cases"], list):
        if not release_answers:
            clean["test_cases"] = [tc for tc in clean["test_cases"] if not tc.get("is_hidden")]
        else:
            clean["test_cases"] = list(clean["test_cases"])

    return clean


async def resolve_target_students(db, payload: AllocationFilterPayload) -> List[Dict[str, Any]]:
    """Resolve student accounts and profiles matching allocation criteria."""
    users_cursor = db.users.find({"role": "STUDENT"})
    students = await users_cursor.to_list(length=1000)
    if not students:
        return []

    uids = [s["firebase_uid"] for s in students if "firebase_uid" in s]
    profiles_cursor = db.student_profiles.find({"user_id": {"$in": uids}})
    profiles = {p["user_id"]: p async for p in profiles_cursor}

    matched: List[Dict[str, Any]] = []

    # Pre-fetch skills if filtering by skill
    skills_map: Dict[str, set] = {}
    if payload.target_type == "skill" and payload.skills:
        ext_cursor = db.extracted_skills.find({"user_id": {"$in": uids}})
        async for sk in ext_cursor:
            uid = sk.get("user_id")
            if uid:
                skills_map.setdefault(uid, set()).add((sk.get("skill_name") or "").lower())
        ver_cursor = db.verified_skills.find({"user_id": {"$in": uids}})
        async for vs in ver_cursor:
            uid = vs.get("user_id")
            if uid:
                skills_map.setdefault(uid, set()).add((vs.get("skill") or "").lower())

    for u in students:
        uid = u["firebase_uid"]
        prof = profiles.get(uid, {})
        dept = (prof.get("branch") or prof.get("department") or "").strip()
        grad_year = prof.get("graduation_year")

        is_match = False
        if payload.target_type == "all":
            is_match = True
        elif payload.target_type == "department":
            if any(d.lower() in dept.lower() for d in payload.departments):
                is_match = True
        elif payload.target_type == "batch":
            try:
                gy_int = int(grad_year) if grad_year is not None else None
            except Exception:
                gy_int = None
            if gy_int is not None and gy_int in payload.batches:
                is_match = True
        elif payload.target_type == "skill":
            user_sks = skills_map.get(uid, set())
            if any(s.lower() in user_sks for s in payload.skills):
                is_match = True
        elif payload.target_type == "manual":
            if uid in payload.student_uids:
                is_match = True

        if is_match:
            matched.append({
                "uid": uid,
                "name": prof.get("full_name") or u.get("display_name") or "Student",
                "email": u.get("email") or "",
                "department": dept or "Computer Science",
                "graduation_year": grad_year,
            })

    return matched


async def create_student_allocations(
    db,
    assignment_id: str,
    target_students: List[Dict[str, Any]],
    deadline_dt: Optional[datetime],
    max_score: float,
    overwrite: bool = False,
) -> int:
    """Create allocation records in assignment_allocations collection."""
    now = datetime.now(timezone.utc)
    allocated_count = 0

    for st in target_students:
        uid = st["uid"]
        query = {"assignment_id": assignment_id, "user_id": uid}
        existing = await db.assignment_allocations.find_one(query)

        if existing and not overwrite:
            continue

        alloc_doc = {
            "assignment_id": assignment_id,
            "user_id": uid,
            "student_name": st["name"],
            "student_email": st["email"],
            "department": st["department"],
            "graduation_year": st["graduation_year"],
            "status": existing.get("status", "not_started") if existing else "not_started",
            "allocated_at": existing.get("allocated_at", now) if existing else now,
            "started_at": existing.get("started_at") if existing else None,
            "submitted_at": existing.get("submitted_at") if existing else None,
            "evaluated_at": existing.get("evaluated_at") if existing else None,
            "score": existing.get("score") if existing else None,
            "max_score": max_score,
            "deadline": deadline_dt,
            "updated_at": now,
        }

        for attempt in range(3):
            try:
                await db.assignment_allocations.replace_one(query, alloc_doc, upsert=True)
                break
            except pymongo.errors.AutoReconnect:
                if attempt == 2:
                    raise
                await asyncio.sleep(0.3)
        allocated_count += 1

    return allocated_count


# ==============================================================================
# STUDENT ROUTES: View, Workstation, Auto-Save Progress, Submit, Results
# ==============================================================================

@router.get("", response_model=List[Dict[str, Any]])
async def list_assignments(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    List assignments relevant to the authenticated student:
    Includes explicitly allocated assignments as well as global templates.
    Never exposes hidden test cases or answer keys to students.
    """
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    now = datetime.now(timezone.utc)

    # 1. Fetch student's allocation records
    allocations = await db.assignment_allocations.find({"user_id": uid}).to_list(length=200)
    alloc_map = {a["assignment_id"]: a for a in allocations}
    allocated_ids = list(alloc_map.keys())

    # 2. Query matching assignments: explicitly allocated + global templates
    query_or = [
        {"user_id": None},
        {"user_id": "system"},
        {"user_id": {"$exists": False}},
    ]
    asg_oids = []
    for aid in allocated_ids:
        try:
            asg_oids.append(ObjectId(aid))
        except Exception:
            pass
    if asg_oids:
        query_or.append({"_id": {"$in": asg_oids}})
        query_or.append({"template_key": {"$in": allocated_ids}})

    asg_docs = await db.assignments.find({"$or": query_or}).to_list(length=100)

    # 3. Fetch student's submissions
    submissions = await db.assignment_submissions.find({"user_id": uid}).to_list(length=100)
    sub_map = {str(s.get("assignment_id")): s for s in submissions}
    sub_by_key = {str(s.get("template_key")): s for s in submissions if s.get("template_key")}

    items: List[Dict[str, Any]] = []
    for idx, doc in enumerate(asg_docs):
        aid = str(doc["_id"])
        tkey = doc.get("template_key", aid)
        alloc = alloc_map.get(aid) or alloc_map.get(tkey)
        sub = sub_map.get(aid) or sub_by_key.get(tkey)

        # Status determination: open, in_progress, submitted, evaluated, overdue
        status_val = "open"
        if alloc and alloc.get("status"):
            st = alloc["status"]
            status_val = "open" if st == "not_started" else st
        elif sub:
            sub_st = sub.get("status", "submitted")
            status_val = "evaluated" if sub_st == "evaluated" else "submitted"

        # Check deadline for overdue status
        deadline_str = doc.get("deadline")
        deadline_dt = None
        if deadline_str:
            try:
                deadline_dt = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
            except Exception:
                pass
        if not deadline_dt and alloc and alloc.get("deadline"):
            deadline_dt = alloc["deadline"]

        remaining_seconds: Optional[int] = None
        if deadline_dt:
            if deadline_dt.tzinfo is None:
                deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
            delta = deadline_dt - now
            remaining_seconds = max(0, int(delta.total_seconds()))
            if delta.total_seconds() < 0 and status_val not in ("submitted", "evaluated"):
                status_val = "overdue"

        # Deliverables fallback
        deliverables = doc.get("deliverables")
        if not deliverables or not isinstance(deliverables, list):
            deliverables = ["GitHub Repository URL", "Design Architecture Notes"]

        # Questions (sanitized for student)
        raw_questions = doc.get("questions", [])
        is_evaluated = status_val == "evaluated"
        clean_questions = [_sanitize_question_for_student(q, release_answers=is_evaluated) for q in raw_questions]

        items.append({
            "id": aid,
            "template_key": tkey,
            "title": doc.get("title") or "Engineering Assignment",
            "category": doc.get("category") or "Technical",
            "skill": doc.get("skill") or "Software Engineering",
            "difficulty": doc.get("difficulty", "Intermediate"),
            "description": doc.get("description") or "",
            "instructions": doc.get("instructions"),
            "deliverables": deliverables,
            "requirements": deliverables,
            "estimated_hours": doc.get("estimated_hours", 4),
            "deadline": deadline_str or (deadline_dt.isoformat() if deadline_dt else "Within 7 Days"),
            "remaining_seconds": remaining_seconds,
            "week_number": doc.get("week_number") or ((idx % 4) + 1),
            "max_score": doc.get("total_marks") or doc.get("max_score", 100),
            "total_marks": doc.get("total_marks") or doc.get("max_score", 100),
            "duration_minutes": doc.get("duration_minutes"),
            "late_submission_policy": doc.get("late_submission_policy", "allow_penalty"),
            "status": status_val,
            "question_count": len(clean_questions),
            "questions": clean_questions,
            "submission": {
                "id": str(sub["_id"]) if "_id" in sub else f"sub-{aid}",
                "github_url": sub.get("github_url"),
                "live_url": sub.get("live_url"),
                "code_snippet": sub.get("code_snippet", ""),
                "notes": sub.get("notes", ""),
                "score": sub.get("score"),
                "auto_score": sub.get("auto_score") or sub.get("score"),
                "evaluation": sub.get("evaluation"),
                "feedback": sub.get("evaluation"),
                "status": sub.get("status", "submitted"),
                "reviewed_by": sub.get("reviewed_by"),
                "reviewed_at": sub["reviewed_at"].isoformat() if isinstance(sub.get("reviewed_at"), datetime) else sub.get("reviewed_at"),
                "submitted_at": sub["submitted_at"].isoformat() if isinstance(sub.get("submitted_at"), datetime) else sub.get("submitted_at"),
            } if sub else None,
        })

    return items


@router.get("/{assignment_id}")
async def get_assignment_detail(
    assignment_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve detailed assignment info. Admins receive full metadata; students receive sanitized data."""
    is_admin = _is_admin(current_user)
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"template_key": assignment_id})
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    asg["id"] = str(asg.pop("_id"))
    if not is_admin:
        asg["questions"] = [_sanitize_question_for_student(q, release_answers=False) for q in asg.get("questions", [])]

    return asg


@router.get("/{assignment_id}/take")
async def get_assignment_workstation(
    assignment_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Launch or resume the student's Assignment Workstation.
    Updates student's allocation status to 'in_progress' upon first opening.
    """
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"template_key": assignment_id})
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    aid = str(asg["_id"])
    now = datetime.now(timezone.utc)

    # Update allocation status to 'in_progress' if currently 'not_started'
    alloc = await db.assignment_allocations.find_one({"assignment_id": aid, "user_id": uid})
    if alloc and alloc.get("status") == "not_started":
        await db.assignment_allocations.update_one(
            {"_id": alloc["_id"]},
            {"$set": {"status": "in_progress", "started_at": now, "updated_at": now}}
        )

    # Check for existing draft or previous submission
    existing_sub = await db.assignment_submissions.find_one({"assignment_id": aid, "user_id": uid})

    # Sanitize questions (students must never see answer keys)
    questions = [_sanitize_question_for_student(q, release_answers=False) for q in asg.get("questions", [])]

    return {
        "id": aid,
        "title": asg.get("title"),
        "description": asg.get("description"),
        "instructions": asg.get("instructions"),
        "category": asg.get("category", "Technical"),
        "skill": asg.get("skill"),
        "difficulty": asg.get("difficulty"),
        "total_marks": asg.get("total_marks") or asg.get("max_score", 100),
        "duration_minutes": asg.get("duration_minutes"),
        "deadline": asg.get("deadline"),
        "late_submission_policy": asg.get("late_submission_policy", "allow_penalty"),
        "deliverables": asg.get("deliverables", []),
        "questions": questions,
        "draft_submission": {
            "github_url": existing_sub.get("github_url", "") if existing_sub else "",
            "live_url": existing_sub.get("live_url", "") if existing_sub else "",
            "code_snippet": existing_sub.get("code_snippet", "") if existing_sub else "",
            "notes": existing_sub.get("notes", "") if existing_sub else "",
            "answers": existing_sub.get("answers", []) if existing_sub else [],
            "status": existing_sub.get("status", "in_progress") if existing_sub else "in_progress",
        } if existing_sub else None,
    }


@router.post("/{assignment_id}/progress")
async def save_assignment_progress(
    assignment_id: str,
    req: SaveProgressRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Auto-save student progress (draft answers and deliverable links) without final submission."""
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"template_key": assignment_id})
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    aid = str(asg["_id"])
    now = datetime.now(timezone.utc)

    # Verify student is not overwriting an already evaluated submission
    existing_sub = await db.assignment_submissions.find_one({"assignment_id": aid, "user_id": uid})
    if existing_sub and existing_sub.get("status") == "evaluated":
        raise HTTPException(status_code=400, detail="Assignment has already been graded and closed.")

    answers_data = [a.model_dump() for a in req.answers]

    draft_doc = {
        "assignment_id": aid,
        "template_key": asg.get("template_key"),
        "assignment_title": asg.get("title"),
        "skill": asg.get("skill"),
        "user_id": uid,
        "student_name": current_user.get("display_name") or current_user.get("name") or "Student",
        "student_email": current_user.get("email") or "",
        "github_url": req.github_url or "",
        "live_url": req.live_url or "",
        "code_snippet": req.code_snippet or "",
        "notes": req.notes or "",
        "answers": answers_data,
        "status": "in_progress",
        "updated_at": now,
    }

    await db.assignment_submissions.update_one(
        {"assignment_id": aid, "user_id": uid},
        {"$set": draft_doc},
        upsert=True
    )

    await db.assignment_allocations.update_one(
        {"assignment_id": aid, "user_id": uid},
        {"$set": {"status": "in_progress", "updated_at": now}}
    )

    return {"message": "Draft progress auto-saved successfully", "updated_at": now.isoformat()}


@router.post("/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    req: SubmitAssignmentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Final assignment submission.
    1. Validates deadline and late policies.
    2. Auto-grades MCQs server-side against protected answer keys.
    3. Records coding and short-answer answers for review.
    4. Enforces duplicate submission protection.
    """
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"template_key": assignment_id})
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    canonical_id = str(asg["_id"])
    now = datetime.now(timezone.utc)

    # Deadline validation
    deadline_str = asg.get("deadline")
    deadline_dt = None
    if deadline_str:
        try:
            deadline_dt = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
        except Exception:
            pass

    is_late = False
    late_penalty_applied = 0.0
    if deadline_dt:
        if deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
    if deadline_dt and now > deadline_dt:
        is_late = True
        policy = asg.get("late_submission_policy", "allow_penalty")
        if policy == "reject":
            raise HTTPException(status_code=400, detail="Submission rejected: Assignment deadline has passed.")
        elif policy == "allow_penalty":
            late_penalty_applied = float(asg.get("late_penalty_percent", 10.0))

    # Clean deliverables
    repo = None
    if req.github_url and req.github_url.strip():
        raw_url = req.github_url.strip()
        if not (raw_url.startswith("http://") or raw_url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Repository URL must start with http:// or https://")
        repo = _clean_url(raw_url)
        if not repo:
            raise HTTPException(status_code=400, detail="Invalid repository URL format")
    live_url = _clean_url(req.live_url)

    # Process questions and auto-grade MCQs
    questions = asg.get("questions", [])
    q_map = {q.get("question_id") or q.get("id"): q for q in questions}

    evaluated_answers: List[Dict[str, Any]] = []
    total_earned_marks = 0.0
    max_total_marks = float(asg.get("total_marks") or asg.get("max_score", 100))
    has_manual_review_items = False

    answers_in = {a.question_id: a for a in req.answers}

    for q in questions:
        qid = q.get("question_id") or q.get("id")
        qtype = q.get("type", "mcq")
        qpoints = float(q.get("points", 10))
        st_ans = answers_in.get(qid)

        ans_record: Dict[str, Any] = {
            "question_id": qid,
            "type": qtype,
            "points": qpoints,
            "awarded_marks": 0.0,
            "status": "pending_review",
            "feedback": "",
        }

        if qtype == "mcq":
            correct_opt = q.get("correct_answer")
            selected_opt = st_ans.selected_option if st_ans else None
            ans_record["selected_option"] = selected_opt
            if selected_opt is not None and correct_opt is not None and int(selected_opt) == int(correct_opt):
                ans_record["awarded_marks"] = qpoints
                ans_record["status"] = "correct"
                total_earned_marks += qpoints
            else:
                ans_record["awarded_marks"] = 0.0
                ans_record["status"] = "incorrect"
        elif qtype in ("simple_coding", "hard_coding", "coding"):
            ans_record["code"] = st_ans.code if st_ans else ""
            ans_record["language"] = st_ans.language if st_ans else "python"
            # If code is provided, award basic structure points; sandboxed execution marks pending
            if st_ans and (st_ans.code or "").strip():
                ans_record["awarded_marks"] = round(qpoints * 0.7, 1)  # Preliminary score
                ans_record["status"] = "pending_faculty_review"
                total_earned_marks += ans_record["awarded_marks"]
            has_manual_review_items = True
        elif qtype == "short_answer":
            ans_record["text_answer"] = st_ans.text_answer if st_ans else ""
            ans_record["awarded_marks"] = 0.0
            ans_record["status"] = "pending_manual_grading"
            has_manual_review_items = True

        evaluated_answers.append(ans_record)

    # Deliverables fallback rubric if no questions were embedded
    if not questions:
        auto_score = 75.0
        if repo and ("github.com" in repo.lower() or "gitlab.com" in repo.lower()):
            auto_score += 15.0
        if live_url:
            auto_score += 5.0
        total_earned_marks = min(98.0, auto_score)
        has_manual_review_items = True

    # Apply late penalty if applicable
    if is_late and late_penalty_applied > 0:
        penalty_deduction = (late_penalty_applied / 100.0) * total_earned_marks
        total_earned_marks = max(0.0, total_earned_marks - penalty_deduction)

    # Determine final or initial submission status
    # If all items were MCQs, we can evaluate immediately!
    sub_status = "evaluated" if (questions and not has_manual_review_items) else "submitted"

    evaluation_msg = (
        f"Automated evaluation completed ({round(total_earned_marks, 1)} marks)."
        if sub_status == "evaluated"
        else f"Preliminary check completed ({round(total_earned_marks, 1)} marks); pending faculty review."
    )
    if is_late:
        evaluation_msg += f" (Late submission penalty: {late_penalty_applied}% applied)."

    sub_doc = {
        "assignment_id": canonical_id,
        "template_key": asg.get("template_key"),
        "assignment_title": asg.get("title"),
        "skill": asg.get("skill"),
        "user_id": uid,
        "student_name": current_user.get("display_name") or current_user.get("name") or "Student",
        "student_email": current_user.get("email") or "",
        "github_url": repo,
        "live_url": live_url,
        "code_snippet": req.code_snippet.strip(),
        "notes": req.notes.strip(),
        "answers": evaluated_answers,
        "score": round(total_earned_marks, 1),
        "auto_score": round(total_earned_marks, 1),
        "max_score": max_total_marks,
        "is_late": is_late,
        "late_penalty_percent": late_penalty_applied,
        "evaluation": evaluation_msg,
        "status": sub_status,
        "submitted_at": now,
        "updated_at": now,
    }

    await db.assignment_submissions.replace_one(
        {"assignment_id": canonical_id, "user_id": uid},
        sub_doc,
        upsert=True,
    )

    # Update allocation record
    await db.assignment_allocations.update_one(
        {"assignment_id": canonical_id, "user_id": uid},
        {"$set": {
            "status": sub_status,
            "submitted_at": now,
            "score": round(total_earned_marks, 1),
            "updated_at": now,
        }},
        upsert=True
    )

    # Notify student
    await db.notifications.insert_one({
        "user_id": uid,
        "title": f"Assignment Submitted: {asg.get('title')}",
        "message": evaluation_msg,
        "type": "assignment",
        "category": "assignment",
        "is_read": False,
        "created_at": now,
    })

    readiness = await compute_and_store_readiness(uid, db)

    return {
        "message": "Assignment submitted successfully",
        "assignment_id": canonical_id,
        "score": round(total_earned_marks, 1),
        "auto_score": round(total_earned_marks, 1),
        "max_score": max_total_marks,
        "status": sub_status,
        "evaluation": evaluation_msg,
        "is_late": is_late,
        "readiness_score": readiness.get("overall_score", 0),
    }


@router.get("/{assignment_id}/result")
async def get_assignment_result(
    assignment_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Get student's results and feedback.
    When status is 'evaluated', answer explanations and correct answers are released!
    """
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"template_key": assignment_id})
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    aid = str(asg["_id"])
    sub = await db.assignment_submissions.find_one({"assignment_id": aid, "user_id": uid})
    if not sub:
        raise HTTPException(status_code=404, detail="No submission found for this assignment")

    is_evaluated = sub.get("status") == "evaluated"
    questions = asg.get("questions", [])

    # If evaluated, release correct answers and explanations
    released_questions = [_sanitize_question_for_student(q, release_answers=is_evaluated) for q in questions]

    return {
        "assignment_id": aid,
        "assignment_title": asg.get("title"),
        "status": sub.get("status", "submitted"),
        "score": sub.get("score"),
        "auto_score": sub.get("auto_score"),
        "max_score": sub.get("max_score") or asg.get("total_marks", 100),
        "is_late": sub.get("is_late", False),
        "evaluation": sub.get("evaluation"),
        "feedback": sub.get("evaluation"),
        "reviewed_by": sub.get("reviewed_by"),
        "reviewed_at": sub.get("reviewed_at"),
        "submitted_at": sub.get("submitted_at"),
        "answers": sub.get("answers", []),
        "questions": released_questions,
    }


@router.get("/submissions/me")
async def get_my_submissions(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """List authenticated student's assignment submissions."""
    uid = current_user.get("firebase_uid") or str(current_user.get("_id", ""))
    docs = await db.assignment_submissions.find({"user_id": uid}).sort("submitted_at", -1).to_list(length=100)
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if isinstance(d.get("submitted_at"), datetime):
            d["submitted_at"] = d["submitted_at"].isoformat()
        if isinstance(d.get("reviewed_at"), datetime):
            d["reviewed_at"] = d["reviewed_at"].isoformat()
    return docs


# ==============================================================================
# ADMINISTRATOR ROUTES: Dashboard, Wizard, Allocation, Grading & Analytics
# ==============================================================================

@router.get("/admin/dashboard-stats")
async def get_admin_dashboard_stats(
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Provide high-level KPI metrics across assignments, allocations, and submissions."""
    now = datetime.now(timezone.utc)

    total_assignments = await db.assignments.count_documents({})
    published_assignments = await db.assignments.count_documents({"status": "published"})
    draft_assignments = await db.assignments.count_documents({"status": "draft"})

    total_allocated = await db.assignment_allocations.count_documents({})
    pending_submissions = await db.assignment_allocations.count_documents({
        "status": {"$in": ["not_started", "in_progress"]}
    })
    total_submitted = await db.assignment_submissions.count_documents({})
    evaluations_pending = await db.assignment_submissions.count_documents({"status": "submitted"})
    completed_evaluations = await db.assignment_submissions.count_documents({"status": "evaluated"})

    # Overdue count
    overdue_count = await db.assignment_allocations.count_documents({
        "status": {"$in": ["not_started", "in_progress", "overdue"]},
        "deadline": {"$lt": now}
    })

    return {
        "total_assignments": total_assignments,
        "published_assignments": published_assignments,
        "draft_assignments": draft_assignments,
        "total_allocated_students": total_allocated,
        "pending_submissions": pending_submissions,
        "submitted_assignments": total_submitted,
        "overdue_assignments": overdue_count,
        "evaluations_pending": evaluations_pending,
        "completed_evaluations": completed_evaluations,
    }


@router.get("/admin/list")
async def list_admin_assignments(
    q: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    category_filter: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """List all assignments with filtering, sorting, question count, and allocation statistics."""
    query: Dict[str, Any] = {}
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    if category_filter and category_filter != "all":
        query["category"] = category_filter
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"skill": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    total = await db.assignments.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.assignments.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)

    results: List[Dict[str, Any]] = []
    for d in docs:
        aid = str(d["_id"])
        alloc_count = await db.assignment_allocations.count_documents({"assignment_id": aid})
        sub_count = await db.assignment_submissions.count_documents({"assignment_id": aid})
        eval_count = await db.assignment_submissions.count_documents({"assignment_id": aid, "status": "evaluated"})

        results.append({
            "id": aid,
            "title": d.get("title"),
            "category": d.get("category", "Technical"),
            "skill": d.get("skill"),
            "difficulty": d.get("difficulty", "Intermediate"),
            "total_marks": d.get("total_marks") or d.get("max_score", 100),
            "question_count": len(d.get("questions", [])),
            "allocated_students_count": alloc_count,
            "submissions_count": sub_count,
            "evaluated_count": eval_count,
            "deadline": d.get("deadline"),
            "status": d.get("status", "published"),
            "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
        })

    return {
        "items": results,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("/admin/allocation-preview")
async def preview_target_students(
    req: AllocationPreviewRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Preview students matching target allocation filters before publishing."""
    payload = AllocationFilterPayload(
        target_type=req.target_type,
        departments=req.departments,
        batches=req.batches,
        skills=req.skills,
        student_uids=req.student_uids,
    )
    students = await resolve_target_students(db, payload)
    return {
        "matched_count": len(students),
        "students": students[:50],  # Preview first 50
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    req: CreateAssignmentRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """
    4-Step Assignment Creation Wizard endpoint:
    1. Assignment Details
    2. Add Questions (MCQ, Coding, Short Answer) with individual points
    3. Student Allocation
    4. Review and Publish
    """
    now = datetime.now(timezone.utc)
    deliverables = req.deliverables or ["GitHub Repository URL", "Design Architecture Notes"]
    deadline = req.deadline or f"Within {req.due_in_days} Days"

    deadline_dt = None
    if req.deadline:
        try:
            deadline_dt = datetime.fromisoformat(req.deadline.replace("Z", "+00:00"))
        except Exception:
            deadline_dt = now + timedelta(days=req.due_in_days)
    else:
        deadline_dt = now + timedelta(days=req.due_in_days)

    # Process and validate questions
    processed_questions: List[Dict[str, Any]] = []
    computed_total_marks = 0
    for idx, q_in in enumerate(req.questions):
        qid = q_in.question_id or f"asg-q-{uuid.uuid4().hex[:8]}"
        q_dict = q_in.model_dump()
        q_dict["question_id"] = qid
        q_dict["order"] = idx + 1
        processed_questions.append(q_dict)
        computed_total_marks += q_in.points

    total_marks = req.total_marks or (computed_total_marks if computed_total_marks > 0 else req.max_score)

    doc = {
        "title": req.title.strip(),
        "description": req.description.strip(),
        "instructions": req.instructions,
        "category": req.category,
        "skill": req.skill.strip(),
        "difficulty": req.difficulty,
        "total_marks": total_marks,
        "max_score": total_marks,
        "start_time": req.start_time,
        "deadline": req.deadline or deadline_dt.isoformat(),
        "duration_minutes": req.duration_minutes,
        "late_submission_policy": req.late_submission_policy,
        "late_penalty_percent": req.late_penalty_percent,
        "deliverables": deliverables,
        "estimated_hours": req.estimated_hours,
        "due_in_days": req.due_in_days,
        "week_number": req.week_number,
        "status": req.status,
        "questions": processed_questions,
        "created_by": current_admin.get("firebase_uid"),
        "created_at": now,
        "updated_at": now,
    }

    for attempt in range(3):
        try:
            result = await db.assignments.insert_one(doc)
            break
        except pymongo.errors.AutoReconnect:
            if attempt == 2:
                raise
            await asyncio.sleep(0.3)
    canonical_id = str(result.inserted_id)

    # If allocation specified and status is 'published', allocate to students
    allocated_count = 0
    if req.allocation and req.status == "published":
        target_students = await resolve_target_students(db, req.allocation)
        allocated_count = await create_student_allocations(
            db, canonical_id, target_students, deadline_dt, float(total_marks)
        )

    doc["id"] = canonical_id
    doc["allocated_students_count"] = allocated_count
    doc.pop("_id", None)
    return doc


@router.put("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    req: UpdateAssignmentRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Admin updates an assignment, questions, or allocation settings."""
    asg_oid = None
    try:
        asg_oid = ObjectId(assignment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    now = datetime.now(timezone.utc)
    updates: Dict[str, Any] = {"updated_at": now}

    if req.title is not None:
        updates["title"] = req.title.strip()
    if req.description is not None:
        updates["description"] = req.description.strip()
    if req.instructions is not None:
        updates["instructions"] = req.instructions
    if req.category is not None:
        updates["category"] = req.category
    if req.skill is not None:
        updates["skill"] = req.skill.strip()
    if req.difficulty is not None:
        updates["difficulty"] = req.difficulty
    if req.total_marks is not None:
        updates["total_marks"] = req.total_marks
        updates["max_score"] = req.total_marks
    if req.start_time is not None:
        updates["start_time"] = req.start_time
    if req.deadline is not None:
        updates["deadline"] = req.deadline
    if req.duration_minutes is not None:
        updates["duration_minutes"] = req.duration_minutes
    if req.late_submission_policy is not None:
        updates["late_submission_policy"] = req.late_submission_policy
    if req.late_penalty_percent is not None:
        updates["late_penalty_percent"] = req.late_penalty_percent
    if req.deliverables is not None:
        updates["deliverables"] = req.deliverables
    if req.estimated_hours is not None:
        updates["estimated_hours"] = req.estimated_hours
    if req.due_in_days is not None:
        updates["due_in_days"] = req.due_in_days
    if req.week_number is not None:
        updates["week_number"] = req.week_number
    if req.status is not None:
        updates["status"] = req.status
    if req.questions is not None:
        processed: List[Dict[str, Any]] = []
        for idx, q_in in enumerate(req.questions):
            qid = q_in.question_id or f"asg-q-{uuid.uuid4().hex[:8]}"
            q_dict = q_in.model_dump()
            q_dict["question_id"] = qid
            q_dict["order"] = idx + 1
            processed.append(q_dict)
        updates["questions"] = processed

    res = await db.assignments.update_one({"_id": asg_oid}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # If allocation updated, trigger re-allocation
    if req.allocation:
        target_students = await resolve_target_students(db, req.allocation)
        deadline_dt = None
        if req.deadline:
            try:
                deadline_dt = datetime.fromisoformat(req.deadline.replace("Z", "+00:00"))
            except Exception:
                pass
        await create_student_allocations(db, assignment_id, target_students, deadline_dt, 100.0)

    updated = await db.assignments.find_one({"_id": asg_oid})
    updated["id"] = str(updated.pop("_id"))
    return updated


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Delete an assignment and clean up related allocations."""
    asg_oid = None
    try:
        asg_oid = ObjectId(assignment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    res = await db.assignments.delete_one({"_id": asg_oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await db.assignment_allocations.delete_many({"assignment_id": assignment_id})
    return {"message": "Assignment deleted successfully", "id": assignment_id}


@router.post("/admin/{assignment_id}/duplicate")
async def duplicate_assignment(
    assignment_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Duplicate an assignment as a new draft."""
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    now = datetime.now(timezone.utc)
    copy_doc = dict(asg)
    copy_doc.pop("_id", None)
    copy_doc["title"] = f"{asg.get('title', 'Assignment')} (Copy)"
    copy_doc["status"] = "draft"
    copy_doc["created_at"] = now
    copy_doc["updated_at"] = now

    result = await db.assignments.insert_one(copy_doc)
    return {"message": "Assignment duplicated as draft", "id": str(result.inserted_id)}


@router.patch("/admin/{assignment_id}/status")
async def update_assignment_status(
    assignment_id: str,
    req: UpdateStatusRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Toggle status between draft, published, and archived."""
    asg_oid = None
    try:
        asg_oid = ObjectId(assignment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    now = datetime.now(timezone.utc)
    res = await db.assignments.update_one(
        {"_id": asg_oid},
        {"$set": {"status": req.status, "updated_at": now}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return {"message": f"Status updated to {req.status}", "id": assignment_id, "status": req.status}


@router.post("/admin/{assignment_id}/allocate")
async def allocate_assignment_to_students(
    assignment_id: str,
    req: AllocationFilterPayload,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Allocate an existing assignment to a selected student cohort."""
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    target_students = await resolve_target_students(db, req)
    deadline_dt = None
    if asg.get("deadline"):
        try:
            deadline_dt = datetime.fromisoformat(asg["deadline"].replace("Z", "+00:00"))
        except Exception:
            pass

    max_score = float(asg.get("total_marks") or asg.get("max_score", 100))
    allocated_count = await create_student_allocations(db, assignment_id, target_students, deadline_dt, max_score)

    return {
        "message": f"Successfully allocated assignment to {allocated_count} students.",
        "allocated_count": allocated_count,
    }


@router.get("/admin/{assignment_id}/analytics")
async def get_assignment_analytics(
    assignment_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Deep inspection of student performance, submission rates, and question analytics."""
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    allocations = await db.assignment_allocations.find({"assignment_id": assignment_id}).to_list(length=500)
    submissions = await db.assignment_submissions.find({"assignment_id": assignment_id}).to_list(length=500)
    sub_map = {s.get("user_id"): s for s in submissions}

    total_allocated = len(allocations)
    submitted_count = len(submissions)
    evaluated_count = sum(1 for s in submissions if s.get("status") == "evaluated")

    scores = [s.get("score", 0) for s in submissions if s.get("score") is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
    highest_score = max(scores) if scores else 0.0
    lowest_score = min(scores) if scores else 0.0

    # Students requiring attention (overdue or score < 50%)
    attention_list: List[Dict[str, Any]] = []
    for a in allocations:
        uid = a.get("user_id")
        sub = sub_map.get(uid)
        is_overdue = a.get("status") == "overdue"
        score_val = sub.get("score") if sub else None
        low_score = score_val is not None and score_val < 50.0

        if is_overdue or low_score or a.get("status") == "not_started":
            attention_list.append({
                "user_id": uid,
                "student_name": a.get("student_name"),
                "student_email": a.get("student_email"),
                "department": a.get("department"),
                "status": a.get("status"),
                "score": score_val,
                "reason": "Overdue Submission" if is_overdue else ("Low Performance (<50%)" if low_score else "Not Started"),
            })

    # Question-wise accuracy stats
    questions = asg.get("questions", [])
    question_stats: List[Dict[str, Any]] = []
    for q in questions:
        qid = q.get("question_id") or q.get("id")
        qpoints = float(q.get("points", 10))
        earned_list = []
        for s in submissions:
            for ans in s.get("answers", []):
                if ans.get("question_id") == qid:
                    earned_list.append(float(ans.get("awarded_marks", 0.0)))
        q_avg = round(sum(earned_list) / len(earned_list), 1) if earned_list else 0.0
        q_rate = round((q_avg / qpoints) * 100, 1) if qpoints > 0 else 0.0
        question_stats.append({
            "question_id": qid,
            "title": q.get("title") or q.get("question_text", "")[:40],
            "type": q.get("type"),
            "max_points": qpoints,
            "average_earned": q_avg,
            "accuracy_percent": q_rate,
        })

    return {
        "assignment_id": assignment_id,
        "title": asg.get("title"),
        "total_allocated": total_allocated,
        "submitted_count": submitted_count,
        "evaluated_count": evaluated_count,
        "submission_rate": round((submitted_count / total_allocated) * 100, 1) if total_allocated > 0 else 0.0,
        "average_score": avg_score,
        "highest_score": highest_score,
        "lowest_score": lowest_score,
        "question_stats": question_stats,
        "students_requiring_attention": attention_list[:30],
        "allocations": allocations[:100],
    }


@router.get("/admin/{assignment_id}/export-csv")
async def export_assignment_results_csv(
    assignment_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Generate and download RFC4180 CSV report of all student results for this assignment."""
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        pass
    if not asg:
        raise HTTPException(status_code=404, detail="Assignment not found")

    allocations = await db.assignment_allocations.find({"assignment_id": assignment_id}).to_list(length=1000)
    submissions = await db.assignment_submissions.find({"assignment_id": assignment_id}).to_list(length=1000)
    sub_map = {s.get("user_id"): s for s in submissions}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Student UID",
        "Student Name",
        "Student Email",
        "Department",
        "Graduation Year",
        "Status",
        "Score",
        "Max Score",
        "Submitted At",
        "Faculty Feedback",
    ])

    for a in allocations:
        uid = a.get("user_id")
        sub = sub_map.get(uid)
        score_val = sub.get("score", "") if sub else ""
        sub_at = sub.get("submitted_at") if sub else ""
        feedback_val = sub.get("evaluation", "") if sub else ""
        if isinstance(sub_at, datetime):
            sub_at = sub_at.isoformat()

        writer.writerow([
            uid,
            a.get("student_name", "Student"),
            a.get("student_email", ""),
            a.get("department", ""),
            a.get("graduation_year", ""),
            a.get("status", "not_started"),
            score_val,
            a.get("max_score", 100),
            sub_at,
            feedback_val,
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=assignment_{assignment_id}_results.csv"
        }
    )


@router.get("/admin/submissions")
async def get_admin_submissions(
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """List all student assignment submissions across the platform for faculty review."""
    submissions = await db.assignment_submissions.find().sort("submitted_at", -1).to_list(length=200)

    user_ids = list({s.get("user_id") for s in submissions if s.get("user_id")})
    users_cursor = db.users.find({"firebase_uid": {"$in": user_ids}})
    users_map = {u.get("firebase_uid"): u async for u in users_cursor}

    asg_ids = []
    for s in submissions:
        raw_aid = s.get("assignment_id")
        if raw_aid:
            try:
                asg_ids.append(ObjectId(raw_aid))
            except Exception:
                pass
    asgs_cursor = db.assignments.find({"_id": {"$in": asg_ids}})
    asgs_map = {str(a["_id"]): a async for a in asgs_cursor}

    items: List[Dict[str, Any]] = []
    for s in submissions:
        sub_id = str(s.get("_id"))
        uid = s.get("user_id")
        user = users_map.get(uid) or {}
        aid = str(s.get("assignment_id"))
        asg = asgs_map.get(aid) or {}

        items.append({
            "id": sub_id,
            "submission_id": sub_id,
            "assignment_id": aid,
            "assignment_title": s.get("assignment_title") or asg.get("title") or "Engineering Assignment",
            "skill": s.get("skill") or asg.get("skill") or "Software Engineering",
            "student_id": uid,
            "student_name": s.get("student_name") or user.get("display_name") or user.get("name") or "Student",
            "student_email": s.get("student_email") or user.get("email") or "student@campus.edu",
            "github_url": s.get("github_url") or "",
            "live_url": s.get("live_url"),
            "code_snippet": s.get("code_snippet") or "",
            "notes": s.get("notes") or "",
            "answers": s.get("answers", []),
            "auto_score": s.get("auto_score") or s.get("score") or 0,
            "grade": s.get("score"),
            "feedback": s.get("evaluation") or "",
            "status": "Graded" if s.get("status") == "evaluated" else "Submitted",
            "reviewed_by": s.get("reviewed_by"),
            "reviewed_at": s["reviewed_at"].isoformat() if isinstance(s.get("reviewed_at"), datetime) else s.get("reviewed_at"),
            "submitted_at": s["submitted_at"].isoformat() if isinstance(s.get("submitted_at"), datetime) else s.get("submitted_at"),
        })

    return items


@router.get("/admin/submissions/{submission_id}")
async def get_admin_submission_detail(
    submission_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """Retrieve complete submission detail along with assignment questions and answer keys for grading."""
    sub = None
    try:
        sub = await db.assignment_submissions.find_one({"_id": ObjectId(submission_id)})
    except Exception:
        pass
    if not sub:
        sub = await db.assignment_submissions.find_one({"assignment_id": submission_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    aid = sub.get("assignment_id")
    asg = None
    try:
        asg = await db.assignments.find_one({"_id": ObjectId(aid)})
    except Exception:
        pass

    sub["id"] = str(sub.pop("_id"))
    sub["assignment"] = asg
    return sub


@router.post("/admin/submissions/{submission_id}/grade")
async def grade_student_submission(
    submission_id: str,
    req: GradeSubmissionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ASSIGNMENT_ADMIN_ROLES)),
    db=Depends(get_database),
):
    """
    Faculty reviews and assigns official grade & feedback.
    Supports question-by-question marks for short-answers and coding,
    updates placement readiness, logs audit trail, and notifies student.
    """
    sub = None
    try:
        sub = await db.assignment_submissions.find_one({"_id": ObjectId(submission_id)})
    except Exception:
        pass
    if not sub:
        sub = await db.assignment_submissions.find_one({"assignment_id": submission_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    now = datetime.now(timezone.utc)
    reviewer_name = current_admin.get("display_name") or current_admin.get("name") or "Faculty Reviewer"
    reviewer_email = current_admin.get("email") or "faculty@campus.edu"
    reviewer_label = f"{reviewer_name} ({reviewer_email})"

    # Update individual question scores if provided
    answers = sub.get("answers", [])
    if req.question_scores:
        score_dict = {qs.question_id: qs for qs in req.question_scores}
        total_q_score = 0.0
        for ans in answers:
            qid = ans.get("question_id")
            if qid in score_dict:
                item = score_dict[qid]
                ans["awarded_marks"] = item.awarded_marks
                if item.feedback:
                    ans["feedback"] = item.feedback
                ans["status"] = "graded"
            total_q_score += float(ans.get("awarded_marks", 0.0))
        final_score = total_q_score if req.score is None else float(req.score)
    else:
        final_score = float(req.score) if req.score is not None else float(sub.get("score", 85.0))

    final_score = round(final_score, 1)
    feedback_val = (req.feedback or "").strip() or "Evaluated against industry rubric specifications."

    update_fields = {
        "score": final_score,
        "answers": answers,
        "evaluation": feedback_val,
        "status": "evaluated",
        "reviewed_by": reviewer_label,
        "reviewed_at": now,
    }

    await db.assignment_submissions.update_one(
        {"_id": sub["_id"]},
        {"$set": update_fields}
    )

    # Update allocation record
    student_uid = sub.get("user_id")
    aid = sub.get("assignment_id")
    if student_uid and aid:
        await db.assignment_allocations.update_one(
            {"assignment_id": aid, "user_id": student_uid},
            {"$set": {
                "status": "evaluated",
                "score": final_score,
                "evaluated_at": now,
                "updated_at": now,
            }}
        )

        # Notify student
        await db.notifications.insert_one({
            "user_id": student_uid,
            "title": f"Assignment Graded: {sub.get('assignment_title', 'Engineering Project')}",
            "message": f"Faculty evaluation recorded. Grade: {final_score}. Feedback: {feedback_val}",
            "type": "grade",
            "category": "assignment",
            "is_read": False,
            "created_at": now,
        })

        # Re-compute readiness
        await compute_and_store_readiness(student_uid, db)

    # Admin audit log
    await db.admin_audit_logs.insert_one({
        "admin_uid": current_admin.get("firebase_uid") or str(current_admin.get("_id")),
        "admin_email": reviewer_email,
        "action": "grade_assignment_submission",
        "target_submission_id": str(sub["_id"]),
        "student_uid": student_uid,
        "score": final_score,
        "timestamp": now,
    })

    return {
        "message": "Submission successfully evaluated and grade persisted",
        "submission_id": str(sub["_id"]),
        "grade": final_score,
        "feedback": feedback_val,
        "reviewed_by": reviewer_label,
        "reviewed_at": now.isoformat(),
        "status": "evaluated",
    }
