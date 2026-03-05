# Dockploy Production Fix: `deliveryMethods` + Report Design Payload Size

Use this runbook when production logs include:

- `column Order.deliveryMethods does not exist`
- `Failed to reset DB request context: current transaction is aborted`
- report design save failures caused by large payloads (`413` or proxy body-size limits)

## 1) Immediate DB Hotfix (Safe and Idempotent)

Run on the production database:

```sql
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryMethods" text;
```

Or run from backend service terminal:

```bash
cd /app
npm run migrate:hotfix:delivery-methods
```

## 2) Run SQL Migrations in Backend Runtime

From Dockploy backend service terminal:

```bash
cd /app
npm run migrate:sql
```

Expected:

- migration output ends with `SQL migrations completed.`
- `020_add_delivery_methods.sql` is marked as applied in `schema_migrations`

## 3) Verify Column Exists

Run:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name = 'deliveryMethods';
```

Expected: one row with `deliveryMethods`.

## 4) Backend Env for Request Body Limit

Set in backend service environment:

```env
API_BODY_LIMIT=20mb
```

Notes:

- App default is `10mb` when env is missing/invalid.
- Keep this aligned with proxy limit (next step).

## 5) Reverse Proxy Body Limit Alignment

Set proxy max body size to at least `20MB`.

### If Nginx

```nginx
client_max_body_size 20m;
```

### If Traefik

Use the equivalent buffering middleware/body limit in your Traefik configuration and attach it to the backend route.

## 6) Redeploy and Smoke Test

1. Redeploy backend after env/proxy updates.
2. Open admin report design page and save with realistic images.
3. Confirm no `413` in browser Network tab.
4. Confirm no backend errors for:
   - `column Order.deliveryMethods does not exist`
   - `Failed to reset DB request context`

## 7) API Checks

From local machine:

```powershell
curl.exe -i https://api.medilis.net/
curl.exe -i -X OPTIONS "https://api.medilis.net/auth/login" -H "Origin: https://zanko.medilis.net" -H "Access-Control-Request-Method: POST"
```

Expected:

- API is not `502`
- preflight returns `204` with CORS headers
