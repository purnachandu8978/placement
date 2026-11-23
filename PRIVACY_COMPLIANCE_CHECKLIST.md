# Placement Intelligence — Statutory Privacy Compliance Checklist (DPDPA 2023 & FERPA)

**Document Reference:** PI-DPDPA-COMPLIANCE-V3  
**Statutory Basis:** Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023, Republic of India) & Family Educational Rights and Privacy Act (FERPA, 20 U.S.C. § 1232g)  
**Data Fiduciary:** Placement Intelligence Enterprise Platform  
**Compliance Verification:** Certified Production-Ready

---

## 1. Statutory Compliance Matrix (DPDPA 2023)

| Section | Statutory Mandate | Platform Implementation Status | Verification Evidence / Technical Control |
|---|---|---|---|
| **Section 4** | Lawful basis for processing digital personal data | **COMPLIANT** | Processing is performed exclusively for educational, readiness benchmarking, and institutional placement matching. Consent is collected on initial onboarding. |
| **Section 5** | Notice requirement for personal data collection | **COMPLIANT** | Notice provided at `/privacy-policy` detailing data items collected, processing purposes, retention windows, and DPO contact. |
| **Section 6** | Free, specific, informed, unconditional consent | **COMPLIANT** | Unambiguous opt-in consent during candidate registration (`/register`) and first Google OAuth sign-in. Consent withdrawal supported via `/api/v1/students/me/privacy-request`. |
| **Section 8** | Technical and organizational measures for data security | **COMPLIANT** | End-to-end TLS 1.3 transit encryption, AES-256 MongoDB Atlas encryption at rest, Argon2id credential hashing (`m=65536, t=3, p=4`), and strict BOLA/IDOR isolation. |
| **Section 9** | Processing of children's data (Higher Ed Candidates) | **COMPLIANT** | Minimum age verified at collegiate admission. No behavioral tracking, targeting, or advertising cookies are deployed. |
| **Section 11** | **Right to Access Information (Data Portability)** | **COMPLIANT** | Implemented `GET /api/v1/students/me/data-export`. Returns complete personal telemetry, resumes, attempts, and badges in structured JSON with SHA-256 integrity hash. |
| **Section 12** | **Right to Correction & Right to Erasure** | **COMPLIANT** | Profile update API (`PUT /students/me`) allows immediate correction. `DELETE /api/v1/students/me/account` anonymizes user credentials and schedules data erasure. |
| **Section 13** | **Right of Grievance Redressal** | **COMPLIANT** | Implemented `POST /api/v1/students/me/privacy-request` registering formal tracking ID (`PRV-XXXXXXXX`) with 30-day statutory resolution countdown. |

---

## 2. FERPA (Family Educational Rights and Privacy Act) Adherence

Placement Intelligence complies with FERPA requirements governing higher educational records:
1. **Educational Record Confidentiality:** Student GPA, examination scores, code submissions, and faculty evaluations are strictly restricted to the individual candidate and authorized college placement officers (`PLACEMENT_ADMIN`, `ACADEMIC_ADMIN`, `SUPER_ADMIN`).
2. **Directory Information Controls:** Candidates maintain control over which verified badges and portfolio links appear on their public verification passport (`/passport/:registrationId`).
3. **Audit Trail Accountability:** Every administrative inspection of a candidate's resume or assessment submission is permanently logged into `db.admin_audit_logs`.

---

## 3. Data Processing Inventory & Retention Schedules

| Data Classification | Specific Data Fields | Storage Mechanism | Retention Period | Deletion / Anonymization Policy |
|---|---|---|---|---|
| **Identity & Authentication** | Full Name, University Email, Firebase UID, Password Hash (Admins only) | MongoDB Atlas (`users`) | Duration of student enrollment + 1 calendar year | Anonymized to `anonymized_XXXX@privacy.deleted` upon student deletion request. |
| **Academic & Placement** | College, Degree, Branch, Graduation Year, CGPA, Target Roles | MongoDB Atlas (`student_profiles`) | Duration of student enrollment + 1 calendar year | Field values purged; anonymous statistics retained for university batch reporting. |
| **Resumes & Artifacts** | Resume PDF/DOCX binaries, extracted text, skills taxonomy | Cloud Object Storage & MongoDB Atlas (`resumes`) | Active enrollment or until candidate uploads replacement | Storage object deleted permanently; metadata purged. |
| **Assessments & Submissions** | Coding solutions, test output, MCQ choices, timestamps | MongoDB Atlas (`assessment_attempts`, `assignment_submissions`) | 2 academic years for accreditation verification | De-identified solution records preserved for academic plagiarism corpus. |
| **Audit & Security Telemetry** | IP addresses, user-agent headers, login status | MongoDB Atlas (`user_logins`, `audit_logs`) | 180 days (rolling purge) | Automatically evicted via MongoDB TTL indexing. |

---

## 4. Third-Party Data Transfer & Tracking Policy

- **Advertising & Marketing Trackers:** ZERO (0) third-party marketing, retargeting, or advertising pixels exist in the codebase.
- **AI Processing (Gemini API):** Used strictly for deterministic resume ATS analysis and skill normalization. No student resumes or personal identifiers are retained or used to train public foundation models.
- **Cloud Object Storage (Cloudflare R2 / AWS S3):** Data resides in compliant sovereign data centers with strict signed-URL expiration (15-minute validity).

---

## 5. Privacy Office & Grievance Redressal Contact

- **Designated Data Protection Officer (DPO):** Directorate of Application Security & Student Privacy
- **Statutory Email:** `privacy@placementintelligence.edu`
- **Grievance Turnaround SLA:** Acknowledgment within 24 hours; complete resolution within statutory 30-day maximum limit.
