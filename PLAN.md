# LIS Implementation Plan - Where to Begin & Requirements

## 1. Where we begin

**Starting point**
- Greenfield: no existing LIS codebase to migrate.
- Target: one web-based LIS you sell to multiple labs (e.g. Lab 1, Lab 2); **only patient profiles are shared** between those labs; orders, results, pricing, and users are **per lab**.
- **Login:** username + password only. System resolves the user's lab from their record and shows it in the UI (no lab selector). All actions use that lab automatically.

**Prerequisites before coding**
- Tech stack chosen: backend **Node.js NestJS**, frontend **React + TypeScript + Ant Design**, DB **PostgreSQL**, optional Redis.
- Development environment: IDE, Node.js, Docker (optional), DB client (e.g. pgAdmin, DBeaver).
- One "first lab" to design for (real or mock).

**First concrete step**
- Set up the project (backend + frontend skeletons), DB, and implement **auth + lab resolution**: login with username/password, load user's lab from DB, return it in the login response and use it for all subsequent API calls. Then add a simple "current lab" display in the layout (no lab selector).

---

## 2. Requirements summary

### 2.1 Business / product

| Area | Requirement |
|------|-------------|
| **Customers** | You sell the app to multiple labs (e.g. Lab 1, Lab 2). |
| **Patients** | Shared across all labs you sold the app to. One patient can visit Lab 1 and later Lab 2; same profile. |
| **Orders, results, pricing, users** | Scoped per lab. Lab 1 does not see Lab 2's orders/results/pricing/users. |
| **Login** | Username + password only. No lab selection. System sets "current lab" from the user's record and shows it in the UI. |
| **Lab in UI** | Current lab is **displayed** (e.g. in TopBar) for clarity; **no lab selector** dropdown. |
| **Roles** | SUPER_ADMIN, LAB_ADMIN, RECEPTION, TECHNICIAN, VERIFIER, DOCTOR (read-only), INSTRUMENT_SERVICE. Backend enforces RBAC. |
| **Orders** | One order -> multiple samples; one sample -> multiple tests. Fast order creation, receipts (e.g. QR, shift-based pricing), labels (barcode/QR, tube type, sample ID). |
| **Tests** | Single-value and multi-parameter panels (e.g. CBC, LFT). Test master, parameters, parameter-level results, auto flagging (H/L). |
| **Calculations** | Formulas (e.g. LDL, eGFR, BMI, HOMA-IR, corrected Ca) stored in DB, safe evaluation, auto-calculation, locked after verification. |
| **Instruments** | HL7, ASTM, TCP, file-based. Raw messages immutable; staging buffer; match -> review -> verifier approval -> inject. Manual review: match, map test code, unit conversion, reject with reason; all audited. |
| **Reporting & analytics** | Server-side PDF, web reports, trends. Stats: orders, test volume, revenue, TAT, instrument workload, abnormal/critical rates. Export PDF/Excel/CSV. |
| **Pricing** | By lab, test, shift (day/night/emergency), hospital vs walk-in, contract. Configurable in admin. |
| **Compliance** | Full audit logs, result versioning, critical value alerts, TAT tracking, no deletion of raw instrument data, role-restricted actions. |

### 2.2 Technical

| Area | Requirement |
|------|-------------|
| **Backend** | Node.js NestJS; REST API; PostgreSQL; optional Redis; Docker-ready. |
| **Frontend** | React + TypeScript + Ant Design; role-based routing; keyboard-optimized UI; real-time where needed. |
| **Auth** | JWT (or equivalent); session stores user + **lab_id** (from user record, not from login form). |
| **Multi-lab** | All lab-scoped resources filtered by `lab_id`; patients table has no `lab_id` (global within the deployment). |
| **API** | REST; `lab_id` taken from token/session (or user's default lab), not from request body for security. |

### 2.3 UX (high level)

- TopBar: **current lab (read-only)**, shift, global search, notifications -- **no lab selector**.
- Login: username + password only; after login, show current lab in layout.
- Keyboard shortcuts, inline editing, no full-page reloads, server-side pagination, virtualized tables where needed.

---

## 3. Phased roadmap (where to begin, in order)

| Phase | Focus | Outcome |
|-------|--------|--------|
| **1 - Start** | Project setup, DB schema (labs, users, user_lab_assignments, shifts), auth API. | Login with username/password; backend resolves lab from user; returns user + lab info; frontend shows "Current lab: X" in layout (no selector). |
| **2** | Patients (global), duplicate check (e.g. national ID, phone). | Patient search and registration shared across labs. |
| **3** | Orders, samples, order_tests, pricing engine, receipts/labels. | Order creation, receipt/label data (QR, shift, barcode). |
| **4** | Test master, parameters, single/panel result entry, calculation engine, H/L flagging. | Worklist, result entry, formulas, verification lock. |
| **5** | Verification workflow, report viewer, PDF export. | Verification queue, reports, PDFs. |
| **6** | Instrument listeners (HL7/ASTM/TCP/File), raw store, staging, test mapping. | Ingest from instruments, staging table, match/map. |
| **7** | Manual review UI, match/map/convert/reject, verifier inject, audit. | Full instrument review workflow, audit trail. |
| **8** | Analytics, admin (tests, users, instruments, pricing), hardening. | Dashboards, admin CRUD, critical alerts, TAT, no raw delete. |

**Where to begin:** Phase 1 -- project setup + auth + "current lab" from username/password (no lab selector), then Phase 2 for patients.

---

## 4. Login & lab - agreed behavior (for implementation)

- **Login request:** `POST /auth/login` with `{ username, password }` only (no `labId`).
- **Backend:** Load user by username; validate password; get lab from `user.default_lab_id` or single `user_lab_assignments.lab_id`; issue JWT containing `userId` and `labId`.
- **Login response:** Return user info + `lab: { id, code, name }` (or equivalent) for display.
- **Frontend:** Store user + lab in state/session; show "Current lab: &lt;name&gt;" in TopBar (read-only); send JWT on all API calls; backend uses `lab_id` from token for all lab-scoped queries.
