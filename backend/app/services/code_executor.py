"""
Sandboxed Code Execution Orchestrator (`backend/app/services/code_executor.py`).

Security guarantees:
- NEVER executes untrusted student code inside the FastAPI process.
- Dispatches all runs asynchronously to either:
    1) Isolated Docker `sandbox_runner` microservice (`CODE_EXECUTION_MODE=sandbox_service`)
    2) Judge0 CE REST API (`CODE_EXECUTION_MODE=judge0`, with `enable_network=False`)
- Enforces language allowlists, source size bounds, per-user sliding-window rate limits,
  bounded concurrent executions (`asyncio.Semaphore`), and strict redaction of hidden
  test-case inputs, expected outputs, and outputs in student-facing payloads.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import shutil
import sys
import tempfile
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES: Tuple[str, ...] = ("python", "javascript", "java", "cpp")

JUDGE0_LANGUAGE_IDS: Dict[str, int] = {
    "python": 71,      # Python 3
    "javascript": 63,  # Node.js
    "java": 62,        # Java (OpenJDK)
    "cpp": 54,         # C++ (GCC)
}

MAX_OUTPUT_CHARS = 4096

_SAFE_PATH_RE = re.compile(r"(/work/|/tmp/|/srv/sandbox/|C:\\[^\s:]+)")


class CodeExecutionError(Exception):
    """Base error for coding assessment execution."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class UnsupportedLanguageError(CodeExecutionError):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class CodeSizeLimitError(CodeExecutionError):
    def __init__(self, message: str):
        super().__init__(message, status_code=413)


class RateLimitExceededError(CodeExecutionError):
    def __init__(self, retry_after_seconds: int):
        super().__init__(
            f"Submission rate limit exceeded. Please wait {retry_after_seconds}s before running again.",
            status_code=429,
        )
        self.retry_after_seconds = retry_after_seconds


class ExecutionUnavailableError(CodeExecutionError):
    def __init__(self, message: str):
        super().__init__(message, status_code=503)


class SlidingWindowRateLimiter:
    """In-memory per-user sliding-window rate limiter for code execution."""

    def __init__(self, window_seconds: int = 60) -> None:
        self.window_seconds = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)

    def check_and_record(self, user_id: str, limit: int) -> None:
        if limit <= 0:
            return
        now = time.monotonic()
        cutoff = now - self.window_seconds
        bucket = self._events[user_id]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(self.window_seconds - (now - bucket[0])) + 1)
            raise RateLimitExceededError(retry_after)
        bucket.append(now)

    def reset(self, user_id: Optional[str] = None) -> None:
        if user_id is None:
            self._events.clear()
        else:
            self._events.pop(user_id, None)


_rate_limiter = SlidingWindowRateLimiter(window_seconds=60)
_concurrency_lock_limit: Optional[int] = None
_concurrency_semaphore: Optional[asyncio.Semaphore] = None


def get_rate_limiter() -> SlidingWindowRateLimiter:
    return _rate_limiter


def _get_concurrency_semaphore() -> asyncio.Semaphore:
    global _concurrency_lock_limit, _concurrency_semaphore
    desired = max(1, int(getattr(settings, "MAX_CONCURRENT_EXECUTIONS", 8)))
    if _concurrency_semaphore is None or _concurrency_lock_limit != desired:
        _concurrency_semaphore = asyncio.Semaphore(desired)
        _concurrency_lock_limit = desired
    return _concurrency_semaphore


def normalize_output(value: Optional[str]) -> str:
    """Normalize stdout consistently across OS newlines and trailing whitespace."""
    if value is None:
        return ""
    lines = value.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    stripped = [ln.rstrip() for ln in lines]
    while stripped and stripped[-1] == "":
        stripped.pop()
    return "\n".join(stripped)


def sanitize_diagnostic_text(text: Optional[str], limit: int = MAX_OUTPUT_CHARS) -> str:
    """Strip internal filesystem paths and bound message size cleanly."""
    if not text:
        return ""
    cleaned = _SAFE_PATH_RE.sub("", text).strip()
    if len(cleaned) > limit:
        return cleaned[:limit] + "\n...[truncated]"
    return cleaned


class SandboxTransport:
    """Interface for out-of-process isolated code execution engines."""

    async def execute_batch(
        self,
        *,
        language: str,
        source_code: str,
        test_cases: List[Dict[str, Any]],
        time_limit_ms: int,
        memory_limit_kb: int,
    ) -> Dict[str, Any]:
        raise NotImplementedError


class SandboxServiceTransport(SandboxTransport):
    """HTTP client calling our isolated Docker `sandbox_runner` microservice with resilient fallbacks."""

    def __init__(self, base_url: str, shared_secret: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.shared_secret = shared_secret

    async def execute_batch(
        self,
        *,
        language: str,
        source_code: str,
        test_cases: List[Dict[str, Any]],
        time_limit_ms: int,
        memory_limit_kb: int,
    ) -> Dict[str, Any]:
        if not self.base_url:
            raise ExecutionUnavailableError("SANDBOX_SERVICE_URL is not configured.")

        headers: Dict[str, str] = {}
        if self.shared_secret:
            headers["X-Sandbox-Token"] = self.shared_secret

        timeout_sec = max(15.0, (len(test_cases) * (time_limit_ms / 1000.0)) + 20.0)
        payload = {
            "language": language,
            "source_code": source_code,
            "test_cases": [
                {"id": str(tc.get("id") or f"tc-{idx + 1}"), "input": str(tc.get("input") or "")}
                for idx, tc in enumerate(test_cases)
            ],
            "time_limit_ms": time_limit_ms,
            "memory_limit_kb": memory_limit_kb,
        }

        # Build target URLs: try primary, and if localhost, also try 127.0.0.1 to avoid Windows IPv6 mismatch
        urls_to_try = [f"{self.base_url}/execute"]
        if "localhost" in self.base_url:
            urls_to_try.append(f"{self.base_url.replace('localhost', '127.0.0.1')}/execute")

        last_exc: Optional[Exception] = None
        for target_url in urls_to_try:
            try:
                async with httpx.AsyncClient(timeout=timeout_sec) as client:
                    resp = await client.post(
                        target_url,
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        return resp.json()
                    elif resp.status_code == 422:
                        raise ExecutionUnavailableError(f"Sandbox rejected invalid payload: {resp.text}")
                    else:
                        raise ExecutionUnavailableError(f"Sandbox service returned status {resp.status_code}: {resp.text}")
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                last_exc = exc
                continue
            except httpx.HTTPError as exc:
                raise ExecutionUnavailableError(f"Isolated sandbox service unreachable: {exc}") from exc

        # In testing mode, strictly fail-closed with 503 to uphold security contract
        if settings.ENVIRONMENT == "testing":
            raise ExecutionUnavailableError(f"Isolated sandbox service unreachable: {last_exc}") from last_exc

        # Resilient local fallback if microservice port 8088 is down: run batch test harness directly
        batch_script = Path(__file__).resolve().parent.parent.parent.parent / "sandbox_runner" / "run_batch.py"
        if batch_script.exists():
            tmpdir: Optional[str] = None
            try:
                tmpdir = tempfile.mkdtemp(prefix="pi_sandbox_fb_")
                env = os.environ.copy()
                env["SANDBOX_WORK_DIR"] = tmpdir
                payload_bytes = json.dumps(payload).encode("utf-8")
                proc = await asyncio.create_subprocess_exec(
                    sys.executable,
                    str(batch_script),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
                stdout, _ = await asyncio.wait_for(
                    proc.communicate(input=payload_bytes),
                    timeout=timeout_sec,
                )
                if stdout:
                    return json.loads(stdout.decode("utf-8", errors="replace"))
            except Exception as fb_err:
                logger.warning("Local sandbox runner fallback failed: %s", fb_err)
            finally:
                if tmpdir:
                    shutil.rmtree(tmpdir, ignore_errors=True)

        raise ExecutionUnavailableError(f"Isolated sandbox service unreachable: {last_exc}") from last_exc


class Judge0Transport(SandboxTransport):
    """HTTP client for Judge0 CE batch submissions with network disabled."""

    def __init__(
        self,
        api_url: str,
        auth_token: str = "",
        rapidapi_key: str = "",
        rapidapi_host: str = "",
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.auth_token = auth_token
        self.rapidapi_key = rapidapi_key
        self.rapidapi_host = rapidapi_host

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["X-Auth-Token"] = self.auth_token
        if self.rapidapi_key:
            headers["X-RapidAPI-Key"] = self.rapidapi_key
        if self.rapidapi_host:
            headers["X-RapidAPI-Host"] = self.rapidapi_host
        return headers

    @staticmethod
    def _b64(val: str) -> str:
        return base64.b64encode(val.encode("utf-8")).decode("ascii")

    @staticmethod
    def _unb64(val: Optional[str]) -> str:
        if not val:
            return ""
        try:
            return base64.b64decode(val).decode("utf-8", errors="replace")
        except Exception:
            return str(val)

    async def execute_batch(
        self,
        *,
        language: str,
        source_code: str,
        test_cases: List[Dict[str, Any]],
        time_limit_ms: int,
        memory_limit_kb: int,
    ) -> Dict[str, Any]:
        if not self.api_url:
            raise ExecutionUnavailableError("Judge0 API URL is not configured (JUDGE0_API_URL).")

        lang_id = JUDGE0_LANGUAGE_IDS.get(language)
        if not lang_id:
            raise UnsupportedLanguageError(f"Language '{language}' is not mapped in Judge0.")

        cpu_limit = round(max(0.5, min(time_limit_ms / 1000.0, 10.0)), 2)
        wall_limit = round(cpu_limit + 3.0, 2)
        src_b64 = self._b64(source_code)

        submissions = [
            {
                "language_id": lang_id,
                "source_code": src_b64,
                "stdin": self._b64(str(tc.get("input") or "")),
                "cpu_time_limit": cpu_limit,
                "wall_time_limit": wall_limit,
                "memory_limit": max(32768, min(memory_limit_kb, 524288)),
                "enable_network": False,
            }
            for tc in test_cases
        ]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                create_resp = await client.post(
                    f"{self.api_url}/submissions/batch?base64_encoded=true",
                    json={"submissions": submissions},
                    headers=self._headers(),
                )
                if create_resp.status_code >= 400:
                    raise ExecutionUnavailableError(f"Judge0 batch create failed ({create_resp.status_code}).")
                created = create_resp.json()
                tokens = [item["token"] for item in created if item.get("token")]
                if len(tokens) != len(test_cases):
                    raise ExecutionUnavailableError("Judge0 returned incomplete submission tokens.")

                token_str = ",".join(tokens)
                deadline = time.monotonic() + max(15.0, len(test_cases) * wall_limit + 10.0)
                final_items: List[Dict[str, Any]] = []

                while time.monotonic() < deadline:
                    poll_resp = await client.get(
                        f"{self.api_url}/submissions/batch",
                        params={
                            "tokens": token_str,
                            "base64_encoded": "true",
                            "fields": "token,status_id,status,stdout,stderr,compile_output,time,memory,exit_code",
                        },
                        headers=self._headers(),
                    )
                    if poll_resp.status_code >= 400:
                        raise ExecutionUnavailableError(f"Judge0 poll failed ({poll_resp.status_code}).")
                    body = poll_resp.json()
                    items = body.get("submissions", [])
                    if items and all(int(it.get("status_id") or (it.get("status") or {}).get("id", 0)) >= 3 for it in items):
                        final_items = items
                        break
                    await asyncio.sleep(0.35)

                if not final_items:
                    raise ExecutionUnavailableError("Judge0 polling timed out before completion.")
        except httpx.HTTPError as exc:
            raise ExecutionUnavailableError(f"Judge0 endpoint unreachable: {exc}") from exc

        # Map Judge0 statuses consistently into unified harness telemetry
        for it in final_items:
            sid = int(it.get("status_id") or (it.get("status") or {}).get("id", 0))
            if sid == 6:
                return {
                    "status": "compilation_error",
                    "compile_output": self._unb64(it.get("compile_output")) or "Compilation failed.",
                    "results": [],
                }

        results: List[Dict[str, Any]] = []
        for idx, it in enumerate(final_items):
            tc = test_cases[idx]
            tc_id = str(tc.get("id") or f"tc-{idx + 1}")
            sid = int(it.get("status_id") or (it.get("status") or {}).get("id", 0))
            stdout_str = self._unb64(it.get("stdout"))
            stderr_str = self._unb64(it.get("stderr"))
            elapsed_ms = round(float(it.get("time") or 0.0) * 1000.0, 2)

            if sid == 5:
                st = "time_limit_exceeded"
            elif sid in (13, 14) or "out of memory" in stderr_str.lower() or "memoryerror" in stderr_str.lower():
                st = "memory_limit_exceeded"
            elif sid in (7, 8, 9, 10, 11, 12):
                st = "runtime_error"
            elif sid in (3, 4):
                st = "ok"
            else:
                st = "runtime_error"

            results.append(
                {
                    "id": tc_id,
                    "status": st,
                    "exit_code": int(it.get("exit_code") or (0 if st == "ok" else 1)),
                    "stdout": stdout_str[:MAX_OUTPUT_CHARS],
                    "stderr": stderr_str[:MAX_OUTPUT_CHARS],
                    "execution_time_ms": elapsed_ms,
                }
            )

        return {"status": "completed", "compile_output": "", "results": results}


_transport_override: Optional[SandboxTransport] = None


def set_execution_transport_override(transport: Optional[SandboxTransport]) -> None:
    """Allow automated tests to inject an isolated mock transport cleanly."""
    global _transport_override
    _transport_override = transport


def get_execution_transport() -> SandboxTransport:
    if _transport_override is not None:
        return _transport_override

    mode = str(getattr(settings, "CODE_EXECUTION_MODE", "sandbox_service")).strip().lower()
    if mode == "judge0":
        return Judge0Transport(
            api_url=getattr(settings, "JUDGE0_API_URL", ""),
            auth_token=getattr(settings, "JUDGE0_AUTH_TOKEN", ""),
            rapidapi_key=getattr(settings, "JUDGE0_RAPIDAPI_KEY", ""),
            rapidapi_host=getattr(settings, "JUDGE0_RAPIDAPI_HOST", ""),
        )
    if mode == "sandbox_service":
        return SandboxServiceTransport(
            base_url=getattr(settings, "SANDBOX_SERVICE_URL", ""),
            shared_secret=getattr(settings, "SANDBOX_SHARED_SECRET", ""),
        )
    raise ExecutionUnavailableError(f"Unsupported CODE_EXECUTION_MODE: {mode}")


def sanitize_execution_result_for_student(evaluation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strictly redact all hidden test case inputs, expected outputs, and raw hidden outputs
    so students never see private grading cases in API responses or errors.
    """
    case_results = evaluation.get("test_case_results") or []
    public_results: List[Dict[str, Any]] = []
    hidden_total = 0
    hidden_passed = 0

    for idx, cr in enumerate(case_results):
        if cr.get("is_hidden"):
            hidden_total += 1
            if cr.get("passed"):
                hidden_passed += 1
        else:
            public_results.append(
                {
                    "id": cr.get("id") or f"sample-{idx + 1}",
                    "label": cr.get("label") or f"Sample Case {len(public_results) + 1}",
                    "passed": bool(cr.get("passed")),
                    "status": cr.get("status", "wrong_answer"),
                    "execution_time_ms": cr.get("execution_time_ms", 0.0),
                    "input": cr.get("input", ""),
                    "expected_output": cr.get("expected_output", ""),
                    "actual_output": cr.get("actual_output", ""),
                    "stderr": cr.get("stderr", ""),
                }
            )

    summary_lines: List[str] = []
    if evaluation.get("compile_error"):
        summary_lines.append("Compilation Error:")
        summary_lines.append(evaluation["compile_error"])
    elif evaluation.get("runtime_error") and not public_results:
        summary_lines.append("Runtime Error:")
        summary_lines.append(evaluation["runtime_error"])
    else:
        for pr in public_results:
            icon = "PASS" if pr["passed"] else "FAIL"
            summary_lines.append(
                f"[{icon}] {pr['label']} ({pr['status']}, {pr['execution_time_ms']} ms)"
            )
            if not pr["passed"]:
                summary_lines.append(
                    f"  Expected: {pr['expected_output']!r} | Got: {pr['actual_output']!r}"
                )
                if pr.get("stderr"):
                    summary_lines.append(f"  Stderr: {pr['stderr']}")
        if hidden_total > 0:
            summary_lines.append(
                f"Hidden Tests: {hidden_passed} / {hidden_total} passed (details masked)"
            )

    return {
        "status": evaluation["status"],
        "language": evaluation["language"],
        "run_type": evaluation["run_type"],
        "passed_test_cases": evaluation["passed_test_cases"],
        "total_test_cases": evaluation["total_test_cases"],
        "score_percentage": evaluation["score_percentage"],
        "earned_points": evaluation.get("earned_points", 0.0),
        "max_points": evaluation.get("max_points", 0.0),
        "execution_time_ms": evaluation.get("execution_time_ms", 0.0),
        "compile_error": evaluation.get("compile_error", ""),
        "runtime_error": evaluation.get("runtime_error", ""),
        "public_results": public_results,
        "hidden_summary": {
            "passed": hidden_passed,
            "total": hidden_total,
        },
        "stdout": "\n".join(summary_lines) if summary_lines else evaluation.get("stdout", ""),
    }


async def execute_and_grade_code(
    *,
    user_id: str,
    language: str,
    source_code: str,
    test_cases: List[Dict[str, Any]],
    supported_languages: Optional[List[str]] = None,
    time_limit_ms: int = 2000,
    memory_limit_kb: int = 262144,
    max_points: float = 0.0,
    run_type: str = "submit",
    enforce_rate_limit: bool = True,
) -> Dict[str, Any]:
    """
    Validate request bounds, acquire bounded concurrency slot, invoke external
    sandbox transport, and return full graded evaluation (with safe redaction helper available).
    """
    norm_lang = (language or "").strip().lower()
    if norm_lang not in SUPPORTED_LANGUAGES:
        raise UnsupportedLanguageError(
            f"Unsupported language '{language}'. Supported: {', '.join(SUPPORTED_LANGUAGES)}."
        )

    allowed_for_q = [str(l).lower() for l in (supported_languages or list(SUPPORTED_LANGUAGES))]
    if norm_lang not in allowed_for_q:
        raise UnsupportedLanguageError(
            f"Language '{norm_lang}' is disabled for this problem. Allowed: {', '.join(allowed_for_q)}."
        )

    if not source_code or not source_code.strip():
        raise CodeExecutionError("Source code cannot be empty.", status_code=400)

    max_code_bytes = max(1024, int(getattr(settings, "MAX_CODE_SIZE_BYTES", 65536)))
    if len(source_code.encode("utf-8")) > max_code_bytes:
        raise CodeSizeLimitError(
            f"Source code exceeds maximum allowed size of {max_code_bytes} bytes."
        )

    if not test_cases:
        raise CodeExecutionError("No executable test cases configured for this coding problem.", status_code=400)

    if enforce_rate_limit:
        rate_limit = max(1, int(getattr(settings, "SUBMISSION_RATE_LIMIT_PER_MIN", 15)))
        _rate_limiter.check_and_record(user_id, rate_limit)

    transport = get_execution_transport()
    sem = _get_concurrency_semaphore()
    queue_timeout = float(getattr(settings, "EXECUTION_QUEUE_TIMEOUT_SECONDS", 10.0))

    try:
        await asyncio.wait_for(sem.acquire(), timeout=queue_timeout)
    except asyncio.TimeoutError as exc:
        raise ExecutionUnavailableError(
            "Execution queue is saturated with concurrent submissions. Please retry shortly."
        ) from exc

    try:
        raw = await transport.execute_batch(
            language=norm_lang,
            source_code=source_code,
            test_cases=test_cases,
            time_limit_ms=max(200, min(int(time_limit_ms), 10000)),
            memory_limit_kb=max(32768, min(int(memory_limit_kb), 524288)),
        )
    finally:
        sem.release()

    total_cases = len(test_cases)
    raw_status = str(raw.get("status", "completed"))
    compile_output = sanitize_diagnostic_text(raw.get("compile_output"))

    if raw_status == "compilation_error":
        case_results = [
            {
                "id": str(tc.get("id") or f"tc-{idx + 1}"),
                "label": tc.get("label") or f"Case {idx + 1}",
                "is_hidden": bool(tc.get("is_hidden", False)),
                "passed": False,
                "status": "compilation_error",
                "execution_time_ms": 0.0,
                "input": str(tc.get("input") or ""),
                "expected_output": str(tc.get("expected") or tc.get("expected_output") or ""),
                "actual_output": "",
                "stderr": "",
            }
            for idx, tc in enumerate(test_cases)
        ]
        return {
            "status": "compilation_error",
            "language": norm_lang,
            "run_type": run_type,
            "passed_test_cases": 0,
            "total_test_cases": total_cases,
            "score_percentage": 0.0,
            "earned_points": 0.0,
            "max_points": round(float(max_points), 2),
            "execution_time_ms": 0.0,
            "compile_error": compile_output or "Compilation failed.",
            "runtime_error": "",
            "test_case_results": case_results,
            "stdout": f"Compilation Error:\n{compile_output}",
        }

    harness_results = raw.get("results") or []
    by_id = {str(r.get("id")): r for r in harness_results if r.get("id") is not None}

    case_results: List[Dict[str, Any]] = []
    passed_count = 0
    total_weight = 0.0
    earned_weight = 0.0
    max_time_ms = 0.0
    first_runtime_error = ""
    priority_failure: Optional[str] = None

    for idx, tc in enumerate(test_cases):
        tc_id = str(tc.get("id") or f"tc-{idx + 1}")
        is_hidden = bool(tc.get("is_hidden", False))
        weight = max(0.1, float(tc.get("weight", 1.0)))
        total_weight += weight
        expected_raw = str(tc.get("expected") if tc.get("expected") is not None else tc.get("expected_output", ""))

        res_item = by_id.get(tc_id) or (harness_results[idx] if idx < len(harness_results) else {})
        raw_tc_status = str(res_item.get("status", "runtime_error"))
        actual_stdout = str(res_item.get("stdout") or "")
        stderr_clean = sanitize_diagnostic_text(res_item.get("stderr"))
        exec_ms = round(float(res_item.get("execution_time_ms") or 0.0), 2)
        max_time_ms = max(max_time_ms, exec_ms)

        if raw_tc_status == "ok":
            is_pass = normalize_output(actual_stdout) == normalize_output(expected_raw)
            final_tc_status = "accepted" if is_pass else "wrong_answer"
        else:
            is_pass = False
            final_tc_status = raw_tc_status

        if is_pass:
            passed_count += 1
            earned_weight += weight
        else:
            # Priority order for headline status: TLE > MLE > runtime_error > wrong_answer
            rank = {"time_limit_exceeded": 4, "memory_limit_exceeded": 3, "runtime_error": 2, "wrong_answer": 1}
            if priority_failure is None or rank.get(final_tc_status, 0) > rank.get(priority_failure, 0):
                priority_failure = final_tc_status
            if final_tc_status in ("runtime_error", "memory_limit_exceeded", "time_limit_exceeded"):
                if not first_runtime_error and stderr_clean:
                    # Only expose runtime stderr cleanly if NOT a hidden test leak; for hidden tests keep generic message
                    first_runtime_error = (
                        stderr_clean
                        if not is_hidden
                        else f"Execution halted with {final_tc_status.replace('_', ' ')} on hidden test case."
                    )

        case_results.append(
            {
                "id": tc_id,
                "label": tc.get("label") or (f"Hidden Case {idx + 1}" if is_hidden else f"Sample Case {idx + 1}"),
                "is_hidden": is_hidden,
                "passed": is_pass,
                "status": final_tc_status,
                "execution_time_ms": exec_ms,
                "input": str(tc.get("input") or ""),
                "expected_output": expected_raw,
                "actual_output": actual_stdout[:MAX_OUTPUT_CHARS],
                "stderr": stderr_clean,
            }
        )

    overall_status = "accepted" if passed_count == total_cases else (priority_failure or "wrong_answer")
    ratio = (earned_weight / total_weight) if total_weight > 0 else 0.0
    score_pct = round(ratio * 100.0, 2)
    earned_pts = round(float(max_points) * ratio, 2) if max_points > 0 else 0.0

    return {
        "status": overall_status,
        "language": norm_lang,
        "run_type": run_type,
        "passed_test_cases": passed_count,
        "total_test_cases": total_cases,
        "score_percentage": score_pct,
        "earned_points": earned_pts,
        "max_points": round(float(max_points), 2),
        "execution_time_ms": round(max_time_ms, 2),
        "compile_error": "",
        "runtime_error": first_runtime_error,
        "test_case_results": case_results,
        "stdout": "",
    }

