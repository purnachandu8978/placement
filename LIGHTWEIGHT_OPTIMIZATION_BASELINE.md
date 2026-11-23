# LIGHTWEIGHT OPTIMIZATION BASELINE AUDIT
**Placement Intelligence Platform**
**Date:** November 23, 2026
**Audited By:** Principal Software Architect & Optimization Team

---

## 1. Executive Summary

This document establishes the pre-optimization baseline metrics for the Placement Intelligence application across repository size, asset storage, frontend bundle composition, backend resource utilization, and dependency footprints.

---

## 2. Repository Footprint Baseline

### Total Repository Footprint (On-Disk)
| Scope | Size (MB) | File Count | Notes |
| :--- | :--- | :--- | :--- |
| **Complete Repository** | **802.74 MB** | **43,588** | Includes `.venv` & `node_modules` |
| Backend (`backend/`) | 258.81 MB | 16,842 | Includes Python virtual environment |
| Frontend (`placemt inligence/`) | 543.76 MB | 26,736 | Includes Node.js modules & dist |
| Sandbox Runner (`sandbox_runner/`) | 0.03 MB | 6 | Containerized execution script |
| Root Docs & Configs | 0.14 MB | 26 | Architecture & compliance docs |

### Clean Source Code Footprint (Excluding `.venv` & `node_modules`)
| Subsystem | Size (MB) | File Count | Notes |
| :--- | :--- | :--- | :--- |
| Backend Source | 16.61 MB | 119 | Includes 13.88 MB unsimplified GeoJSON |
| Frontend Source | 18.49 MB | 145 | Includes 15.15 MB static GeoJSON & duplicates |
| Sandbox Runner | 0.02 MB | 5 | Docker runtime files |
| Root Documentation | 0.14 MB | 26 | System specifications |
| **Total Clean Source** | **35.26 MB** | **295** | Baseline before asset & dead-code cleanup |

---

## 3. Top Space-Consuming Assets (Pre-Optimization)

| File Path | Size (Bytes) | Size (MB) | Current Status & Finding |
| :--- | :--- | :--- | :--- |
| `placemt inligence/public/data/geo/india_states.geojson` | 14,555,346 | 13.88 MB | **Dead Asset**: Frontend queries `/startups/map-data` API; this file is never requested. |
| `backend/app/data/geo/india_states.geojson` | 14,555,346 | 13.88 MB | **Dead Asset**: Backend service `startup_discovery_service.py` loads `india_states_web.geojson`. |
| `placemt inligence/public/data/geo/india_states_web.geojson` | 1,336,090 | 1.27 MB | **Dead Asset**: Duplicate static copy not served or referenced by frontend client. |
| `backend/app/data/geo/india_states_web.geojson` | 1,336,090 | 1.27 MB | **Active Asset**: Used by backend GeoJSON service (36 states/UTs, 0.01 tolerance). |
| `placemt inligence/public/hero-student-collage.png` | 622,748 | 0.59 MB | **Duplicate**: Root copy unreferenced; active copy is in `public/assets/images/`. |
| `placemt inligence/public/assets/images/hero-student-collage.png` | 622,748 | 0.59 MB | **Active Asset**: Approved hero banner image. |
| `placemt inligence/public/hero-student-collage.jpg` | 258,975 | 0.25 MB | **Duplicate**: Root copy unreferenced; active copy is in `public/assets/images/`. |
| `placemt inligence/public/assets/images/hero-student-collage.jpg` | 258,975 | 0.25 MB | **Active Asset**: Fallback hero image. |

**Identified Dead Storage:** ~31.32 MB of redundant and unreferenced GeoJSON polygons and duplicate images.

---

## 4. Frontend Production Build Baseline

Production build metrics generated via Vite 7 / Rollup:
- **Modules Transformed:** 1,705 modules
- **Build Duration:** 4.55 seconds
- **Total Dist Size:** 1,053.47 kB (Uncompressed) / 289.12 kB (Gzipped)

### Bundle Chunk Composition
| Chunk / Asset | Size | Gzip Size | Role |
| :--- | :--- | :--- | :--- |
| `dist/assets/index-*.js` | 389.24 kB | 107.41 kB | Main application bundle & router |
| `dist/assets/firebase-*.js` | 160.05 kB | 33.82 kB | Firebase Client SDK (Auth, Firestore) |
| `dist/assets/icons-*.js` | 49.38 kB | 9.21 kB | Tree-shaken Lucide icons chunk |
| `dist/assets/StartupMap-*.js` | 24.18 kB | 7.82 kB | Leaflet interactive map component |
| `dist/assets/index-*.css` | 34.62 kB | 6.84 kB | Tailwind CSS production bundle |
| Lazy Route Chunks (48 files) | ~396 kB | ~124 kB | Code-split feature views |

---

## 5. Dependency Audit Baseline

### Backend Dependencies (`requirements.txt`)
Total direct runtime dependencies: **20 packages**
- `fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`: Web framework & validation
- `motor`, `pymongo`: Async MongoDB driver
- `argon2-cffi`, `python-jose[cryptography]`: Password hashing & JWT
- `firebase-admin`: Firebase verification
- `httpx`, `aiohttp`, `requests`: HTTP clients
- `python-multipart`: File upload parsing
- `reportlab`: PDF generation for student profiles & reports
- `pandas`, `openpyxl`: Excel/CSV export & tabular data
- `pydantic[email]`, `slowapi`: Email validation & rate limiting
- `pytest`, `pytest-asyncio`: Automated test suites

### Frontend Dependencies (`package.json`)
Total direct dependencies: **5 runtime / 6 dev**
- **Runtime:** `firebase`, `lucide-react`, `react`, `react-dom`, `react-router-dom`
- **Development:** `@tailwindcss/postcss`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `typescript`, `vite`

---

## 6. Optimization Target Projections

1. **Clean Source Code:** Reduce clean source footprint from **35.26 MB** to **~5.5 MB** (~84% reduction) by removing dead GeoJSON polygons and duplicate image assets.
2. **Dead Component Removal:** Remove 12 unreferenced legacy landing components, unreferenced video proctoring mockup, and obsolete animation tracks without impacting active routes.
3. **Frontend Asset Optimization:** Provide next-gen WebP image formats with fallback, yielding ~70% reduction in image network payload.
4. **Vite Code Splitting:** Retain modular async chunks with aggressive tree-shaking so initial paint remains sub-150 kB gzipped.
5. **Backend Database Efficiency:** Ensure database queries use strict field projections to minimize BSON serialization and memory consumption.
6. **Docker Build Efficiency:** Optimize `.dockerignore` across backend and frontend to eliminate gigabytes of build context overhead.
