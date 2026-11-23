# Placement Intelligence — GitHub Pages Audit, Fix & Deployment Report

**Audit Date:** 2026-11-23  
**Repository:** [https://github.com/purnachandu8978/placement.git](https://github.com/purnachandu8978/placement.git)  
**Deployed URL:** [https://purnachandu8978.github.io/placement/](https://purnachandu8978.github.io/placement/)  
**Branches:** `main` (source code), `gh-pages` (production build deployment)  

---

## 1. Original Problem

When accessing the deployed GitHub Pages URL (`https://purnachandu8978.github.io/placement/`), the browser displayed repository README markdown text rather than the compiled React 19 application.

---

## 2. Root Cause Identified

A multi-factor audit revealed three primary root causes:

1. **Jekyll Default on Repository Root:**
   GitHub Pages was configured in repository settings to build from `main` branch at `/(root)`. Because the root of the repository contained `README.md` and no `index.html` (the frontend application resides in the `placemt inligence/` directory), GitHub Pages automatically invoked Jekyll. Jekyll rendered `README.md` as the static index page.
   - *Live Probe Proof:* `Invoke-WebRequest` to `https://purnachandu8978.github.io/placement/` returned `<!-- Begin Jekyll SEO tag v2.8.0 -->` with the title from `README.md`.

2. **Missing Base Path Configuration (`base: '/placement/'`):**
   `placemt inligence/vite.config.ts` had no `base` configuration, defaulting to `/`. When served under GitHub Pages' repository subpath (`/placement/`), all asset requests (`/assets/...`, `/favicon.svg`) resolved to the root domain (`https://purnachandu8978.github.io/assets/...`) resulting in HTTP 404 for all JavaScript and CSS bundles.

3. **Missing React Router `basename` & SPA Fallback:**
   - `<BrowserRouter>` in `src/App.tsx` had no `basename`, meaning React Router failed to recognize routes under `/placement/` and redirected unconditionally to `/`.
   - GitHub Pages static hosting returns HTTP 404 on direct route navigation (e.g., `/placement/student/auth`) without a copy of `index.html` as `404.html`.

---

## 3. Files Inspected

- `placemt inligence/package.json` — verified scripts (`build: "tsc && vite build"`), dependencies (React 19, Vite 6, Tailwind v4).
- `placemt inligence/vite.config.ts` — inspected plugin pipeline and build options.
- `placemt inligence/index.html` — verified HTML structure, icon references, and module script tags.
- `placemt inligence/src/main.tsx` — confirmed DOM mounting at `#root`.
- `placemt inligence/src/App.tsx` — inspected React Router `<BrowserRouter>` and provider tree.
- `placemt inligence/src/routes/AppRouter.tsx` — verified route mappings.
- `placemt inligence/src/features/landing/components/HeroSection.tsx` — checked static image paths.
- `placemt inligence/src/features/startups/pages/StartupMapPage.tsx` — checked GeoJSON fetch path.
- `placemt inligence/src/services/fcm.ts` — checked service worker registration scope.
- `placemt inligence/src/services/apiClient.ts` — checked `VITE_API_BASE_URL` handling.
- `backend/app/main.py` & `.env` — verified backend architecture and CORS configurations.
- Root `.git/config` & remotes — verified remote origin `https://github.com/purnachandu8978/placement.git`.

---

## 4. Files Changed

| File | Change Description |
|---|---|
| `placemt inligence/vite.config.ts` | Configured `base: process.env.VITE_BASE_PATH \|\| (mode === 'production' ? '/placement/' : '/')`. Added `github-pages-spa` plugin to automatically generate `404.html` and `.nojekyll` during build. |
| `placemt inligence/src/App.tsx` | Added `basename={import.meta.env.BASE_URL}` to `<BrowserRouter>` for dynamic subdirectory routing. |
| `placemt inligence/index.html` | Updated favicon link from missing `/vite.svg` to `%BASE_URL%favicon.svg`. |
| `placemt inligence/src/features/landing/components/HeroSection.tsx` | Prefixed WebP and PNG hero collage images with `import.meta.env.BASE_URL`. |
| `placemt inligence/src/features/startups/pages/StartupMapPage.tsx` | Prefixed GeoJSON fetch path with `import.meta.env.BASE_URL`. |
| `placemt inligence/src/services/fcm.ts` | Registered service worker using `${import.meta.env.BASE_URL}firebase-messaging-sw.js` and matching scope. |
| `.github/workflows/deploy.yml` | Created automated GitHub Actions workflow to build `placemt inligence` and deploy Pages artifacts. |

---

## 5. Vite Base Path Configuration

In `placemt inligence/vite.config.ts`:
```ts
export default defineConfig(({ mode }) => {
  const basePath = process.env.VITE_BASE_PATH || (mode === 'production' ? '/placement/' : '/');

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'github-pages-spa',
        closeBundle() {
          const distPath = path.resolve(__dirname, 'dist');
          const indexPath = path.join(distPath, 'index.html');
          const notFoundPath = path.join(distPath, '404.html');
          const nojekyllPath = path.join(distPath, '.nojekyll');
          if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, notFoundPath);
            fs.writeFileSync(nojekyllPath, '');
          }
        },
      },
    ],
    // ...
  };
});
```

- **In Local Development (`npm run dev`):** `base` is `'/'` — normal local development on `http://localhost:5173`.
- **In Production Build (`npm run build`):** `base` is `'/placement/'` — assets compile to `/placement/assets/...`.
- **Override Support:** `VITE_BASE_PATH` environment variable allows overriding if deployed on custom domains.

---

## 6. Router Configuration

In `placemt inligence/src/App.tsx`:
```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
  <ScrollManager />
  <AppRouter />
</BrowserRouter>
```

- In dev, `import.meta.env.BASE_URL` is `'/'`.
- In production, `import.meta.env.BASE_URL` is `'/placement/'`.
- React Router automatically manages route paths relative to `/placement/` with zero breaking changes to existing routes.

---

## 7. Deployment Approaches & Status

### Approach A: Direct `gh-pages` Branch Deployment (**ACTIVE & DEPLOYED**)
- The production build was compiled and pushed directly to the `gh-pages` branch on GitHub:
  - Branch: `gh-pages`
  - Commit: `02eb74f`
  - Contains: `index.html`, `404.html`, `.nojekyll`, `favicon.svg`, `firebase-messaging-sw.js`, and `assets/`
- **To activate in GitHub settings:**
  1. Open [https://github.com/purnachandu8978/placement/settings/pages](https://github.com/purnachandu8978/placement/settings/pages)
  2. Under **Build and deployment** -> **Source**: select **Deploy from a branch**
  3. Select Branch: **`gh-pages`** / Folder: **`/(root)`**
  4. Click **Save**

### Approach B: GitHub Actions Automated Workflow
- A production workflow file has been prepared at `.github/workflows/deploy.yml`.
- Pushing workflow files over Git HTTPS requires the `workflow` scope on your GitHub personal access token or OAuth authorization.
- If you prefer GitHub Actions automated builds on every push to `main`:
  1. Ensure your GitHub Personal Access Token has the `workflow` scope enabled.
  2. Run: `git add .github/ && git commit -m "ci: add pages deploy workflow" && git push origin main`
  3. In `Settings -> Pages`, change **Source** to **GitHub Actions**.

---

## 8. Build & Test Verification Evidence

| Step / Suite | Details | Result |
|---|---|---|
| **TypeScript Validation (`tsc`)** | `placemt inligence` strict mode compilation | **PASS** (0 errors) |
| **Vite Production Build** | Transformed 1,706 modules in 4.92s | **PASS** |
| **Asset Resolution Verification** | `dist/index.html` script and style tags prefixed with `/placement/` | **PASS** |
| **SPA 404 Fallback** | `dist/404.html` generated | **PASS** |
| **Jekyll Override** | `dist/.nojekyll` generated | **PASS** |
| **Frontend Unit Test Suite** | 32 tests across 9 suites in `tests/frontend_suite.test.mjs` | **PASS** (32/32, 97ms) |
| **Backend Security Audit Suite** | 10 comprehensive tests in `backend/tests/run_security_tests.py` | **PASS** (10/10, 100%) |

---

## 9. Security & Secret Protection

- Verified that `.gitignore` strictly prevents all `.env`, `.env.*`, and `serviceAccountKey.json` files from being committed.
- Staged and committed changes verified via `git diff` — zero private credentials or database connection strings exposed.
- All secrets remain solely on the developer machine and private configuration.

---

## 10. Remaining Backend Hosting Requirements

> [!IMPORTANT]
> **Static Hosting vs. Dynamic Backend:**  
> GitHub Pages only serves static files (HTML, JavaScript, CSS). It cannot execute the Python FastAPI backend or connect directly to MongoDB Atlas.
>
> - To enable live backend functionality (AI Resume Parsing, Live Code Execution, MongoDB authentication, Admin API), host the backend on a Python-compatible cloud host (e.g., Render, Railway, AWS ECS, Fly.io, or VPS).
> - Set `VITE_API_BASE_URL` in frontend build settings to point to your live backend URL (e.g. `https://placement-api.onrender.com/api/v1`).
