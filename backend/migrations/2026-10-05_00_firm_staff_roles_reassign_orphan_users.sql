-- Repair: users pointing at inactive duplicate roles after dedupe (QA envs that ran 10-04 without user reassignment).
-- Only reassign when inactive role matches an active survivor by tenant bucket + lower(name) + identical permissions.
-- Idempotent; does not broaden permissions; skips ambiguous rows.

BEGIN;

UPDATE users u
SET firm_staff_role_id = s.survivor_id
FROM firm_staff_roles r
INNER JOIN (
    SELECT DISTINCT ON (law_firm_tenant_id, lower(name))
        id AS survivor_id,
        law_firm_tenant_id,
        lower(name) AS lname,
        permissions AS survivor_permissions
    FROM firm_staff_roles
    WHERE is_active = TRUE
    ORDER BY
        law_firm_tenant_id,
        lower(name),
        (
            SELECT COUNT(*)::int FROM users u2 WHERE u2.firm_staff_role_id = firm_staff_roles.id
        ) DESC,
        created_at ASC
) s ON r.law_firm_tenant_id IS NOT DISTINCT FROM s.law_firm_tenant_id
   AND lower(r.name) = s.lname
   AND r.permissions IS NOT DISTINCT FROM s.survivor_permissions
WHERE u.firm_staff_role_id = r.id
  AND NOT r.is_active
  AND u.firm_staff_role_id IS DISTINCT FROM s.survivor_id;

COMMIT;
