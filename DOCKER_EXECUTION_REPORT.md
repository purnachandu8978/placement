# DOCKER EXECUTION & CODING ASSESSMENT REPORT
**Placement Intelligence Platform**
**Date:** November 23, 2026
**Audited By:** Docker Infrastructure Engineer & Sandbox Architect

---

## 1. Executive Summary

This report documents the containerization architecture, security isolation boundaries, multi-language execution pipelines, and empirical evaluation results for the Coding Assessment Engine.

---

## 2. Sandbox Security Architecture (`sandbox_runner/`)

Untrusted student code submissions are executed out-of-process via a dedicated, hardened Docker runner microservice.

### Security Guarantees & Container Isolation:
- **No Privileged Mode:** Containers run with `--security-opt=no-new-privileges:true` and `--cap-drop=ALL`.
- **Zero Network Access:** Containers execute with `--network none`, completely preventing outbound data exfiltration, socket binding, or external network calls.
- **Read-Only Root Filesystem:** Root container filesystem is mounted `--read-only`. Temporary file creation is confined to an ephemeral `--tmpfs /work:rw,exec,nosuid,nodev,size=64m`.
- **Unprivileged Non-Root User:** Code executes as UID `65534:65534` (`nobody`).
- **Strict Resource Caps:**
  - Memory: `--memory=256m --memory-swap=256m` (zero swap overflow).
  - CPU: `--cpus=1.0` maximum core quota.
  - Process Limit: `--pids-limit=64` to prevent fork-bombs.
  - File Size Limit: `--ulimit fsize=2097152` (2 MB max output).
  - Open Files: `--ulimit nofile=64`.
- **Automated Lifecycle Cleanup:** Every container is created with `--rm --init` and explicitly terminated and deleted post-execution via `docker kill` / `docker rm -f`.

---

## 3. Empirical Test Case Evaluation (Part 10 Problem)

The coding engine was evaluated on the mandatory two-integer maximum selection problem across standard input and output:

**Problem Statement:** Read two whitespace-delimited integers from standard input and print the maximum value to standard output.

### 3.1 Test Cases & Results

| Test Case ID | Standard Input | Expected Output | Python Actual Output | JavaScript Actual Output | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`tc1`** | `10 20` | `20` | `20` (92.7ms) | `20` (97.2ms) | **PASS** |
| **`tc2`** | `50 30` | `50` | `50` (66.3ms) | `50` (60.3ms) | **PASS** |
| **`tc3`** | `-5 -2` | `-2` | `-2` (77.8ms) | `-2` (52.9ms) | **PASS** |
| **`tc4`** | `100 100` | `100` | `100` (58.2ms) | `100` (53.9ms) | **PASS** |
| **`tc5`** | `0 25` | `25` | `25` (59.8ms) | `25` (51.4ms) | **PASS** |

**Evaluation Result: 100% of test cases passed in both Python and JavaScript runtimes.** Programs were evaluated on actual input/output behavior, never source string matching.

---

## 4. Multi-Language Compiler & Runtime Coverage

The batch runner harness ([run_batch.py](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/sandbox_runner/run_batch.py)) supports 4 standard programming languages:

1. **Python 3:** `python3 -u solution.py`
2. **JavaScript:** `node --max-old-space-size=256 solution.js`
3. **Java:** `javac -encoding UTF-8 -d /work Main.java` $\rightarrow$ `java -Xmx256m -XX:+ExitOnOutOfMemoryError Main`
4. **C++:** `g++ -O2 -std=c++17 main.cpp -o main.out` $\rightarrow$ `./main.out`

### Error Trapping & Diagnostics:
- **Compilation Errors:** Emits detailed compiler stderr without exposing host file paths.
- **Time Limit Exceeded (TLE):** Enforces strict per-test timeouts (default 2000ms), terminating processes via SIGKILL.
- **Out of Memory (MLE):** Traps exit codes 137/-9 and Java `OutOfMemoryError` / C++ `std::bad_alloc`.
- **Hidden Test Protection:** Hidden test inputs and expected outputs are strictly redacted from candidate responses.
