# Placement Intelligence — Environment Configuration Specification

**Document Reference:** PI-ENV-SPEC-V3  
**Classification:** Confidential / System Administration  
**Target Architecture:** Multi-tier Production Cloud  
**Status:** Validated

---

## 1. Environment Variable Security Matrix

| Variable Name | Required | Classification | Default (Dev) | Production Target Format | Description |
|---|---|---|---|---|---|
| `ENVIRONMENT` | Yes | Public | `development` | `production` | Switches exception detail masking, cookie security, and cert checks. |
| `SECRET_KEY` | Yes | **Confidential** | `dev-local-session-secret...` | 64+ char random hex string | Signs administrator HS256 JWT sessions. |
| `ALGORITHM` | No | Internal | `HS256` | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Internal | `1440` | `1440` (24h) | JWT access token lifetime. |
| `INITIAL_ADMIN_EMAIL` | No | Internal | `admin@placement.edu` | Institutional Dean Email | Bootstrap initial super admin account. |
| `INITIAL_ADMIN_PASSWORD` | No | **Confidential** | `Admin@Placement2026!` | 16+ char high-entropy password | Initial bootstrap password (hashed with Argon2id). |
| `MONGODB_URI` | Yes | **Confidential** | `mongodb+srv://...` | MongoDB Atlas Connection String | Atlas connection URI with credentials and cluster name. |
| `MONGODB_DB_NAME` | No | Internal | `placement_intelligence` | `placement_intelligence` | Target database name. |
| `FIREBASE_PROJECT_ID` | Yes | Public | `placement-management-e89c7` | Firebase Project Identifier | Project ID for verifying student Google ID tokens. |
| `FIREBASE_CREDENTIALS_PATH` | Optional | **Confidential** | `serviceAccountKey.json` | Path to service account file | Path to private Firebase Admin credentials file. |
| `FIREBASE_MOCK_AUTH_IN_DEV` | No | Internal | `true` | `false` | Disables mock authentication bypass in production. |
| `BACKEND_CORS_ORIGINS` | Yes | Internal | `["http://localhost:5173"]` | `["https://portal.placement.edu"]` | Allowed browser origins for CORS requests. |
| `STORAGE_PROVIDER` | Yes | Internal | `mongodb` | `cloudflare_r2` or `aws_s3` | Active object storage provider for resumes. |
| `STORAGE_BUCKET_NAME` | Yes | Internal | `placement-resumes` | Sovereign bucket name | Bucket for resume storage. |
| `STORAGE_ACCESS_KEY_ID` | Optional | **Confidential** | Empty | Cloud Storage Key ID | Access key for S3 / Cloudflare R2. |
| `STORAGE_SECRET_ACCESS_KEY`| Optional | **Confidential** | Empty | Cloud Storage Secret Key | Secret key for S3 / Cloudflare R2. |
| `GEMINI_API_KEY` | Optional | **Confidential** | Empty | Google AI Studio Key | API key for Gemini Flash Lite resume parsing. |
| `FIRECRAWL_API_KEY` | Optional | **Confidential** | Empty | Firecrawl Platform Key | API key for external company discovery crawler. |
| `MAINTENANCE_MODE` | No | Internal | `false` | `false` | Server-side switch for scheduled maintenance mode. |

---

## 2. Secrets Management & Rotation Policy

### 2.1 Git Exclusion (.gitignore)
The root `.gitignore` and `backend/.gitignore` strictly exclude the following patterns:
- `.env`
- `*.env`
- `.env.*`
- `serviceAccountKey.json`
- `*.pem` / `*.key`
- `uploads/`

### 2.2 Secret Rotation Runbook
- **JWT `SECRET_KEY` Rotation:** Rotating `SECRET_KEY` invalidates all existing active admin sessions immediately without affecting database records. Rotate every 90 days.
- **Database Credentials:** Update Atlas user credentials via the Atlas web console, update `MONGODB_URI` in production secret store, and perform a rolling restart.
- **Cloud Storage Keys:** Maintain dual active access keys in S3/R2 during rotation. Update application config to use the new key, verify functionality, then revoke the retired key.
