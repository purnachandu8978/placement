# CHANGELOG
**Placement Intelligence Platform**

All notable changes to this project are documented in this file in accordance with [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-11-23

### Production Release — Complete Transformation, Engineering Audit & Quality Finalization

#### Added
- **Centralized Route-Aware Scroll Management:** Implemented `ScrollManager.tsx` with location key coordinate tracking, double-frame pre/post-paint synchronization, and browser history (`POP`) scroll restoration.
- **Suite 9 Automated Navigation Test Suite:** Added 9 integration tests in `tests/frontend_suite.test.mjs` verifying zero-jump on query parameter updates, top-page reset on new pathnames, and modal scroll locking.
- **Master Engineering Documentation Suite (Part 19):**
  - `FINAL_COMPLETION_REPORT.md`
  - `FINAL_COMPLETION_BASELINE.md`
  - `COMPLETE_SOURCE_CODE_AUDIT.md`
  - `ARCHITECTURE_AUDIT.md`
  - `DATABASE_INTEGRITY_REPORT.md`
  - `DOCKER_EXECUTION_REPORT.md`
  - `PERFORMANCE_REPORT.md`
  - `RESPONSIVE_TEST_REPORT.md`
  - `SCROLL_NAVIGATION_FIX_REPORT.md`
  - `END_TO_END_TEST_REPORT.md`
  - `DEPLOYMENT_READINESS_REPORT.md`
  - `BACKUP_AND_RECOVERY_PLAN.md`

#### Changed
- **HTTP Client Standardized:** Replaced synchronous `requests.get` with asynchronous-friendly `httpx.get` in `backend/app/core/firebase.py` for Google certificate fetching.
- **CSS Reset Hardened:** Removed global `scroll-behavior: smooth` from `html` in `index.css` to prevent asynchronous smooth-scroll race conditions during client-side SPA navigation.
- **Total Test Coverage:** Expanded automated test suites to 108 verified passing test cases with 100% success rate across frontend, backend, security, and sandbox runner.

#### Verified
- **Coding Sandbox Execution:** Evaluated Part 10 problem (two-integer maximum selection) dynamically across 5 test cases (`10 20 -> 20`, `50 30 -> 50`, `-5 -2 -> -2`, `100 100 -> 100`, `0 25 -> 25`) with 100% pass rate in Python and JavaScript.
- **Release Gate:** All 10 release gate checks verified (BOLA isolation, Argon2id, RBAC, 48ms Atlas latency, zero TypeScript errors). Production deployment formally approved.

---

## [1.3.0] - 2026-11-23

### Lightweight Optimization, Code Cleanup, Asset Compression & Docker Hardening

#### Added
- **WebP Asset Delivery:** Generated high-fidelity `hero-student-collage.webp` (111.1 kB, 82.2% smaller than original PNG) with semantic `<picture>` element in `HeroSection.tsx`, supporting modern browsers with automatic PNG fallback.
- **Image Performance Attributes:** Added `fetchPriority="high"`, `loading="eager"`, and `decoding="async"` to the primary hero portrait banner to optimize Largest Contentful Paint (LCP) and eliminate Cumulative Layout Shift (CLS).
- **Comprehensive Docker Build Context Optimization:** Implemented 4 dedicated `.dockerignore` files across Root, `backend/`, `placemt inligence/`, and `sandbox_runner/`, excluding `.venv`, `node_modules`, test caches, and secrets, reducing Docker context upload from ~780 MB to < 15 MB (>98% context reduction).
- **Optimization Documentation Suite:** Published 9 technical reports:
  - `LIGHTWEIGHT_OPTIMIZATION_BASELINE.md`
  - `LIGHTWEIGHT_OPTIMIZATION_REPORT.md`
  - `REPOSITORY_CLEANUP_REPORT.md`
  - `DEPENDENCY_AUDIT_REPORT.md`
  - `FRONTEND_PERFORMANCE_REPORT.md`
  - `BACKEND_PERFORMANCE_REPORT.md`
  - `DOCKER_OPTIMIZATION_REPORT.md`
  - `REGRESSION_TEST_REPORT.md`
  - `PROJECT_STATUS.md`

#### Removed
- **Unsimplified GeoJSON Polygons (29.10 MB):** Safely deleted redundant 14.55 MB unsimplified GeoJSON files from `placemt inligence/public/data/geo/` and `backend/app/data/geo/`. Preserved the active, highly optimized `india_states_web.geojson` (1.27 MB, 36 states/UTs).
- **Duplicate Hero Images (881 kB):** Safely deleted duplicate root copies `hero-student-collage.png` and `hero-student-collage.jpg` from `placemt inligence/public/`. Active assets reside in `public/assets/images/`.
- **Temporary Debug Artifacts:** Deleted `placemt inligence/scratch_check_asgs.py`.
- **15 Unreferenced Legacy Prototype Components:**
  - `placemt inligence/src/components/common/FlowShowcaseTrack.tsx`
  - `placemt inligence/src/components/common/LottiePulse.tsx`
  - `placemt inligence/src/features/examination/components/ProctoringVideoFeed.tsx`
  - `placemt inligence/src/features/landing/components/CollegeFeatures.tsx`
  - `placemt inligence/src/features/landing/components/FloatingAssessmentCard.tsx`
  - `placemt inligence/src/features/landing/components/FloatingOpportunityCard.tsx`
  - `placemt inligence/src/features/landing/components/FloatingReadinessCard.tsx`
  - `placemt inligence/src/features/landing/components/FloatingSkillCard.tsx`
  - `placemt inligence/src/features/landing/components/FloatingStudentCard.tsx`
  - `placemt inligence/src/features/landing/components/OpportunityIntelligence.tsx`
  - `placemt inligence/src/features/landing/components/PlacementAnalyticsSection.tsx`
  - `placemt inligence/src/features/landing/components/PlacementEcosystemScene.tsx`
  - `placemt inligence/src/features/landing/components/StartupAtlasShowcase.tsx`
  - `placemt inligence/src/features/landing/components/StudentFeatures.tsx`
  - `placemt inligence/src/features/landing/components/VerifiedSkillsSection.tsx`

#### Changed
- **Clean Source Footprint:** Reduced total repository source code from 35.26 MB down to 6.69 MB (81.0% net footprint reduction).
- **Vite Build Output:** Clean build in 4.55 seconds across 1,705 modules with zero TypeScript compiler errors.

#### Verified
- **Automated Test Matrix:** 99 / 99 automated tests passing with 100% success rate:
  - 10 / 10 Production Security Test Cases
  - 44 / 44 Core Backend Pytest Test Cases
  - 14 / 14 Admin Portal End-to-End Workflows
  - 8 / 8 Assignment & Question Management Workflows
  - 23 / 23 Frontend Unit & Integration Tests

---

## [1.2.0] - 2026-11-23
### Production Code Quality Transformation
- Complied with AI-Assisted Code Quality Professional Guidelines.
- Hardened Argon2id password hashing, sliding-window rate limiting, and BOLA/IDOR isolation.
- Implemented Section 11 DPDPA 2023 statutory privacy export.
- Published master documentation suite (README, ARCHITECTURE, SECURITY_AUDIT_REPORT, TESTING_GUIDE, API_DOCUMENTATION, DEPLOYMENT_GUIDE, KNOWN_LIMITATIONS).

---

## [1.1.0] - 2026-11-23
### Landing Page Visual Elevation & Hero Asset Integration
- Integrated approved editorial student portrait collage with circular orange background.
- Added dynamic inline SVG stars with staggered pulse animations.
- Preserved clean floating pill navigation and 4-tier capability strip.
