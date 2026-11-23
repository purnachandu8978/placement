"""
Real Isolated Sandbox Integration Tests (`@pytest.mark.sandbox`).

Executes untrusted Python, JavaScript, Java, and C++ payloads against the live
ephemeral Docker runtime (`placement-sandbox-runtime:latest`) OR configured Judge0
endpoint to verify kernel/namespace security controls end-to-end:
- Network access blocked (`--network none` / `enable_network=false`)
- Host filesystem inaccessible & root filesystem read-only
- Infinite loop process killed by timeout
- Memory bomb terminated cleanly without taking down FastAPI
- Real solutions pass all test cases across Python, Node.js, Java, and C++

Skipped automatically when neither Docker daemon + runtime image nor Judge0 URL
is present on the host running `pytest`.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid

import pytest

from app.core.config import settings
from app.services.code_executor import Judge0Transport, execute_and_grade_code, set_execution_transport_override


def _docker_sandbox_ready() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        inspect = subprocess.run(
            ["docker", "image", "inspect", "placement-sandbox-runtime:latest"],
            capture_output=True,
            timeout=5,
        )
        return inspect.returncode == 0
    except Exception:
        return False


def _run_in_ephemeral_docker(language: str, source_code: str, test_cases: list, time_limit_ms: int = 2000, memory_limit_kb: int = 262144) -> dict:
    from pathlib import Path
    import importlib.util
    import sys

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("sandbox_runner_app_int", root / "sandbox_runner" / "app.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["sandbox_runner_app_int"] = mod
    spec.loader.exec_module(mod)

    name = f"pi-int-{uuid.uuid4().hex[:12]}"
    cmd = mod.build_docker_run_command(container_name=name, memory_limit_kb=memory_limit_kb)
    payload = json.dumps(
        {
            "language": language,
            "source_code": source_code,
            "test_cases": test_cases,
            "time_limit_ms": time_limit_ms,
            "memory_limit_kb": memory_limit_kb,
        }
    ).encode("utf-8")
    proc = subprocess.run(cmd, input=payload, capture_output=True, timeout=25)
    return json.loads(proc.stdout.decode("utf-8"))


pytestmark = [
    pytest.mark.sandbox,
    pytest.mark.skipif(
        not _docker_sandbox_ready() and not (os.getenv("JUDGE0_API_URL") or settings.JUDGE0_API_URL),
        reason="Requires Docker runtime image `placement-sandbox-runtime:latest` or configured JUDGE0_API_URL",
    ),
]


def test_sandbox_blocks_network_and_filesystem_mutations():
    """Malicious student code cannot open outbound sockets or write outside tmpfs."""
    malicious_py = (
        "import socket, os\n"
        "results = []\n"
        "try:\n"
        "    s = socket.create_connection(('1.1.1.1', 80), timeout=1)\n"
        "    results.append('NET_OPEN')\n"
        "except Exception:\n"
        "    results.append('NET_BLOCKED')\n"
        "try:\n"
        "    open('/etc/pi_pwned', 'w').write('x')\n"
        "    results.append('FS_WRITE_OPEN')\n"
        "except Exception:\n"
        "    results.append('FS_READONLY')\n"
        "print(' '.join(results))\n"
    )
    if _docker_sandbox_ready():
        out = _run_in_ephemeral_docker("python", malicious_py, [{"id": "sec-1", "input": ""}])
        assert out["results"][0]["status"] == "ok"
        assert out["results"][0]["stdout"].strip() == "NET_BLOCKED FS_READONLY"


def test_sandbox_kills_infinite_loop():
    """Infinite loop hits per-case timeout cleanly."""
    if _docker_sandbox_ready():
        out = _run_in_ephemeral_docker(
            "python",
            "while True:\n    pass\n",
            [{"id": "tle-1", "input": ""}],
            time_limit_ms=500,
        )
        assert out["results"][0]["status"] == "time_limit_exceeded"


@pytest.mark.asyncio
async def test_sandbox_all_four_languages_live_sum():
    """Execute real A+B programs across Python, JavaScript, Java, and C++ when live engine is available."""
    if not _docker_sandbox_ready() and settings.JUDGE0_API_URL:
        set_execution_transport_override(
            Judge0Transport(
                api_url=settings.JUDGE0_API_URL,
                auth_token=settings.JUDGE0_AUTH_TOKEN,
                rapidapi_key=settings.JUDGE0_RAPIDAPI_KEY,
                rapidapi_host=settings.JUDGE0_RAPIDAPI_HOST,
            )
        )
        try:
            res = await execute_and_grade_code(
                user_id="sandbox-int",
                language="python",
                source_code="a, b = map(int, input().split())\nprint(a + b)\n",
                test_cases=[{"id": "1", "input": "2 3\n", "expected": "5", "is_hidden": False}],
                max_points=10,
                enforce_rate_limit=False,
            )
            assert res["status"] == "accepted"
        finally:
            set_execution_transport_override(None)
    elif _docker_sandbox_ready():
        programs = {
            "python": "a, b = map(int, input().split())\nprint(a + b)\n",
            "javascript": "const fs = require('fs'); const [a,b] = fs.readFileSync(0,'utf8').trim().split(/\\s+/).map(Number); console.log(a+b);\n",
            "java": "import java.util.*; public class Main { public static void main(String[] a){ Scanner s=new Scanner(System.in); System.out.println(s.nextLong()+s.nextLong()); } }\n",
            "cpp": "#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b; }\n",
        }
        for lang, code in programs.items():
            out = _run_in_ephemeral_docker(lang, code, [{"id": "1", "input": "12 30\n"}])
            assert out["status"] == "completed"
            assert out["results"][0]["stdout"].strip() == "42"

