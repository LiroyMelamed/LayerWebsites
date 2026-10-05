-- Custom firm staff roles (platform admin per law_firm_tenant).
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.firm_staff_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid NULL REFERENCES public.law_firm_tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS firm_staff_roles_tenant_name_uidx
    ON public.firm_staff_roles (law_firm_tenant_id, lower(name))
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS firm_staff_roles_tenant_idx
    ON public.firm_staff_roles (law_firm_tenant_id);

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS firm_staff_role_id uuid NULL
    REFERENCES public.firm_staff_roles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS users_firm_staff_role_idx
    ON public.users (firm_staff_role_id)
    WHERE firm_staff_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_tenant_firm_staff_role_idx
    ON public.users (law_firm_tenant_id, firm_staff_role_id)
    WHERE firm_staff_role_id IS NOT NULL;

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app', 'ashrafessa_app', 'melamedlaw_app', 'melamedia_app', 'idm_app', 'lawyer_app']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.firm_staff_roles TO %I',
                role_name
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
