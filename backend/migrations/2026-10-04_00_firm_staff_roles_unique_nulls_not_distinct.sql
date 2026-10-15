-- Enforce unique active role names per tenant, treating NULL tenant as one legacy bucket (PG 15+ NULLS NOT DISTINCT).
-- Survivor policy (only when every active row in the name bucket has identical permissions jsonb):
--   1) role with the most assigned users, 2) earliest created_at.
-- Reassign users from duplicate roles to survivor, deactivate duplicates, replace index.
-- If permissions differ within a duplicate name bucket, abort (manual resolution required).

BEGIN;

DO $dedupe_guard$
DECLARE
    conflict_groups int;
BEGIN
    SELECT COUNT(*)::int INTO conflict_groups
    FROM (
        SELECT law_firm_tenant_id, lower(name) AS lname
        FROM firm_staff_roles
        WHERE is_active = TRUE
        GROUP BY law_firm_tenant_id, lower(name)
        HAVING COUNT(*) > 1 AND COUNT(DISTINCT permissions) > 1
    ) g;

    IF conflict_groups > 0 THEN
        RAISE EXCEPTION
            'firm_staff_roles dedupe blocked: % active duplicate name group(s) have conflicting permissions',
            conflict_groups
            USING HINT = 'Align permissions or deactivate/rename duplicates before re-running this migration.';
    END IF;
END $dedupe_guard$;

CREATE TEMP TABLE _firm_staff_role_dupes (
    duplicate_id uuid NOT NULL,
    survivor_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _firm_staff_role_dupes (duplicate_id, survivor_id)
WITH active_ranked AS (
    SELECT
        r.id,
        FIRST_VALUE(r.id) OVER (
            PARTITION BY r.law_firm_tenant_id, lower(r.name)
            ORDER BY (
                SELECT COUNT(*)::int FROM users u WHERE u.firm_staff_role_id = r.id
            ) DESC,
            r.created_at ASC
        ) AS survivor_id,
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
SELECT id AS duplicate_id, survivor_id
FROM active_ranked
WHERE rn > 1;

UPDATE users u
SET firm_staff_role_id = d.survivor_id
FROM _firm_staff_role_dupes d
WHERE u.firm_staff_role_id = d.duplicate_id;

UPDATE firm_staff_roles r
SET is_active = FALSE,
    updated_at = now()
FROM _firm_staff_role_dupes d
WHERE r.id = d.duplicate_id;

DROP INDEX IF EXISTS firm_staff_roles_tenant_name_uidx;

CREATE UNIQUE INDEX firm_staff_roles_tenant_name_uidx
    ON public.firm_staff_roles (law_firm_tenant_id, lower(name))
    NULLS NOT DISTINCT
    WHERE is_active = TRUE;

COMMIT;
