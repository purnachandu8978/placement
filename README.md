# Placement Intelligence — Enterprise Campus Placement & Skill Verification Platform

> **Production-Hardened College Placement Ecosystem, Intelligent Resume Extraction, Unified Examination & Cryptographic Credentialing Authority**  
> Built with React 19, TypeScript (Strict Mode), Vite 6, Tailwind CSS, FastAPI (Python 3.12), Motor Async MongoDB Atlas, and Firebase Google Authentication.

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%200%20Errors-blue.svg)]()
[![Python](https://img.shields.io/badge/Python-3.12%20FastAPI-blue.svg)]()
[![Security Audit](https://img.shields.io/badge/Security%20Audit-Grade%20A%2B%20(100%25)-success.svg)]()
[![Database](https://img.shields.io/badge/Database-MongoDB%20Atlas-forestgreen.svg)]()

---

## 1. Product Overview & Core Architecture

**Placement Intelligence** bridges the gap between engineering institutions, students, and tier-1 recruiters through a unified, data-driven, and multi-tenant placement ecosystem.

The platform provides two strictly segregated, role-isolated portals:

### 1. Student Career Acceleration Portal (Warm Sunset Orange)
- **Zero-State Profile Initialization:** Clean onboarding upon Firebase Google login with zero pre-filled fake data.
- **AI Resume Intelligence:** Upload PDF/DOCX resumes for ATS keyword analysis, tech-stack scoring, and semantic skill discovery.
- **Adaptive Technical Assessments:** 5-minute (Blue Verified) and 10-minute (Green Fully Verified) technical competency challenges with MCQ and sandboxed coding problems.
- **Curriculum Assignment Center:** Hands-on technical assignments evaluated via rubrics and automated test cases.
- **Cryptographic Credentialing Authority:** Tamper-proof digital certificates with SHA-256 assertions, unique serial IDs (`PI-CRED-YYYY-XXXXXXXX`), and public verification routes (`/verify/{hash}`).
- **Autonomous Job Intelligence:** Ingests live job feeds across tech ecosystems, scoring candidate fit with 5-factor matching.
- **Interactive Startup Atlas:** 36-territory interactive GeoJSON map of Indian tech hubs, funded venture directories, and student application tracking.
- **Statutory Privacy Rights:** DPDPA 2023 & FERPA compliant data export (`GET /students/me/data-export`) with SHA-256 integrity checksum, privacy requests, and account erasure.

### 2. Institutional Placement Administration Console (Institutional Royal Blue)
- **Placement Cell 360° Control Center:** Real-time analytics, student account management, and placement telemetry.
- **Cohort Group Management:** Group students by graduating class, department, or skill tier, with bulk assignment allocation.
- **Centralized Question Bank:** Author MCQ, Short Answer, and Coding challenges with hidden test cases and execution time/memory limits.
- **Assignment Evaluation Workstation:** Grade student submissions with multi-criteria rubrics, inline feedback, and score releases.
- **Proctored Examination Control Room:** Real-time exam session monitoring, telemetry logs, device readiness tracking, and termination controls.
- **Server-Side Maintenance Mode:** Instant platform freeze returning HTTP 503 (`Retry-After: 300`) with administrative bypass.
- **Security & Rate Limiting:** In-memory sliding-window rate limiters, 15-minute brute-force account lockout defense, and immutable audit logs.

---

## 2. Technology Stack

| Layer | Technologies | Key Highlights |
|---|---|---|
| **Frontend UI** | React 19, TypeScript, Vite 6, Tailwind CSS | Modular feature slices, Lucide icons, responsive design across mobile/desktop, zero runtime errors. |
| **Backend API** | Python 3.12, FastAPI, Pydantic v2, Starlette | Async request pipeline, non-blocking I/O, OpenAPI 3.1 documentation, strict RBAC guards. |
| **Database** | MongoDB Atlas, Motor (AsyncIOMotorClient) | Document-oriented collections, ESR-compliant compound indexes, continuous backup enabled. |
| **Authentication** | Firebase Google Auth + Argon2id / HS256 JWT | Students authenticate via Google; Admins authenticate via Argon2id hashed credentials and signed JWT sessions. |
| **Code Execution** | Isolated Docker Sandbox (`sandbox_runner`) / Judge0 | Multi-language runner (Python, JavaScript, Java, C++) with strict memory, CPU, and network lockdown. |
| **Storage** | Cloudflare R2 / AWS S3 / MongoDB GridFS | Sovereign bucket storage with HMAC signed URLs (15-minute expiration) and MIME magic-byte validation. |

---

## 3. Quick Start Guide (Local Development)

### Prerequisites
- Node.js 20+ and npm
- Python 3.12+ and virtualenv
- Docker Desktop (optional, for local sandboxed code execution)
- Active MongoDB Atlas connection URI or local MongoDB instance

### Step 1: Clone and Setup Environment Files
```bash
git clone <repository-url>
cd PLACEMENT
```

Configure backend environment (`backend/.env`):
```ini
ENVIRONMENT=development
SECRET_KEY=dev-secret-key-at-least-64-characters-long-for-hs256-jwt-signing
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net
MONGODB_DB_NAME=placement
FIREBASE_PROJECT_ID=placement-management-e89c7
FIREBASE_MOCK_AUTH_IN_DEV=true
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Configure frontend environment (`placemt inligence/.env`):
```ini
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_FIREBASE_PROJECT_ID=placement-management-e89c7
```

### Step 2: Start Backend Server
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Backend API will be available at: `http://localhost:8000`  
Interactive Swagger Docs: `http://localhost:8000/docs`

### Step 3: Start Frontend Application
In a separate terminal:
```bash
cd "placemt inligence"
npm install
npm run dev
```
Frontend Web Portal will be available at: `http://localhost:5173`

---

## 4. Operational URLs & Endpoints

| Service / Interface | URL | Description |
|---|---|---|
| **Public Landing Page** | `http://localhost:5173/` | Editorial hero, placement journey, and public platform entry. |
| **Student Auth** | `http://localhost:5173/auth/student` | Firebase Google sign-in for candidates. |
| **Admin Console** | `http://localhost:5173/admin/login` | Institutional administrator login portal. |
| **Public Verification** | `http://localhost:5173/verify/:hash` | Public digital credential verification without authentication. |
| **API Health Probe** | `http://localhost:8000/health` | Real-time orchestrator health telemetry and MongoDB ping. |
| **Interactive API Docs** | `http://localhost:8000/docs` | Swagger UI OpenAPI specification. |
| **ReDoc Documentation**| `http://localhost:8000/redoc` | High-contrast ReDoc technical documentation. |

---

## 5. Verification & Testing

Run all unit, integration, and security test suites:

```bash
# Backend pytest suite (all 29 core verification tests)
backend/.venv/Scripts/python -m pytest backend/tests/test_college_verification.py backend/tests/test_phase6_production_hardening.py backend/tests/test_security_suite.py backend/tests/test_auth_email_and_admin_mfa.py -v

# Standalone Production Security Test Runner (10/10 PASS)
backend/.venv/Scripts/python backend/tests/run_security_tests.py

# Frontend TypeScript Type Check (Strict Mode, 0 Errors)
cd "placemt inligence" && npx tsc --noEmit

# Frontend Production Vite Build
cd "placemt inligence" && npm run build
```

---

## 6. Complete Documentation Directory

For in-depth architectural specifications and operational protocols, refer to:

- [ARCHITECTURE.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/ARCHITECTURE.md) — Multi-tier architecture, data flow models, and security layers.
- [SECURITY_AUDIT_REPORT.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/SECURITY_AUDIT_REPORT.md) — Comprehensive threat model, vulnerability remediations, and compliance audit.
- [CODE_QUALITY_REPORT.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/CODE_QUALITY_REPORT.md) — Clean code audit, cyclomatic complexity, and design pattern analysis.
- [TESTING_GUIDE.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/TESTING_GUIDE.md) — Test suite layout, mock fixtures, and execution procedures.
- [API_DOCUMENTATION.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/API_DOCUMENTATION.md) — Complete REST endpoint catalog with schemas and parameters.
- [ENVIRONMENT_CONFIGURATION.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/ENVIRONMENT_CONFIGURATION.md) — Environment variables, secrets management, and rotation policy.
- [DEPLOYMENT_GUIDE.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/DEPLOYMENT_GUIDE.md) — High-availability cluster deployment, Docker setup, and SSL/TLS.
- [KNOWN_LIMITATIONS.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/KNOWN_LIMITATIONS.md) — Architectural trade-offs, scaling limits, and roadmap items.
- [PROJECT_STATUS.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/PROJECT_STATUS.md) — Production readiness matrix and subsystem health.
- [CHANGELOG.md](file:///c:/Users/Medisetty%20Chandu/OneDrive/Desktop/PLACEMENT/CHANGELOG.md) — Release history and version updates.
