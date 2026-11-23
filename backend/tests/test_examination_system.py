import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Set test environment flags immediately
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
settings.USE_MOCK_MONGODB_FOR_TESTS = True

from app.db.mongodb import get_database
from app.api.v1.endpoints.examination import (
    get_or_create_examination_session,
    save_examination_progress,
    run_examination_code,
    log_security_event,
    submit_examination,
    get_safe_exam_browser_config,
    get_examination_monitoring,
    record_examination_admin_decision,
    ExaminationSaveRequest,
    ExaminationAnswerItem,
    ExaminationRunRequest,
    ExaminationSecurityEventRequest,
    ExaminationSubmitRequest,
    ExaminationAdminDecisionRequest,
)
from app.services.code_executor import SandboxTransport, set_execution_transport_override


class DeterministicExamMockTransport(SandboxTransport):
    async def execute_batch(
        self,
        *,
        language: str,
        source_code: str,
        test_cases: list,
        time_limit_ms: int,
        memory_limit_kb: int,
    ) -> dict:
        results = []
        for tc in test_cases:
            inp = tc.get("input", "")
            out = f"Echo: {inp.strip()}" if "Echo:" in source_code or "UnifiedExamRunner" in inp else "ok"
            results.append({
                "id": tc.get("id"),
                "passed": True,
                "status": "accepted",
                "execution_time_ms": 12.0,
                "memory_kb": 2048,
                "stdout": out,
                "stderr": "",
            })
        return {"status": "completed", "compile_output": "", "results": results}


async def test_examination_suite():
    set_execution_transport_override(DeterministicExamMockTransport())
    db = await get_database()
    student_user = {
        "firebase_uid": "test_exam_student_1",
        "email": "student1@placement.edu",
        "display_name": "Test Student One",
        "role": "STUDENT",
    }
    admin_user = {
        "firebase_uid": "test_exam_admin_1",
        "email": "admin@placement.edu",
        "display_name": "Dean of Examinations",
        "role": "SUPER_ADMIN",
    }

    print("=== STARTING UNIFIED EXAMINATION SYSTEM TEST SUITE ===", flush=True)

    # Clean previous test runs for test student to ensure idempotency
    await db.assessment_attempts.delete_many({"user_id": student_user["firebase_uid"]})
    await db.security_events.delete_many({"user_id": student_user["firebase_uid"]})

    # Seed mock assessment if missing
    asmt_doc = await db.assessments.find_one({})
    if not asmt_doc:
        asmt_doc = {
            "id": "test-algorithms-5",
            "title": "Algorithms 5-Question Assessment",
            "skill_name": "Algorithms",
            "duration_minutes": 30,
            "total_marks": 50,
            "questions": [
                {
                    "id": "q1",
                    "type": "mcq",
                    "question": "What is time complexity of binary search?",
                    "options": ["O(log n)", "O(n)", "O(1)", "O(n^2)"],
                    "correct_answer": 0,
                    "points": 10,
                },
                {
                    "id": "q2",
                    "type": "coding",
                    "title": "Echo Function",
                    "problem_statement": "Read from stdin and output with Echo prefix.",
                    "points": 20,
                    "starter_code": "import sys\nprint('Starter')",
                }
            ],
        }
        await db.assessments.insert_one(asmt_doc)

    asmt_id = asmt_doc.get("id") or str(asmt_doc.get("_id"))

    # 1. Assessment Session
    session_res = await get_or_create_examination_session(
        exam_type="assessment",
        exam_id=asmt_id,
        current_user=student_user,
        db=db,
    )
    print(f"1. Assessment Session initialized: {session_res.get('title')}, Questions: {len(session_res.get('questions', []))}", flush=True)
    assert session_res["session_status"] == "active"
    assert session_res["remaining_seconds"] > 0
    assert len(session_res["questions"]) > 0

    # 2. Answer Auto-Save
    first_q = session_res["questions"][0]
    save_req = ExaminationSaveRequest(
        answers=[
            ExaminationAnswerItem(
                question_id=first_q.get("id") or first_q.get("question_id"),
                type=first_q.get("type", "mcq"),
                selected_option=0,
                code="print('Hello Exam')",
                marked_for_review=True,
            )
        ]
    )
    save_res = await save_examination_progress(
        exam_type="assessment",
        exam_id=asmt_id,
        req=save_req,
        current_user=student_user,
        db=db,
    )
    print(f"2. Answer Auto-Save succeeded: {save_res.get('message')}", flush=True)
    assert "saved successfully" in save_res["message"]

    # 3. Custom Input Code Run
    run_req = ExaminationRunRequest(
        question_id=first_q.get("id") or "q-1",
        code="import sys\nline = sys.stdin.read().strip()\nprint(f'Echo: {line}')",
        language="python",
        custom_input="UnifiedExamRunner",
    )
    run_res = await run_examination_code(
        exam_type="assessment",
        exam_id=asmt_id,
        req=run_req,
        current_user=student_user,
        db=db,
    )
    print(f"3. Custom Input Code Run executed. Status: {run_res.get('status')}, Stdout: {repr(run_res.get('stdout'))}", flush=True)
    assert run_res["status"] in ("ok", "accepted")
    assert "Echo: UnifiedExamRunner" in run_res.get("stdout", "")

    # 4. Security Events: Warning 1/3, 2/3, 3/3, and 4th Violation Termination
    for v_idx in range(1, 5):
        sec_req = ExaminationSecurityEventRequest(
            event_type="fullscreen_exit",
            details=f"Test violation iteration {v_idx}",
            client_timestamp="2026-11-22T20:30:00Z",
        )
        sec_res = await log_security_event(
            exam_type="assessment",
            exam_id=asmt_id,
            req=sec_req,
            current_user=student_user,
            db=db,
        )
        print(f"4.{v_idx} Security Event {v_idx}: Count={sec_res['violations_count']}, Action={sec_res['action_taken']}, Terminated={sec_res['is_terminated']}", flush=True)
        assert sec_res["violations_count"] == v_idx
        if v_idx >= 4:
            assert sec_res["is_terminated"] is True
            assert sec_res["action_taken"] == "attempt_terminated"

    # 5. Safe Exam Browser (.seb) XML Generation with Prohibited Processes
    seb_res = await get_safe_exam_browser_config(
        exam_type="assessment",
        exam_id=asmt_id,
        current_user=student_user,
        db=db,
    )
    print(f"5. SEB Config generated. Media type: {seb_res.media_type}, Length: {len(seb_res.body)}", flush=True)
    assert seb_res.media_type == "application/seb"
    assert b"<plist" in seb_res.body
    assert b"startURL" in seb_res.body
    assert b"GameBar.exe" in seb_res.body
    assert b"prohibitedProcesses" in seb_res.body

    # 6. Admin Malpractice Control Room
    mon_res = await get_examination_monitoring(
        status_filter="all",
        current_admin=admin_user,
        db=db,
    )
    print(f"6. Admin Monitoring Control Room: Active={mon_res['active_sessions_count']}, Terminated={mon_res['terminated_sessions_count']}, Events={len(mon_res['recent_security_events'])}", flush=True)
    assert mon_res["terminated_sessions_count"] >= 1
    assert len(mon_res["recent_security_events"]) >= 4

    # 7. Admin Decision Workflow (Dismiss false positive / Restore attempt)
    target_attempt = mon_res["sessions"][0]
    dec_req = ExaminationAdminDecisionRequest(
        attempt_id=target_attempt["attempt_id"],
        exam_type="assessment",
        decision="dismiss_false_positive",
        notes="Student experienced verifiable operating system notification overlay.",
    )
    dec_res = await record_examination_admin_decision(
        req=dec_req,
        current_admin=admin_user,
        db=db,
    )
    print(f"7. Admin Decision recorded: {dec_res.get('message')}", flush=True)
    assert "dismiss_false_positive" in dec_res["message"]

    # 8. Final Examination Submit
    sub_req = ExaminationSubmitRequest(
        answers=[
            ExaminationAnswerItem(
                question_id=first_q.get("id") or first_q.get("question_id"),
                type="mcq",
                selected_option=0,
            )
        ]
    )
    sub_res = await submit_examination(
        exam_type="assessment",
        exam_id=asmt_id,
        req=sub_req,
        current_user=student_user,
        db=db,
    )
    print(f"8. Final Examination Submission completed: Score={sub_res.get('score')}, Status={sub_res.get('status')}", flush=True)
    assert sub_res["status"] == "completed"

    print("\n=======================================================", flush=True)
    print("ALL 8 UNIFIED EXAMINATION SYSTEM SUITE TESTS PASSED 100%!", flush=True)
    print("=======================================================", flush=True)

if __name__ == "__main__":
    asyncio.run(test_examination_suite())
