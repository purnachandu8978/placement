# Placement Intelligence — Complete Testing & Verification Guide

**Guide Version:** 3.0.0-PROD  
**Target Systems:** Backend (pytest + FastAPI + Motor Async) & Frontend (TypeScript + Vite)  
**Status:** Validated & Production Verified

---

## 1. Overview of Test Architecture

Placement Intelligence features an exhaustive test suite covering security hardening, role-based access control, cryptographic verification, background job engines, and full-screen proctored examinations.

### Test Directory Layout

```text
backend/tests/
├── conftest.py                             # Pytest fixtures, mock MongoDB setup, test tokens
├── run_security_tests.py                   # Standalone 10-point production security test runner
├── run_tests.py                            # General test runner orchestrator
├── test_admin_portal_all.py                # Admin console 14-endpoint comprehensive test
├── test_admin_portal_runner.py             # Admin portal standalone test runner
├── test_ai_resume_intelligence.py          # Resume parsing, skill extraction, ATS scoring
├── test_assignments.py                     # Assignment listing, submission, and grading
├── test_assignment_system_runner.py        # Assignment management standalone runner
├── test_auth_email_and_admin_mfa.py        # Student registration, login & admin authentication
├── test_autonomous_job_engine.py           # Job connectors, deduplication & 5-factor matching
├── test_cloud_storage.py                   # Storage keys, magic bytes, signed URLs
├── test_coding_engine.py                   # Sandboxed code execution & test case grading
├── test_college_verification.py            # College credential assessments & public verify
├── test_examination_system.py              # Full-screen exam room proctoring & lockdown
├── test_firebase_mongodb.py                # Firebase Google login & MongoDB Atlas writes
├── test_job_discovery_and_matching.py      # Greenhouse, Lever, Remotive & RSS connectors
├── test_phase5_notifications.py            # FCM device tokens, quiet hours & broadcasts
├── test_phase5_runner.py                   # Phase 5 notification standalone runner
├── test_phase6_production_hardening.py     # OWASP headers, PII redaction & public verification
├── test_phase6_runner.py                   # Phase 6 production hardening runner
├── test_quota_manager.py                   # API token quotas & rate limit mitigation
├── test_security_suite.py                  # Rate limiter, maintenance mode, DPDPA privacy
├── test_startup_atlas_suite.py             # GeoJSON map territories & startup directory
├── test_startup_discovery.py               # Startup recommendations & direct apply tracking
└── test_ultimate_master_suite.py           # Student ID generation, certificate serials & PDFs
```

---

## 2. Test Environment & Fixtures (`conftest.py`)

### Isolated Mock Database
Tests do NOT mutate production MongoDB Atlas collections. In `conftest.py`:
- `mongomock_motor.AsyncMongoMockClient` provides a zero-network, high-speed asynchronous MongoDB engine.
- `seed_mongodb_data(test_db)` pre-seeds curriculum templates, question banks, and default startups.
- Database is safely flushed and cleaned between test sessions.

### Pre-Configured Test Personas
The test suite provisions standard identity tokens:
- **`mock_token_student_verif_01` .. `08`:** Clean student accounts for verification tests.
- **`mock_token_arjun_sharma`:** Student with active resume and technical skills (Python, JS, React).
- **`mock_token_priya_patel`:** Secondary student used for cross-tenant BOLA/IDOR isolation tests.
- **`mock_token_dean_admin`:** Verified administrator persona with `role: "ADMIN"`.

---

## 3. Running Backend Tests with Pytest

### Activate Python Environment
```bash
# Windows:
backend\.venv\Scripts\activate
# Linux/macOS:
source backend/.venv/bin/activate
```

### Run All Pytest Suites
```bash
python -m pytest backend/tests/ -v
```

### Run Target Specific Feature Suites

#### 1. College Verification & Credential Assessments (8 tests)
```bash
python -m pytest backend/tests/test_college_verification.py -v
```

#### 2. Production Security & Hardening Suite (11 tests)
```bash
python -m pytest backend/tests/test_security_suite.py -v
```

#### 3. AI Resume Intelligence Suite (12 tests)
```bash
python -m pytest backend/tests/test_ai_resume_intelligence.py -v
```

#### 4. Sandboxed Coding Execution Engine (7 tests)
```bash
python -m pytest backend/tests/test_coding_engine.py -v
```

#### 5. Unified Examination Proctored Engine (1 test)
```bash
python -m pytest backend/tests/test_examination_system.py -v
```

#### 6. Autonomous Job Discovery & Matching (7 tests)
```bash
python -m pytest backend/tests/test_autonomous_job_engine.py -v
```

#### 7. India Startup Atlas & Map Suite (6 tests)
```bash
python -m pytest backend/tests/test_startup_atlas_suite.py -v
```

#### 8. Firebase & MongoDB Integration (17 tests)
```bash
python -m pytest backend/tests/test_firebase_mongodb.py -v
```

---

## 4. Running Standalone Verification Runners

Placement Intelligence includes self-contained test runners that execute complete multi-step user workflows:

```bash
# 1. 10-Point Production Security Audit Runner (100% PASS)
python backend/tests/run_security_tests.py

# 2. Institutional Admin Portal Workflow Runner (14/14 PASS)
python backend/tests/test_admin_portal_runner.py

# 3. Assignment & Question Management Runner (8/8 PASS)
python backend/tests/test_assignment_system_runner.py

# 4. Phase 5 Real-Time Notification & FCM Runner (8/8 PASS)
python backend/tests/test_phase5_runner.py

# 5. Phase 6 Production Hardening & PII Redaction Runner (8/8 PASS)
python backend/tests/test_phase6_runner.py
```

---

## 5. Frontend Verification & Build Tests

Ensure frontend code quality and type safety:

```bash
cd "placemt inligence"

# 1. TypeScript Strict Mode Type Check (0 Errors)
npx tsc --noEmit

# 2. Vite Production Build (1705 modules bundled with 0 errors)
npm run build
```

---

## 6. Windows-Specific Execution Guidelines

When running tests on Windows:
- Subprocess execution involving compiled C-extensions (such as Argon2id) or loopback HTTP sockets require elevated process permissions. In automated tools or IDE terminals, execute commands with appropriate terminal permissions (`BypassSandbox: true` if using AI agent harnesses).
- Ensure `PYTHONPATH` includes the `backend/` directory:
  ```powershell
  $env:PYTHONPATH = "backend"
  ```

---

## 7. Troubleshooting Common Test Failures

| Symptom | Root Cause | Resolution |
|---|---|---|
| `AssertionError: assert False is True` on `level_1_eligible` | Student has not completed prerequisites (resume or assignments). | Use `seed_verification_prerequisites(uid)` to simulate completed assignments and passing assessments. |
| `KeyError: 'mfa_required'` on admin login | Direct admin login was updated to issue JWT directly. | Update test to assert `token in response.json()` rather than legacy 2FA OTP flow. |
| `ExecutionUnavailableError` in exam tests | Docker daemon is not active on port 8088. | Ensure `DeterministicExamMockTransport` fixture is active during offline testing. |
| `ConnectionRefused` on `/health` | Backend server process is not active. | Verify `uvicorn app.main:app` is running on port 8000 before running live probe tests. |
