# Railway Deployment (Step-by-Step, Non-Coder Friendly)

This guide deploys your LIS with:
1. PostgreSQL
2. Backend (`/backend`)
3. Frontend (`/frontend`)
4. Multi-tenant-ready backend (lab subdomains + `admin.` host)

## Step 1: Create Project + Database
1. Open Railway.
2. Click `New Project`.
3. Select your GitHub repo.
4. Add a `PostgreSQL` service in the same project.

## Step 2: Configure Backend Service
1. Open backend service `Settings`.
2. Set `Root Directory` to `/backend`.
3. In backend `Variables`, add:
   - `PORT=3000`
   - `DATABASE_URL` (link from PostgreSQL service)
   - `JWT_SECRET=<long random secret>`
   - `PLATFORM_JWT_SECRET=<different long random secret>`
   - `JWT_ACCESS_TTL=900`
   - `PLATFORM_JWT_ACCESS_TTL=900`
   - `APP_BASE_DOMAIN=yourlis.com` (your real domain)
   - `APP_ADMIN_HOST=admin.yourlis.com`
   - `CORS_ORIGIN=https://<your-frontend-url>`
   - `DB_SYNC=false`
   - `AUTO_SEED_ON_BOOT=true` (first deploy only)
4. Deploy backend once.

## Step 3: Run SQL Migrations (Important)
Run migration script one time after backend is deployed:
1. Railway CLI way (recommended):
   - `npm i -g @railway/cli`
   - `railway login`
   - `railway link` (inside your project folder)
   - `railway run --service <backend-service-name> npm run migrate:sql`
2. Expected output: `SQL migrations completed.`

This creates new multi-tenant tables, columns, and RLS policies.

## Step 4: Configure Frontend Service
1. Add another app service from same GitHub repo.
2. Set `Root Directory` to `/frontend`.
3. Add variable:
   - `VITE_API_URL=https://<your-backend-public-domain>`
4. Deploy frontend.

## Step 5: DNS for Subdomains (Multi-Lab)
In your DNS provider:
1. Create wildcard record:
   - `*.yourlis.com` -> backend public domain
2. Create admin record:
   - `admin.yourlis.com` -> backend public domain

Now you can use:
- `lab1.yourlis.com` (lab users)
- `lab2.yourlis.com` (lab users)
- `admin.yourlis.com` (platform super admin / auditor)

## Step 6: First Login
Default seeded lab user:
- Username: `admin`
- Password: `password`

Change it immediately.

## Step 7: Quick Validation Checklist
1. `https://admin.yourlis.com/admin/auth/login` responds (not 404).
2. `https://lab1.yourlis.com/auth/login` responds (not 404).
3. Backend logs show no DB column errors.
4. Migration command printed `SQL migrations completed.`

## If Something Fails
1. Backend crash at startup:
   - Check `DATABASE_URL` is linked correctly.
2. Login fails on lab host:
   - Verify `APP_BASE_DOMAIN` and `APP_ADMIN_HOST` exactly match your DNS.
3. `column ... does not exist` errors:
   - Run `npm run migrate:sql` again.
4. CORS errors:
   - `CORS_ORIGIN` must exactly equal frontend URL (`https://...`).
5. PDF style issues:
   - Redeploy backend with `Clear build cache`.
