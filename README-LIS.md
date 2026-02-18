# LIS – Phase 1 (Backend + Frontend)

## Quick start (Windows)

1. **Use PowerShell**, not Command Prompt (cmd). In Cursor: Terminal → New Terminal (or set default profile to PowerShell). Do **not** paste long error text into the terminal — each line will run as a command.
2. **Run one command at a time.** Type or paste only one line, press Enter, wait for it to finish, then run the next.
3. Open a terminal and go to your project folder, then into `backend`:

**Step 1** — go to backend (adjust path if your project is elsewhere):
```powershell
cd "C:\Users\Hi\Desktop\lab data\backend"
```

**Step 2** — copy env file:
```powershell
copy .env.example .env
```

**Step 3** — install dependencies:
```powershell
npm install
```

**Step 4** — start the backend:
```powershell
npm run start:dev
```

If you see `@nestjs/common@^8 || ^9 || ^10` peer conflict, the backend `package.json` already uses Nest 11–compatible packages; run **Step 3** again from inside `backend`. If you see `path-scurry` or EPERM, see **Troubleshooting** below.

---

## Stack
- **Backend:** Node.js, NestJS, PostgreSQL, TypeORM, JWT
- **Frontend:** React, TypeScript, Vite, Ant Design

## Prerequisites
- Node.js 18+
- PostgreSQL (create a database named `lis`)

## Backend

**All backend commands must be run from the `backend` folder.**

```powershell
cd backend
copy .env.example .env   # edit DB_* and JWT_SECRET if needed (Windows: copy)
npm install
npm run start:dev
```

With default `.env`, TypeORM will create tables (synchronize) on startup. Then seed initial data (from the `backend` folder):

```powershell
npm run seed
```

This creates:
- Lab: LAB01 / Main Lab
- Shift: DAY / Day Shift
- User: **admin** / **password** (LAB_ADMIN, assigned to Main Lab)

API: `http://localhost:3000`  
- `POST /auth/login` — body: `{ "username": "admin", "password": "password" }` → returns `accessToken`, `user`, `lab`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Log in with **admin** / **password**. After login you’ll see the layout with **Current lab: Main Lab** in the top bar (no lab selector).

## Env (optional)
- **Backend:** `backend/.env` — `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `JWT_SECRET`, `CORS_ORIGIN`
- **Frontend:** `frontend/.env` — `VITE_API_URL=http://localhost:3000` (if backend is on another host)

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:5432` or "Unable to connect to the database"

PostgreSQL is not running or not installed. The app needs a running PostgreSQL server and a database named `lis`.

1. **Install PostgreSQL** from https://www.postgresql.org/download/windows/ (remember the port, usually 5432, and the `postgres` user password).
2. **Start the service:** Win+R → `services.msc` → find "PostgreSQL" → Start.
3. **Create the database:** In pgAdmin or psql, run `CREATE DATABASE lis;`
4. **Set `backend\.env`:** `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USERNAME=postgres`, `DB_PASSWORD=your_password`, `DB_DATABASE=lis`
5. Run `npm run start:dev` again from the `backend` folder.

### `password authentication failed for user "postgres"`

The password in `backend\.env` (`DB_PASSWORD`) does not match your PostgreSQL `postgres` user password. Edit `backend\.env` and set `DB_PASSWORD` to the password you use for PostgreSQL (e.g. in pgAdmin or the one you set during install). Save and run `npm run start:dev` again.

### `Cannot find module 'path-scurry\dist\commonjs\index.js'` or EPERM during npm install

This usually means `node_modules` is corrupted (e.g. by file locking on Windows). Do a **clean reinstall**:

1. **Close** Cursor/VS Code (or at least all terminals and file tabs under `backend`).
2. In **File Explorer**, delete:
   - `backend\node_modules` (entire folder)
   - `backend\package-lock.json` (file)
3. Open a **new** PowerShell (Run as Administrator if needed).
4. Run:
   ```powershell
   cd "C:\Users\Hi\Desktop\lab data\backend"
   npm install
   npm run start:dev
   ```
5. If EPERM errors persist, move the project to a path **without spaces** (e.g. `C:\lis`) and run `npm install` there.
