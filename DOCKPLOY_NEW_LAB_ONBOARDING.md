# Dockploy New Lab Onboarding (medilis.net)

This runbook is for your current setup:

- Linux server with Dockploy
- One public IP
- Multi-tenant subdomains on `medilis.net`
- Existing DNS wildcard (`*.medilis.net`)

Use this every time you add a new lab (example: `lab02`).

---

## 1) DNS and Host Routing

### DNS (already correct in your screenshot)

Keep these A records pointing to your server IP:

- `admin.medilis.net`
- `api.medilis.net`
- `*.medilis.net`

You do **not** need to add a new DNS record for each new lab if wildcard remains.

### Dockploy reverse proxy routes (required once)

Configure host-based routes:

- `admin.medilis.net` -> frontend service
- `*.medilis.net` -> frontend service
- `api.medilis.net` -> backend service

For troubleshooting, keep DNS as `DNS only` until stable.

---

## 2) Backend Environment (Dockploy)

Set these backend variables:

- `APP_BASE_DOMAIN=medilis.net`
- `APP_ADMIN_HOST=admin.medilis.net`
- `TRUST_PROXY_HOPS=1`
- `CORS_ORIGIN=https://admin.medilis.net,https://*.medilis.net`
- `JWT_SECRET=<strong-random-secret>`
- `PLATFORM_JWT_SECRET=<different-strong-random-secret>`

Recommended production values:

- `DB_SYNC=false`
- `AUTO_SEED_ON_BOOT=false` (after first setup)

Redeploy backend after saving variables.

---

## 3) Frontend Environment (Dockploy)

Set:

- `VITE_API_URL=https://api.medilis.net`

Redeploy frontend.

---

## 4) Create the New Lab (Platform Admin UI)

1. Open `https://admin.medilis.net/login`
2. Log in as `SUPER_ADMIN`
3. Go to `Labs` -> `Create Lab`
4. Enter:
   - `Name` (example: `Lab 02`)
   - `Code` (example: `LAB02`)
   - `Subdomain` (example: `lab02`)
   - `Timezone`
   - `Active = true`
5. Save

Notes:

- If subdomain is empty, backend generates from code.
- Subdomain format: lowercase letters, numbers, and `-` only.
- Subdomain must be unique.

---

## 5) Create First User for the Lab

In admin panel:

1. Open the new lab details
2. Go to `Users`
3. Create at least one lab user (recommended role: `LAB_ADMIN`)

Without a lab user, login at `lab02.medilis.net` cannot succeed.

---

## 6) First Login and Lab Initialization

1. Open `https://lab02.medilis.net/login`
2. Log in with the user created for `LAB02`
3. Configure minimum lab master data:
   - shifts
   - departments
   - tests
   - pricing

Optional:

- Use test seed endpoints if your workflow relies on seeded panels/tests.

---

## 7) Validation Checklist

### Browser checks

- `https://admin.medilis.net/login` loads and allows platform login.
- `https://lab02.medilis.net/login` loads lab login page.
- Existing `https://lab01.medilis.net/login` still works.

### Guard/scope checks

- `https://admin.medilis.net/auth/login` should be blocked for lab scope.
- `https://lab02.medilis.net/admin/auth/login` should be blocked for admin scope.
- Correct login endpoints should work on correct hosts.

### Functional checks

- Lab user can log in on `lab02`.
- Orders page loads and can fetch tests.
- Admin can disable lab; disabled lab login is blocked.

---

## 8) Typical Issues and Fixes

1. Lab subdomain opens but API fails:
   - Verify frontend `VITE_API_URL=https://api.medilis.net`
   - Verify backend CORS includes admin/lab origins

2. Wrong scope errors:
   - Verify backend `APP_BASE_DOMAIN` and `APP_ADMIN_HOST`
   - Verify proxy forwards host correctly

3. CORS errors in browser:
   - Check exact `CORS_ORIGIN` value and redeploy backend

4. New lab URL not resolving:
   - Confirm wildcard DNS record is active and propagated

---

## 9) Repeatable Onboarding for Future Labs

For each new lab `labXX`:

1. Create lab in admin panel (set subdomain to `labxx`)
2. Create first lab user
3. Validate `https://labxx.medilis.net/login`

No DNS change required when wildcard is already in place.
