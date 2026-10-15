# Hard-coded role checks (post role-matrix model)

Business authorization for office users with `firm_staff_role_id IS NOT NULL` must come from **`req.firmPermissions`** / `requireFirmAreaVisible` / `requireFirmAction`.  
`users.role` (Admin / Lawyer / Staff) is **identity + legacy routing only**.

## Intentionally retained (not business matrix)

| Location | Check | Why |
|----------|--------|-----|
| `middlewares/requirePlatformAdmin.js` | platform admin row | PA-only: staff roles CRUD, office user list, role assignment, rollout summary, billing owner tools |
| `middlewares/requireAdmin.js` | `users.role === Admin` | Legacy office **user management** APIs (`/api/Admin/*`) — not assignable via matrix |
| `routes/staffRoutes.js` | `requirePlatformAdmin` on `/staff/roles`, `/staff/users`, `/rollout-summary` | Role management is PA-only |
| `middlewares/requireFirmAction.js` | legacy fallbacks when `permissionMode === 'legacy'` | Rollout: null `firm_staff_role_id` keeps prior Admin/Lawyer behavior |
| `middlewares/requireFirmEvidencePackageAccess.js` | legacy `lawyerOrAdmin` | ZIP download when not in role mode |
| `lib/firmStaffOfficeUsers.js` | `OFFICE_USER_LIST_ROLES`, assignment target roles | Which accounts appear in PA “משתמשי משרד” list (Admin + Lawyer) |
| `staffRolesController.assignUserFirmStaffRole` | block PA target | Platform admin cannot receive custom role |
| Public / client flows | Lawyer vs Client identities | Signing verify, client portal — outside office permission model |
| `customerController` / `auditEventsController` lawyer branches | data scoping for **legacy** lawyer identity | Legacy list filters; role-mode uses firm permissions middleware on routes |

## Frontend identity-only

| Location | Usage |
|----------|--------|
| `resolvePostLoginNavigation.js` | **Legacy** stack choice when `permissionMode === 'legacy'` |
| `ClientStackRoleRedirect.js` | Sends **custom role** users from ClientStack → AdminStack office shell |
| `AdminsCard.js`, `EventFormModal.js` | Display labels for Admin vs Lawyer |
| `EvidenceVerifyScreen.js` | Public verify flow admin branch |

## Business routes — authority

Assignable areas use **`requireFirmAreaVisible` + `requireFirmAction`** (including `evidenceDocuments`, cases, clients, calendar, etc.).  
Do **not** add `requireLawyerOrAdmin` on new assignable endpoints without matching legacy option on `requireFirmAction`.

## Removed (do not reintroduce)

- `assertFirmStaffRoleCompatibleWithUser` / 409 “Lawyer incompatible areas” — **deleted**; same matrix for Admin and Lawyer given same `firm_staff_role_id`.

## Billing / plan usage

`planUsage` / `PlansPricing` — **Platform Admin only**; not in permission catalog.  
**No «תוכניות מימוש» implementation-plans screen** found in repository.
