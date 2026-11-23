from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user, require_role
from app.db.mongodb import get_database
from app.services.assessment_utils import sanitize_question_for_student, upgrade_legacy_coding_question_if_needed
from app.services.code_executor import SUPPORTED_LANGUAGES

router = APIRouter()


class TestCasePayload(BaseModel):
    id: Optional[str] = None
    label: str = "Test Case"
    input: str = ""
    expected: str = ""
    is_hidden: bool = False
    weight: float = Field(default=1.0, ge=0.1, le=10.0)


class CreateQuestionRequest(BaseModel):
    skill_id: str = "python"
    skill_name: Optional[str] = None
    category: str = "Technical Skills"
    type: str  # mcq, simple_coding, hard_coding, short_answer
    title: Optional[str] = None
    question_text: str
    input_format: Optional[str] = "Standard input (stdin)"
    output_format: Optional[str] = "Standard output (stdout)"
    constraints: List[str] = []
    explanation: Optional[str] = None
    points: int = Field(default=10, ge=1, le=100)
    difficulty: str = "medium"
    estimated_minutes: int = Field(default=15, ge=1, le=180)
    instructions: Optional[str] = None
    tags: List[str] = []
    expected_answer: Optional[str] = None
    rubric: Optional[str] = None
    admin_feedback: Optional[str] = None
    partial_credit: bool = True
    supported_languages: List[str] = list(SUPPORTED_LANGUAGES)
    time_limit_ms: int = Field(default=2000, ge=200, le=10000)
    memory_limit_kb: int = Field(default=262144, ge=32768, le=524288)
    starter_code: Dict[str, str] = {}
    test_cases: List[TestCasePayload] = []
    options: List[str] = []
    correct_answer: int = 0
    approval_status: str = "approved"  # draft, pending_review, approved, archived


class UpdateQuestionRequest(BaseModel):
    title: Optional[str] = None
    question_text: Optional[str] = None
    category: Optional[str] = None
    skill_id: Optional[str] = None
    skill_name: Optional[str] = None
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[List[str]] = None
    explanation: Optional[str] = None
    points: Optional[int] = Field(default=None, ge=1, le=100)
    difficulty: Optional[str] = None
    estimated_minutes: Optional[int] = Field(default=None, ge=1, le=180)
    instructions: Optional[str] = None
    tags: Optional[List[str]] = None
    expected_answer: Optional[str] = None
    rubric: Optional[str] = None
    admin_feedback: Optional[str] = None
    partial_credit: Optional[bool] = None
    supported_languages: Optional[List[str]] = None
    time_limit_ms: Optional[int] = Field(default=None, ge=200, le=10000)
    memory_limit_kb: Optional[int] = Field(default=None, ge=32768, le=524288)
    starter_code: Optional[Dict[str, str]] = None
    test_cases: Optional[List[TestCasePayload]] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[int] = None
    approval_status: Optional[str] = None


class ApproveQuestionRequest(BaseModel):
    approval_status: str = "approved"


def _is_admin(user: Dict[str, Any]) -> bool:
    role = str(user.get("role", "STUDENT")).upper()
    return role in ("ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER")


def _normalize_test_cases(raw_cases: List[TestCasePayload]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for idx, tc in enumerate(raw_cases):
        normalized.append(
            {
                "id": tc.id or f"tc-{idx + 1}-{uuid.uuid4().hex[:6]}",
                "label": tc.label or (f"Hidden Case {idx + 1}" if tc.is_hidden else f"Sample Case {idx + 1}"),
                "input": tc.input,
                "expected": tc.expected,
                "is_hidden": bool(tc.is_hidden),
                "weight": float(tc.weight or 1.0),
            }
        )
    return normalized


def _format_question_record(
    q: Dict[str, Any],
    *,
    is_admin: bool,
    skill_id: str = "",
    skill_name: str = "",
    category: str = "Technical Skills",
) -> Dict[str, Any]:
    upgraded = upgrade_legacy_coding_question_if_needed(q, skill_name or skill_id or "Software Engineering")
    base = dict(upgraded) if is_admin else sanitize_question_for_student(upgraded)
    base.pop("expected_keywords", None)

    q_text = base.get("question") or base.get("problem_statement") or base.get("title") or ""
    record: Dict[str, Any] = {
        "id": base.get("id"),
        "skill_id": base.get("skill_id") or skill_id,
        "skill_name": base.get("skill_name") or skill_name or skill_id,
        "category": base.get("category") or category,
        "type": base.get("type"),
        "title": base.get("title") or q_text[:80],
        "question_text": q_text,
        "problem_statement": base.get("problem_statement") or q_text,
        "input_format": base.get("input_format", "Standard input (stdin)"),
        "output_format": base.get("output_format", "Standard output (stdout)"),
        "constraints": base.get("constraints", []),
        "points": base.get("points", 10),
        "difficulty": base.get("difficulty", "medium"),
        "estimated_minutes": base.get("estimated_minutes", 15),
        "instructions": base.get("instructions"),
        "tags": base.get("tags", []),
        "partial_credit": base.get("partial_credit", True),
        "supported_languages": base.get("supported_languages", list(SUPPORTED_LANGUAGES)),
        "time_limit_ms": base.get("time_limit_ms", 2000),
        "memory_limit_kb": base.get("memory_limit_kb", 262144),
        "starter_code": base.get("starter_code", {}),
        "test_cases": base.get("test_cases", []),
        "hidden_test_count": (
            sum(1 for tc in upgraded.get("test_cases", []) if tc.get("is_hidden"))
            if is_admin
            else base.get("hidden_test_count", 0)
        ),
        "approval_status": base.get("approval_status", "approved"),
        "options": [
            {"id": f"opt-{idx}", "option_text": opt, "order_index": idx}
            for idx, opt in enumerate(base.get("options", []))
        ],
    }
    if is_admin:
        record["explanation"] = base.get("explanation")
        record["correct_answer"] = base.get("correct_answer")
        record["expected_answer"] = base.get("expected_answer")
        record["rubric"] = base.get("rubric")
        record["admin_feedback"] = base.get("admin_feedback")
    return record


@router.get("")
async def list_questions(
    type: Optional[str] = Query(None),
    skill: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """List questions from MongoDB catalog. Private hidden tests are exposed ONLY to ADMIN / SUPER_ADMIN."""
    is_admin = _is_admin(current_user)
    seen_ids = set()
    all_questions: List[Dict[str, Any]] = []

    standalone_cursor = db.coding_questions.find({})
    async for sq in standalone_cursor:
        sq.pop("_id", None)
        if not is_admin and sq.get("approval_status", "approved") != "approved":
            continue
        if type and sq.get("type") != type and not (type == "coding" and sq.get("type") in ("simple_coding", "hard_coding")):
            continue
        if skill and skill.lower() not in (sq.get("skill_id", "") + " " + sq.get("skill_name", "") + " " + sq.get("category", "")).lower():
            continue
        if approval_status and sq.get("approval_status", "approved") != approval_status:
            continue
        seen_ids.add(sq.get("id"))
        all_questions.append(_format_question_record(sq, is_admin=is_admin))

    assessments = await db.assessments.find({}).to_list(length=50)
    for a in assessments:
        sk_id = a.get("skill_id", "")
        sk_name = a.get("skill_name", sk_id)
        cat = a.get("category", "Technical Skills")
        if skill and skill.lower() not in f"{sk_id} {sk_name} {cat}".lower():
            continue
        for q in a.get("questions", []):
            qid = q.get("id")
            if qid in seen_ids:
                continue
            qtype = q.get("type", "")
            if type and qtype != type and not (type == "coding" and qtype in ("simple_coding", "hard_coding")):
                continue
            if approval_status and q.get("approval_status", "approved") != approval_status:
                continue
            if not is_admin and q.get("approval_status", "approved") != "approved":
                continue
            seen_ids.add(qid)
            all_questions.append(
                _format_question_record(q, is_admin=is_admin, skill_id=sk_id, skill_name=sk_name, category=cat)
            )

    return all_questions


@router.get("/{question_id}")
async def get_question_detail(
    question_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Retrieve a single question (hidden test cases included ONLY for admins)."""
    is_admin = _is_admin(current_user)
    sq = await db.coding_questions.find_one({"id": question_id})
    if sq:
        sq.pop("_id", None)
        if not is_admin and sq.get("approval_status", "approved") != "approved":
            raise HTTPException(status_code=403, detail="Question is not published.")
        return _format_question_record(sq, is_admin=is_admin)

    asmt = await db.assessments.find_one({"questions.id": question_id})
    if asmt:
        for q in asmt.get("questions", []):
            if q.get("id") == question_id:
                return _format_question_record(
                    q,
                    is_admin=is_admin,
                    skill_id=asmt.get("skill_id", ""),
                    skill_name=asmt.get("skill_name", ""),
                    category=asmt.get("category", "Technical Skills"),
                )
    raise HTTPException(status_code=404, detail="Question not found")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: CreateQuestionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Create a new MCQ or Sandboxed Coding question with public & hidden test cases."""
    is_coding = payload.type in ("simple_coding", "hard_coding", "coding")
    langs = [l.lower() for l in (payload.supported_languages or list(SUPPORTED_LANGUAGES)) if l.lower() in SUPPORTED_LANGUAGES]
    if is_coding:
        if not langs:
            raise HTTPException(status_code=400, detail="At least one valid supported language is required.")
        if not payload.test_cases:
            raise HTTPException(status_code=400, detail="Coding questions require at least one test case.")

    now = datetime.now(timezone.utc)
    qid = f"q-{uuid.uuid4().hex[:12]}"
    new_q: Dict[str, Any] = {
        "id": qid,
        "skill_id": payload.skill_id.lower().strip(),
        "skill_name": payload.skill_name or payload.skill_id.replace("-", " ").title(),
        "category": payload.category,
        "type": payload.type,
        "title": payload.title or payload.question_text[:80],
        "question": payload.question_text,
        "problem_statement": payload.question_text,
        "input_format": payload.input_format,
        "output_format": payload.output_format,
        "constraints": payload.constraints,
        "explanation": payload.explanation,
        "points": payload.points,
        "difficulty": payload.difficulty,
        "estimated_minutes": payload.estimated_minutes,
        "instructions": payload.instructions,
        "tags": payload.tags,
        "expected_answer": payload.expected_answer,
        "rubric": payload.rubric,
        "admin_feedback": payload.admin_feedback,
        "partial_credit": payload.partial_credit,
        "supported_languages": langs,
        "time_limit_ms": payload.time_limit_ms,
        "memory_limit_kb": payload.memory_limit_kb,
        "starter_code": payload.starter_code,
        "test_cases": _normalize_test_cases(payload.test_cases),
        "options": payload.options,
        "correct_answer": payload.correct_answer,
        "approval_status": payload.approval_status,
        "created_by": current_admin.get("firebase_uid"),
        "created_at": now,
        "updated_at": now,
    }
    await db.coding_questions.insert_one(dict(new_q))

    # Synchronize question directly into matching skill assessments in db.assessments
    skill_clean = payload.skill_id.lower().strip()
    asmts_cursor = db.assessments.find({
        "$or": [
            {"skill_id": skill_clean},
            {"id": {"$regex": f"^test-{skill_clean}-"}},
        ]
    })
    async for a in asmts_cursor:
        existing_qs = a.get("questions", [])
        if not any(eq.get("id") == qid for eq in existing_qs):
            updated_qs = list(existing_qs) + [new_q]
            await db.assessments.update_one(
                {"_id": a["_id"]},
                {"$set": {"questions": updated_qs, "updated_at": now}},
            )

    return _format_question_record(new_q, is_admin=True)


@router.put("/{question_id}")
async def update_question(
    question_id: str,
    payload: UpdateQuestionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Edit question fields, hidden test cases, limits, marks, and languages (propagates to assessments)."""
    updates: Dict[str, Any] = {}
    data = payload.model_dump(exclude_none=True)
    if "question_text" in data:
        updates["question"] = data["question_text"]
        updates["problem_statement"] = data["question_text"]
        del data["question_text"]
    if "supported_languages" in data:
        langs = [l.lower() for l in data["supported_languages"] if l.lower() in SUPPORTED_LANGUAGES]
        if not langs:
            raise HTTPException(status_code=400, detail="At least one supported language is required.")
        updates["supported_languages"] = langs
        del data["supported_languages"]
    if "test_cases" in data:
        updates["test_cases"] = _normalize_test_cases(payload.test_cases or [])
        del data["test_cases"]

    updates.update(data)
    updates["updated_at"] = datetime.now(timezone.utc)

    standalone = await db.coding_questions.find_one({"id": question_id})
    if standalone:
        await db.coding_questions.update_one({"id": question_id}, {"$set": updates})
        fresh = await db.coding_questions.find_one({"id": question_id})
        fresh.pop("_id", None)
        return _format_question_record(fresh, is_admin=True)

    # Otherwise update embedded question inside matching assessments
    asmts = await db.assessments.find({"questions.id": question_id}).to_list(length=20)
    if not asmts:
        raise HTTPException(status_code=404, detail="Question not found")

    updated_q: Optional[Dict[str, Any]] = None
    skill_meta = ("", "", "Technical Skills")
    for asmt in asmts:
        new_qs = []
        for q in asmt.get("questions", []):
            if q.get("id") == question_id:
                merged = {**q, **updates}
                new_qs.append(merged)
                updated_q = merged
                skill_meta = (asmt.get("skill_id", ""), asmt.get("skill_name", ""), asmt.get("category", "Technical Skills"))
            else:
                new_qs.append(q)
        await db.assessments.update_one(
            {"_id": asmt["_id"]},
            {"$set": {"questions": new_qs, "updated_at": datetime.now(timezone.utc)}},
        )

    return _format_question_record(
        updated_q or {},
        is_admin=True,
        skill_id=skill_meta[0],
        skill_name=skill_meta[1],
        category=skill_meta[2],
    )


@router.patch("/{question_id}/approve")
async def approve_question(
    question_id: str,
    payload: ApproveQuestionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Approve or update lifecycle status of a question in the question bank."""
    if payload.approval_status not in ("approved", "draft", "pending_review", "archived"):
        raise HTTPException(status_code=400, detail="approval_status must be approved, draft, pending_review, or archived")

    now = datetime.now(timezone.utc)
    res = await db.coding_questions.update_one(
        {"id": question_id},
        {"$set": {"approval_status": payload.approval_status, "approved_by": current_admin.get("firebase_uid"), "updated_at": now}},
    )
    if res.matched_count > 0:
        return {"id": question_id, "approval_status": payload.approval_status}

    asmt = await db.assessments.find_one({"questions.id": question_id})
    if not asmt:
        raise HTTPException(status_code=404, detail="Question not found")
    new_qs = [
        ({**q, "approval_status": payload.approval_status} if q.get("id") == question_id else q)
        for q in asmt.get("questions", [])
    ]
    await db.assessments.update_one({"_id": asmt["_id"]}, {"$set": {"questions": new_qs, "updated_at": now}})
    return {"id": question_id, "approval_status": payload.approval_status}


@router.delete("/{question_id}")
async def delete_question(
    question_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Delete a custom question created by administrators."""
    res = await db.coding_questions.delete_one({"id": question_id})
    # Also pull from any assessments that embedded it
    await db.assessments.update_many(
        {"questions.id": question_id},
        {"$pull": {"questions": {"id": question_id}}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Standalone question not found (built-in seed questions can be archived or edited instead).")
    return {"deleted": True, "id": question_id}
