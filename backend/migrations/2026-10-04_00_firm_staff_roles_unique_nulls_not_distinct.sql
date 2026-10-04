-- Enforce unique active role names per tenant, treating NULL tenant as one legacy bucket (PG 15+ NULLS NOT DISTINCT).
-- Idempotent: dedupe active duplicates first, then replace index.

BEGIN;

-- Keep the role with the most assigned users; tie-break oldest created_at.
WITH ranked AS (
    SELECT r.id,
           ROW_NUMBER() OVER (
               PARTITION BY r.law_firm_tenant_id, lower(r.name)
               ORDER BY (
                   SELECT COUNT(*)::int FROM users u WHERE u.firm_staff_role_id = r.id
               ) DESC,
               r.created_at ASC
           ) AS rn
    FROM firm_staff_roles r
    WHERE r.is_active = TRUE
)
UPDATE firm_staff_roles r
SET is_active = FALSE,
    updated_at = now()
FROM ranked x
WHERE r.id = x.id
  AND x.rn > 1;

DROP INDEX IF EXISTS firm_staff_roles_tenant_name_uidx;

CREATE UNIQUE INDEX firm_staff_roles_tenant_name_uidx
    ON public.firm_staff_roles (law_firm_tenant_id, lower(name))
    NULLS NOT DISTINCT
    WHERE is_active = TRUE;

COMMIT;
