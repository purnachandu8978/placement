# Placement Intelligence — Known Limitations & Architectural Boundaries

**Document Version:** 3.0.0-PROD  
**Classification:** Engineering Evaluation & Transparency Report  
**Status:** Documented & Monitored

---

## 1. Overview

In adherence to the *AI-Assisted Code Quality: Professional Guidelines*, this document details the architectural boundaries, system trade-offs, and known edge-case constraints of the Placement Intelligence platform. Documenting known limitations prevents unrealistic operational assumptions and guides future infrastructure roadmaps.

---

## 2. Technical Boundaries & Operational Constraints

### 2.1 In-Memory Sliding-Window Rate Limiter (Horizontal Scaling Boundary)
- **Current Architecture:** The sliding-window rate limiter and brute-force lockout manager (`app/core/rate_limit.py`) utilize thread-safe in-memory dictionaries protected by `asyncio.Lock`.
- **Constraint:** In a multi-node cluster (e.g. 4 Uvicorn worker pods behind a round-robin load balancer), rate-limit counters and 15-minute account lockouts are tracked per process rather than across a shared distributed cache.
- **Operational Impact:** A determined brute-force attacker could theoretically attempt 5 logins on Node A, then 5 logins on Node B before reaching the threshold, unless the load balancer enforces IP sticky sessions (session affinity).
- **Recommended Roadmap Solution:** For multi-datacenter clusters, transition the rate-limiter backend to a shared Redis instance with atomic Lua scripts.

---

### 2.2 Sandboxed Code Execution Concurrency Ceiling
- **Current Architecture:** Code assessments are executed within an isolated local container (`sandbox_runner`) with 256MB RAM and 0.5 CPU caps.
- **Constraint:** A single bare-metal host can concurrently execute up to 10–15 simultaneous container evaluations without kernel CPU starvation.
- **Operational Impact:** If 500 students simultaneously click "Run Code" in the exact same second during an institution-wide examination, submissions will queue, increasing execution latency from 1.2s to 8–12s.
- **Recommended Roadmap Solution:** Deploy an auto-scaling Kubernetes cluster running a pool of pre-warmed sandbox runners, or delegate peak exam spikes to a dedicated distributed Judge0 cluster with SQS message buffering.

---

### 2.3 Scanned Image-Only Resume Parsing (Non-Text PDFs)
- **Current Architecture:** The resume intelligence engine extracts text streams from PDF and DOCX files using native binary stream decoders (`pypdf`, `python-docx`).
- **Constraint:** If a student uploads a scanned photograph of a printed resume saved as a flattened bitmap image inside a PDF wrapper (containing 0 digital character glyphs), text extraction returns an empty string.
- **Current Fail-Safe:** The system displays a clear error informing the student: *"No machine-readable text found in resume. Please upload a standard digital PDF or DOCX file."*
- **Recommended Roadmap Solution:** Introduce an asynchronous Tesseract OCR or multimodal Gemini Flash fallback worker specifically triggered when character count is below 50.

---

### 2.4 Browser-Based Proctoring Perimeter
- **Current Architecture:** The proctored examination interface enforces full-screen lockdown, traps keyboard shortcuts (Alt+Tab, Windows Key, Ctrl+C/V), monitors blur events, and tracks device readiness.
- **Constraint:** In a pure web application sandbox, the browser security model cannot detect physical secondary devices (e.g. candidate reading a smartphone placed beside the laptop screen) or hardware-level HDMI splitters.
- **Operational Guidance:** For high-stakes institutional certification exams, the digital proctoring engine should be supplemented with live institutional human proctors or AI webcam head-pose tracking.

---

### 2.5 GeoJSON Interactive Map Rendering on Budget Mobile Hardware
- **Current Architecture:** The India Startup Atlas renders all 36 states and union territories using an interactive SVG map layer with hover states, sector clustering, and dynamic metrics.
- **Constraint:** While lightweight and performant on modern desktops and smartphones (60 FPS), budget mobile devices (e.g. entry-level smartphones with under 2GB RAM) may exhibit brief frame drops during rapid multi-touch pinch-to-zoom gestures.
- **Current Fail-Safe:** The interface provides an instant toggle to switch from "Interactive Map View" to "Structured List View", ensuring 100% accessibility on all screen sizes and processing tiers.

---

## 3. Summary Risk Assessment

| Limitation | Severity | Likelihood | Current Mitigation |
|---|:---:|:---:|---|
| Distributed Rate Limiter Sync | Low | Low | Sticky IP sessions at Nginx edge; local process lockout (5 attempts / 15 mins). |
| Exam Code Execution Spikes | Medium | Medium | Server-side concurrency queues; sample test caching; timeout hard cap (5s). |
| Scanned Image Resumes | Low | Low | Form validation; client-side file inspection; helpful guidance banner. |
| Physical Proctoring Evasion | Medium | Medium | Tab switch counters; full-screen lockouts; administrative termination controls. |
| Low-End Mobile Map Rendering | Low | Low | Dual-mode UI (Interactive Map + High-Performance Table Directory). |
