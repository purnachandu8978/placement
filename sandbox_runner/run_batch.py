"""
Immutable in-container batch test harness (/opt/runner/run_batch.py).
Reads a single JSON execution payload from stdin, optionally compiles the submission
into /work, executes each test case under strict per-case time limits, and emits
JSON execution telemetry to stdout.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

WORK_DIR = Path(
    os.environ.get("SANDBOX_WORK_DIR", tempfile.gettempdir() if os.name == "nt" else "/work")
).resolve()
MAX_CAPTURE_BYTES = 16384
COMPILE_TIMEOUT_SECONDS = 12.0


def _truncate_text(raw: bytes | str | None, limit: int = 4096) -> str:
    if raw is None:
        return ""
    if isinstance(raw, bytes):
        text = raw[:MAX_CAPTURE_BYTES].decode("utf-8", errors="replace")
    else:
        text = raw
    if len(text) > limit:
        return text[:limit] + "\n...[output truncated]"
    return text


def _detect_oom(returncode: int, stderr_text: str) -> bool:
    if returncode in (-9, 137):
        return True
    lower = stderr_text.lower()
    return (
        "memoryerror" in lower
        or "outofmemoryerror" in lower
        or "std::bad_alloc" in lower
        or "heap out of memory" in lower
        or "allocation failed" in lower
    )


def _prepare_commands(language: str, source_code: str, memory_limit_kb: int) -> Dict[str, Any]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    mem_mb = max(64, int(memory_limit_kb // 1024))
    python_bin = sys.executable if sys.executable else "python3"

    if language == "python":
        src = WORK_DIR / "solution.py"
        src.write_text(source_code, encoding="utf-8")
        return {
            "compile_cmd": None,
            "run_cmd": [python_bin, "-u", str(src)],
        }
    if language == "javascript":
        src = WORK_DIR / "solution.js"
        src.write_text(source_code, encoding="utf-8")
        return {
            "compile_cmd": None,
            "run_cmd": ["node", f"--max-old-space-size={mem_mb}", str(src)],
        }
    if language == "java":
        src = WORK_DIR / "Main.java"
        src.write_text(source_code, encoding="utf-8")
        return {
            "compile_cmd": ["javac", "-encoding", "UTF-8", "-d", str(WORK_DIR), str(src)],
            "run_cmd": ["java", f"-Xmx{mem_mb}m", "-XX:+ExitOnOutOfMemoryError", "-cp", str(WORK_DIR), "Main"],
        }
    if language == "cpp":
        src = WORK_DIR / "main.cpp"
        exe = WORK_DIR / ("main.exe" if os.name == "nt" else "main.out")
        src.write_text(source_code, encoding="utf-8")
        return {
            "compile_cmd": ["g++", "-O2", "-std=c++17", str(src), "-o", str(exe)],
            "run_cmd": [str(exe)],
        }
    raise ValueError(f"Unsupported language: {language}")


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        print(json.dumps({"status": "internal_error", "error": f"Invalid harness payload: {exc}", "results": []}))
        return 1

    language = str(payload.get("language", "")).strip().lower()
    source_code = str(payload.get("source_code", ""))
    test_cases: List[Dict[str, Any]] = payload.get("test_cases") or []
    time_limit_ms = max(200, min(int(payload.get("time_limit_ms", 2000)), 10000))
    memory_limit_kb = max(32768, min(int(payload.get("memory_limit_kb", 262144)), 524288))
    timeout_sec = time_limit_ms / 1000.0

    try:
        cmds = _prepare_commands(language, source_code, memory_limit_kb)
    except Exception as exc:
        print(json.dumps({"status": "unsupported_language", "error": str(exc), "results": []}))
        return 0

    compile_cmd = cmds.get("compile_cmd")
    if compile_cmd:
        comp_start = time.perf_counter()
        try:
            comp_proc = subprocess.run(
                compile_cmd,
                cwd=str(WORK_DIR),
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=COMPILE_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            print(
                json.dumps(
                    {
                        "status": "compilation_error",
                        "compile_output": "Compilation timed out.",
                        "compile_time_ms": round((time.perf_counter() - comp_start) * 1000, 2),
                        "results": [],
                    }
                )
            )
            return 0

        if comp_proc.returncode != 0:
            err_msg = _truncate_text(comp_proc.stderr or comp_proc.stdout, 4096)
            print(
                json.dumps(
                    {
                        "status": "compilation_error",
                        "compile_output": err_msg or "Compilation failed with non-zero exit code.",
                        "compile_time_ms": round((time.perf_counter() - comp_start) * 1000, 2),
                        "results": [],
                    }
                )
            )
            return 0

    run_cmd = cmds["run_cmd"]
    results: List[Dict[str, Any]] = []

    for idx, tc in enumerate(test_cases):
        tc_id = str(tc.get("id") or f"tc-{idx + 1}")
        stdin_data = str(tc.get("input") or "")
        started = time.perf_counter()
        try:
            proc = subprocess.run(
                run_cmd,
                cwd=str(WORK_DIR),
                input=stdin_data.encode("utf-8"),
                capture_output=True,
                timeout=timeout_sec,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            stdout_str = _truncate_text(proc.stdout, 4096)
            stderr_str = _truncate_text(proc.stderr, 4096)

            if proc.returncode == 0:
                tc_status = "ok"
            elif _detect_oom(proc.returncode, stderr_str):
                tc_status = "memory_limit_exceeded"
            else:
                tc_status = "runtime_error"

            results.append(
                {
                    "id": tc_id,
                    "status": tc_status,
                    "exit_code": proc.returncode,
                    "stdout": stdout_str,
                    "stderr": stderr_str,
                    "execution_time_ms": elapsed_ms,
                }
            )
        except subprocess.TimeoutExpired as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            results.append(
                {
                    "id": tc_id,
                    "status": "time_limit_exceeded",
                    "exit_code": -1,
                    "stdout": _truncate_text(exc.stdout, 1024),
                    "stderr": f"Execution exceeded time limit of {time_limit_ms} ms.",
                    "execution_time_ms": elapsed_ms,
                }
            )

    print(json.dumps({"status": "completed", "compile_output": "", "results": results}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

