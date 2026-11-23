# Placement Intelligence — High-Level System Architecture Specification

**Document Version:** 3.0.0-PROD  
**Classification:** Technical Architecture & Design Document  
**Target Platform:** Multi-tier Cloud Architecture (FastAPI + React 19 + MongoDB Atlas)  
**Status:** Validated & Production Ready

---

## 1. Architectural Philosophy & Design Principles

Placement Intelligence is engineered around six fundamental software architecture tenets:

1. **Separation of Concerns:** Business logic strictly resides in `app/services/`; API routers in `app/api/v1/endpoints/` only handle validation, serialization, and HTTP status codes; frontend components in `features/` consume unified API clients in `services/`.
2. **Multi-Tenant Data Isolation (BOLA/IDOR Defense):** Every student data query strictly scopes to `user_id == current_user["firebase_uid"]`. Cross-student inspection is prevented at the database driver level.
3. **Defense in Depth:** Dual authentication mechanisms (Firebase Google Auth for candidates, Argon2id + HS256 JWT for administrators), sliding-window rate limiters, automated brute-force lockouts, and OWASP security headers.
4. **Sandboxed Code Execution:** Untrusted student code is NEVER executed inside the web application process. Execution is delegated to hardened containers (`sandbox_runner`) or external execution brokers with zero network access, memory caps, and hidden test case redaction.
5. **Zero Data Loss & Database Integrity:** Document stores in MongoDB Atlas maintain ESR-compliant compound indexes, continuous point-in-time recovery, and de-identification erasure rather than catastrophic hard deletes.
6. **Production Observability:** Subsystem ping probes, structured error logging with correlation IDs (`err_XXXXXXXXXXXX`), and statutory DPDPA compliance logging.

---

## 2. High-Level System Topology

```text
                                  +------------------------------------+
                                  |         Web Clients (HTTPS)        |
                                  |  Students, Placement Admins, Public |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |       Vite / Nginx Edge Layer      |
                                  | (React 19 SPA, Assets, Compression)|
                                  +-----------------+------------------+
                                                    |
                                    HTTPS API Reverse Proxy (/api/v1)
                                                    |
                                                    v
                    +---------------------------------------------------------------+
                    |               FastAPI Application Engine (Python 3.12)        |
                    |                                                               |
                    |  +---------------------+   +-------------------------------+  |
                    |  | Security Middleware |   | Sliding-Window Rate Limiter   |  |
                    |  +----------+----------+   +---------------+---------------+  |
                    |             |                              |                  |
                    |             v                              v                  |
                    |  +---------------------+   +-------------------------------+  |
                    |  | Maintenance Switch  |   | Authentication & RBAC Router  |  |
                    |  +----------+----------+   +---------------+---------------+  |
                    |             |                              |                  |
                    |             +--------------+---------------+                  |
                    |                            |                                  |
                    |                            v                                  |
                    |             +-------------------------------+                 |
                    |             |    Versioned Endpoint Layer   |                 |
                    |             |  (/students, /resumes, /admin)|                 |
                    |             +--------------+----------------+                 |
                    |                            |                                  |
                    |                            v                                  |
                    |             +-------------------------------+                 |
                    |             |     Domain Service Engines    |                 |
                    |             | (Resume, Exam, Verification)  |                 |
                    |             +--------------+----------------+                 |
                    +----------------------------|----------------------------------+
                                                 |
                         +-----------------------+-----------------------+
                         |                                               |
                         v                                               v
        +---------------------------------+             +----------------------------------+
        |       MongoDB Atlas Cluster     |             |     Isolated Execution Sandbox   |
        |  (Motor Async Driver, 39 Colls) |             |  (Docker Container, Read-Only,   |
        |  - users, profiles, resumes     |             |   No Network, 256MB RAM Cap)     |
        |  - credentials, attempts, jobs  |             +----------------------------------+
        +---------------------------------+
```

---

## 3. Frontend Architecture (React 19 + TypeScript + Vite)

The frontend is structured as a modular Single Page Application (SPA) adhering to feature-slice architecture:

```text
placemt inligence/src/
├── components/          # Shared atomic UI components (Button, Card, Modal, Input, Badge)
├── context/             # Global application state (AuthContext, ToastContext)
├── features/            # Isolated domain feature slices
│   ├── admin/           # Admin Console (Student 360°, Cohorts, Question Bank, Exams)
│   ├── assessment/      # Timed Technical Assessment Workstation
│   ├── exam/            # Full-screen proctored examination interface
│   ├── legal/           # DPDPA Privacy Policy, Terms of Service, Cookie Policy
│   ├── profile/         # Student profile management and academic settings
│   ├── resume/          # Resume upload, ATS score gauge, and bullet optimizer
│   ├── roadmap/         # 4-week interactive skill roadmap and weekly milestones
│   ├── startups/        # Interactive India Startup Atlas & Map Explorer
│   └── verification/    # College-Verified Credentials, PDF viewer & public verify
├── routes/              # Declarative React Router configuration with lazy-loaded chunks
├── services/            # Axios/Fetch API client abstractions with automatic token injection
├── types/               # Strict TypeScript domain interfaces and DTOs
└── utils/               # Pure formatting helpers (date, math, timer, string sanitization)
```

### Visual Identity & Portal Segregation
The application enforces strict design boundaries between the student and admin experiences:
- **Student Portal:** Warm Sunset Orange (`#F97316` / `#EA580C`) representing growth, acceleration, and encouragement.
- **Admin Console:** Institutional Royal Blue (`#2563EB` / `#1D4ED8`) representing authority, security, and governance.

---

## 4. Backend Architecture (FastAPI + Pydantic v2)

The backend follows clean layered architecture principles:

```text
backend/app/
├── api/
│   ├── deps.py          # Shared route dependencies (current_user, database, roles)
│   └── v1/
│       ├── router.py    # Master versioned router combining all domain controllers
│       └── endpoints/   # Individual REST controllers (auth, students, resumes, etc.)
├── core/
│   ├── config.py        # Pydantic BaseSettings loading validated environment variables
│   ├── dependencies.py  # Authentication guards (Firebase token decode, JWT parse)
│   ├── firebase.py      # Firebase Admin SDK & Google Public x509 Cert verification
│   ├── middleware.py    # OWASP security headers & Server Maintenance Mode middleware
│   ├── observability.py # Subsystem health probes and latency telemetry
│   ├── rate_limit.py    # Thread-safe sliding-window rate limiter & lockout manager
│   └── security.py      # Argon2id password hasher & HS256 session token generator
├── db/
│   ├── mongodb.py       # Async Motor database manager, connection pool & ping health
│   └── seed.py          # Safe idempotent database seeder (never writes fake students)
├── schemas/             # Pydantic v2 Request/Response transfer schemas
├── services/            # Pure asynchronous business logic & domain orchestrators
│   ├── college_verification_service.py # Credential assessments, HMAC hashes, PDF generation
│   ├── resume_intelligence.py          # ATS keyword extraction & semantic skills
│   ├── job_matcher.py                  # 5-factor explainable job matching
│   ├── code_executor.py                # Safe execution pipeline with Judge0/Docker
│   └── startup_discovery_service.py    # Startup directory and state GeoJSON aggregation
└── worker.py            # Background job ingestion and periodic notifications worker
```

---

## 5. Database Architecture & Collections (MongoDB Atlas)

The platform utilizes a document-oriented architecture hosted on MongoDB Atlas with continuous backups and strict compound indexes.

### Core Collections Overview

| Collection Name | Document Responsibility | Primary Indexes |
|---|---|---|
| `users` | Core user identity, role, and auth provider metadata. | `firebase_uid` (unique), `email` (unique) |
| `student_profiles` | Academic background, CGPA, college, target roles, social links. | `user_id` (unique) |
| `resumes` | Uploaded resume metadata, ATS score, detected skills, storage URL. | `user_id` + `is_active` (compound unique) |
| `extracted_skills` | Normalized technical skills discovered from resumes or manual entry. | `user_id` + `skill_name` |
| `verified_skills` | Cryptographically proven skills passed via assessment or manual proof. | `verification_hash` (unique), `user_id` |
| `student_credentials` | Formal college-verified digital badges (`LEVEL_1_BLUE`, `LEVEL_2_GREEN`). | `credential_id` (unique), `credential_hash` (unique), `user_id` |
| `assignments` | Academic technical assignments authored by faculty or system. | `template_key`, `user_id` |
| `assignment_submissions` | Student assignment submissions with scores, answers, and rubrics. | `user_id` + `assignment_id` |
| `assessment_attempts` | Timed skill assessment results, answer sheets, and scores. | `user_id` + `assessment_id` |
| `job_postings` | Curated and scraped job opportunities from verified companies. | `source_id` + `company` (unique), `is_active` |
| `startups` | Verified Indian startup profiles across 36 states and union territories. | `slug` (unique), `state` |
| `audit_events` | Immutable platform activity log for security and compliance audits. | `timestamp` (TTL index), `user_id` |

---

## 6. Authentication & Authorization Security Model

### Dual-Channel Authentication Flow

1. **Candidate Path (Firebase Google ID Token):**
   - Candidate signs in on frontend via official Google Firebase SDK popup.
   - Frontend sends Google ID Token to `POST /api/v1/auth/google`.
   - Backend validates the token against Google's public x509 certificates (or Firebase Admin SDK if serviceAccountKey is present).
   - Backend verifies `iss == "https://securetoken.google.com/<PROJECT_ID>"`, `aud == <PROJECT_ID>`, and `exp > now()`.
   - User document is retrieved or initialized in a clean zero-state in `db.users` and `db.student_profiles`.
   - Role is strictly pinned to `STUDENT`.

2. **Administrator Path (Argon2id + HS256 JWT):**
   - Administrator signs in via `/admin/login` using institutional email and password.
   - Password is verified using RFC 9106 Argon2id parameters (`m=65536, t=3, p=4`).
   - Brute-force protection allows max 5 failed attempts before a 15-minute lockout.
   - Upon successful verification, a signed HS256 JWT is issued containing claims: `{sub: uid, role: "ADMIN", jti: "<unique-uuid>"}`.
   - Token is delivered in the JSON response and set as an HttpOnly, SameSite=Lax cookie.

### Role-Based Access Control (RBAC) Matrix

| Endpoint Group | STUDENT | PLACEMENT_OFFICER | FACULTY | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|
| `/students/me/*` (Profile, Roadmap) | Allowed | Self Only | Self Only | Full Read | Full Read |
| `/resumes/upload` & `/skills/*` | Allowed | Denied | Denied | Audit Read | Audit Read |
| `/verification/assessment/*` | Allowed | Denied | Denied | Audit Read | Audit Read |
| `/verify/{hash}` (Public Verification) | Public | Public | Public | Public | Public |
| `/admin/students` (Cohort Management) | **Denied (403)** | Allowed | Allowed | Allowed | Allowed |
| `/admin/questions` & `/assignments` | **Denied (403)** | Allowed | Allowed | Allowed | Allowed |
| `/admin/integrations` & Maintenance | **Denied (403)** | Denied | Denied | Allowed | Allowed |

---

## 7. Sandboxed Code Execution Architecture

Untrusted code submitted by candidates in coding assessments is processed through a zero-trust execution sandbox:

```text
[Candidate Browser]
        |
        | POST /api/v1/attempts/{id}/submit
        v
[FastAPI Backend Engine]
        |
        | 1. Sanitize code string (strip harmful shell hooks)
        | 2. Fetch test cases (Samples + Hidden) from Question Bank
        | 3. Dispatch to Sandbox Runner via isolated socket/HTTP
        v
[Isolated Container: sandbox_runner]
        |
        | - Dropped root privileges (`user: sandboxuser`)
        | - Read-only root filesystem (`read_only: true`)
        | - Network disabled (`network_mode: none`)
        | - Strict Memory Limit: 256MB (`memory: 256m`)
        | - Strict CPU Cap: 0.5 CPU core (`cpus: 0.5`)
        | - Timeout enforcement: 5 seconds max runtime
        v
[Output Processing]
        |
        | 1. Redact hidden test inputs and expected outputs
        | 2. Produce masked summary: "Hidden Tests: X / Y passed"
        | 3. Return execution metrics (latency, memory, exit code)
        v
[Grading & Credential Pipeline]
```

---

## 8. Statutory Privacy Compliance (DPDPA 2023 & FERPA)

The application implements legal safeguards complying with India's **Digital Personal Data Protection Act, 2023**:

- **Section 11 (Right to Access):** `GET /api/v1/students/me/data-export` bundles all personal identifiers, academic details, resume text, assessment scores, and audit logs into a portable JSON document certified with a 64-character SHA-256 integrity hash.
- **Section 12 (Right to Erasure):** `DELETE /api/v1/students/me/account` anonymizes personal identifiers (email, name, phone, resume files) while preserving aggregated institutional telemetry for historical placement reporting.
- **Section 13 (Grievance Redressal):** `POST /api/v1/students/me/privacy-request` issues an official tracking reference (`PRV-XXXXXXXX`) and enforces a statutory 30-day response deadline.
