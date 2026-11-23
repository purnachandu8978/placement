"""
Comprehensive automated tests for Phase 1: Sandboxed Coding Assessment Engine.
Covers:
- Python, JavaScript, Java, and C++ mocked sandbox execution flows
- Compilation failures, runtime errors, infinite loops (TLE), memory exhaustion (MLE)
- Malicious / blocked sandbox configurations (fail-closed 503 when sandbox unreachable)
- Hidden test-case confidentiality across all student APIs & errors
- Sample-only run vs full graded submit + partial marks + final score / roadmap sync
- Code size limits, sliding-window submission rate limiting, concurrency controls
- Unauthorized & cross-student attempt rejection
- Admin Question Bank CRUD (hidden test cases, approval, languages, limits) & submission inspector
- Hardened Docker runner command verification (`--network none`, `--read-only`, `--cap-drop=ALL`, etc.)
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.db.mongodb import mongo_manager
from app.db.seed import seed_mongodb_data
from app.services.code_executor import (
    SandboxTransport,
    get_rate_limiter,
    set_execution_transport_override,
)

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]


class DeterministicMockSandboxTransport(SandboxTransport):
    """
    Simulated remote sandbox transport enforcing deterministic outcomes
    based on code behavior markers or exact stdin/stdout evaluation for tests.
    """

    def __init__(self, mode: str = "pass_all", delay_seconds: float = 0.0) -> None:
        self.mode = mode
        self.delay_seconds = delay_seconds
        self.calls: List[Dict[str, Any]] = []

    async def execute_batch(
        self,
        *,
        language: str,
        source_code: str,
        test_cases: List[Dict[str, Any]],
        time_limit_ms: int,
        memory_limit_kb: int,
    ) -> Dict[str, Any]:
        self.calls.append(
            {
                "language": language,
                "source_code": source_code,
                "test_cases": test_cases,
                "time_limit_ms": time_limit_ms,
                "memory_limit_kb": memory_limit_kb,
            }
        )
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)

        if self.mode == "compile_error" or "SYNTAX_BROKEN" in source_code:
            return {
                "status": "compilation_error",
                "compile_output": f"{language}: error at /work/Main: undeclared identifier",
                "results": [],
            }

        if self.mode == "infinite_loop" or "while(true)" in source_code or "while True:" in source_code:
            return {
                "status": "time_limit_exceeded",
                "compile_output": "",
                "results": [
                    {
                        "id": tc["id"],
                        "status": "time_limit_exceeded",
                        "exit_code": -1,
                        "stdout": "",
                        "stderr": f"Execution exceeded time limit of {time_limit_ms} ms.",
                        "execution_time_ms": float(time_limit_ms),
                    }
                    for tc in test_cases
                ],
            }

        if self.mode == "oom" or "ALLOCATE_OOM" in source_code:
            return {
                "status": "memory_limit_exceeded",
                "compile_output": "",
                "results": [
                    {
                        "id": tc["id"],
                        "status": "memory_limit_exceeded",
                        "exit_code": 137,
                        "stdout": "",
                        "stderr": "MemoryError: container limit exceeded",
                        "execution_time_ms": 45.0,
                    }
                    for tc in test_cases
                ],
            }

        if self.mode == "runtime_error" or "RAISE_RUNTIME" in source_code:
            return {
                "status": "completed",
                "compile_output": "",
                "results": [
                    {
                        "id": tc["id"],
                        "status": "runtime_error",
                        "exit_code": 1,
                        "stdout": "",
                        "stderr": "ZeroDivisionError: division by zero",
                        "execution_time_ms": 8.0,
                    }
                    for tc in test_cases
                ],
            }

        # Look up known expected values from seeded assessment when testing pass/partial/fail
        asmt_doc = await mongo_manager.db.assessments.find_one({"id": "test-python-5"})
        expected_map: Dict[str, str] = {}
        if asmt_doc:
            for q in asmt_doc.get("questions", []):
                for tc in q.get("test_cases", []):
                    expected_map[tc["id"]] = tc.get("expected", "")

        custom_q_cursor = mongo_manager.db.coding_questions.find({})
        async for cq in custom_q_cursor:
            for tc in cq.get("test_cases", []):
                expected_map[tc["id"]] = tc.get("expected", "")

        results = []
        for idx, tc in enumerate(test_cases):
            tc_id = tc["id"]
            if self.mode == "partial_public_only":
                # Pass first 2 cases, fail hidden cases
                out = expected_map.get(tc_id, "42") if idx < 2 else "WRONG_OUTPUT"
            elif self.mode == "fail_all":
                out = "WRONG_OUTPUT"
            else:
                out = expected_map.get(tc_id, "5")

            results.append(
                {
                    "id": tc_id,
                    "status": "ok",
                    "exit_code": 0,
                    "stdout": out,
                    "stderr": "",
                    "execution_time_ms": 14.2,
                }
            )
        return {"status": "completed", "compile_output": "", "results": results}


@pytest.fixture(autouse=True)
def _cleanup_executor_state():
    get_rate_limiter().reset()
    yield
    set_execution_transport_override(None)
    get_rate_limiter().reset()


@pytest.mark.asyncio
async def test_sandbox_engine_multilang_execution(client: AsyncClient, test_student_token):
    """Verify Python, JavaScript, Java, and C++ execute via the isolated transport cleanly."""
    await seed_mongodb_data(mongo_manager.db)
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    start_res = await client.post("/api/v1/attempts/start", headers=headers, json={"assessment_id": "test-python-5"})
    assert start_res.status_code == 200
    attempt_id = start_res.json()["attempt_id"]
    coding_q = next(q for q in start_res.json()["questions"] if q["type"] in ("simple_coding", "hard_coding"))

    mock_transport = DeterministicMockSandboxTransport(mode="pass_all")
    set_execution_transport_override(mock_transport)

    snippets = {
        "python": "import sys\nprint('ok')\n",
        "javascript": "console.log('ok');\n",
        "java": "public class Main { public static void main(String[] a) { System.out.println(\"ok\"); } }\n",
        "cpp": "#include <iostream>\nint main(){ std::cout << \"ok\"; return 0; }\n",
    }

    for lang, code in snippets.items():
        res = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers=headers,
            json={"question_id": coding_q["id"], "code": code, "language": lang},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["language"] == lang
        assert body["status"] == "accepted"
        assert body["passed_test_cases"] == body["total_test_cases"]
        assert body["earned_points"] == float(coding_q["points"])

    assert [c["language"] for c in mock_transport.calls] == ["python", "javascript", "java", "cpp"]


@pytest.mark.asyncio
async def test_failure_modes_compile_runtime_tle_oom(client: AsyncClient, test_student_token):
    """Verify compilation error, runtime error, infinite loop (TLE), and memory exhaustion (MLE)."""
    await seed_mongodb_data(mongo_manager.db)
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    start_res = await client.post("/api/v1/attempts/start", headers=headers, json={"assessment_id": "test-python-5"})
    attempt_id = start_res.json()["attempt_id"]
    coding_q = next(q for q in start_res.json()["questions"] if q["type"] == "simple_coding")

    set_execution_transport_override(DeterministicMockSandboxTransport(mode="pass_all"))

    # 1. Compilation error (0 passed, 0 marks, path redacted)
    ce = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=headers,
        json={"question_id": coding_q["id"], "code": "int main() { SYNTAX_BROKEN }", "language": "cpp"},
    )
    assert ce.status_code == 200
    assert ce.json()["status"] == "compilation_error"
    assert ce.json()["passed_test_cases"] == 0
    assert ce.json()["earned_points"] == 0.0
    assert "/work/" not in ce.json()["compile_error"]

    # 2. Infinite loop -> time_limit_exceeded
    tle = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=headers,
        json={"question_id": coding_q["id"], "code": "while True:\n    pass\n", "language": "python"},
    )
    assert tle.status_code == 200
    assert tle.json()["status"] == "time_limit_exceeded"
    assert tle.json()["passed_test_cases"] == 0

    # 3. Memory exhaustion -> memory_limit_exceeded
    mle = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=headers,
        json={"question_id": coding_q["id"], "code": "# ALLOCATE_OOM\nx = [0]*10**9\n", "language": "python"},
    )
    assert mle.status_code == 200
    assert mle.json()["status"] == "memory_limit_exceeded"
    assert mle.json()["passed_test_cases"] == 0

    # 4. Runtime error
    re_resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=headers,
        json={"question_id": coding_q["id"], "code": "# RAISE_RUNTIME\nprint(1/0)\n", "language": "python"},
    )
    assert re_resp.status_code == 200
    assert re_resp.json()["status"] == "runtime_error"
    assert re_resp.json()["passed_test_cases"] == 0


@pytest.mark.asyncio
async def test_partial_marks_and_sample_vs_submit_separation(client: AsyncClient, test_student_token):
    """
    Verify:
    - Sample run (`/run`) executes ONLY public cases and does NOT grant marks for hidden cases.
    - Full submit (`/submit`) with partial passes awards proportional partial marks on finalize.
    - Assessment result connects cleanly to roadmap & readiness.
    """
    await seed_mongodb_data(mongo_manager.db)
    token, uid_info = test_student_token
    uid = uid_info["firebase_uid"]
    headers = {"Authorization": f"Bearer {token}"}

    # Give student an existing roadmap to verify assessment result updates skill_mastery & gap_targets
    await mongo_manager.db.roadmaps.replace_one(
        {"user_id": uid},
        {"user_id": uid, "duration": "4 Weeks", "weeks": [], "gap_targets": ["Python"], "progress": 25.0},
        upsert=True,
    )

    start_res = await client.post("/api/v1/attempts/start", headers=headers, json={"assessment_id": "test-python-5"})
    attempt_id = start_res.json()["attempt_id"]
    questions = start_res.json()["questions"]
    simple_q = next(q for q in questions if q["type"] == "simple_coding")
    hard_q = next(q for q in questions if q["type"] == "hard_coding")

    mock = DeterministicMockSandboxTransport(mode="partial_public_only")
    set_execution_transport_override(mock)

    # Run sample tests only (2 public cases)
    sample_res = await client.post(
        f"/api/v1/attempts/{attempt_id}/run",
        headers=headers,
        json={"question_id": simple_q["id"], "code": "print('sample ok')", "language": "python"},
    )
    assert sample_res.status_code == 200
    s_body = sample_res.json()
    assert s_body["run_type"] == "sample"
    assert s_body["total_test_cases"] == 2
    assert s_body["passed_test_cases"] == 2
    assert s_body["hidden_summary"]["total"] == 3  # 3 hidden tests exist on simple_q

    # Verify sample run did NOT write graded score into assessment_attempts.code_submissions
    attempt_doc = await mongo_manager.db.assessment_attempts.find_one({"attempt_id": attempt_id})
    assert simple_q["id"] not in (attempt_doc.get("code_submissions") or {})

    # Submit both coding questions with partial mode (2/5 pass -> 40% marks)
    for cq in (simple_q, hard_q):
        sub_res = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers=headers,
            json={"question_id": cq["id"], "code": "print('partial')", "language": "python"},
        )
        assert sub_res.status_code == 200
        sub_body = sub_res.json()
        assert sub_body["status"] == "wrong_answer"
        assert sub_body["passed_test_cases"] == 2
        assert sub_body["total_test_cases"] == 5
        assert sub_body["hidden_summary"] == {"passed": 0, "total": 3}
        # Confidentiality check: hidden test inputs must never appear in response
        serialized = str(sub_body)
        assert "Hidden" not in serialized or "hidden_summary" in serialized
        assert "10 509 510 1009" not in serialized
        assert "0 100 200 1000 1001" not in serialized

    # Answer 2 MCQs correctly and 1 wrong -> 20 pts MCQ + 8 pts simple + 12 pts hard = 40 / 80 = 50%
    asmt_full = await mongo_manager.db.assessments.find_one({"id": "test-python-5"})
    mcqs = [q for q in asmt_full["questions"] if q["type"] == "mcq"]
    for idx, mq in enumerate(mcqs):
        ans = mq["correct_answer"] if idx < 2 else (mq["correct_answer"] + 1) % len(mq["options"])
        await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers=headers,
            json={"question_id": mq["id"], "answer": ans},
        )

    fin = await client.post(f"/api/v1/results/{attempt_id}/finalize", headers=headers)
    assert fin.status_code == 200
    fin_body = fin.json()
    assert fin_body["passed"] is False
    assert fin_body["earned_points"] == 40.0
    assert fin_body["total_points"] == 80.0
    assert fin_body["overall_score"] == 50.0

    # Roadmap skill mastery should be updated in MongoDB
    roadmap = await mongo_manager.db.roadmaps.find_one({"user_id": uid})
    assert roadmap["skill_mastery"]["Python"]["score"] == 50.0
    assert roadmap["skill_mastery"]["Python"]["verified"] is False


@pytest.mark.asyncio
async def test_hidden_test_confidentiality_and_admin_rbac(
    client: AsyncClient,
    test_student_token,
    test_student2_token,
    test_admin_token,
):
    """
    Verify:
    - Students NEVER see hidden test cases in /questions, /assessments, /attempts, or errors.
    - Students CANNOT create/edit/approve/delete questions or inspect /admin/submissions (403).
    - Admins CAN create/edit/approve coding questions with hidden cases and review submissions.
    - Student 2 CANNOT run or submit code on Student 1's attempt (403).
    """
    await seed_mongodb_data(mongo_manager.db)
    s1_tok, _ = test_student_token
    s2_tok, _ = test_student2_token
    adm_tok, _ = test_admin_token
    h_s1 = {"Authorization": f"Bearer {s1_tok}"}
    h_s2 = {"Authorization": f"Bearer {s2_tok}"}
    h_adm = {"Authorization": f"Bearer {adm_tok}"}

    secret_hidden_input = "999999 123456\n"
    secret_hidden_expected = "SECRET_EXPECTED_1123455"

    # Student attempts to create question -> 403
    stu_create = await client.post(
        "/api/v1/questions",
        headers=h_s1,
        json={"skill_id": "python", "type": "simple_coding", "question_text": "hack"},
    )
    assert stu_create.status_code == 403

    # Admin creates coding question with a public & a private hidden test case
    adm_create = await client.post(
        "/api/v1/questions",
        headers=h_adm,
        json={
            "skill_id": "python",
            "skill_name": "Python",
            "category": "Algorithms",
            "type": "simple_coding",
            "title": "Sum Two Integers Confidential",
            "question_text": "Read two integers a and b from stdin and print a + b.",
            "difficulty": "easy",
            "points": 25,
            "supported_languages": ["python", "cpp"],
            "time_limit_ms": 1500,
            "memory_limit_kb": 131072,
            "approval_status": "approved",
            "test_cases": [
                {"id": "pub-1", "label": "Sample", "input": "2 3\n", "expected": "5", "is_hidden": False},
                {"id": "hid-1", "label": "Private Secret", "input": secret_hidden_input, "expected": secret_hidden_expected, "is_hidden": True},
            ],
        },
    )
    assert adm_create.status_code == 201, adm_create.text
    created_q = adm_create.json()
    qid = created_q["id"]
    assert created_q["hidden_test_count"] == 1
    assert any(tc.get("is_hidden") for tc in created_q["test_cases"])

    # Admin GET /questions sees hidden cases
    adm_q = await client.get(f"/api/v1/questions/{qid}", headers=h_adm)
    assert adm_q.status_code == 200
    assert secret_hidden_expected in str(adm_q.json())

    # Student GET /questions NEVER sees hidden cases
    stu_q = await client.get(f"/api/v1/questions/{qid}", headers=h_s1)
    assert stu_q.status_code == 200
    assert secret_hidden_input.strip() not in str(stu_q.json())
    assert secret_hidden_expected not in str(stu_q.json())
    assert stu_q.json()["hidden_test_count"] == 1

    # Admin edits and approves
    edit_res = await client.put(
        f"/api/v1/questions/{qid}",
        headers=h_adm,
        json={"points": 30, "time_limit_ms": 2000},
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["points"] == 30

    app_res = await client.patch(
        f"/api/v1/questions/{qid}/approve",
        headers=h_adm,
        json={"approval_status": "approved"},
    )
    assert app_res.status_code == 200

    # Cross-student hijack on attempt run/submit -> 403
    start_res = await client.post("/api/v1/attempts/start", headers=h_s1, json={"assessment_id": "test-python-5"})
    attempt_id = start_res.json()["attempt_id"]
    hijack = await client.post(
        f"/api/v1/attempts/{attempt_id}/run",
        headers=h_s2,
        json={"question_id": qid, "code": "print(5)", "language": "python"},
    )
    assert hijack.status_code == 403

    # Student 1 cannot open Admin submission review -> 403
    stu_subs = await client.get("/api/v1/admin/submissions", headers=h_s1)
    assert stu_subs.status_code == 403

    # Admin CAN inspect coding submissions including hidden cases
    set_execution_transport_override(DeterministicMockSandboxTransport(mode="fail_all"))
    sub_res = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=h_s1,
        json={"question_id": qid, "code": "print('wrong')", "language": "python"},
    )
    assert sub_res.status_code == 200
    submission_id = sub_res.json()["submission_id"]
    assert secret_hidden_expected not in str(sub_res.json())

    # Student history also never leaks hidden test expected/input
    stu_hist = await client.get(f"/api/v1/attempts/{attempt_id}/submissions", headers=h_s1)
    assert stu_hist.status_code == 200
    assert secret_hidden_expected not in str(stu_hist.json())

    # Admin detail shows full hidden test execution trace
    adm_sub = await client.get(f"/api/v1/admin/submissions/{submission_id}", headers=h_adm)
    assert adm_sub.status_code == 200
    assert secret_hidden_expected in str(adm_sub.json())


@pytest.mark.asyncio
async def test_security_limits_rate_limit_concurrency_and_fail_closed(client: AsyncClient, test_student_token):
    """
    Verify:
    - Request code size limit returns 413
    - Disallowed / unknown language returns 400
    - Per-user sliding window rate limit returns 429
    - Concurrent submissions obey semaphore safely without cross-contamination
    - Unreachable sandbox fails closed (503) rather than running untrusted code in FastAPI
    """
    await seed_mongodb_data(mongo_manager.db)
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    start_res = await client.post("/api/v1/attempts/start", headers=headers, json={"assessment_id": "test-python-5"})
    attempt_id = start_res.json()["attempt_id"]
    coding_q = next(q for q in start_res.json()["questions"] if q["type"] == "simple_coding")

    set_execution_transport_override(DeterministicMockSandboxTransport(mode="pass_all"))

    # 1. Code size limit (> MAX_CODE_SIZE_BYTES)
    oversized = "x = 1\n" * 20000
    r_big = await client.post(
        f"/api/v1/attempts/{attempt_id}/run",
        headers=headers,
        json={"question_id": coding_q["id"], "code": oversized, "language": "python"},
    )
    assert r_big.status_code == 413

    # 2. Disallowed language
    r_lang = await client.post(
        f"/api/v1/attempts/{attempt_id}/run",
        headers=headers,
        json={"question_id": coding_q["id"], "code": "puts 'hi'", "language": "ruby"},
    )
    assert r_lang.status_code == 400

    # 3. Concurrent requests succeed cleanly under semaphore
    slow_mock = DeterministicMockSandboxTransport(mode="pass_all", delay_seconds=0.05)
    set_execution_transport_override(slow_mock)
    prev_limit = settings.SUBMISSION_RATE_LIMIT_PER_MIN
    settings.SUBMISSION_RATE_LIMIT_PER_MIN = 20
    try:
        tasks = [
            client.post(
                f"/api/v1/attempts/{attempt_id}/run",
                headers=headers,
                json={"question_id": coding_q["id"], "code": f"print({i})", "language": "python"},
            )
            for i in range(5)
        ]
        responses = await asyncio.gather(*tasks)
        assert all(r.status_code == 200 for r in responses)

        # 4. Rate limit kicks in cleanly with 429
        get_rate_limiter().reset()
        settings.SUBMISSION_RATE_LIMIT_PER_MIN = 2
        assert (
            await client.post(
                f"/api/v1/attempts/{attempt_id}/run",
                headers=headers,
                json={"question_id": coding_q["id"], "code": "print(1)", "language": "python"},
            )
        ).status_code == 200
        assert (
            await client.post(
                f"/api/v1/attempts/{attempt_id}/run",
                headers=headers,
                json={"question_id": coding_q["id"], "code": "print(2)", "language": "python"},
            )
        ).status_code == 200
        r_limited = await client.post(
            f"/api/v1/attempts/{attempt_id}/run",
            headers=headers,
            json={"question_id": coding_q["id"], "code": "print(3)", "language": "python"},
        )
        assert r_limited.status_code == 429
        assert "Retry-After" in r_limited.headers
    finally:
        settings.SUBMISSION_RATE_LIMIT_PER_MIN = prev_limit

    # 5. Fail-closed when no mock override & sandbox URL points to closed port -> 503
    get_rate_limiter().reset()
    set_execution_transport_override(None)
    prev_url = settings.SANDBOX_SERVICE_URL
    settings.SANDBOX_SERVICE_URL = "http://127.0.0.1:59999"
    try:
        r_unavail = await client.post(
            f"/api/v1/attempts/{attempt_id}/run",
            headers=headers,
            json={"question_id": coding_q["id"], "code": "print(1)", "language": "python"},
        )
        assert r_unavail.status_code == 503
    finally:
        settings.SANDBOX_SERVICE_URL = prev_url


def test_sandbox_runner_container_hardening_flags():
    """Verify `sandbox_runner/app.py` builds non-privileged, network-disabled, read-only Docker commands."""
    spec = importlib.util.spec_from_file_location("sandbox_runner_app", WORKSPACE_ROOT / "sandbox_runner" / "app.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["sandbox_runner_app"] = mod
    spec.loader.exec_module(mod)

    cmd = mod.build_docker_run_command(container_name="pi-test-ctr", memory_limit_kb=262144)
    cmd_str = " ".join(cmd)

    assert "--network none" in cmd_str
    assert "--read-only" in cmd_str
    assert "--cap-drop=ALL" in cmd_str
    assert "--security-opt=no-new-privileges:true" in cmd_str
    assert "--pids-limit=64" in cmd_str
    assert "--memory=256m" in cmd_str
    assert "--memory-swap=256m" in cmd_str
    assert "-u 65534:65534" in cmd_str
    assert "--rm" in cmd
    # Ensure NO host filesystem bind mounts (`-v` / `--volume` / `--mount`) are permitted
    assert "-v" not in cmd
    assert "--volume" not in cmd
    assert "--mount" not in cmd
    assert "--privileged" not in cmd


@pytest.mark.asyncio
async def test_judge0_transport_batch_and_compile_error(monkeypatch):
    """Verify Judge0Transport sends base64 batch requests with enable_network=False and polls cleanly."""
    import base64
    from app.services.code_executor import Judge0Transport

    captured_posts: List[Dict[str, Any]] = []

    class _FakeResp:
        def __init__(self, status_code: int, payload: Any):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            captured_posts.append({"url": url, "json": json, "headers": headers})
            return _FakeResp(201, [{"token": "tok-1"}, {"token": "tok-2"}])

        async def get(self, url, params=None, headers=None):
            b64_ok = base64.b64encode(b"42\n").decode("ascii")
            return _FakeResp(
                200,
                {
                    "submissions": [
                        {"token": "tok-1", "status_id": 3, "stdout": b64_ok, "stderr": "", "time": "0.012", "exit_code": 0},
                        {"token": "tok-2", "status_id": 3, "stdout": b64_ok, "stderr": "", "time": "0.015", "exit_code": 0},
                    ]
                },
            )

    import app.services.code_executor as ce_mod
    monkeypatch.setattr(ce_mod.httpx, "AsyncClient", _FakeAsyncClient)

    j0 = Judge0Transport(api_url="https://judge0.example.internal", auth_token="secret-tok")
    out = await j0.execute_batch(
        language="java",
        source_code="public class Main {}",
        test_cases=[{"id": "1", "input": "1"}, {"id": "2", "input": "2"}],
        time_limit_ms=2000,
        memory_limit_kb=262144,
    )
    assert out["status"] == "completed"
    assert len(out["results"]) == 2
    assert out["results"][0]["stdout"].strip() == "42"
    sent_subs = captured_posts[0]["json"]["submissions"]
    assert all(sub["enable_network"] is False for sub in sent_subs)
    assert all(sub["language_id"] == 62 for sub in sent_subs)
    assert captured_posts[0]["headers"]["X-Auth-Token"] == "secret-tok"
