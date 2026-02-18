# LIS Dashboard – Definition

## Purpose
Single at-a-glance screen for lab staff: KPIs, alerts, and quick links. All data is **lab-scoped** (current user’s lab from JWT). Role-based visibility can be added later.

---

## Layout (grid)

- **Row 1:** Four KPI cards (Orders today | Pending verification | Critical alerts | Avg TAT).
- **Row 2:** One card “Orders trend” (chart placeholder or small chart).
- **Row 3:** Quick stats (e.g. Total patients) + optional “Quick actions” links.

Layout is responsive: 4 cols → 2 → 1 on smaller screens.

---

## Widgets and data

| Widget              | Description                    | Source / API                         | When available   |
|---------------------|--------------------------------|--------------------------------------|------------------|
| **Orders today**    | Count of orders registered today for the lab. | `GET /dashboard/kpis` → `ordersToday` | Phase 3 (Orders) |
| **Pending verification** | Count of result sets not yet verified. | Same → `pendingVerification`          | Phase 4–5        |
| **Critical alerts** | Count of critical results not yet acknowledged. | Same → `criticalAlerts`               | Phase 4–5        |
| **Avg TAT**         | Average turnaround time (e.g. order received → result verified) for last 7 days, in hours. | Same → `avgTatHours`                  | Phase 4–5        |
| **Orders trend**    | Daily order counts for last 7 or 14 days (for chart). | `GET /dashboard/orders-trend?days=7`  | Phase 3          |
| **Total patients**  | Total patient count (global; no lab filter).   | Same KPIs → `totalPatients`           | Phase 2 (now)    |

---

## API contract

### 1. `GET /dashboard/kpis`

**Auth:** JWT required. `labId` taken from token.

**Query:** Optional `tz` (timezone) for “today” (default server or UTC).

**Response (JSON):**

```json
{
  "ordersToday": 0,
  "pendingVerification": 0,
  "criticalAlerts": 0,
  "avgTatHours": null,
  "totalPatients": 42
}
```

- **ordersToday:** integer, lab-scoped.
- **pendingVerification:** integer, lab-scoped (order_tests not verified).
- **criticalAlerts:** integer, lab-scoped (critical result values not yet acknowledged).
- **avgTatHours:** number or null (null if no completed orders in period).
- **totalPatients:** integer, global count (all patients).

Until Orders/Results exist, backend returns `0` or `null` for order/verification/TAT fields and real count for `totalPatients`.

### 2. `GET /dashboard/orders-trend`

**Auth:** JWT required.

**Query:** `days=7` (default) or `14`.

**Response (JSON):**

```json
{
  "data": [
    { "date": "2026-02-01", "count": 12 },
    { "date": "2026-02-02", "count": 15 }
  ]
}
```

Until Orders exist, return `data: []` or zeros.

---

## Frontend

- **Route:** `/` (existing Dashboard page).
- **Page:** Title “Dashboard”, then grid of cards.
- **KPI cards:** Big number + label; optional “View all” link when the target screen exists (e.g. Pending verification → `/verification`).
- **Orders trend:** Ant Design `Chart` or simple `<Table>` / list of dates and counts; later replace with a line/bar chart.
- **Quick links:** Can reuse sidebar (Dashboard, Patients, later Orders, Worklist, Verification); or a small “Quick actions” card with same links.
- **Data:** On load, call `GET /dashboard/kpis` and `GET /dashboard/orders-trend?days=7`; store in local state and render. Handle loading and error (toast or inline message).

---

## Backend implementation notes

- **Lab context:** Use JWT payload `labId` (from `request.user` after `JwtAuthGuard`) for all lab-scoped metrics.
- **Orders today:** Count `orders` where `lab_id = labId` and `registered_at` is in “today” in server (or requested) timezone.
- **Pending verification:** Count `order_tests` (or equivalent) with status not “verified” and belonging to the lab.
- **Critical alerts:** Count result values marked critical where “acknowledged” is false (or equivalent), lab-scoped.
- **Avg TAT:** From orders with verified results: average of (verified_at − order.registered_at or sample collected_at) in hours, last 7 days, lab-scoped.
- **Total patients:** `COUNT(*)` from `patients` (no lab filter).
- **Orders trend:** Group orders by date (registered_at or created_at), last N days, lab-scoped; return array of `{ date, count }`.

---

## File changes (summary)

| Layer   | File(s) |
|---------|---------|
| Spec    | `DASHBOARD.md` (this file) |
| Backend | `dashboard/dashboard.controller.ts`, `dashboard/dashboard.service.ts`, `dashboard/dashboard.module.ts`; register in `app.module`; protect routes with `JwtAuthGuard`; get `labId` from `req.user`. |
| Frontend| `api/client.ts` – add `getDashboardKpis()`, `getOrdersTrend(days)`; `pages/DashboardPage.tsx` – grid, cards, fetch and display KPIs and trend. |

---

## Later extensions

- Filters: date range, department, test type.
- Role-based: hide or show widgets by role.
- Real-time: refresh every N minutes or WebSocket.
- Export: PDF/Excel of dashboard data.
