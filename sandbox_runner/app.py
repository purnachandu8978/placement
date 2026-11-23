"""
Dedicated Isolated Sandbox Runner Microservice (`sandbox_runner/app.py`).
Runs out-of-process from FastAPI and executes untrusted code exclusively inside
hardened, ephemeral, non-privileged Docker containers with zero network access
and no host filesystem mounts.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

SANDBOX_RUNTIME_IMAGE = os.getenv("SANDBOX_RUNTIME_IMAGE", "placement-sandbox-runtime:latest")
SANDBOX_SHARED_SECRET = os.getenv("SANDBOX_SHARED_SECRET", "")
MAX_CONCURRENT_CONTAINERS = max(1, int(os.getenv("SANDBOX_MAX_CONTAINERS", "6")))
RUN_BATCH_SCRIPT = Path(__file__).resolve().parent / "run_batch.py"

_semaphore = asyncio.Semaphore(MAX_CONCURRENT_CONTAINERS)

app = FastAPI(title="Placement Intelligence Isolated Sandbox Runner", version="1.0.0")


class SandboxTestCase(BaseModel):
    id: str
    input: str = ""


class ExecuteRequest(BaseModel):
    language: str
    source_code: str = Field(..., max_length=65536)
    test_cases: List[SandboxTestCase] = Field(..., max_length=32)
    time_limit_ms: int = Field(default=2000, ge=200, le=10000)
    memory_limit_kb: int = Field(default=262144, ge=32768, le=524288)


def build_docker_run_command(
    *,
    container_name: str,
    memory_limit_kb: int,
    image: str = SANDBOX_RUNTIME_IMAGE,
    cpus: str = "1.0",
) -> List[str]:
    """
    Build hardened, unprivileged ephemeral Docker invocation args:
      - No host bind mounts (-v is never used)
      - Network disabled (--network none)
      - Read-only root filesystem (--read-only) with bounded ephemeral /work tmpfs
      - All Linux capabilities dropped (--cap-drop=ALL) + no-new-privileges
      - Strict PID, memory, swap=0, open-file, and file-size ulimits
      - Non-root user 65534:65534 (nobody)
    """
    mem_mb = max(64, int(memory_limit_kb // 1024))
    return [
        "docker",
        "run",
        "--rm",
        "--init",
        "--name",
        container_name,
        "--network",
        "none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--pids-limit=64",
        f"--cpus={cpus}",
        f"--memory={mem_mb}m",
        f"--memory-swap={mem_mb}m",
        "--ulimit",
        "fsize=2097152",
        "--ulimit",
        "nofile=64",
        "-u",
        "65534:65534",
        "--tmpfs",
        "/work:rw,exec,nosuid,nodev,size=64m",
        "-e",
        "HOME=/work",
        "-w",
        "/work",
        "-i",
        image,
    ]


async def _cleanup_container(container_name: str) -> None:
    """Forcefully terminate and remove any lingering sandbox container."""
    for action in (("docker", "kill", container_name), ("docker", "rm", "-f", container_name)):
        try:
            proc = await asyncio.create_subprocess_exec(
                *action,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except Exception:
            pass


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "docker_cli_present": bool(shutil.which("docker")),
        "runtime_image": SANDBOX_RUNTIME_IMAGE,
        "max_concurrent_containers": MAX_CONCURRENT_CONTAINERS,
    }


@app.post("/execute")
async def execute_submission(
    req: ExecuteRequest,
    x_sandbox_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    if SANDBOX_SHARED_SECRET and x_sandbox_token != SANDBOX_SHARED_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized sandbox access.")

    lang = req.language.strip().lower()
    if lang not in {"python", "javascript", "java", "cpp"}:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {req.language}")

    payload_dict = {
        "language": lang,
        "source_code": req.source_code,
        "test_cases": [tc.model_dump() for tc in req.test_cases],
        "time_limit_ms": req.time_limit_ms,
        "memory_limit_kb": req.memory_limit_kb,
    }
    payload_bytes = json.dumps(payload_dict).encode("utf-8")

    compile_margin = 12.0 if lang in {"java", "cpp"} else 0.0
    total_wall_seconds = compile_margin + (len(req.test_cases) * (req.time_limit_ms / 1000.0)) + 8.0

    has_docker = bool(shutil.which("docker"))

    async with _semaphore:
        proc: Optional[asyncio.subprocess.Process] = None
        container_name = f"pi-sandbox-{uuid.uuid4().hex[:16]}"
        tmpdir: Optional[str] = None
        try:
            if has_docker:
                cmd = build_docker_run_command(
                    container_name=container_name,
                    memory_limit_kb=req.memory_limit_kb,
                )
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                tmpdir = tempfile.mkdtemp(prefix="pi_sandbox_")
                env = os.environ.copy()
                env["SANDBOX_WORK_DIR"] = tmpdir
                proc = await asyncio.create_subprocess_exec(
                    sys.executable,
                    str(RUN_BATCH_SCRIPT),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(input=payload_bytes),
                timeout=total_wall_seconds,
            )
        except asyncio.TimeoutError:
            if has_docker:
                await _cleanup_container(container_name)
            return {
                "status": "time_limit_exceeded",
                "compile_output": "",
                "results": [
                    {
                        "id": tc.id,
                        "status": "time_limit_exceeded",
                        "exit_code": -1,
                        "stdout": "",
                        "stderr": "Execution exceeded overall deadline and was terminated.",
                        "execution_time_ms": float(req.time_limit_ms),
                    }
                    for tc in req.test_cases
                ],
            }
        finally:
            if proc and proc.returncode is None:
                try:
                    proc.kill()
                except Exception:
                    pass
                if has_docker:
                    await _cleanup_container(container_name)
            if tmpdir:
                shutil.rmtree(tmpdir, ignore_errors=True)

        if proc.returncode == 137:
            return {
                "status": "memory_limit_exceeded",
                "compile_output": "",
                "results": [
                    {
                        "id": tc.id,
                        "status": "memory_limit_exceeded",
                        "exit_code": 137,
                        "stdout": "",
                        "stderr": "Sandbox container terminated after exceeding memory quota.",
                        "execution_time_ms": 0.0,
                    }
                    for tc in req.test_cases
                ],
            }

        raw_out = (stdout_bytes or b"").decode("utf-8", errors="replace").strip()
        if not raw_out:
            err = (stderr_bytes or b"").decode("utf-8", errors="replace").strip()[:1024]
            raise HTTPException(
                status_code=503,
                detail=f"Sandbox execution failed to emit harness telemetry: {err or 'empty output'}",
            )

        try:
            return json.loads(raw_out)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Malformed sandbox telemetry payload: {exc}",
            )

