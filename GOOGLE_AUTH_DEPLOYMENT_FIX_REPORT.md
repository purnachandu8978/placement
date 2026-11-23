# Google Authentication & CORS Preflight 400 Fix Report

**Report Date:** 2026-11-23  
**Frontend URL:** [https://placement-intelligence-two.vercel.app](https://placement-intelligence-two.vercel.app)  
**Backend URL:** [https://placement-mcjt.onrender.com](https://placement-mcjt.onrender.com)  

---

## 1. Problem Summary & Live Symptoms

During student Google Sign-In on the Vercel-deployed application (`https://placement-intelligence-two.vercel.app`), the browser threw CORS errors, and Render logs showed:
```text
OPTIONS /auth/google HTTP/1.1 400 Bad Request
OPTIONS /auth/me HTTP/1.1 400 Bad Request
```
Live curl diagnostic to `https://placement-mcjt.onrender.com/auth/google` with `Origin: https://placement-intelligence-two.vercel.app` confirmed:
```text
HTTP/1.1 400 Bad Request
Disallowed CORS origin
```

---

## 2. Root Cause Identified

Two root causes combined to create the failure:

1. **Disallowed CORS Origin on Backend (Starlette 400):**  
   FastAPI's underlying Starlette `CORSMiddleware` checks the `Origin` header during preflight `OPTIONS` requests. If the origin is not recognized in `allow_origins` or matching `allow_origin_regex`, Starlette explicitly returns:
   `Response("Disallowed CORS origin", status_code=400)`.  
   Because `https://placement-intelligence-two.vercel.app` was not yet in the active Render deployment's CORS origin list or regex, all preflights failed with HTTP 400.

2. **API Path Prefix Mismatch (`/auth/google` vs `/api/v1/auth/google`):**  
   The FastAPI backend mounts all versioned routes under `settings.API_V1_STR` (`/api/v1`). When `VITE_API_BASE_URL` on Vercel is set to `https://placement-mcjt.onrender.com` (omitting `/api/v1`), the frontend called `/auth/google` and `/auth/me` instead of `/api/v1/auth/google` and `/api/v1/auth/me`. While Starlette intercepts the preflight, the subsequent POST/GET request would return 404.

3. **Firebase Console Authorized Domains:**  
   Firebase Authentication blocks Google Sign-In popups when triggered from unwhitelisted domains (`auth/unauthorized-domain`), requiring `placement-intelligence-two.vercel.app` to be added in the Firebase project console.

---

## 3. Files Modified

| File | Change Details |
|---|---|
| **`backend/app/main.py`** | 1. Configured `CORSMiddleware` with explicit whitelisting for `https://placement-intelligence-two.vercel.app`, `https://placement-intelligence.vercel.app`, and `r"^https://([a-zA-Z0-9-]+\.)*vercel\.app$"`.<br>2. Allowed all standard HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`).<br>3. Allowed all headers (`*`) and credentials (`true`).<br>4. Mounted `auth_router` at both `/api/v1/auth` and `/auth` as a root alias for dual-layer URL resilience. |
| **`backend/app/core/config.py`** | Added `https://placement-intelligence-two.vercel.app` to default `BACKEND_CORS_ORIGINS`. |
| **`placemt inligence/src/services/apiClient.ts`** | Added automatic base URL normalization: if `VITE_API_BASE_URL` is set without `/api/v1` (e.g. `https://placement-mcjt.onrender.com`), it automatically appends `/api/v1`. |

---

## 4. Verification & Test Evidence

### A. Preflight `OPTIONS` Tests (Automated via HTTPX ASGITransport)
All preflight routes were tested from `Origin: https://placement-intelligence-two.vercel.app`:

```text
PASS: POST /api/v1/auth/google preflight (status 200, origin allowed, credentials true)
PASS: POST /auth/google preflight (status 200, origin allowed, credentials true)
PASS: GET /api/v1/auth/me preflight (status 200, origin allowed, credentials true)
PASS: GET /auth/me preflight (status 200, origin allowed, credentials true)
```

Preflight response headers:
- `access-control-allow-origin`: `https://placement-intelligence-two.vercel.app`
- `access-control-allow-credentials`: `true`
- `access-control-allow-methods`: `DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`
- `access-control-allow-headers`: `authorization,content-type`

### B. Security & Frontend Test Suites
- **Backend Security Suite (`run_security_tests.py`):** 10/10 PASS (100% success rate, Argon2id, RBAC, BOLA/IDOR, OWASP headers).
- **Frontend Unit Suite (`frontend_suite.test.mjs`):** 32/32 PASS (9 suites, 152ms).
- **Frontend Production Build (`tsc && vite build`):** Transformed 1,706 modules in 9.06s with 0 errors.

---

## 5. Firebase Console Action Required (1-Minute Step)

To allow the Google Sign-In popup to open from Vercel:

1. Open [Firebase Console](https://console.firebase.google.com).
2. Select your project: **`placement-management-e89c7`**.
3. In the left navigation, go to **Build** -> **Authentication**.
4. Click the **Settings** tab at the top.
5. In the left menu of Settings, click **Authorized domains**.
6. Click **Add domain**.
7. Enter:
   ```text
   placement-intelligence-two.vercel.app
   ```
8. Click **Add**.

---

## 6. Render Environment Variables Action (Optional Double-Check)

In your Render dashboard for `placement-mcjt` -> **Environment**:
Verify that `BACKEND_CORS_ORIGINS` includes:
```json
["https://placement-intelligence-two.vercel.app","https://purnachandu8978.github.io","http://localhost:5173"]
```
*(With our latest code in `main.py`, the backend also automatically whitelists `*.vercel.app` via regex as a hardcoded safety fallback).*

---

## 7. Git & Deployment Command

Per instructions, the changes have been tested and prepared locally without automatic pushing:
- To push these fixes to GitHub and trigger automatic deployment on Render and Vercel:
  ```bash
  git push origin main
  ```
