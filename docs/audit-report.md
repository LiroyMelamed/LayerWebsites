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
- Auth used for testing:
  - Admin: phone `0507299064`, OTP `123456`
  - Non-admin: phone `0501234567`, OTP `123456`

### Results summary
- Case Types CRUD: ✅ PASS (create/search/get-by-id/update/delete)
- Admins CRUD: ✅ PASS (create/list/update/delete)
- Cases CRUD: ✅ PASS (create/list/get-by-id/update/delete, tag)
- Authorization hardening: ✅ PASS (non-admin can no longer access admin-management endpoints; non-admin cannot fetch other users’ cases by ID)

### Evidence
Canonical evidence blocks are recorded in [docs/e2e-checklist.md](docs/e2e-checklist.md) under:
- **4) Case types CRUD**
- **5) Admin management CRUD**
- **3) Cases CRUD + tagging**

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

### Open items (not completed in Phase B)
- Add minimal automated API tests (e.g., supertest) for one happy path per resource + one permission test.
- Validate UI flows end-to-end (screens, state refresh, error surfaces) beyond API-first checks.
- Continue remaining checklist areas: dashboard data, notifications, signing flow.
