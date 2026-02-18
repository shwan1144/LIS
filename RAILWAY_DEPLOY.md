# Deploy LIS to Railway via Git

Your repo has two parts: **backend** (NestJS + PostgreSQL) and **frontend** (Vite + React). On Railway you will create **one project** with **three components**: a PostgreSQL database, the API service, and the web app.

---

## First step (you’ve already done this)

- Code is in a Git repository (e.g. GitHub).  
- Next: create a Railway project, add PostgreSQL, then add two services from the same repo (backend and frontend) and set the variables below.

---

## Step 1: Create a Railway project and add PostgreSQL

1. Go to [railway.app](https://railway.app) and sign in (GitHub is easiest).
2. Click **New Project**.
3. Choose **Provision PostgreSQL** (or “Add PostgreSQL”).
4. Wait until the database is ready. Open it and go to **Variables** or **Connect** and note the connection details (you’ll use them in the next step).

---

## Step 2: Deploy the backend (API)

1. In the same project, click **New** → **GitHub Repo** (or **GitHub** and select your repo).
2. Railway will add a service from your repo. Open that service.
3. In the service **Settings**:
   - **Root Directory**: set to `backend`.
   - **Build Command**: leave default or set to `npm install && npm run build`.
   - **Start Command**: set to `npm run start:prod` (or `node dist/main`).
   - **Watch Paths**: optional, e.g. `backend/**` so only backend changes trigger deploys.
4. Open **Variables** and add (use the values from your PostgreSQL service where applicable):

   | Variable        | Value / Where to get it |
   |-----------------|--------------------------|
   | `PORT`          | Railway sets this; keep it. |
   | `NODE_ENV`      | `production` |
   | `DB_HOST`       | From PostgreSQL service (e.g. `...railway.app`) |
   | `DB_PORT`       | From PostgreSQL (often `5432`) |
   | `DB_USERNAME`   | From PostgreSQL |
   | `DB_PASSWORD`   | From PostgreSQL |
   | `DB_DATABASE`   | From PostgreSQL (e.g. `railway`) |
   | `JWT_SECRET`    | Generate a long random string (e.g. `openssl rand -base64 32`) |
   | `CORS_ORIGIN`   | Leave empty for now; set after frontend is deployed (see Step 4). |

   **Tip:** If your PostgreSQL service exposes a single **`DATABASE_URL`**, you can use that instead of separate `DB_*` variables only if your app supports it. Right now the app expects `DB_HOST`, `DB_PORT`, etc. So either:
   - Keep using `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, or  
   - Add a small change in the backend to read `DATABASE_URL` and parse it (optional).

5. Deploy: push a commit or click **Deploy** in Railway. After a successful deploy, open the **Settings** → **Networking** (or **Generate Domain**) and note the public URL, e.g. `https://your-backend.up.railway.app`. You will use this as the API URL for the frontend.

---

## Step 3: Deploy the frontend (React app)

1. In the same Railway project, click **New** → **GitHub Repo** again and select the **same repo**.
2. A second service is created. Open it.
3. In this service’s **Settings**:
   - **Root Directory**: `frontend`.
   - **Build Command**: `npm install && npm run build`.
   - **Start Command**: `npm run start` (serves the built app from `dist` on the port Railway provides).
4. In **Variables** add:
   - **`VITE_API_URL`** = your backend URL from Step 2, e.g. `https://your-backend.up.railway.app`  
   (This is baked in at build time; rebuild after changing it.)
5. Deploy (push or **Deploy**). Then open **Settings** → **Networking** and generate a domain for this service, e.g. `https://your-app.up.railway.app`.

---

## Step 4: Point backend CORS to your frontend

1. Go back to the **backend** service → **Variables**.
2. Set **`CORS_ORIGIN`** to your frontend URL from Step 3, e.g. `https://your-app.up.railway.app` (no trailing slash).
3. Redeploy the backend so the new CORS setting is applied.

---

## Step 5: Database migrations / seed (optional)

- If you use migrations, run them against the Railway PostgreSQL (e.g. from your machine with `DB_*` or `DATABASE_URL` pointing at Railway, or via a one-off Railway run).
- If you have a seed (e.g. default lab/user), run it once the first time with the same DB credentials.

---

## Quick checklist

- [ ] Railway project created.
- [ ] PostgreSQL provisioned and connection vars noted.
- [ ] Backend service: root `backend`, build + `npm run start:prod`, env vars set (DB, JWT_SECRET, PORT, then CORS_ORIGIN).
- [ ] Backend domain generated and URL copied.
- [ ] Frontend service: root `frontend`, build, `VITE_API_URL` = backend URL, static serve (e.g. `npx serve -s dist -l 3000`).
- [ ] Frontend domain generated.
- [ ] Backend `CORS_ORIGIN` set to frontend URL and backend redeployed.

After that, open the frontend URL in the browser; the app should talk to the API on Railway and use the PostgreSQL database.
