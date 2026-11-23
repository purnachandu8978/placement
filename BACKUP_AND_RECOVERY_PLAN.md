# BACKUP AND DISASTER RECOVERY PLAN
**Placement Intelligence Platform**
**Date:** November 23, 2026
**Approved By:** Principal Systems Architect & Production Operations Lead

---

## 1. Executive Summary

This plan outlines the continuous backup architectures, automated retention policies, replication topologies, and disaster recovery procedures established to safeguard student academic records, resumes, assessment results, and institutional audit logs.

---

## 2. Recovery Objectives

- **Recovery Point Objective (RPO):** $< 5 \text{ minutes}$ (Continuous oplog snapshot replication in MongoDB Atlas).
- **Recovery Time Objective (RTO):** $< 30 \text{ minutes}$ (Automated container redeployment via Docker Compose or Kubernetes).

---

## 3. Database Backup Topology (MongoDB Atlas)

Placement Intelligence utilizes MongoDB Atlas automated cloud backups across distributed availability zones:

1. **Continuous Cloud Snapshots:**
   - Incremental snapshots captured automatically every 6 hours.
   - 7-day continuous oplog tracking enabling point-in-time restoration to any exact minute.
2. **Scheduled Weekly & Monthly Retention:**
   - Weekly snapshots retained for 4 weeks.
   - Monthly compliance snapshots retained for 12 months in encrypted, immutable cloud storage.
3. **Automated Restoration Verification Procedure:**
   - On a bi-weekly automated schedule, a staging cluster is spun up, the latest snapshot restored, and integrity checks executed (`db.users.countDocuments()`, `db.resumes.countDocuments()`).

---

## 4. Object Storage & File Backup (Resumes & Diplomas)

Student resumes and generated PDF certificates are archived using redundant cloud storage providers:
- **Primary:** Supabase / AWS S3 compliant encrypted bucket (`placement-resumes-prod`).
- **Replication:** Cross-region replication enabled (versioning active).
- **Immutability:** S3 Object Lock / versioning prevents accidental deletion or overwriting of candidate resumes.

---

## 5. Disaster Recovery Runbook

### Scenario A: Unresponsive Database Node
1. MongoDB Atlas replica set automatically elects a new primary in $< 5 \text{ seconds}$.
2. Motor async client pool reconnects automatically via `retryWrites=True` with zero application restart required.

### Scenario B: Accidental Data Corruption or Malicious Deletion
1. Isolate the affected collection immediately by setting platform maintenance mode via `/api/v1/admin/maintenance-mode`.
2. Initiate point-in-time restore in MongoDB Atlas to the minute immediately preceding the corruption event.
3. Validate row counts and run `tests/run_security_tests.py` against restored database.
4. Disable maintenance mode and resume normal platform traffic.

### Scenario C: Complete Cloud Host Failure
1. Clone the verified git checkpoint repository (`git clone`).
2. Populate `.env` from secure secrets vault (AWS Secrets Manager or Vault).
3. Execute `docker compose up -d --build`.
4. Verify health via `curl -f http://localhost:8000/health`.
