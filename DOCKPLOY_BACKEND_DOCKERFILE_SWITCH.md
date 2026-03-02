# Dockploy Backend Dockerfile Switch (Fix Slow PDF/Print)

This runbook switches backend build mode from `Railpack` to `Dockerfile` so Playwright Chromium and Linux deps are installed exactly from repo.

## 1. Switch Dockploy Build Type

In Dockploy backend service settings:

1. Set `Build Type` to `Dockerfile`.
2. Set service root + Dockerfile path consistently:
- If service root is repo root: Dockerfile path = `backend/Dockerfile`
- If service root is `backend`: Dockerfile path = `Dockerfile`

3. Set `.env` file path consistently with service root:
- If service root is repo root: env file path = `backend/.env`
- If service root is `backend`: env file path = `.env`

Do not prefix `backend/` twice. If root is already `backend`, `backend/.env` becomes invalid (`.../code/backend/backend/.env`).

## 2. Force Clean Rebuild

Deploy with build cache cleared.

Expected build log must include both commands from Dockerfile:

1. `npm ci`
2. `npx playwright install --with-deps chromium`

If these lines are missing, Dockploy is still not using your Dockerfile.

## 3. Runtime Env Sanity

Use these backend env values:

1. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` = empty (unless you use a custom Chromium path)
2. `REPORTS_PDF_FALLBACK=true`
3. `REPORTS_PDF_CACHE_TTL_MS=120000`
4. `REPORTS_PDF_CACHE_MAX_ENTRIES=30`
5. `REPORTS_PDF_PERF_LOG_THRESHOLD_MS=500`

## 4. Post-Deploy Verification

### A. Browser check (lab01)

1. Open `https://lab01.medilis.net/reports`
2. Click `PDF` for an order once (warm/cold generation)
3. Click `PDF` or `Print` again for same order
4. Confirm second request is much faster

### B. API timing check (Network tab)

1. Filter requests by `results`
2. Compare first and second `GET /reports/orders/:id/results`
3. Success pattern:
- First call can be slower
- Second call should drop significantly (cache hit path)

### C. Backend log check

Search logs for:

1. `reports.results_pdf.performance`
2. `Playwright PDF rendering failed; using fallback renderer`

Success pattern:

1. Performance event appears with phase timings.
2. Fallback warning is rare or absent in normal flow.

## 5. If Still Slow

Use `reports.results_pdf.performance` fields to isolate bottleneck:

1. High `snapshotMs`: database/query path bottleneck
2. High `renderMs`: Chromium render bottleneck
3. High `fallbackMs`: fallback renderer path is being hit

Then optimize only the dominant phase.

## 6. Common Dockploy Path Error

Error:

`cannot create .../code/backend/backend/.env: Directory nonexistent`

Meaning:

Your service root is already `backend`, but env file path is also set to `backend/.env`.

Fix:

1. Keep root as `backend`
2. Change Dockerfile path to `Dockerfile`
3. Change env file path to `.env`
4. Redeploy with clear build cache
