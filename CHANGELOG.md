# Placement Intelligence — Changelog & Release History

All notable changes to the Placement Intelligence enterprise codebase are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0-PROD] — 2026-11-23

### Security Hardening & Defenses
- **Added:** Thread-safe in-memory sliding-window rate limiter (`app/core/rate_limit.py`) protecting public authentication routes (`/login`, `/register`, `/admin/login`, `/forgot-password/*`).
- **Added:** Automated account and IP brute-force lockout defense enforcing 15-minute lockouts after 5 consecutive failed login attempts (returning HTTP 429 with compliant `Retry-After: 900` headers).
- **Added:** Server-side platform maintenance mode middleware (`app/core/middleware.py`) returning HTTP 503 Service Unavailable with `Retry-After: 300`, with automated bypass for `/health` probes and authenticated `ADMIN` sessions.
- **Added:** Administrative maintenance mode status and dynamic toggle APIs (`GET /admin/maintenance-status` and `POST /admin/maintenance-toggle`).
- **Added:** Strict OWASP security response headers on all responses (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`).
- **Added:** Production exception masking in `main.py` with correlation tracking IDs (`request_id: err_XXXXXXXXXXXX`) preventing server stack trace leakage.
- **Added:** Automated Production Security Test Suite (`backend/tests/test_security_suite.py` and `backend/tests/run_security_tests.py`) covering all 10 security audit domains with 100% pass rate.
- **Hardened:** Public candidate registration strictly discards any client-supplied `role` attributes, enforcing role `STUDENT`.
- **Hardened:** Multi-user Broken Object-Level Authorization (BOLA/IDOR) defenses validated across student profiles, resumes, roadmaps, attempts, and assignments.

### Privacy & Statutory Compliance (DPDPA 2023 & FERPA)
- **Added:** DPDPA Section 11 Right to Access endpoint: `GET /api/v1/students/me/data-export`, delivering complete personal profile and telemetry records in portable JSON with a SHA-256 integrity checksum.
- **Added:** DPDPA Section 13 Grievance Redressal endpoint: `POST /api/v1/students/me/privacy-request`, logging statutory requests with tracking ID (`PRV-XXXXXXXX`) and 30-day statutory resolution timeline.
- **Added:** DPDPA Section 12 Right to Erasure endpoint: `DELETE /api/v1/students/me/account`, performing student de-identification while preserving aggregate placement analytics.
- **Added:** Dedicated public frontend legal pages:
  - Privacy Policy (`/privacy-policy` and `/privacy`) compliant with DPDPA 2023.
  - Terms of Service (`/terms-of-service` and `/terms`).
  - Cookie Policy (`/cookie-policy` and `/cookies`).

### Visual Design & Landing Page Refinements
- **Added:** Integrated approved high-resolution student portrait collage (`hero-student-collage.png`) into the central hero section at 50% grid width with balanced floating star shapes.
- **Refined:** Clean floating header capsule (`LandingHeader.tsx`) keeping only PI logo, Home, Platform ⌵, For Colleges, Startup Atlas, Blog, `[👤 Sign In]`, and `[Get Started →]`.
- **Refined:** Landing page 5-pillar capability strip: Resume Intelligence, Skill Verification, Assessments & Assignments, Personalized Roadmap, Job Opportunities.

---

## [2.0.0] — 2026-11-21

### Features & Infrastructure
- Integrated MongoDB Atlas continuous connection with real collection seeding (`users`, `student_profiles`, `resumes`, `jobs`, `assessments`).
- Created Unified Secure Examination System with anti-cheat full-screen lock and device readiness checks.
- Created interactive Startup Atlas with GeoJSON India state map.
- Separated student Google OAuth credentials from administrator Argon2id credentials.

---

## [1.0.0] — 2026-11-15

### Initial Release
- Initial baseline architecture on React 19, TypeScript, and FastAPI.
- Student profile setup, resume ATS upload, and coding assessment interfaces.
