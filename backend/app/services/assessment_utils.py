"""
Shared assessment lookup, student-safe sanitization, and sandboxed submission
orchestration helpers (`backend/app/services/assessment_utils.py`).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException

from app.services.code_executor import (
    SUPPORTED_LANGUAGES,
    CodeExecutionError,
    RateLimitExceededError,
    execute_and_grade_code,
    sanitize_execution_result_for_student,
)
from app.services.question_bank import build_assessment_for_skill


def upgrade_legacy_coding_question_if_needed(q: Dict[str, Any], skill_name: str) -> Dict[str, Any]:
    """
    If a stored MongoDB assessment document predates the sandboxed coding engine
    (e.g., carries heuristic `expected_keywords` and lacks structured `test_cases`),
    upgrade it seamlessly from the canonical question bank definition.
    Never overwrites or replaces custom user-created questions!
    """
    q_type = q.get("type", "")
    if q_type not in ("simple_coding", "hard_coding", "coding"):
        return q

    # If the question already has structured test_cases or custom content, NEVER replace it!
    test_cases = q.get("test_cases") or []
    if test_cases:
        # Normalize test case inputs for standard stdin
        normalized_cases = []
        for tc in test_cases:
            tc_copy = dict(tc)
            raw_in = str(tc_copy.get("input", ""))
            if raw_in and not raw_in.endswith("\n"):
                tc_copy["input"] = raw_in + "\n"
            normalized_cases.append(tc_copy)
        q["test_cases"] = normalized_cases
        if not isinstance(q.get("starter_code"), dict):
            q["starter_code"] = {}
        return q

    # Only upgrade known canonical question IDs that predate sandboxing
    q_id = q.get("id", "")
    fresh_10 = build_assessment_for_skill(skill_name=skill_name, size=10)
    by_id = {fq["id"]: fq for fq in fresh_10.get("questions", [])}
    if q_id in by_id:
        upgraded = dict(by_id[q_id])
        if q.get("points") is not None:
            upgraded["points"] = q["points"]
        return upgraded

    # If it has a title or problem statement, preserve it as a custom question
    if q.get("title") or q.get("question") or q.get("problem_statement"):
        if not isinstance(q.get("starter_code"), dict):
            q["starter_code"] = {}
        return q

    return q


def sanitize_question_for_student(q: Dict[str, Any], index: int = 0) -> Dict[str, Any]:
    """
    Strip MCQ answer keys, explanations, and all private hidden test cases
    before returning question metadata to a student client.
    """
    item = {
        k: v
        for k, v in q.items()
        if k not in ("correct_answer", "explanation", "expected_keywords", "hidden_test_cases")
    }
    item.setdefault("index", index)

    raw_cases = q.get("test_cases")
    if isinstance(raw_cases, list):
        public_cases: List[Dict[str, Any]] = []
        hidden_count = 0
        for tc in raw_cases:
            if tc.get("is_hidden"):
                hidden_count += 1
            else:
                public_cases.append(
                    {
                        "id": tc.get("id", f"sample-{len(public_cases) + 1}"),
                        "label": tc.get("label", f"Sample Case {len(public_cases) + 1}"),
                        "input": tc.get("input", ""),
                        "expected": tc.get("expected", tc.get("expected_output", "")),
                        "is_hidden": False,
                    }
                )
        item["test_cases"] = public_cases
        item["hidden_test_count"] = hidden_count

    if item.get("type") in ("simple_coding", "hard_coding", "coding"):
        item.setdefault("supported_languages", list(SUPPORTED_LANGUAGES))
        item.setdefault("time_limit_ms", 2000)
        item.setdefault("memory_limit_kb", 262144)
        item.setdefault("input_format", "Standard input (stdin)")
        item.setdefault("output_format", "Standard output (stdout)")
        item.setdefault("difficulty", "hard" if item.get("type") == "hard_coding" else "medium")

    return item


def sanitize_questions_for_student(questions: List[Dict[str, Any]], skill_name: str = "Software Engineering") -> List[Dict[str, Any]]:
    sanitized: List[Dict[str, Any]] = []
    for idx, q in enumerate(questions):
        upgraded = upgrade_legacy_coding_question_if_needed(q, skill_name)
        sanitized.append(sanitize_question_for_student(upgraded, index=idx))
    return sanitized


async def find_or_generate_assessment(assessment_id: str, db: Any) -> Optional[Dict[str, Any]]:
    doc = await db.assessments.find_one({"id": assessment_id})
    if not doc:
        try:
            doc = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
        except Exception:
            doc = None

    if doc:
        doc["id"] = doc.get("id") or str(doc["_id"])
        doc.pop("_id", None)
        skill_name = doc.get("skill_name", "Software Engineering")
        upgraded_questions = [upgrade_legacy_coding_question_if_needed(q, skill_name) for q in doc.get("questions", [])]

        # Merge custom approved questions from coding_questions for this skill
        skill_clean = doc.get("skill_id", "").lower().strip()
        if not skill_clean and doc.get("skill_name"):
            skill_clean = doc.get("skill_name", "").lower().strip()

        if skill_clean:
            custom_qs = await db.coding_questions.find({
                "$or": [
                    {"skill_id": skill_clean},
                    {"skill_name": {"$regex": f"^{skill_clean}$", "$options": "i"}},
                ],
                "approval_status": "approved",
            }).to_list(length=50)

            existing_ids = {q.get("id") for q in upgraded_questions}
            for cq in custom_qs:
                cq.pop("_id", None)
                if cq.get("id") not in existing_ids:
                    upgraded_questions.append(cq)
                    existing_ids.add(cq.get("id"))

        if upgraded_questions != doc.get("questions", []):
            doc["questions"] = upgraded_questions
            await db.assessments.update_one(
                {"id": doc["id"]},
                {"$set": {"questions": upgraded_questions, "updated_at": datetime.now(timezone.utc)}},
            )
        return doc

    m = re.match(r"^test-(.+)-(5|10)$", assessment_id)
    if m:
        raw_slug = m.group(1).replace("-", " ").title()
        skill_slug_lower = m.group(1).lower()
        size = int(m.group(2))
        built = build_assessment_for_skill(skill_name=raw_slug, size=size)
        built["id"] = assessment_id
        built["skill_id"] = skill_slug_lower

        # Merge any custom approved questions from coding_questions for this skill
        custom_qs = await db.coding_questions.find({
            "$or": [
                {"skill_id": skill_slug_lower},
                {"skill_name": {"$regex": f"^{skill_slug_lower}$", "$options": "i"}},
            ],
            "approval_status": "approved",
        }).to_list(length=50)

        existing_ids = {q.get("id") for q in built.get("questions", [])}
        for cq in custom_qs:
            cq.pop("_id", None)
            if cq.get("id") not in existing_ids:
                built["questions"].append(cq)
                existing_ids.add(cq.get("id"))

        now = datetime.now(timezone.utc)
        await db.assessments.replace_one(
            {"id": assessment_id},
            {**built, "created_at": now, "updated_at": now},
            upsert=True,
        )
        return built

    return None


async def resolve_question_for_attempt(assessment: Optional[Dict[str, Any]], question_id: str, db: Any) -> Optional[Dict[str, Any]]:
    """Locate coding question on assessment (or standalone `coding_questions` collection)."""
    if assessment:
        skill_name = assessment.get("skill_name", "Software Engineering")
        for q in assessment.get("questions", []):
            if q.get("id") == question_id:
                return upgrade_legacy_coding_question_if_needed(q, skill_name)

    standalone = await db.coding_questions.find_one({"id": question_id})
    if standalone:
        standalone.pop("_id", None)
        return standalone
    return None


async def execute_attempt_code(
    *,
    attempt_id: str,
    question_id: str,
    code: str,
    language: str,
    run_type: str,
    custom_input: Optional[str],
    current_user: Dict[str, Any],
    db: Any,
) -> Dict[str, Any]:
    """
    Authorize the attempt owner, resolve the coding problem + all test cases,
    dispatch sandboxed execution, store audit history, and return a student-safe verdict.
    """
    try:
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt_id format")

    attempt = await db.assessment_attempts.find_one({"_id": oid})
    if not attempt:
        raise HTTPException(status_code=404, detail="Assessment attempt not found")

    if attempt.get("user_id") != current_user["firebase_uid"]:
        raise HTTPException(status_code=403, detail="Unauthorized: You do not own this assessment attempt.")

    if attempt.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Assessment attempt is already finalized.")

    asmt = await find_or_generate_assessment(attempt["assessment_id"], db)
    target_q = await resolve_question_for_attempt(asmt, question_id, db)
    if not target_q:
        raise HTTPException(status_code=404, detail="Coding question not found in this assessment.")

    all_cases: List[Dict[str, Any]] = list(target_q.get("test_cases") or [])
    if not all_cases:
        raise HTTPException(status_code=400, detail="Coding question has no configured test cases.")

    is_custom = run_type == "custom"
    if run_type == "sample":
        exec_cases = [tc for tc in all_cases if not tc.get("is_hidden")]
        if not exec_cases:
            exec_cases = [dict(all_cases[0], is_hidden=False)]
    elif is_custom:
        custom_val = str(custom_input or "")
        if len(custom_val.encode("utf-8")) > 16384:
            raise HTTPException(status_code=413, detail="Custom stdin exceeds 16 KB limit.")
        exec_cases = [
            {
                "id": "custom-1",
                "label": "Custom Input",
                "input": custom_val,
                "expected": "",
                "is_hidden": False,
                "weight": 1.0,
            }
        ]
    else:
        run_type = "submit"
        exec_cases = all_cases

    total_hidden_in_question = sum(1 for tc in all_cases if tc.get("is_hidden"))
    max_points = float(target_q.get("points", 20))

    try:
        full_eval = await execute_and_grade_code(
            user_id=current_user["firebase_uid"],
            language=language,
            source_code=code,
            test_cases=exec_cases,
            supported_languages=target_q.get("supported_languages"),
            time_limit_ms=int(target_q.get("time_limit_ms", 2000)),
            memory_limit_kb=int(target_q.get("memory_limit_kb", 262144)),
            max_points=max_points,
            run_type=run_type,
        )
    except RateLimitExceededError as rle:
        raise HTTPException(
            status_code=429,
            detail=rle.message,
            headers={"Retry-After": str(rle.retry_after_seconds)},
        )
    except CodeExecutionError as cee:
        raise HTTPException(status_code=cee.status_code, detail=cee.message)

    # For custom stdin runs, output raw program stdout directly (there is no expected verdict)
    if is_custom:
        cr0 = (full_eval.get("test_case_results") or [{}])[0]
        raw_stdout = cr0.get("actual_output", "")
        raw_stderr = cr0.get("stderr", "") or full_eval.get("compile_error", "")
        custom_status = (
            "compilation_error"
            if full_eval["status"] == "compilation_error"
            else ("ok" if cr0.get("status") in ("accepted", "wrong_answer") else cr0.get("status", "runtime_error"))
        )
        return {
            "submission_id": None,
            "question_id": question_id,
            "run_type": "custom",
            "status": custom_status,
            "language": full_eval["language"],
            "passed_test_cases": 0,
            "total_test_cases": 1,
            "score_percentage": 0.0,
            "earned_points": 0.0,
            "max_points": max_points,
            "execution_time_ms": full_eval.get("execution_time_ms", 0.0),
            "compile_error": full_eval.get("compile_error", ""),
            "runtime_error": raw_stderr if custom_status != "compilation_error" else "",
            "public_results": [
                {
                    "id": "custom-1",
                    "label": "Custom Input Run",
                    "passed": custom_status == "ok",
                    "status": custom_status,
                    "execution_time_ms": cr0.get("execution_time_ms", 0.0),
                    "input": str(custom_input or ""),
                    "expected_output": "(Custom Input — ungraded)",
                    "actual_output": raw_stdout,
                    "stderr": raw_stderr,
                }
            ],
            "hidden_summary": {"passed": 0, "total": total_hidden_in_question},
            "stdout": raw_stdout if custom_status == "ok" else (raw_stderr or full_eval.get("compile_error", "")),
        }

    student_view = sanitize_execution_result_for_student(full_eval)
    if run_type == "sample":
        # Preserve question's true hidden test count so UI always knows hidden cases exist
        student_view["hidden_summary"]["total"] = total_hidden_in_question

    now = datetime.now(timezone.utc)
    submission_id = f"csub-{uuid.uuid4().hex[:14]}"
    submission_doc = {
        "submission_id": submission_id,
        "attempt_id": attempt_id,
        "assessment_id": attempt.get("assessment_id"),
        "skill_name": attempt.get("skill_name", ""),
        "user_id": current_user["firebase_uid"],
        "student_email": current_user.get("email", ""),
        "student_name": current_user.get("display_name", ""),
        "question_id": question_id,
        "question_title": target_q.get("title", ""),
        "language": full_eval["language"],
        "source_code": code,
        "run_type": run_type,
        "status": full_eval["status"],
        "passed_test_cases": full_eval["passed_test_cases"],
        "total_test_cases": full_eval["total_test_cases"],
        "score_percentage": full_eval["score_percentage"],
        "earned_points": full_eval["earned_points"],
        "max_points": full_eval["max_points"],
        "execution_time_ms": full_eval["execution_time_ms"],
        "compile_error": full_eval["compile_error"],
        "runtime_error": full_eval["runtime_error"],
        "test_case_results": full_eval["test_case_results"],
        "hidden_summary": student_view["hidden_summary"],
        "submitted_at": now,
    }
    await db.coding_submissions.insert_one(submission_doc)

    # Persist authoritative score on the attempt ONLY for full `submit` runs
    if run_type == "submit":
        await db.assessment_attempts.update_one(
            {"_id": oid},
            {
                "$set": {
                    f"code_submissions.{question_id}": {
                        "submission_id": submission_id,
                        "code": code,
                        "language": full_eval["language"],
                        "status": full_eval["status"],
                        "passed_test_cases": full_eval["passed_test_cases"],
                        "total_test_cases": full_eval["total_test_cases"],
                        "score_percentage": full_eval["score_percentage"],
                        "earned_points": full_eval["earned_points"],
                        "max_points": full_eval["max_points"],
                        "execution_time_ms": full_eval["execution_time_ms"],
                        "compile_error": full_eval["compile_error"],
                        "runtime_error": full_eval["runtime_error"],
                        "hidden_summary": student_view["hidden_summary"],
                        "public_results": student_view["public_results"],
                        "stdout": student_view["stdout"],
                        "submitted_at": now,
                    }
                }
            },
        )

    return {
        "submission_id": submission_id,
        "question_id": question_id,
        "submitted_at": now.isoformat(),
        **student_view,
    }

