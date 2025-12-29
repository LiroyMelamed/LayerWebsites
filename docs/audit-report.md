# Audit Report

## Phase B — E2E Functionality (API-first)

### Scope
Phase B focuses on validating real end-to-end CRUD behavior against the running local stack (backend + Postgres) using real HTTP calls and real auth (JWT via OTP). The primary scope here is:

- Cases: list/read/create/update/delete + tagging + permissions
- Case Types: list/search/create/update/delete + permissions
- Admins: list/search/create/update/delete + permissions

UI-level verification is tracked in [docs/e2e-checklist.md](docs/e2e-checklist.md), but Phase B evidence below is **API-first** to isolate backend correctness.

### Environment
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`
- DB: Postgres via `backend/config/db.js`
- Auth used for testing: OTP login using local `scripts/e2e/.env` (not committed)

Canonical harness runPrefix: `e2e-20251230-0045-`

### Results summary
- Harness overall: ✅ PASS (25/25 checks)
- Dashboard API: ✅ PASS (admin returns expected keys; non-admin denied)
- Cases WhatsApp link flow: ✅ PASS (read/update/clear; invalid URL rejected)
- Notifications: ✅ PASS (list + mark read idempotent; unread count non-increasing)
- Signing: ✅ PASS (reachability only; full upload/detect/sign flow still TODO)

### Evidence
Canonical evidence is recorded in [docs/e2e-checklist.md](docs/e2e-checklist.md) under **0.1 Automated evidence harness (API-first)**.

Evidence folder: `scripts/e2e/out/e2e-20251230-0045-/`
- `summary.json`
- `dashboard.json`
- `cases.whatsapp.json`
- `notifications.json`
- `signing.json`
- `auth.json`

### Fixes applied during Phase B

#### 1) CaseTypes get-by-id bug
- Symptom: `GET /api/CaseTypes/GetCaseType/:caseTypeId` returned 404 for existing IDs.
- Root cause: controller read `req.params.CaseTypeId` while the route param is `:caseTypeId`.
- Fix: accept `caseTypeId` (and tolerate `CaseTypeId`), validate numeric, query with parsed int.

#### 2) Critical authorization gap: non-admin could call admin management APIs
- Symptom: a non-admin JWT could call `GET /api/Admins/GetAdmins` and receive data.
- Root cause: admin routes required authentication but did not enforce role.
- Fix: added `requireAdmin` middleware and applied to all admin-management endpoints.

#### 3) Case data leakage risk: non-admin could fetch arbitrary cases by ID
- Symptom: `GET /api/Cases/GetCase/:caseId` allowed access to any case ID.
- Root cause: controller query did not scope by `userid` for non-admin.
- Fix: for non-admin users, query adds `AND C.userid = $2` (owner-only access). Admin behavior unchanged.

#### 4) Stability: prevent SMS integration issues from failing CRUD
- Symptom: missing/invalid SMS provider configuration could break CRUD flows.
- Fix: wrapped SMS send calls in try/catch (case creation/update/stage update and customer welcome).

#### 5) Notifications: mark-as-read robustness
- Symptom: E2E harness attempted `PUT /api/Notifications/undefined/read` and received 500.
- Root cause: list endpoint returns Postgres column names as lowercase (`notificationid`, `isread`, `createdat`), while the harness was reading `NotificationId` and constructed an invalid URL.
- Fix:
  - Harness: normalize notification fields before selecting a target.
  - Backend: validate `:id` is a number and return 400 for invalid IDs (prevents 500).

### Open items (not completed in Phase B)
- Add minimal automated API tests (e.g., supertest) for one happy path per resource + one permission test.
- Validate UI flows end-to-end (screens, state refresh, error surfaces) beyond API-first checks.
- Continue remaining checklist areas: dashboard data, notifications, signing flow.
