# Placement Intelligence — Comprehensive Threat Model (STRIDE Methodology)

**Document Reference:** PI-THREAT-MODEL-V3  
**Evaluation Methodology:** Microsoft STRIDE Threat Classification  
**Target Architecture:** Multi-tenant College Placement SaaS (FastAPI + React 19 + MongoDB Atlas + Firebase)  
**Status:** Complete / Controls Validated

---

## 1. System Architecture & Trust Boundaries

```
[ Public Internet / Untrusted Client Browser ]
                     │  (TLS 1.3 / OWASP Security Headers / Rate Limiter)
                     ▼
[ Reverse Proxy / API Gateway: FastAPI Application ]
  ├── Boundary 1: Authentication & Token Verification (Firebase Google OAuth / Argon2id HS256)
  ├── Boundary 2: RBAC & BOLA Access Control Engine (verify_student_ownership)
  └── Boundary 3: Business Logic & Validation Layer
         │                             │                           │
         ▼                             ▼                           ▼
[ MongoDB Atlas Database ]    [ Cloud Object Storage ]   [ Sandboxed Execution Runner ]
  - AES-256 at Rest             - Cloudflare R2 / S3       - Docker / cgroups / Judge0
  - TLS 1.3 in Transit          - 15-min Signed URLs       - CPU/Memory/Network Capped
```

---

## 2. STRIDE Threat Analysis Matrix

### 2.1 Spoofing (Identity Deception)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-S-01** | Attacker spoofs Google ID Token to impersonate another student | Low | Critical | Real tokens are cryptographically verified against Google x509 public certificates (`google.auth.jwt.decode`). Mock tokens are strictly restricted to `ENVIRONMENT == "testing"`. | Verified |
| **TH-S-02** | Attacker signs fake Admin JWT session token | Very Low | Critical | Backend signs JWTs using `SECRET_KEY` with HS256 and unique 16-byte hex `jti`. Signature mismatch returns HTTP 401. | Verified |
| **TH-S-03** | Brute force password guessing on administrator login | High | High | `SlidingWindowRateLimiter` enforces max 5 failed attempts per IP and per account, triggering an automatic 15-minute lockout (HTTP 429). | Verified |

### 2.2 Tampering (Data Manipulation)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-T-01** | Student alters assessment score or test results during submission | Medium | High | Scoring is computed purely server-side in `attempts.py` and `services/assessment_utils.py`. The client never submits calculated score totals. | Verified |
| **TH-T-02** | MongoDB NoSQL operator injection (`$gt`, `$ne`, `$where`) | Medium | Critical | All API inputs are parsed and strictly type-validated by Pydantic schemas. Query selectors use typed dictionary key mappings. | Verified |
| **TH-T-03** | Malicious file payload disguised as PDF resume | Medium | High | `resumes.py` validates file magic bytes, MIME types, and file extensions, and stores files outside executable web roots in cloud object storage. | Verified |

### 2.3 Repudiation (Denial of Action)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-R-01** | Administrator denies unauthorized modification of student records | Medium | Medium | All role modifications, student status changes, and template updates are logged permanently to `db.admin_audit_logs`. | Verified |
| **TH-R-02** | User denies signing in or claims account takeover | Low | Medium | Login events (IP address, user agent, timestamp, auth provider, status) are recorded in `db.user_logins`. | Verified |

### 2.4 Information Disclosure (Data Leakage)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-I-01** | BOLA/IDOR: Student queries another student's resume or profile | High | High | Strict `verify_student_ownership()` check ensures students can only query documents matching their `firebase_uid`. Cross-user access returns HTTP 403. | Verified |
| **TH-I-02** | Internal exception stack traces leaked in HTTP 500 responses | Medium | Medium | `generic_exception_handler` logs traceback with correlation `request_id` and returns sanitized client response in production. | Verified |
| **TH-I-03** | Sensitive headers leaked to third parties | Low | Low | Global middleware injects `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`. | Verified |

### 2.5 Denial of Service (Resource Starvation)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-D-01** | Massive concurrent authentication requests exhaust server | High | High | `app/core/rate_limit.py` applies a sliding window rate limit of 10 req/min on auth routes. | Verified |
| **TH-D-02** | Malicious student code with infinite loop crashes server | High | Critical | Submissions execute inside isolated sandboxes with strict resource quotas (2.0 CPU cores, 256MB RAM, 5.0s timeout). | Verified |
| **TH-D-03** | Uncontrolled AI API consumption bankrupts quota | Medium | Medium | `quota_manager.py` enforces daily caps (Firecrawl: 10/day, Gemini: 50/day, Judge0: 50/day). | Verified |

### 2.6 Elevation of Privilege (Unauthorized Access)
| Threat ID | Threat Description | Likelihood | Impact | Implemented Countermeasure | Verification |
|---|---|---|---|---|---|
| **TH-E-01** | Public student registers with `role: "SUPER_ADMIN"` | High | Critical | `StudentRegisterRequest` discards client role attributes and hardcodes `role = "STUDENT"`. Admin creation requires existing authenticated SUPER_ADMIN. | Verified |
| **TH-E-02** | Student calls admin endpoint with student JWT token | High | Critical | `require_role(["ADMIN", "SUPER_ADMIN"])` dependency inspects token claims and rejects non-admin users with HTTP 403 Forbidden. | Verified |

---

## 3. Residual Risk Summary

All critical and high-severity threats identified in the system architecture have been fully mitigated through technical controls and verified by automated tests. Ongoing security hygiene includes regular quarterly secret rotation and continuous automated vulnerability scanning in the CI/CD pipeline.
