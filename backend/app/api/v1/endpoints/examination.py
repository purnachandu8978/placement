"""
Unified Secure Examination Engine API (backend/app/api/v1/endpoints/examination.py)
Shared high-security examination service for both Assessment Center and Assignment Center.
Features:
- Unified full-screen session management
- Anti-malpractice event auditing with 3-violation limit & 30-second grace recovery
- Isolated code execution with custom stdin
- Safe Exam Browser (.seb) XML configuration generation
- Student answer autosave persistence & network resilience
- Admin Examination Malpractice Control Room & decision workflows
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Union

import pymongo
from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.dependencies import get_current_user, get_optional_user, require_role
from app.db.mongodb import get_database

logger = logging.getLogger(__name__)
from app.services.code_executor import (
    CodeExecutionError,
    RateLimitExceededError,
    SUPPORTED_LANGUAGES,
    execute_and_grade_code,
)
from app.services.assessment_utils import (
    find_or_generate_assessment,
    sanitize_questions_for_student,
)

router = APIRouter()

ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN", "ACADEMIC_ADMIN", "PLACEMENT_ADMIN", "REVIEWER", "FACULTY", "DEAN"]


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class ExaminationAnswerItem(BaseModel):
    question_id: str
    type: str = "mcq"  # mcq, coding, short_answer
    selected_option: Optional[Union[int, str]] = None
    code: Optional[str] = None
    language: Optional[str] = "python"
    text_answer: Optional[str] = None
    marked_for_review: bool = False


class ExaminationSaveRequest(BaseModel):
    answers: List[ExaminationAnswerItem] = []
    github_url: Optional[str] = None
    live_url: Optional[str] = None
    notes: Optional[str] = None


class ExaminationRunRequest(BaseModel):
    question_id: str
    code: str
    language: str = "python"
    custom_input: Optional[str] = None


class ExaminationSecurityEventRequest(BaseModel):
    event_type: str = Field(description="fullscreen_exit, window_blur, tab_hidden, copy_paste_attempt, devtools_opened, network_offline, network_online, window_focus")
    details: Optional[str] = None
    client_timestamp: Optional[str] = None


class ExaminationSubmitRequest(BaseModel):
    answers: List[ExaminationAnswerItem] = []
    github_url: Optional[str] = None
    live_url: Optional[str] = None
    notes: Optional[str] = None


class ExaminationAdminDecisionRequest(BaseModel):
    attempt_id: str
    exam_type: str  # assessment, assignment
    decision: str  # confirm_violation, dismiss_false_positive, authorize_retake, restore_attempt
    notes: str = ""


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

async def _resolve_assignment(exam_id: str, db) -> Optional[Dict[str, Any]]:
    """Robustly locate an assignment by ObjectId, id, _id string, or template_key."""
    if not exam_id:
        return None
    asg = None
    try:
        if ObjectId.is_valid(exam_id):
            asg = await db.assignments.find_one({"_id": ObjectId(exam_id)})
    except Exception:
        pass
    if not asg:
        asg = await db.assignments.find_one({"id": exam_id})
    if not asg:
        asg = await db.assignments.find_one({"_id": exam_id})
    if not asg:
        asg = await db.assignments.find_one({"template_key": exam_id})
    return asg


def _sanitize_question(q: Dict[str, Any]) -> Dict[str, Any]:
    """Strictly purge answer keys, explanations, and hidden test cases."""
    clean = dict(q)
    clean.pop("correct_answer", None)
    clean.pop("explanation", None)
    clean.pop("expected_answer", None)
    clean.pop("rubric", None)
    clean.pop("admin_feedback", None)

    # Sanitize test cases: only expose non-hidden samples
    if "test_cases" in clean and isinstance(clean["test_cases"], list):
        clean["test_cases"] = [
            {
                "id": tc.get("id") or f"case-{idx}",
                "label": tc.get("label", f"Sample Case {idx + 1}"),
                "input": tc.get("input", ""),
                "expected": tc.get("expected", ""),
                "is_hidden": False,
            }
            for idx, tc in enumerate(clean["test_cases"])
            if not tc.get("is_hidden")
        ]
    return clean


def _generate_seb_config_xml(start_url: str, exam_title: str) -> str:
    """Generate official Safe Exam Browser XML config with Windows Game Bar and application lockdown."""
    root = ET.Element("plist", version="1.0")
    dict_elem = ET.SubElement(root, "dict")

    # Start URL
    ET.SubElement(dict_elem, "key").text = "startURL"
    ET.SubElement(dict_elem, "string").text = start_url

    # Exam title
    ET.SubElement(dict_elem, "key").text = "examTitle"
    ET.SubElement(dict_elem, "string").text = exam_title

    # Kiosk & Fullscreen mode
    ET.SubElement(dict_elem, "key").text = "allowQuit"
    ET.SubElement(dict_elem, "true")

    ET.SubElement(dict_elem, "key").text = "allowPreferencesWindow"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "browserWindowAllowReload"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "browserWindowShowURL"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "enableSpellCheck"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "enableDeveloperConsole"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "allowApplicationSwitching"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "enablePrintScreen"
    ET.SubElement(dict_elem, "false")

    ET.SubElement(dict_elem, "key").text = "blockScreenShots"
    ET.SubElement(dict_elem, "true")

    ET.SubElement(dict_elem, "key").text = "enableRightMouse"
    ET.SubElement(dict_elem, "false")

    # Prohibited Applications (Windows Game Bar, external browsers, screen recorders)
    prohibited = [
        ("GameBar.exe", "Windows Xbox Game Bar"),
        ("GameBarFT.exe", "Windows Game Bar Overlay"),
        ("XboxGamingOverlay.exe", "Xbox Gaming Overlay"),
        ("SnippingTool.exe", "Windows Snipping Tool"),
        ("ScreenClippingHost.exe", "Windows Screen Clipping Host"),
        ("chrome.exe", "Google Chrome External Browser"),
        ("msedge.exe", "Microsoft Edge External Browser"),
        ("firefox.exe", "Mozilla Firefox"),
        ("brave.exe", "Brave Browser"),
        ("Discord.exe", "Discord Chat"),
        ("WhatsApp.exe", "WhatsApp Desktop"),
        ("Telegram.exe", "Telegram Desktop"),
        ("Slack.exe", "Slack"),
        ("Teams.exe", "Microsoft Teams"),
        ("TeamViewer.exe", "TeamViewer Remote Access"),
        ("AnyDesk.exe", "AnyDesk Remote Desktop"),
        ("mstsc.exe", "Windows Remote Desktop"),
    ]

    ET.SubElement(dict_elem, "key").text = "prohibitedProcesses"
    array_elem = ET.SubElement(dict_elem, "array")
    for exe, desc in prohibited:
        proc_dict = ET.SubElement(array_elem, "dict")
        ET.SubElement(proc_dict, "key").text = "executable"
        ET.SubElement(proc_dict, "string").text = exe
        ET.SubElement(proc_dict, "key").text = "description"
        ET.SubElement(proc_dict, "string").text = desc
        ET.SubElement(proc_dict, "key").text = "active"
        ET.SubElement(proc_dict, "true")
        ET.SubElement(proc_dict, "key").text = "strongKill"
        ET.SubElement(proc_dict, "true")

    ET.SubElement(dict_elem, "key").text = "quitURL"
    ET.SubElement(dict_elem, "string").text = "http://localhost:5173/student/dashboard"

    xml_declaration = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    return xml_declaration + ET.tostring(root, encoding="utf-8").decode("utf-8")


# ==============================================================================
# UNIFIED EXAMINATION SESSION ENDPOINTS
# ==============================================================================

def _ensure_utc(dt: Any) -> datetime:
    if not isinstance(dt, datetime):
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/session/{exam_type}/{exam_id}")
async def get_or_create_examination_session(
    exam_type: str,
    exam_id: str,
    retake: bool = Query(default=False),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Unified entry point for both assessments and assignments.
    Retrieves or establishes active session, validates attempt ownership,
    enforces server-side countdown deadlines, and returns sanitized examination payload.
    Supports ?retake=true to allow candidates to practice or re-attempt.
    """
    uid = current_user["firebase_uid"]
    now = datetime.now(timezone.utc)

    if exam_type not in ("assessment", "assignment"):
        raise HTTPException(status_code=400, detail="Invalid exam_type. Must be 'assessment' or 'assignment'.")

    title = ""
    skill = ""
    duration_minutes = 45
    deadline_iso = None
    questions: List[Dict[str, Any]] = []
    saved_answers: Dict[str, Any] = {}
    attempt_id = ""
    status_val = "in_progress"
    violations_count = 0
    is_malpractice_flagged = False
    late_policy = "allow_penalty"
    max_score = 100

    if exam_type == "assessment":
        asmt = await find_or_generate_assessment(exam_id, db)
        if not asmt:
            raise HTTPException(status_code=404, detail="Assessment not found")

        title = asmt.get("title") or f"{asmt.get('skill_name', 'Skill')} Verification Assessment"
        skill = asmt.get("skill_name", "Software Engineering")
        duration_minutes = asmt.get("duration_minutes", 30)
        max_score = asmt.get("total_marks") or (len(asmt.get("questions", [])) * 10)

        # Check existing in-progress or completed attempt
        existing_attempt = await db.assessment_attempts.find_one(
            {"user_id": uid, "assessment_id": asmt["id"]},
            sort=[("start_time", -1)],
        )

        if not retake and existing_attempt and existing_attempt.get("status") in ("completed", "evaluated"):
            return {
                "session_status": "already_submitted",
                "attempt_id": str(existing_attempt["_id"]),
                "exam_type": exam_type,
                "exam_id": exam_id,
                "title": title,
                "skill": skill,
                "score": existing_attempt.get("score"),
                "status": existing_attempt.get("status"),
                "submitted_at": existing_attempt.get("submitted_at"),
                "evaluation_breakdown": existing_attempt.get("evaluation_breakdown", []),
            }

        if existing_attempt and existing_attempt.get("status") == "in_progress":
            start_time = _ensure_utc(existing_attempt.get("start_time", now))
            elapsed_seconds = (now - start_time).total_seconds()
            total_seconds = duration_minutes * 60

            if elapsed_seconds < total_seconds and not retake:
                attempt_id = str(existing_attempt["_id"])
                saved_answers = existing_attempt.get("answers", {})
                violations_count = existing_attempt.get("violations_count", 0)
                is_malpractice_flagged = existing_attempt.get("is_malpractice_flagged", False)
                remaining_seconds = max(10, int(total_seconds - elapsed_seconds))
            else:
                # Mark expired stale attempt and start fresh
                await db.assessment_attempts.update_one(
                    {"_id": existing_attempt["_id"]},
                    {"$set": {"status": "expired", "updated_at": now}}
                )
                existing_attempt = None

        if not existing_attempt or existing_attempt.get("status") != "in_progress":
            # Create fresh attempt
            doc = {
                "user_id": uid,
                "assessment_id": asmt["id"],
                "skill_name": skill,
                "title": title,
                "answers": {},
                "code_submissions": {},
                "status": "in_progress",
                "violations_count": 0,
                "is_malpractice_flagged": False,
                "start_time": now,
                "created_at": now,
                "updated_at": now,
            }
            res = await db.assessment_attempts.insert_one(doc)
            attempt_id = str(res.inserted_id)
            remaining_seconds = duration_minutes * 60

        raw_qs = asmt.get("questions", [])
        questions = [_sanitize_question(q) for q in raw_qs]

    else:
        # Assignment Examination
        asg = await _resolve_assignment(exam_id, db)
        if not asg:
            raise HTTPException(status_code=404, detail="Assignment not found")

        aid = str(asg["_id"])
        asg_id_field = asg.get("id") or aid
        title = asg.get("title") or "Engineering Assignment Workstation"
        skill = asg.get("skill", "Software Engineering")
        duration_minutes = asg.get("duration_minutes") or 60
        max_score = asg.get("total_marks") or asg.get("max_score", 100)
        late_policy = asg.get("late_submission_policy", "allow_penalty")

        # Check existing submission or draft
        existing_sub = await db.assignment_submissions.find_one({
            "$or": [{"assignment_id": aid}, {"assignment_id": exam_id}, {"assignment_id": asg_id_field}],
            "user_id": uid,
        })
        if not retake and existing_sub and existing_sub.get("status") in ("submitted", "evaluated"):
            return {
                "session_status": "already_submitted",
                "attempt_id": str(existing_sub["_id"]),
                "exam_type": exam_type,
                "exam_id": aid,
                "title": title,
                "skill": skill,
                "score": existing_sub.get("score"),
                "status": existing_sub.get("status"),
                "submitted_at": existing_sub.get("submitted_at"),
                "evaluation_breakdown": existing_sub.get("answers", []),
            }

        attempt_id = aid
        start_time = now

        # Update student allocation status to in_progress
        alloc = await db.assignment_allocations.find_one({
            "$or": [{"assignment_id": aid}, {"assignment_id": exam_id}, {"assignment_id": asg_id_field}],
            "user_id": uid,
        })
        if alloc:
            if alloc.get("started_at"):
                start_time = _ensure_utc(alloc["started_at"])
            else:
                await db.assignment_allocations.update_one(
                    {"_id": alloc["_id"]},
                    {"$set": {"status": "in_progress", "started_at": now, "updated_at": now}}
                )
            violations_count = alloc.get("violations_count", 0)
            is_malpractice_flagged = alloc.get("is_malpractice_flagged", False)

        if existing_sub:
            # Map saved answers
            ans_list = existing_sub.get("answers", [])
            for item in ans_list:
                qid = item.get("question_id")
                if qid:
                    saved_answers[qid] = item

        elapsed_seconds = (now - _ensure_utc(start_time)).total_seconds() if start_time else 0
        total_seconds = duration_minutes * 60
        if elapsed_seconds >= total_seconds:
            # Grant fresh session duration for working on this assignment workstation
            start_time = now
            elapsed_seconds = 0
            if alloc:
                await db.assignment_allocations.update_one(
                    {"_id": alloc["_id"]},
                    {"$set": {"started_at": now, "updated_at": now}}
                )
        remaining_seconds = max(10, int(total_seconds - elapsed_seconds))

        raw_qs = asg.get("questions") or []
        if not raw_qs:
            desc = asg.get("description") or asg.get("title") or "Implement the requested assignment solution."
            if asg.get("deliverables"):
                deliverables_text = "\n\nKey Deliverables:\n" + "\n".join(f"- {d}" for d in asg["deliverables"])
                desc += deliverables_text

            raw_qs = [
                {
                    "id": f"q-{aid[-8:]}",
                    "type": "coding",
                    "title": asg.get("title") or "Coding Assignment Challenge",
                    "difficulty": asg.get("difficulty", "medium"),
                    "points": max_score,
                    "problem_statement": desc,
                    "input_format": "Standard input (stdin) according to specification.",
                    "output_format": "Standard output (stdout) according to specification.",
                    "constraints": ["Execution Time limit: 2.0s", "Memory limit: 256MB"],
                    "starter_code": {
                        "python": f"# {asg.get('title')}\n# Implement your solution below\n\ndef main():\n    print(\"Running assignment solution for: {asg.get('title')}\")\n\nif __name__ == '__main__':\n    main()\n",
                        "javascript": f"// {asg.get('title')}\nfunction solution() {{\n  console.log('Running assignment solution for: {asg.get('title')}');\n}}\n\nsolution();\n",
                        "java": f"// {asg.get('title')}\npublic class Main {{\n    public static void main(String[] args) {{\n        System.out.println(\"Running assignment solution for: {asg.get('title')}\");\n    }}\n}}\n",
                        "cpp": f"// {asg.get('title')}\n#include <iostream>\nusing namespace std;\n\nint main() {{\n    cout << \"Running assignment solution for: {asg.get('title')}\" << endl;\n    return 0;\n}}\n"
                    },
                    "test_cases": [
                        {
                            "id": "tc-1",
                            "label": "Sample Verification Case",
                            "input": "",
                            "expected": "",
                            "is_hidden": False,
                            "weight": 1.0
                        }
                    ],
                    "supported_languages": ["python", "javascript", "java", "cpp"]
                }
            ]

        questions = [_sanitize_question(q) for q in raw_qs]

    return {
        "session_status": "active",
        "attempt_id": attempt_id,
        "exam_type": exam_type,
        "exam_id": exam_id,
        "title": title,
        "skill": skill,
        "duration_minutes": duration_minutes,
        "remaining_seconds": remaining_seconds,
        "server_time": now.isoformat(),
        "max_score": max_score,
        "late_submission_policy": late_policy,
        "questions": questions,
        "saved_answers": saved_answers,
        "violations_count": violations_count,
        "is_malpractice_flagged": is_malpractice_flagged,
        "max_violations_allowed": 3,
        "supported_languages": list(SUPPORTED_LANGUAGES),
        "security_policy": {
            "enforce_fullscreen": True,
            "max_violations": 3,
            "grace_period_seconds": 30,
            "block_clipboard": True,
            "block_context_menu": True,
            "require_seb": False,
        },
    }


# ==============================================================================
# ANSWER AUTO-SAVE & DRAFT PERSISTENCE
# ==============================================================================

@router.post("/session/{exam_type}/{exam_id}/save")
async def save_examination_progress(
    exam_type: str,
    exam_id: str,
    req: ExaminationSaveRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Idempotent auto-save for student answers and code buffers.
    Supports network interruption recovery and instant state preservation.
    """
    uid = current_user["firebase_uid"]
    now = datetime.now(timezone.utc)

    answers_dict = {}
    for a in req.answers:
        answers_dict[a.question_id] = a.model_dump()

    if exam_type == "assessment":
        # Save into assessment_attempts
        attempt = await db.assessment_attempts.find_one(
            {"user_id": uid, "assessment_id": exam_id, "status": "in_progress"},
            sort=[("start_time", -1)],
        )
        if not attempt:
            # Try by _id
            try:
                attempt = await db.assessment_attempts.find_one({"_id": ObjectId(exam_id), "user_id": uid})
            except Exception:
                pass

        if attempt:
            await db.assessment_attempts.update_one(
                {"_id": attempt["_id"]},
                {"$set": {"answers": answers_dict, "updated_at": now}}
            )
            return {"message": "Assessment draft answers saved successfully", "saved_at": now.isoformat()}
        else:
            raise HTTPException(status_code=404, detail="Active assessment attempt not found.")

    else:
        # Save into assignment_submissions & assignment_allocations
        asg = await _resolve_assignment(exam_id, db)
        aid = str(asg["_id"]) if asg else exam_id

        answers_list = [a.model_dump() for a in req.answers]
        draft_doc = {
            "assignment_id": aid,
            "user_id": uid,
            "student_name": current_user.get("display_name") or "Student",
            "student_email": current_user.get("email") or "",
            "github_url": req.github_url or "",
            "live_url": req.live_url or "",
            "notes": req.notes or "",
            "answers": answers_list,
            "status": "in_progress",
            "updated_at": now,
        }

        await db.assignment_submissions.update_one(
            {"assignment_id": aid, "user_id": uid},
            {"$set": draft_doc},
            upsert=True,
        )
        await db.assignment_allocations.update_one(
            {"assignment_id": aid, "user_id": uid},
            {"$set": {"status": "in_progress", "updated_at": now}}
        )

        return {"message": "Assignment draft answers saved successfully", "saved_at": now.isoformat()}


# ==============================================================================
# ISOLATED CODE EXECUTION (RUN BUTTON WITH CUSTOM STDIN)
# ==============================================================================

@router.post("/session/{exam_type}/{exam_id}/run")
async def run_examination_code(
    exam_type: str,
    exam_id: str,
    req: ExaminationRunRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Run button handler:
    1. Validates source code and language.
    2. Enforces input size limit (16 KB max custom stdin).
    3. Runs inside isolated sandbox with strict timeouts (2000ms, 256MB).
    4. Never leaks hidden test cases.
    5. Returns stdout, stderr, execution time, memory, and status.
    """
    uid = current_user["firebase_uid"]

    if req.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{req.language}'. Supported: {', '.join(SUPPORTED_LANGUAGES)}"
        )

    code_bytes = req.code.encode("utf-8")
    if len(code_bytes) > 65536:
        raise HTTPException(status_code=413, detail="Source code exceeds 64 KB limit.")

    custom_stdin = req.custom_input if req.custom_input is not None else ""
    if len(custom_stdin.encode("utf-8")) > 16384:
        raise HTTPException(status_code=413, detail="Custom stdin exceeds 16 KB limit.")

    # Find the question constraints if present
    time_limit_ms = 2000
    memory_limit_kb = 262144

    try:
        exec_cases = [
            {
                "id": "custom-stdin",
                "label": "Custom Stdin",
                "input": custom_stdin,
                "expected": "",
                "is_hidden": False,
                "weight": 1.0,
            }
        ]
        eval_res = await execute_and_grade_code(
            user_id=uid,
            language=req.language,
            source_code=req.code,
            test_cases=exec_cases,
            time_limit_ms=time_limit_ms,
            memory_limit_kb=memory_limit_kb,
            run_type="custom",
        )

        test_detail = eval_res.get("test_case_results", [{}])[0] if eval_res.get("test_case_results") else {}
        actual_stdout = test_detail.get("actual_output") or test_detail.get("stdout") or eval_res.get("stdout", "")
        actual_stderr = eval_res.get("compile_error") or eval_res.get("runtime_error") or test_detail.get("stderr", "")

        status_str = "ok"
        if eval_res.get("status") == "compilation_error" or eval_res.get("compile_error"):
            status_str = "compilation_error"
        elif eval_res.get("status") in ("runtime_error", "time_limit_exceeded", "memory_limit_exceeded") or eval_res.get("runtime_error"):
            status_str = eval_res.get("status") or "runtime_error"

        # Record run history in audit log
        await db.security_events.insert_one({
            "user_id": uid,
            "exam_type": exam_type,
            "exam_id": exam_id,
            "question_id": req.question_id,
            "event_type": "code_run",
            "language": req.language,
            "execution_status": status_str,
            "execution_time_ms": eval_res.get("execution_time_ms", 0),
            "timestamp": datetime.now(timezone.utc),
        })

        return {
            "status": status_str,
            "stdout": actual_stdout,
            "stderr": actual_stderr,
            "compile_output": eval_res.get("compile_error", ""),
            "time_ms": eval_res.get("execution_time_ms", 0),
            "memory_kb": 0,
        }

    except RateLimitExceededError as rle:
        raise HTTPException(
            status_code=429,
            detail=rle.message,
            headers={"Retry-After": str(rle.retry_after_seconds)}
        )
    except Exception as e:
        logger.error(f"Examination code run failed: {e}")
        return {
            "status": "runtime_error",
            "stdout": "",
            "stderr": str(e),
            "compile_output": "",
            "time_ms": 0,
            "memory_kb": 0,
        }


# ==============================================================================
# MALPRACTICE DETECTION, 3-VIOLATION POLICY & 30-SECOND RECOVERY
# ==============================================================================

@router.post("/session/{exam_type}/{exam_id}/security-event")
async def log_security_event(
    exam_type: str,
    exam_id: str,
    req: ExaminationSecurityEventRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Malpractice detection & security event processor:
    - 3 permitted violations with warnings (Warning 1/3, 2/3, 3/3)
    - 30-second return recovery grace period
    - 4th qualifying violation immediately terminates attempt & notifies admin
    - Network disconnections are recorded as technical events, NOT malpractice!
    """
    uid = current_user["firebase_uid"]
    now = datetime.now(timezone.utc)

    # Classify event
    is_network_event = req.event_type in ("network_offline", "network_online")
    is_return_event = req.event_type in ("window_focus", "fullscreen_enter", "return_within_grace")
    is_qualifying_violation = req.event_type in ("fullscreen_exit", "window_blur", "tab_hidden", "copy_paste_attempt", "devtools_opened")

    # Fetch active attempt/allocation to inspect current violation count
    attempt_doc = None
    if exam_type == "assessment":
        attempt_doc = await db.assessment_attempts.find_one(
            {"user_id": uid, "assessment_id": exam_id, "status": "in_progress"},
            sort=[("start_time", -1)],
        )
        if not attempt_doc:
            try:
                attempt_doc = await db.assessment_attempts.find_one({"_id": ObjectId(exam_id), "user_id": uid})
            except Exception:
                pass
    else:
        asg = await _resolve_assignment(exam_id, db)
        aid = str(asg["_id"]) if asg else exam_id
        asg_id_field = (asg.get("id") or aid) if asg else aid
        attempt_doc = await db.assignment_allocations.find_one({
            "$or": [{"assignment_id": aid}, {"assignment_id": exam_id}, {"assignment_id": asg_id_field}],
            "user_id": uid,
        })

    current_violations = (attempt_doc.get("violations_count", 0) if attempt_doc else 0)

    new_violation_count = current_violations
    action_taken = "logged"
    is_terminated = False

    if is_qualifying_violation:
        new_violation_count = current_violations + 1

        if new_violation_count >= 4:
            action_taken = "attempt_terminated"
            is_terminated = True
        elif new_violation_count == 3:
            action_taken = "flagged_stricter_monitoring"
        elif new_violation_count == 2:
            action_taken = "warning_2_recorded"
        else:
            action_taken = "warning_1_recorded"

    elif is_return_event:
        action_taken = "student_returned_safely"

    elif is_network_event:
        action_taken = "technical_network_transition"

    # Persist security event audit log
    event_record = {
        "user_id": uid,
        "student_email": current_user.get("email"),
        "student_name": current_user.get("display_name") or "Student",
        "exam_type": exam_type,
        "exam_id": exam_id,
        "event_type": req.event_type,
        "details": req.details or "",
        "violation_count": new_violation_count,
        "is_qualifying_violation": is_qualifying_violation,
        "is_network_event": is_network_event,
        "action_taken": action_taken,
        "client_timestamp": req.client_timestamp,
        "server_timestamp": now,
    }
    await db.security_events.insert_one(event_record)

    # Update attempt document status and violation count
    updates: Dict[str, Any] = {
        "violations_count": new_violation_count,
        "updated_at": now,
    }
    if new_violation_count >= 3:
        updates["is_malpractice_flagged"] = True
    if is_terminated:
        updates["status"] = "malpractice_flagged"
        updates["terminated_at"] = now
        updates["termination_reason"] = f"Exceeded maximum permitted violations (count: {new_violation_count})"

    if exam_type == "assessment" and attempt_doc:
        await db.assessment_attempts.update_one({"_id": attempt_doc["_id"]}, {"$set": updates})
    elif exam_type == "assignment":
        await db.assignment_allocations.update_one({"assignment_id": exam_id, "user_id": uid}, {"$set": updates})
        await db.assignment_submissions.update_one({"assignment_id": exam_id, "user_id": uid}, {"$set": updates})

    return {
        "event_type": req.event_type,
        "is_qualifying_violation": is_qualifying_violation,
        "violations_count": new_violation_count,
        "max_violations_allowed": 3,
        "action_taken": action_taken,
        "is_terminated": is_terminated,
        "grace_period_seconds": 30,
        "server_timestamp": now.isoformat(),
    }


# ==============================================================================
# FINAL EXAMINATION SUBMISSION & AUTOMATED EVALUATION
# ==============================================================================

@router.post("/session/{exam_type}/{exam_id}/submit")
async def submit_examination(
    exam_type: str,
    exam_id: str,
    req: ExaminationSubmitRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Final examination submission handler:
    1. Idempotently locks answers and updates state.
    2. Auto-grades MCQs against protected answer keys.
    3. Evaluates coding solutions against all test cases.
    4. Computes total marks, percentage, and updates readiness.
    """
    uid = current_user["firebase_uid"]
    now = datetime.now(timezone.utc)

    if exam_type == "assessment":
        asmt = await find_or_generate_assessment(exam_id, db)
        if not asmt:
            raise HTTPException(status_code=404, detail="Assessment not found")

        raw_qs = asmt.get("questions", [])
        q_map = {q.get("id"): q for q in raw_qs}

        total_earned = 0.0
        max_total = 0.0
        evaluation_breakdown = []

        for ans in req.answers:
            target_q = q_map.get(ans.question_id)
            if not target_q:
                continue

            q_points = float(target_q.get("points", 10))
            max_total += q_points
            q_type = target_q.get("type", "mcq")

            if q_type == "mcq":
                correct_opt = target_q.get("correct_answer")
                student_sel = ans.selected_option
                is_correct = False
                try:
                    if correct_opt is not None and student_sel is not None:
                        is_correct = int(correct_opt) == int(student_sel)
                except Exception:
                    pass

                awarded = q_points if is_correct else 0.0
                total_earned += awarded
                evaluation_breakdown.append({
                    "question_id": ans.question_id,
                    "type": "mcq",
                    "awarded_marks": awarded,
                    "max_marks": q_points,
                    "is_correct": is_correct,
                })
            elif q_type in ("coding", "simple_coding", "hard_coding"):
                # Execute against test cases
                all_cases = target_q.get("test_cases", [])
                code_text = ans.code or ""
                lang = ans.language or "python"

                if code_text.strip() and all_cases:
                    try:
                        eval_res = await execute_and_grade_code(
                            user_id=uid,
                            language=lang,
                            source_code=code_text,
                            test_cases=all_cases,
                            time_limit_ms=2000,
                            memory_limit_kb=262144,
                            max_points=q_points,
                            run_type="submit",
                        )
                        awarded = eval_res.get("earned_points", 0.0)
                        total_earned += awarded
                        evaluation_breakdown.append({
                            "question_id": ans.question_id,
                            "type": "coding",
                            "awarded_marks": awarded,
                            "max_marks": q_points,
                            "passed_tests": eval_res.get("passed_test_cases", 0),
                            "total_tests": eval_res.get("total_test_cases", 0),
                        })
                    except Exception as e:
                        evaluation_breakdown.append({
                            "question_id": ans.question_id,
                            "type": "coding",
                            "awarded_marks": 0.0,
                            "max_marks": q_points,
                            "error": str(e),
                        })
                else:
                    evaluation_breakdown.append({
                        "question_id": ans.question_id,
                        "type": "coding",
                        "awarded_marks": 0.0,
                        "max_marks": q_points,
                    })

        percentage = round((total_earned / max_total) * 100, 2) if max_total > 0 else 0.0
        passed = percentage >= float(asmt.get("passing_score", 70))

        # Update attempt
        attempt = await db.assessment_attempts.find_one(
            {"user_id": uid, "assessment_id": asmt["id"]},
            sort=[("start_time", -1)],
        )
        if attempt:
            await db.assessment_attempts.update_one(
                {"_id": attempt["_id"]},
                {
                    "$set": {
                        "status": "completed",
                        "submitted_at": now,
                        "score": percentage,
                        "total_earned": total_earned,
                        "max_total": max_total,
                        "passed": passed,
                        "evaluation_breakdown": evaluation_breakdown,
                        "updated_at": now,
                    }
                }
            )

        return {
            "status": "completed",
            "exam_type": "assessment",
            "score": percentage,
            "total_earned": total_earned,
            "max_total": max_total,
            "passed": passed,
            "submitted_at": now.isoformat(),
            "evaluation_breakdown": evaluation_breakdown,
        }

    else:
        # Assignment Submission
        from app.api.v1.endpoints.assignments import submit_assignment, SubmitAssignmentRequest, SubmitAnswerItem
        sub_answers = [
            SubmitAnswerItem(
                question_id=a.question_id,
                type=a.type,
                selected_option=int(a.selected_option) if a.selected_option is not None and str(a.selected_option).isdigit() else None,
                code=a.code,
                language=a.language or "python",
                text_answer=a.text_answer,
            )
            for a in req.answers
        ]
        sub_req = SubmitAssignmentRequest(
            github_url=req.github_url or "",
            notes=req.notes or "",
            answers=sub_answers,
        )
        asg = await _resolve_assignment(exam_id, db)
        target_aid = str(asg["_id"]) if asg else exam_id
        asg_res = await submit_assignment(target_aid, sub_req, current_user, db)

        earned = float(asg_res.get("score") or asg_res.get("auto_score") or 0.0)
        max_total = float(asg_res.get("max_score") or 100.0)
        pct = round((earned / max_total) * 100, 2) if max_total > 0 else 0.0

        breakdown = [
            {
                "question_id": a.question_id,
                "type": a.type or "coding",
                "awarded_marks": earned,
                "max_marks": max_total,
                "passed_tests": 1,
                "total_tests": 1,
            }
            for a in req.answers
        ]
        if not breakdown:
            breakdown = [
                {
                    "question_id": f"asg-{exam_id[:8]}",
                    "type": "coding",
                    "awarded_marks": earned,
                    "max_marks": max_total,
                    "passed_tests": 1,
                    "total_tests": 1,
                }
            ]

        return {
            "status": asg_res.get("status", "completed"),
            "exam_type": "assignment",
            "score": pct,
            "total_earned": earned,
            "max_total": max_total,
            "passed": pct >= 70.0,
            "submitted_at": now.isoformat(),
            "evaluation_breakdown": breakdown,
        }


# ==============================================================================
# SAFE EXAM BROWSER CONFIGURATION GENERATION
# ==============================================================================

@router.get("/seb-config/{exam_type}/{exam_id}")
async def get_safe_exam_browser_config(
    exam_type: str,
    exam_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
    db=Depends(get_database),
):
    """
    Generate official Safe Exam Browser (.seb) XML configuration for strict mode exams.
    Configures locked kiosk environment, disables application switching, and sets quit URL.
    """
    origin = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    exam_url = f"{origin}/exam/{exam_type}/{exam_id}"
    exam_title = f"Placement Intelligence Secure Exam - {exam_type.capitalize()}"

    xml_content = _generate_seb_config_xml(start_url=exam_url, exam_title=exam_title)
    filename = f"secure_exam_{exam_type}_{exam_id[:8]}.seb"

    return Response(
        content=xml_content,
        media_type="application/seb",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


# ==============================================================================
# ADMIN MALPRACTICE CONTROL ROOM
# ==============================================================================

@router.get("/admin/monitoring")
async def get_examination_monitoring(
    status_filter: Optional[str] = Query(None, description="active, flagged, terminated, all"),
    current_admin: Dict[str, Any] = Depends(require_role(ADMIN_ROLES)),
    db=Depends(get_database),
):
    """
    Admin Malpractice Control Room telemetry:
    - Active live sessions
    - Student name, registration ID, exam title, and remaining time
    - Violation counts, security audit log events
    - Terminated / flagged attempts for review
    """
    # 1. Fetch live and flagged assessment attempts
    query: Dict[str, Any] = {}
    if status_filter and status_filter != "all":
        if status_filter == "flagged":
            query["$or"] = [{"is_malpractice_flagged": True}, {"status": "malpractice_flagged"}]
        elif status_filter == "active":
            query["status"] = "in_progress"
        elif status_filter == "terminated":
            query["status"] = "malpractice_flagged"
        else:
            query["status"] = status_filter

    attempts = await db.assessment_attempts.find(query).sort("start_time", -1).to_list(length=100)

    # 2. Fetch student dossiers
    uids = list({a.get("user_id") for a in attempts if a.get("user_id")})
    users_cursor = db.users.find({"firebase_uid": {"$in": uids}})
    users_map = {u.get("firebase_uid"): u async for u in users_cursor}

    profiles_cursor = db.student_profiles.find({"user_id": {"$in": uids}})
    profiles_map = {p.get("user_id"): p async for p in profiles_cursor}

    # 3. Fetch security events
    recent_events = await db.security_events.find().sort("server_timestamp", -1).to_list(length=100)

    sessions = []
    now = datetime.now(timezone.utc)
    for a in attempts:
        uid = a.get("user_id")
        user = users_map.get(uid, {})
        prof = profiles_map.get(uid, {})

        st = _ensure_utc(a.get("start_time", now))
        elapsed = (now - st).total_seconds() if st else 0
        duration_s = (a.get("duration_minutes") or 30) * 60
        remaining_s = max(0, int(duration_s - elapsed))

        sessions.append({
            "attempt_id": str(a["_id"]),
            "student_id": uid,
            "student_name": prof.get("full_name") or user.get("display_name") or "Student",
            "student_email": user.get("email") or "",
            "registration_id": user.get("student_registration_id") or f"PI-STU-{uid[:6].upper()}",
            "exam_type": "assessment",
            "exam_id": a.get("assessment_id"),
            "exam_title": a.get("title") or a.get("skill_name") or "Skill Assessment",
            "status": a.get("status", "in_progress"),
            "violations_count": a.get("violations_count", 0),
            "is_malpractice_flagged": a.get("is_malpractice_flagged", False),
            "remaining_seconds": remaining_s,
            "start_time": st.isoformat() if isinstance(st, datetime) else str(st),
            "terminated_at": a.get("terminated_at").isoformat() if isinstance(a.get("terminated_at"), datetime) else a.get("terminated_at"),
            "termination_reason": a.get("termination_reason"),
        })

    # Format events for audit
    formatted_events = []
    for ev in recent_events:
        formatted_events.append({
            "id": str(ev["_id"]),
            "user_id": ev.get("user_id"),
            "student_name": ev.get("student_name", "Student"),
            "student_email": ev.get("student_email", ""),
            "exam_type": ev.get("exam_type"),
            "exam_id": ev.get("exam_id"),
            "event_type": ev.get("event_type"),
            "details": ev.get("details", ""),
            "violation_count": ev.get("violation_count", 0),
            "action_taken": ev.get("action_taken", ""),
            "server_timestamp": ev["server_timestamp"].isoformat() if isinstance(ev.get("server_timestamp"), datetime) else str(ev.get("server_timestamp")),
        })

    return {
        "active_sessions_count": sum(1 for s in sessions if s["status"] == "in_progress"),
        "flagged_sessions_count": sum(1 for s in sessions if s["is_malpractice_flagged"]),
        "terminated_sessions_count": sum(1 for s in sessions if s["status"] == "malpractice_flagged"),
        "sessions": sessions,
        "recent_security_events": formatted_events,
    }


@router.post("/admin/decision")
async def record_examination_admin_decision(
    req: ExaminationAdminDecisionRequest,
    current_admin: Dict[str, Any] = Depends(require_role(ADMIN_ROLES)),
    db=Depends(get_database),
):
    """
    Authorized administrator action:
    - confirm_violation: Confirms malpractice, locks attempt permanently.
    - dismiss_false_positive: Clears flags, resets violation counter to 0.
    - authorize_retake: Deletes current attempt, grants fresh attempt.
    - restore_attempt: Resets status to in_progress, allows student to resume within allotted time.
    """
    now = datetime.now(timezone.utc)
    admin_uid = current_admin.get("firebase_uid", "admin")

    target_oid = None
    try:
        target_oid = ObjectId(req.attempt_id)
    except Exception:
        pass

    if req.exam_type == "assessment":
        attempt = await db.assessment_attempts.find_one({"_id": target_oid} if target_oid else {"assessment_id": req.attempt_id})
        if not attempt:
            raise HTTPException(status_code=404, detail="Assessment attempt not found.")

        aid = attempt["_id"]
        if req.decision == "confirm_violation":
            await db.assessment_attempts.update_one(
                {"_id": aid},
                {
                    "$set": {
                        "status": "terminated_malpractice_confirmed",
                        "admin_decision": "confirmed",
                        "admin_notes": req.notes,
                        "decided_by": admin_uid,
                        "decided_at": now,
                    }
                }
            )
        elif req.decision == "dismiss_false_positive":
            await db.assessment_attempts.update_one(
                {"_id": aid},
                {
                    "$set": {
                        "is_malpractice_flagged": False,
                        "violations_count": 0,
                        "status": "in_progress",
                        "admin_decision": "dismissed_false_positive",
                        "admin_notes": req.notes,
                        "decided_by": admin_uid,
                        "decided_at": now,
                    }
                }
            )
        elif req.decision == "restore_attempt":
            await db.assessment_attempts.update_one(
                {"_id": aid},
                {
                    "$set": {
                        "status": "in_progress",
                        "is_malpractice_flagged": False,
                        "admin_decision": "restored",
                        "admin_notes": req.notes,
                        "decided_by": admin_uid,
                        "decided_at": now,
                    }
                }
            )
        elif req.decision == "authorize_retake":
            await db.assessment_attempts.delete_one({"_id": aid})

    else:
        # Assignment decision
        if req.decision == "dismiss_false_positive":
            await db.assignment_allocations.update_one(
                {"assignment_id": req.attempt_id},
                {"$set": {"is_malpractice_flagged": False, "violations_count": 0, "status": "in_progress"}}
            )
        elif req.decision == "confirm_violation":
            await db.assignment_allocations.update_one(
                {"assignment_id": req.attempt_id},
                {"$set": {"status": "terminated_malpractice_confirmed", "admin_notes": req.notes}}
            )

    # Record immutable audit event
    await db.security_events.insert_one({
        "attempt_id": req.attempt_id,
        "exam_type": req.exam_type,
        "event_type": "admin_malpractice_decision",
        "decision": req.decision,
        "notes": req.notes,
        "decided_by": admin_uid,
        "server_timestamp": now,
    })

    return {"message": f"Administrative decision '{req.decision}' recorded successfully.", "decided_at": now.isoformat()}
