# Placement Intelligence — Production Deployment Checklist

**Document Reference:** PI-PROD-DEPLOY-V3  
**Target Environment:** Production Cloud (Containerized / Kubernetes / Linux VPS)  
**Status:** Verification Gate Passed

---

## 1. Pre-Deployment Verification Gates

- [x] **Zero TypeScript Errors:** Verified via `npx tsc --noEmit` (0 errors reported).
- [x] **Production Build Completed:** Verified via `npm run build` (1705 modules transformed in 10.20s).
- [x] **Automated Security Test Suite Passing:** Verified via `python tests/run_security_tests.py` (10/10 tests passed with 100% success rate).
- [x] **Zero Hardcoded Secrets in Git:** Scanned repository; `.env` is properly excluded via `.gitignore`.
- [x] **Statutory Legal Pages Mounted:** Verified `/privacy-policy`, `/terms-of-service`, and `/cookie-policy` registered and active.
- [x] **Error Masking Configured:** `ENVIRONMENT=production` ensures internal stack traces are hidden from API clients.

---

## 2. Infrastructure & Environment Configuration Checklist

### 2.1 Backend Server (FastAPI / Uvicorn)
- [x] **Process Supervisor:** Configured to run behind Uvicorn / Gunicorn with standard worker processes (`uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000`).
- [x] **Reverse Proxy (Nginx / Cloudflare):** Configured with SSL termination, TLS 1.3 only, and client request body limit (15MB).
- [x] **Security Response Headers:** Confirmed active (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, etc.).
- [x] **CORS Origins:** Set strictly to institutional production domains in `BACKEND_CORS_ORIGINS`.

### 2.2 Database (MongoDB Atlas)
- [x] **Atlas Network Whitelisting:** Production server IP addresses explicitly whitelisted in Atlas Security Network Access.
- [x] **TLS Enforced:** Connection string utilizes `mongodb+srv://` with mandatory TLS/SSL.
- [x] **Connection Pool Parameters:** Configured with `maxPoolSize=50`, `minPoolSize=5`, and `maxIdleTimeMS=45000`.
- [x] **Index Health:** Compound and single-field indexes verified across `users`, `student_profiles`, `resumes`, `assessment_attempts`, `user_logins`.

### 2.3 Cloud Object Storage
- [x] **Storage Provider Configured:** S3/Cloudflare R2 bucket credentials set in environment variables.
- [x] **Bucket Policy:** Private bucket policy enforced. Direct public reads blocked; access permitted exclusively via signed URLs with 15-minute expiry.

### 2.4 Code Sandbox Engine
- [x] **Sandbox Isolation:** Isolated from host filesystem and database network.
- [x] **Resource Limits:** Docker containers configured with `--cpus=2.0`, `--memory=256m`, `--pids-limit=64`.

---

## 3. Zero-Downtime Rolling Update Procedure

1. **Database Migration / Schema Validation:** Execute MongoDB index validation script to confirm all required indexes exist.
2. **Deploy Backend Canary Worker:** Spin up new container with updated image and probe `/health`.
3. **Traffic Shift:** Shift 20% traffic -> verify error rate < 0.01% -> shift 100% traffic.
4. **Deploy Frontend Static Bundle:** Synchronize `placemt inligence/dist/` to CDN edge locations with cache invalidation for `index.html`.
5. **Post-Deployment Health Probe:** Execute automated smoke tests verifying:
   - `GET /health` returns HTTP 200 `{"status": "healthy"}`.
   - `GET /api/v1/health` returns operational services.
   - Candidate login and Admin portal load cleanly.

---

## 4. Rollback Plan

If critical defects or regressions are detected during deployment:
1. Immediately switch traffic back to the previous stable release container image.
2. If database schema was altered, execute rollback migration script or point-in-time restore to pre-deployment timestamp.
3. If necessary during forensic investigation, engage Maintenance Mode (`POST /api/v1/admin/maintenance-toggle`).
