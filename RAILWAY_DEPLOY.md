# Railway Deployment (Easy Mode)

This guide is for non-coders. Follow it exactly and your LIS app should deploy with less manual work.

## What You Will Deploy
You need 3 Railway services in one project:
1. PostgreSQL database
2. Backend API (`/backend`)
3. Frontend web app (`/frontend`)

---

## Step 1: Create Railway Project + Database
1. Log in to Railway.
2. Click `New Project`.
3. Choose `Deploy from GitHub Repo` and select `shwan1144/LIS`.
4. In the same Railway project, click `+ Add` and add `PostgreSQL`.

---

## Step 2: Configure Backend Service
1. Open the backend service (created from your repo).
2. Go to `Settings` and set:
   - `Root Directory`: `/backend`
3. Go to `Variables` and add:
   - `PORT=3000`
   - `DATABASE_URL` linked from PostgreSQL (`DATABASE_URL`)
   - `JWT_SECRET` (any long random text)
   - `CORS_ORIGIN` (set this to your frontend URL after Step 3)
   - `DB_SYNC=true`
4. Deploy the backend.

Notes:
- Backend now supports `DATABASE_URL` directly (no need to copy `DB_HOST`, `DB_PORT`, etc.).
- On production boot, backend seeds default data automatically.

---

## Step 3: Configure Frontend Service
1. In Railway project, click `+ Add` -> `GitHub Repo`.
2. Select `shwan1144/LIS` again (this creates a second app service).
3. Open that new service `Settings`:
   - `Root Directory`: `/frontend`
4. In `Variables`, add:
   - `VITE_API_URL=https://<your-backend-domain>`
5. Deploy frontend.

---

## Step 4: Final CORS Update
1. Copy your frontend public URL.
2. Go back to backend service variables.
3. Set `CORS_ORIGIN` to that exact frontend URL.
4. Redeploy backend once.

---

## Step 5: First Login
After backend deploy completes, use:
- Username: `admin`
- Password: `password`

Change this password immediately in your app.

---

## Every Future Deploy
Just push code to GitHub (`main` branch). Railway redeploys automatically.

---

## If Something Fails
1. Backend crashes on startup:
   - Check `DATABASE_URL` is linked correctly from PostgreSQL.
2. Frontend shows CORS error:
   - `CORS_ORIGIN` must exactly match frontend URL (`https://...`).
3. Login does not work:
   - Check backend logs for `Seed done.`
   - If needed, set `AUTO_SEED_ON_BOOT=true` and redeploy backend.
4. Frontend cannot call API:
   - Confirm `VITE_API_URL` points to backend public URL.
   - Redeploy frontend after variable changes.
