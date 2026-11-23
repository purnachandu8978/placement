# Placement Intelligence — Security Incident Response Plan (NIST SP 800-61 Rev 2)

**Document Reference:** PI-IRP-V3  
**Standard Compliance:** NIST SP 800-61 Rev 2 (Computer Security Incident Handling Guide) & CERT-In Mandatory Reporting Directives  
**Classification:** Confidential / Operational Security  
**Version:** 3.0.0-PROD

---

## 1. Incident Response Team & Escalation Hierarchy

| Role | Primary Responsibility | Contact Protocol |
|---|---|---|
| **Incident Commander (IC)** | Directs end-to-end incident mitigation, declares incident severity, coordinates cross-functional response. | Lead DevOps / Architect |
| **Lead Security Engineer** | Forensic analysis, log triage, vulnerability root cause determination, exploit isolation. | AppSec Team |
| **Data Protection Officer (DPO)** | Legal and statutory compliance assessment, DPDPA & CERT-In notifications, student rights defense. | Legal / Privacy Office |
| **Communications Officer** | Institutional notifications, student portal status banners, executive placement committee briefings. | Placement Directorate |

---

## 2. Incident Severity Classification

| Severity Level | Definition | Examples | Response SLA | Target Containment |
|---|---|---|---|---|
| **P1 — Critical** | Active data breach involving student personal data, total service outage, or unauthorized admin compromise. | Mass student profile exfiltration, admin account takeover, ransomware attack. | Immediate (< 15 mins) | < 2 Hours |
| **P2 — High** | Exploitable vulnerability in production, sandboxed runner breakout attempt, or active brute-force campaign. | BOLA/IDOR vulnerability identified, rate limiter bypass, DoS on assessment engine. | < 1 Hour | < 6 Hours |
| **P3 — Medium** | Isolated permission inconsistency, third-party API degradation (Gemini, Firecrawl), non-critical failure. | Job sync worker failure, single non-sensitive endpoint error, minor telemetry discrepancy. | < 4 Hours | < 24 Hours |
| **P4 — Low** | Minor security hygiene items, documentation corrections, non-exploitable edge cases. | Deprecated dependency warning, minor UI security text typo. | < 24 Hours | Next Release |

---

## 3. Incident Response Lifecycle (6 NIST Phases)

### Phase 1: Preparation
- Continuous logging configured: `db.user_logins`, `db.admin_audit_logs`, `db.privacy_requests`.
- Health probes active at `/health` and `/api/v1/health`.
- Emergency maintenance mode switch operational (`POST /api/v1/admin/maintenance-toggle`).
- Daily automated database snapshots enabled in MongoDB Atlas.

### Phase 2: Detection & Analysis
- Monitor real-time logs via FastAPI / Uvicorn telemetry and MongoDB Atlas alerts.
- Triage anomalies: spike in HTTP 401/403/429 status codes, unexpected spike in CPU/RAM on code sandbox runners.
- Correlate unhandled exceptions using unique `request_id` identifiers (`err_XXXXXXXXXXXX`).

### Phase 3: Containment
1. **Emergency Maintenance Isolation:** If active exploitation occurs, immediately activate platform maintenance mode via Admin Console or API (`set_dynamic_maintenance_mode(True)`).
   - Candidate routes return HTTP 503 Service Unavailable with `Retry-After: 300`.
   - Health checks and admin triage routes remain operational.
2. **Credential Revocation:** If an admin account is compromised, revoke active sessions by changing the user's password hash in MongoDB and rotating JWT `SECRET_KEY`.
3. **Network Isolation:** Block malicious source IP subnets at reverse proxy / firewall level.

### Phase 4: Eradication
- Identify underlying code or configuration flaw.
- Deploy hotfix to code repository and execute test suite: `python tests/run_security_tests.py`.
- Verify vulnerability remediation with zero regressions.

### Phase 5: Recovery
- Validate database integrity and restore from point-in-time snapshot if data tampering occurred.
- Deactivate maintenance mode (`set_dynamic_maintenance_mode(False)`).
- Monitor system telemetry for 24 hours under heightened observation.

### Phase 6: Post-Incident Activity (Lessons Learned)
- Conduct post-mortem meeting within 48 hours of incident closure.
- Document Root Cause Analysis (RCA), timeline of events, and preventative architectural enhancements.
- Update threat model and automated test suite with regression test cases.

---

## 4. Statutory Breach Notification Protocols

### 4.1 CERT-In Mandatory Reporting (India)
- Pursuant to CERT-In cybersecurity directives, report cybersecurity incidents (unauthorized system access, ransomware, data breach) within **6 hours** of noticing the incident via `incident@cert-in.org.in`.

### 4.2 Data Subject & Student Notification (DPDPA 2023)
- In the event of a verified personal data breach, notify the Data Protection Board of India and affected candidates without undue delay with:
  1. Nature of the breach and affected personal data fields.
  2. Measures taken to contain and mitigate the breach.
  3. Guidance to affected students (e.g. password resets).
  4. Contact information for the designated DPO.
