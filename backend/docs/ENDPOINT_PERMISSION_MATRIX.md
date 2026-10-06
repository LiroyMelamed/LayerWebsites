# AdminStack / Staff API — permission matrix

Legend:
- **Legacy guard**: `requireFirmAction` / `requireFirmAreaVisible` legacy rule when `firm_staff_role_id IS NULL`.
- **Scope**: record-level checks in controllers (`assertCaseRecordAccess`, `assertSigningFileOfficeAccess`).
- **UI-only**: permission affects nav/buttons only; no dedicated API.

Catalog source: `backend/lib/firmRolePermissions.js` (v1).

## Cases (`cases`)

| Endpoint | Action | Data scope | Route guard | Record scope | Status |
|----------|--------|------------|-------------|--------------|--------|
| GET `/api/Cases/GetCases` | view | all_firm / assigned_only | controller | SQL filter | covered |
| GET `/api/Cases/my` | view | assigned (implicit) | `cases.view` legacy lawyerOrAdmin | controller | covered |
| GET `/api/Cases/GetCase/:id` | view | assigned_only | controller | `assertCaseRecordAccess` | covered |
| GET `/api/Cases/GetCaseByName` | view | assigned_only | controller | filtered query | covered |
| POST `/api/Cases/AddCase` | create | — | `cases.create` | — | covered |
| PUT `/api/Cases/UpdateCase/:id` | edit | assigned_only | `cases.edit` | assert | covered |
| PUT `/api/Cases/UpdateStage/:id` | edit | assigned_only | `cases.edit` | assert | covered |
| DELETE `/api/Cases/DeleteCase/:id` | delete | assigned_only | `cases.delete` | assert | covered |
| PUT `/api/Cases/TagCase/:id` | tag | assigned_only | `cases.tag` | assert | covered |
| GET `/api/Cases/TaggedCases` | view | all_firm / assigned_only | `cases.view` | SQL scope | covered |
| GET `/api/Cases/TaggedCasesByName` | view | all_firm / assigned_only | `cases.view` | SQL scope | covered |
| PUT `/api/Cases/LinkWhatsappGroup/:id` | edit | assigned_only | `cases.edit` | assert | covered |
| POST `/api/Cases/CreateLicenseReminders` | edit | assigned_only | `cases.edit` | assert | covered |
| GET `/api/Files/stage-files/:caseId` | view (via cases) | assigned_only | auth + assert | assert | covered |
| GET `/api/Files/stage-file-read/:fileId` | view | assigned_only | auth + assert | assert via caseid | covered |
| POST `/api/Files/stage-files/:caseId/:stage` | edit | assigned_only | `cases.edit` legacy admin | assert | covered |
| DELETE `/api/Files/stage-files/:fileId` | edit | assigned_only | `cases.edit` | assert | covered |
| GET `/api/Data/GetMainScreenData` | view (main+cases) | cases scope in data | `main` visible + `cases.view` legacy admin | controller data | covered |
| GET `/api/Data/GetManagerHomeData` | view | same | same | same | covered |
| GET `/api/Data/GetManagerHomeAiBrief` | view | same | same | same | covered |
| Nav `newOrUpdateCase` | create/edit | — | — | — | UI-only (`canAction`) |

## Clients (`clients`)

| Endpoint | Action | Route guard | Notes | Status |
|----------|--------|-------------|-------|--------|
| GET `/api/Customers/GetCustomers` | view | `clients.view` legacy admin | route guard only (no inner `requireAdmin`) | covered |
| GET `/api/Customers/GetCustomerByName` | view | same | autocomplete | covered |
| GET `/api/Customers/GetCompaniesByName` | view | same | | covered |
| POST `/api/Customers/AddCustomer` | edit | `clients.edit` | | covered |
| PUT `/api/Customers/UpdateCustomer/:id` | edit | `clients.edit` | | covered |
| POST `/api/Customers/import` | edit | `clients.edit` | | covered |
| DELETE `/api/Customers/DeleteCustomer/:id` | delete | `clients.delete` legacy lawyerOrAdmin | | covered |
| GET/PUT `/api/Customers/GetCurrentCustomer` etc. | — | auth (client self) | not Staff AdminStack | N/A |

## Signing — office (`signing`)

Public `/api/SigningFiles/public/*`, OTP, client sign routes: **unchanged** (not role catalog).

| Endpoint | Action | Route guard | Record scope | Status |
|----------|--------|-------------|--------------|--------|
| GET `/lawyer-files` | view | signView | — | covered |
| GET `/pending`, `/client-files` | view | signView | — | covered |
| POST `/upload`, `/detect-spots` | upload | signUpload | — | covered |
| GET/PATCH/POST/DELETE `/:signingFileId/*` office ops | view/manage | signView/signManage + scope middleware | `requireSigningOfficeAccess` | covered |
| Saved signature/stamp (authenticated) | — | `requireSigningEnabledForUser` | lawyer self-sign UX | legacy (not staff catalog) |

## Calendar (`calendar`)

| Endpoint | Action | Route guard | Status |
|----------|--------|-------------|--------|
| GET list/today/holidays/agenda/… | view | calView | covered |
| POST/PUT/PATCH/DELETE mutations | manage | calManage | covered |
| `/invite/:token`, `/feed/:token`, OAuth callbacks | public/oauth | no staff catalog | N/A |

## Reminders (`reminders`)

All routes: `reminders.view` / `reminders.manage` on router. **covered**.

## Case types (`caseTypes`)

All `/api/CaseTypes/*`: area visible + view; mutations `caseTypes.manage`. **covered**.

## Support (`support`)

`/api/support/*`: router `support.view` (legacy admin). **covered**.

## Staff roles (platform admin)

`/api/staff/*` except `session-scope` + `permission-catalog`: `requirePlatformAdmin` + tenant checks in controller. **Not in assignable catalog.**

## Auxiliary lookups

| Endpoint | Guard | Rationale |
|----------|-------|-----------|
| GET `/api/Admins/GetStaffByName` | `requireFirmStaffLookup` | cases or calendar visible + action |
| GET `/api/Files/presign-upload` | auth only | user-scoped R2 key prefix |
| GET `/api/Files/presign-read` | auth + key ownership | |
| GET `/api/Notifications/*` | auth | generic notifications (legacy) |
| GET `/api/Admins/*` (other) | requireAdmin | managers admin screen (legacy Admin) |

## Session

| Endpoint | Purpose |
|----------|---------|
| GET `/api/staff/session-scope` | UI display only; not authority |
| attachFirmPermissions | DB load every request; authority |
