# Office custom roles (v1)

## Routing

| User | `firm_staff_role_id` | Shell |
|------|----------------------|--------|
| Platform Admin | any (ignored) | AdminStack — full access |
| Admin / Lawyer / Staff | `NULL` | **Legacy:** Admin/Staff → AdminStack; Lawyer → ClientStack |
| Admin / Lawyer / Staff | set | **Role mode:** AdminStack office shell, navbar/routes/API from `GET /api/staff/session-scope` |

After OTP: fetch **session-scope** (permissions are not in JWT).  
`firstAllowedStaffPath` avoids landing on forbidden routes.  
Lawyers with a custom role who hit ClientStack are redirected to AdminStack (`ClientStackRoleRedirect`).

## Authorization

- **No Lawyer-compatible area whitelist.** Same `firm_staff_role_id` → same matrix whether `users.role` is Admin or Lawyer.
- **`users.role`** does not limit which catalog areas PA can assign.
- **PA-only:** role CRUD, assign roles on office users, platform settings, billing/plan usage, rollout summary.

## Assignment UI

- **FirmStaffRolesScreen:** roles only.
- **AllManger (PA):** Admin + Lawyer accounts; popup assigns dynamic role. PA row = «בעל מערכת», no selector.

## Rollout

`firm_staff_role_id IS NULL` → legacy until fully assigned.  
`GET /api/staff/rollout-summary` (PA) counts users without custom role.  
Do **not** enable `FIRM_ROLES_REQUIRE_ASSIGNMENT` until product decides.
