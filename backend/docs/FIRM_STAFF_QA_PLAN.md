# Firm staff roles — QA plan (assignment on existing users)

## Model

- `FirmStaffRoles` screen: role CRUD + deactivate only (no employee creation).
- Assignment: Platform Admin sets `firm_staff_role_id` on **existing** **Admin + Lawyer** via **AllManger** (`GET /api/staff/users` when platform admin) → **AdminPopup** (Lawyer: read-only profile + role dropdown).
- Lawyer routing: see `LAWYER_CUSTOM_ROLES.md` (ClientStack + API-only enforcement; compatible role areas only).
- `users.role` unchanged. `firm_staff_role_id = null` → legacy behavior.
- Platform admins (`platform_admins`): cannot receive custom firm staff role assignment.

## Required flows (QA Melamedia only)

1. Platform Admin creates/edits custom role on `/AdminStack/FirmStaffRoles`.
2. Open existing Admin user card on `/AdminStack/AllManger` → section **תפקיד והרשאות** → assign role.
3. User keeps same login identity; permissions follow `firm_staff_role_id`.
4. Set **ללא תפקיד מותאם** → legacy restored.
5. Cross-tenant role assignment → denied (404).
6. Deactivate role with `assignedUserCount > 0` → 409; clear assignments on user cards first.
7. Legacy: Admin/Lawyer with null role → unchanged behavior.

## Not in scope for this suite

- **Create Staff employee** (removed).
- Suites 2–3 Cases/Clients until permissions + assignment retest pass.
- Production deploy.

## QA test users (keep until retest)

- QA Staff A–D (`0509999101`–`0509999104`): legacy Staff accounts; optional cleanup after Admin/Lawyer assignment verified.

## API

- `PATCH /api/staff/users/:userId/firm-staff-role` body `{ firmStaffRoleId: uuid | null }` (Platform Admin + same tenant).
- Removed: `GET/POST/PATCH /api/staff/employees`.
