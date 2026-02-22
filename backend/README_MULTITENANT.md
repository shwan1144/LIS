# Multi-Tenant LIS SaaS Foundation

This document describes the implemented backend foundation for:
- Subdomain-based lab tenancy (`lab1.yourlis.com`, `lab2.yourlis.com`)
- Separate platform admin scope (`admin.yourlis.com`)
- Shared global patients + lab-scoped clinical data
- App-layer + PostgreSQL RLS tenant isolation

## Implemented Components

### Subdomain Resolution
- `src/tenant/lab-resolver.middleware.ts`
- Resolves host into:
  - `HostScope.ADMIN` for `admin.<base-domain>`
  - `HostScope.LAB` for `<subdomain>.<base-domain>`
- Attaches `req.labId`, `req.lab`, `req.hostScope`.

### Host/Scope Guards
- `src/tenant/lab-host.guard.ts`
- `src/tenant/admin-host.guard.ts`
- `src/tenant/lab-user-scope.guard.ts`
- `src/tenant/lab-token-context.guard.ts`

### Auth Split
- Lab auth:
  - `POST /auth/login`
  - `POST /auth/portal-login` (one-time bridge token from admin impersonation)
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - Files under `src/auth/*`
- Platform auth:
  - `POST /admin/auth/login`
  - `POST /admin/auth/refresh`
  - `POST /admin/auth/logout`
  - Files under `src/admin-auth/*`

### Admin APIs
- `GET /admin/api/labs`
- `GET /admin/api/dashboard/summary`
- `GET /admin/api/orders?labId=...`
- `GET /admin/api/audit-logs?labId=...`
- `POST /admin/api/impersonation/open-lab` (mint one-time token to open real lab panel)
- Files under `src/platform-admin/*`

### Lab APIs (`/api/*`, lab subdomains only)
- `GET /api/patients`
- `POST /api/patients` (find/reuse/create global patient)
- `POST /api/orders`
- `GET /api/orders`
- `POST /api/results`
- `POST /api/orders/:id/export` (stub + audited)
- Files under `src/lab-api/*`

### RLS Session Helper
- `src/database/rls-session.service.ts`
- `src/tenant/tenant-rls-context.middleware.ts`
- `src/database/rls-query-runner-enforcer.service.ts`
- Middleware stores per-request DB scope (`lab`, `admin`, `none`) and query-runner enforcer applies it automatically for repository/query-builder usage.
- Explicit wrapper methods are still available and run in transaction:
  - `SET LOCAL app.current_lab_id = '<lab-id>'`
  - `SET LOCAL ROLE app_lab_user` (best-effort)
  - or `SET LOCAL ROLE app_platform_admin` for admin queries

## Database + Migrations

- Migration file:
  - `migrations/004_multitenant_saas_foundation.sql`
- Runner:
  - `scripts/run-sql-migrations.js`
- Command:
  - `npm run migrate:sql`

Migration includes:
- New/updated schema:
  - `labs.subdomain`
  - `users.labId` + unique `(labId, username)`
  - `samples.labId`, `order_tests.labId` + backfill
  - `platform_users`
  - `refresh_tokens`
  - `results`
  - `audit_logs.actorType`, `audit_logs.actorId`
- RLS:
  - roles: `app_lab_user`, `app_platform_admin`
  - function: `app.current_lab_id()`
  - policies on:
    - `users`
    - `orders`
    - `samples`
    - `order_tests`
    - `results`

## Security Notes
- Password hashing: Argon2id with bcrypt verification fallback.
- Access tokens + refresh token rotation (family/reuse detection).
- Host-based route separation (`admin.*` vs `lab.*`).
- Lab token must match resolved subdomain lab.
- Admin drill-down orders endpoint requires explicit `labId`.
- Audit logging implemented for lab/platform auth and sensitive actions.
- Production-safe secret handling:
  - `JWT_SECRET` is required in production.
  - `PLATFORM_JWT_SECRET` is required in production.
  - In non-production, dev fallback secrets are allowed with explicit startup warnings.
- Seeding is now opt-in only: set `AUTO_SEED_ON_BOOT=true` when you intentionally want boot-time seeding.
- TypeORM `synchronize` is always disabled in production.
- Login brute-force/rate protection is DB-backed via `audit_logs` windows:
  - `AUTH_LOGIN_RATE_WINDOW_SECONDS`, `AUTH_LOGIN_RATE_MAX_ATTEMPTS_PER_IP`
  - `AUTH_LOGIN_FAILED_WINDOW_SECONDS`, `AUTH_LOGIN_FAILED_MAX_PER_IP`, `AUTH_LOGIN_FAILED_MAX_PER_IDENTIFIER`
- Admin-to-lab bridge login is one-time and short-lived:
  - Env: `LAB_PORTAL_BRIDGE_TTL_SECONDS` (default `90`, max `300`)
  - Token is hashed in DB and invalid after first use or expiry.
- Global API hardening:
  - `helmet` security headers + CSP are enabled.
  - Global throttling is enabled (`API_RATE_LIMIT`, `API_RATE_WINDOW_SECONDS`).
  - In production, CORS must be explicit (`CORS_ORIGIN`) and cannot include `*` when credentials are enabled.
- Strict RLS safety mode:
  - `RLS_STRICT_MODE` defaults to `true` in production.
  - When enabled, missing tenant DB roles/context (`app_lab_user`, `app_platform_admin`, `app.current_lab_id()`) causes startup/request failure instead of warning fallback.

## Tests

### Unit
- `src/tenant/lab-resolver.middleware.spec.ts`
- `src/tenant/tenant-rls-context.middleware.spec.ts`
- `src/database/rls-query-runner-enforcer.service.spec.ts`
- `src/platform-admin/platform-admin.service.spec.ts`

### E2E-style
- `test/lab-user-scope.e2e-spec.ts`
- `test/rls-isolation.e2e-spec.ts` (runs only when `RLS_E2E_DATABASE_URL` is set)
- `test/order-number-concurrency.e2e-spec.ts` (runs only when `RLS_E2E_DATABASE_URL` or `DATABASE_URL` is set)

Run:
- `npm test`
- `npm run test:e2e`

## Local Dev Host Mapping

Map in hosts file:
- `127.0.0.1 lab1.localhost`
- `127.0.0.1 lab2.localhost`
- `127.0.0.1 admin.localhost`

Set env:
- `APP_BASE_DOMAIN=localhost`
- `APP_ADMIN_HOST=admin.localhost`

## Production Checklist

1. Set required env vars:
   - `NODE_ENV=production`
   - `JWT_SECRET=<strong-random-secret>`
   - `PLATFORM_JWT_SECRET=<strong-random-secret>`
   - `CORS_ORIGIN=https://admin.yourdomain.com,https://lab01.yourdomain.com` (explicit list only)
   - Optional override: `RLS_STRICT_MODE=true` (recommended; default true in production)
2. Keep schema safety on:
   - `DB_SYNC=false` (production ignores sync even if set true)
   - `AUTO_SEED_ON_BOOT=false` (default)
3. Configure proxy/host safety:
   - `TRUST_PROXY_HOPS=1` (single reverse proxy)
   - Optional strict mode: `STRICT_TENANT_HOST=true`
4. Apply migrations before startup:
   - `npm run migrate:sql`
   - Includes:
     - `013_atomic_counters_and_uniques.sql` (atomic counters + unique order/barcode indexes)
     - `014_additional_rls_policies.sql` (audit/history/unmatched/user-assignments RLS coverage)
5. Verify isolation/hardening:
   - `npm run test -- lab-resolver.middleware.spec.ts`
   - `npm run test:e2e -- rls-isolation.e2e-spec.ts`
   - `npm run test:e2e -- order-number-concurrency.e2e-spec.ts`

## Admin Console Implementation Checklist (Execution Tracker)

Use this as the single source of truth while building and deploying.

### Phase 0: Foundation (Current)
- [x] Subdomain tenant resolution (`admin.*` vs `lab.*`)
- [x] Separate auth flows (lab auth + platform auth)
- [x] Platform admin APIs: labs, dashboard summary, cross-lab orders, audit logs
- [x] RLS session context helper + SQL policies and roles
- [x] Audit logging for sensitive auth/actions
- [x] Moved these features from lab panel to admin panel:
  - [x] Lab user management
  - [x] Online Results QR toggle
  - [x] Report Design
- [x] Blocked old lab-side APIs for moved features (`/settings/users`, report/online settings mutation)

### Phase 1: Admin UI Shell + Navigation
- [ ] Finalize admin header:
  - [x] Host label (`admin.yourdomain.com`)
  - [x] Environment badge (`PILOT`/`PROD`)
  - [x] Date range control (Today/7d/30d/Custom)
  - [x] Profile menu (role + logout)
- [ ] Finalize admin sidebar IA:
  - [x] Dashboard
  - [x] Labs
  - [x] Orders
  - [x] Audit Logs
  - [x] Settings
- [x] Always show scope badge:
  - [x] `Scope: All Labs`
  - [x] `Scope: <Selected Lab>`
- [x] Add read-only visual mode for `AUDITOR`

### Phase 2: Core Admin Pages (Tier 1)
- [x] Dashboard (`/`)
  - [x] KPI cards
  - [x] Orders trend chart
  - [x] Top tests chart/table
  - [x] Alerts panel (inactive labs, high pending, suspicious logins)
  - [x] Quick actions (Create lab, View audit logs)
- [ ] Labs (`/labs`)
  - [x] Labs table (name, subdomain, status, users, orders 30d, createdAt)
  - [x] Create lab modal/page (name, code, subdomain, timezone, status)
  - [x] Edit lab
  - [x] Disable/Enable lab with confirmation + reason
  - [x] Lab details page (`/labs/:labId`) tabs:
    - [x] Overview
    - [x] Users
    - [x] Orders
    - [x] Results
    - [x] Settings
- [ ] Orders (`/orders`)
  - [x] Cross-lab filter bar
  - [x] Server-side table + pagination
  - [x] Order details drawer + timeline
  - [x] Link to results
- [ ] Audit Logs (`/audit`)
  - [x] Advanced filters (actor/lab/action/entity/date/search)
  - [x] Table + pagination
  - [x] Row drawer with metadata JSON
  - [x] Export flow (role-restricted + audited)
- [ ] Settings (`/settings`)
  - [x] Branding section
  - [x] Security policy section
  - [x] MFA toggle UI
  - [x] System health readonly section

### Phase 3: UX Standards (All Admin Pages)
- [ ] Every list page has:
  - [ ] Filter bar
  - [ ] Active filter chips + Reset filters
  - [ ] Server-side pagination (default size 25)
  - [ ] Loading/skeleton state
  - [ ] Empty state
  - [ ] Error state + retry
  - [x] Labs page upgraded to server-side pagination + active filter chips + retry/empty/error states
  - [x] Orders page upgraded with inline retry/empty/error states + active filter chips
  - [x] Audit logs page upgraded with inline retry/empty/error states + active filter chips
  - [x] Lab users page upgraded with inline retry/empty/error states
- [ ] Row click opens details drawer with `Open full page` link
- [ ] Use safe-save flows (clear success/error feedback; avoid risky optimistic updates)

### Phase 4: Security Hardening Gates
- [ ] RBAC enforcement complete:
  - [x] `SUPER_ADMIN` full mutation
  - [x] `AUDITOR` read-only
- [ ] Dangerous actions require confirm + reason:
  - [x] Disable/enable lab
  - [x] Reset password
  - [x] Impersonation
  - [x] Export all/cross-lab bulk export
- [x] Backend enforces permissions regardless of hidden UI
- [ ] Audit log coverage expanded for:
  - [x] Sensitive reads
  - [x] Exports
  - [x] Impersonation start/stop
- [x] Rate limiting and brute-force protection verified on auth endpoints
  - [x] DB-backed login attempt throttling by IP and account identifier

### Phase 5: Testing Gates
- [x] Unit tests:
  - [x] Admin layout/role guard utilities
  - [x] Filter/query param mapping
- [x] E2E/API tests:
  - [x] Auditor cannot mutate
  - [x] Super admin can mutate
  - [x] Cross-lab reads work only in admin scope
  - [x] Lab APIs cannot access other labs
  - [x] Legacy blocked lab endpoints return `403`
- [ ] Manual workflow tests:
  - [ ] Create lab -> appears in dashboard
  - [ ] Search audit event -> open metadata drawer
  - [ ] Drill down orders by selected lab

### Phase 6: Railway Deployment Checklist
- [ ] Backend service
  - [ ] `APP_BASE_DOMAIN` set correctly
  - [ ] `APP_ADMIN_HOST` set (e.g., `admin.yourdomain.com`)
  - [ ] `DATABASE_URL`, JWT secrets, refresh secrets configured
  - [ ] SQL migration executed (`npm run migrate:sql`)
- [ ] Frontend service
  - [ ] Admin host resolves to frontend
  - [ ] `VITE_API_URL` points to backend admin host/base
  - [ ] CORS includes admin frontend origin
- [ ] DNS/Domain
  - [ ] Wildcard lab domain `*.yourdomain.com`
  - [ ] Admin subdomain `admin.yourdomain.com`
  - [ ] TLS certificates valid
- [ ] Post-deploy smoke tests:
  - [ ] Admin login works
  - [ ] Lab login works
  - [ ] Admin dashboard loads
  - [ ] Lab isolation still enforced

### Phase 7: Tier 2 Expansion (After Tier 1 Stable)
- [ ] Patients (cross-lab admin views)
- [ ] Results (cross-lab with flags and PDF export actions)
- [ ] Users overview page (all labs)
- [ ] Analytics page (lab comparison, test volumes, operational)
- [ ] Optional global tests catalog admin view/editor

## Status Update Rule

For each task:
- Mark `[x]` only after code is merged + tested.
- Keep unchecked `[ ]` for planned/not fully verified work.
- For failures, add a short note under the task with date and blocker.
