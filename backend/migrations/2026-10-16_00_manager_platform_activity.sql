BEGIN;

-- New creations only: past ownership is not reliable evidence of authorship.
CREATE TABLE IF NOT EXISTS public.manager_platform_activity (
    id bigserial PRIMARY KEY,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    actor_id integer NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
    caseid integer REFERENCES public.cases(caseid) ON DELETE SET NULL,
    kind text NOT NULL CHECK (kind IN ('case_open','calendar')),
    activity_key text NOT NULL CHECK (activity_key ~ '^(case|calendar):[0-9]+$'),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(actor_id,kind,activity_key)
);
CREATE INDEX IF NOT EXISTS manager_platform_activity_period
    ON public.manager_platform_activity(law_firm_tenant_id,occurred_at);

DO $migration$
BEGIN
    IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
        ALTER TABLE public.manager_platform_activity ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id();
        ALTER TABLE public.manager_platform_activity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.manager_platform_activity FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS office_access ON public.manager_platform_activity;
        DROP POLICY IF EXISTS office_boundary ON public.manager_platform_activity;
        CREATE POLICY office_access ON public.manager_platform_activity AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
        CREATE POLICY office_boundary ON public.manager_platform_activity AS RESTRICTIVE FOR ALL
            USING (public.office_row_allowed(law_firm_tenant_id)) WITH CHECK (public.office_row_allowed(law_firm_tenant_id));
        DROP TRIGGER IF EXISTS office_owner_guard ON public.manager_platform_activity;
        CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.manager_platform_activity
            FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner();
        DROP TRIGGER IF EXISTS platform_activity_case_scope ON public.manager_platform_activity;
        CREATE TRIGGER platform_activity_case_scope BEFORE INSERT OR UPDATE ON public.manager_platform_activity
            FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('cases','caseid','caseid');
        DROP TRIGGER IF EXISTS platform_activity_actor_scope ON public.manager_platform_activity;
        CREATE TRIGGER platform_activity_actor_scope BEFORE INSERT OR UPDATE ON public.manager_platform_activity
            FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('users','actor_id','userid');
    END IF;
END $migration$;

DO $grants$
DECLARE app_role record;
BEGIN
    FOR app_role IN SELECT rolname,oid FROM pg_roles WHERE NOT rolsuper AND rolname !~ '^pg_' LOOP
        IF has_table_privilege(app_role.oid,'public.cases','SELECT') THEN
            EXECUTE format('GRANT SELECT ON public.manager_platform_activity TO %I',app_role.rolname);
        END IF;
        IF has_table_privilege(app_role.oid,'public.cases','INSERT')
            OR has_table_privilege(app_role.oid,'public.calendar_events','INSERT') THEN
            EXECUTE format('GRANT INSERT ON public.manager_platform_activity TO %I',app_role.rolname);
            EXECUTE format('GRANT USAGE ON SEQUENCE public.manager_platform_activity_id_seq TO %I',app_role.rolname);
        END IF;
    END LOOP;
END $grants$;
COMMIT;
