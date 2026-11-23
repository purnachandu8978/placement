# Placement Intelligence — Complete API Specification (REST v1)

**Specification Version:** 3.0.0-PROD  
**Base URL (Development):** `http://localhost:8000/api/v1`  
**Base URL (Production):** `https://api.yourinstitution.edu/api/v1`  
**Interactive Docs:** `http://localhost:8000/docs` (Swagger UI) | `http://localhost:8000/redoc` (ReDoc)  
**OpenAPI Specification:** `http://localhost:8000/api/v1/openapi.json`

---

## 1. Global Standards & Authentication

### 1.1 Authentication Headers
- **Student Principal:** `Authorization: Bearer <firebase_google_id_token>`
- **Administrator Principal:** `Authorization: Bearer <hs256_admin_jwt>` or secure `access_token` HttpOnly cookie.

### 1.2 Rate Limiting Headers
- All public authentication routes enforce a sliding-window limiter.
- If exceeded: HTTP `429 Too Many Requests` with `Retry-After: <seconds>` header.

### 1.3 Standard Error Format
```json
{
  "success": false,
  "detail": "Descriptive, sanitized error message",
  "request_id": "err_c4a8f921e0b1"
}
```

---

## 2. Authentication & Identity (`/auth`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `POST` | `/auth/google` | Public | Authenticates candidate via Firebase Google ID token. Auto-provisions zero-state profile. |
| `POST` | `/auth/register` | Public | Registers candidate with email & password. Strictly pins `role: STUDENT`. |
| `POST` | `/auth/login` | Public | Authenticates student with email & password, returning JWT access token. |
| `POST` | `/auth/admin/login` | Public | Authenticates institutional administrator with Argon2id password verification. |
| `GET` | `/auth/me` | Authenticated | Retrieves current authenticated user profile, permissions, and onboarding status. |
| `POST` | `/auth/tour-complete`| STUDENT | Flags onboarding tour as completed for student account. |
| `POST` | `/auth/forgot-password/send-code` | Public | Dispatches 6-digit verification code. Anti-enumeration protected in production. |
| `POST` | `/auth/forgot-password/verify-code` | Public | Verifies reset code and issues single-use reset token. |
| `POST` | `/auth/forgot-password/reset` | Public | Consumes reset token and securely updates Argon2id password hash. |

---

## 3. Student Profile & Statutory Privacy (`/students`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/students/me` | STUDENT | Retrieves candidate's complete profile (academic, branch, CGPA, target roles). |
| `PUT` | `/students/me` | STUDENT | Updates candidate profile attributes with input validation. |
| `GET` | `/students/me/dashboard` | STUDENT | Aggregated dashboard telemetry (ATS score, verification level, top job matches). |
| `GET` | `/students/me/data-export` | STUDENT | **DPDPA Section 11 Right to Access:** Portable JSON export with 64-char SHA-256 hash. |
| `POST` | `/students/me/privacy-request` | STUDENT | **DPDPA Section 13 Grievance:** Registers formal privacy request with tracking ID. |
| `DELETE` | `/students/me/account` | STUDENT | **DPDPA Section 12 Right to Erasure:** De-identifies student record while retaining stats. |

---

## 4. Resume Intelligence (`/resumes`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/resumes/current` | STUDENT | Retrieves active resume metadata, ATS keyword score, and detected skills. |
| `POST` | `/resumes/upload` | STUDENT | Uploads PDF/DOCX resume (max 10MB) with magic-byte validation and ATS extraction. |
| `POST` | `/resumes/optimize-bullet` | STUDENT | AI-assisted resume bullet point enhancement with measurable impact framing. |
| `DELETE` | `/resumes/current` | STUDENT | Deletes current resume object from cloud storage and purges extracted skills. |

---

## 5. Skills Intelligence (`/skills`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/skills/student` | STUDENT | Returns all extracted and verified skills with proficiency and score. |
| `GET` | `/skills/gaps` | STUDENT | Calculates market skill gaps against top engineering job requirements. |
| `POST` | `/skills/student` | STUDENT | Manually adds a technical skill, auto-provisioning corresponding assessments. |
| `DELETE` | `/skills/student/{skill_name}` | STUDENT | Removes skill and recalculates downstream job compatibility. |

---

## 6. Technical Assessments (`/assessments` & `/attempts`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/assessments` | STUDENT | Lists available technical assessments based on student's detected skills. |
| `GET` | `/assessments/{id}` | STUDENT | Retrieves assessment metadata, question count, and time limit (sanitized). |
| `POST` | `/attempts/start` | STUDENT | Initiates timed assessment attempt, generating randomized question set. |
| `POST` | `/attempts/{attempt_id}/submit` | STUDENT | Submits candidate answers for server-side grading and updates readiness score. |

---

## 7. Curriculum Assignment Center (`/assignments`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/assignments` | STUDENT | Lists published assignments allocated to the student or their cohort group. |
| `GET` | `/assignments/{id}` | STUDENT | Retrieves assignment instructions, deliverables checklist, and rubric criteria. |
| `POST` | `/assignments/{id}/submit` | STUDENT | Submits GitHub repo URL, architecture notes, and deliverables for grading. |
| `GET` | `/assignments/{id}/submission` | STUDENT | Retrieves candidate's graded submission, score, and faculty feedback. |

---

## 8. College Verification & Credential Authority (`/verification`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/verification/status` | STUDENT | Comprehensive competency audit overview, Blue/Green counts, and eligibility. |
| `POST` | `/verification/assessment/start` | STUDENT | Starts 5-min (Blue) or 10-min (Green) timed institutional certification exam. |
| `POST` | `/verification/assessment/submit`| STUDENT | Grades certification exam; awards digital credential badge and serial number. |
| `GET` | `/verification/credentials/{id}` | STUDENT | Retrieves issued credential details, SHA-256 HMAC hash, and metadata. |
| `GET` | `/verification/credentials/{id}/pdf` | Public | Streams official A4 landscape high-resolution digital certificate PDF. |
| `PATCH` | `/verification/credentials/{id}/visibility` | STUDENT | Toggles public credential verification visibility (Public / Private). |
| `GET` | `/verification/verify/{identifier}` | **Public** | **Public Credential Verification:** Verifies credential authenticity without auth. |

---

## 9. Full-Screen Proctored Examination Engine (`/examination`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/examination/{exam_id}/readiness` | STUDENT | Verifies browser environment, webcam capabilities, and screen resolution. |
| `POST` | `/examination/{exam_id}/enter` | STUDENT | Enters full-screen lockdown mode; creates monitored exam session. |
| `POST` | `/examination/{exam_id}/heartbeat`| STUDENT | Submits continuous proctoring telemetry (tab switches, focus loss, blur events). |
| `POST` | `/examination/{exam_id}/run-code` | STUDENT | Executes student code against visible sample test cases in isolated sandbox. |
| `POST` | `/examination/{exam_id}/submit` | STUDENT | Finalizes exam session, executes hidden test cases, and seals final score. |

---

## 10. Autonomous Job Intelligence (`/jobs` & `/job-matches`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/jobs` | STUDENT | Lists active job opportunities with keyword, location, and work-mode filters. |
| `GET` | `/job-matches` | STUDENT | Retrieves explainable 5-factor compatibility scores tailored to candidate. |
| `POST` | `/jobs/{id}/click` | STUDENT | Logs outbound application click for placement cell outcome tracking. |
| `POST` | `/jobs/exclude-company` | STUDENT | Excludes company from candidate recommendations. |

---

## 11. India Startup Atlas (`/startups`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/startups` | STUDENT | Lists verified Indian startup profiles across 36 states and union territories. |
| `GET` | `/startups/map-data` | STUDENT | Aggregated GeoJSON telemetry of startup hubs across all 36 Indian territories. |
| `GET` | `/startups/{slug}` | STUDENT | Detailed venture dossier: funding stage, tech stack, open roles, founder info. |
| `POST` | `/startups/{slug}/track` | STUDENT | Adds startup to student's hiring watchlist and tracks application stages. |

---

## 12. Real-Time Notification Center (`/notifications`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/notifications` | STUDENT | Retrieves recent in-app notifications with unread count and category filters. |
| `PATCH` | `/notifications/{id}/read` | STUDENT | Marks specific notification as read. |
| `POST` | `/notifications/devices` | STUDENT | Registers Firebase Cloud Messaging (FCM) device token for web push alerts. |
| `PUT` | `/notifications/preferences` | STUDENT | Updates quiet hours and channel preferences (Job Alerts, Assessment Notices). |

---

## 13. Placement Cell Administration Console (`/admin`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/admin/metrics` | ADMIN | Real-time institutional telemetry: placement readiness, ATS scores, hiring trends. |
| `GET` | `/admin/students` | ADMIN | Directory of all enrolled students with search, filters, and batch operations. |
| `GET` | `/admin/students/{id}/dossier` | ADMIN | **Student 360° Dossier:** Complete 12-section student profile and activity log. |
| `PUT` | `/admin/students/{id}/status` | ADMIN | Modifies student account status (`active`, `suspended`, `graduated`). |
| `GET` | `/admin/groups` | ADMIN | Lists student cohort groups (by department, graduation year, skill level). |
| `POST` | `/admin/groups` | ADMIN | Creates new cohort group and dynamically enrolls member students. |
| `POST` | `/admin/groups/{id}/allocate-assignment` | ADMIN | Bulk allocates technical assignment to all students in cohort group. |
| `GET` | `/admin/questions` | ADMIN | Lists question bank challenges across MCQ, Short Answer, and Coding. |
| `POST` | `/admin/questions` | ADMIN | Authors new challenge with sample test cases, hidden tests, and memory limits. |
| `GET` | `/admin/integrations` | ADMIN | Reads masked MongoDB Atlas and Firebase Authentication configuration. |
| `PUT` | `/admin/integrations` | ADMIN | Dynamically updates MongoDB Atlas connection strings or Firebase project keys. |
| `GET` | `/admin/maintenance-status` | ADMIN | Checks server-side maintenance mode status. |
| `POST` | `/admin/maintenance-toggle` | ADMIN | Toggles platform maintenance mode freeze with administrative bypass. |
| `GET` | `/admin/audit-logs` | ADMIN | Immutable chronological log of all administrative actions and security events. |
