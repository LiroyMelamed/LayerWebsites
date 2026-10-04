# Lawyer + firm_staff_role_id (routing decision)

## Facts from code (MelamedLaw web)

| Identity | Login stack | Permission UI enforcement |
|----------|-------------|---------------------------|
| `Admin` / `Staff` (office web) | **AdminStack** | `AdminRouteGuard` + `session-scope` nav filter |
| `Lawyer` | **ClientStack** (not a separate LawyerStack module) | **Backend only** via `attachFirmPermissions` + `requireFirmAction` |

Lawyer OTP navigates to `ClientStack`, not `AdminStack` (`LoginOtpScreen.js`).

AdminStack-only areas in the permission catalog: `main`, `caseTypes`, `clients` (admin list), `support` (admin tickets), etc.

## Decision (v1 — minimal change)

**Option C:** When assigning a custom role to a **`Lawyer`**, the API rejects roles whose visible areas include anything outside:

- `cases`
- `signing`
- `reminders`
- `calendar`

Implementation: `backend/lib/firmStaffOfficeUsers.js` → `assertFirmStaffRoleCompatibleWithUser`.

Effects:

- Lawyer keeps `users.role = Lawyer` and ClientStack login.
- Custom role **restricts API capabilities** that already apply to lawyers (cases/my, signing, calendar/reminders APIs with `legacy: lawyerOrAdmin`).
- Platform admin cannot assign a role that implies AdminStack-only screens the lawyer cannot reach.

Future (not v1): shared office shell or Lawyer nav driven by `session-scope`.

## QA Staff A–D

Legacy `AppRoles.Staff` test users remain for regression only; product UX is **Admin + Lawyer** via `/AllManger` + `/FirmStaffRoles`.
