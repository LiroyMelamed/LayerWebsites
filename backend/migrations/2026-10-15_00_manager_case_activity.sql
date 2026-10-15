BEGIN;

-- A durable scoring record: stage rows are mutable and cannot reliably identify
-- historical actors. Deliberately do not backfill points from those rows.
CREATE TABLE IF NOT EXISTS public.manager_case_activity (
    id bigserial PRIMARY KEY,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    caseid integer NOT NULL REFERENCES public.cases(caseid) ON DELETE CASCADE,
    actor_id integer NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('update','close')),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS manager_case_activity_period ON public.manager_case_activity(law_firm_tenant_id, occurred_at);

CREATE OR REPLACE FUNCTION public.record_manager_case_activity() RETURNS trigger
LANGUAGE plpgsql AS $body$
DECLARE actor integer; owner_id uuid; event_kind text;
BEGIN
    IF TG_TABLE_NAME = 'casedescriptions' THEN
        IF NEW.timestamp IS NULL OR NEW.updated_by_userid IS NULL THEN RETURN NEW; END IF;
        -- Updating an unchanged stage can overwrite updated_by_userid in legacy
        -- endpoints. That must not move credit or create a new scoring event.
        IF TG_OP = 'UPDATE' THEN
            IF ROW(NEW.stage, NEW.text, NEW.timestamp) IS NOT DISTINCT FROM ROW(OLD.stage, OLD.text, OLD.timestamp) THEN RETURN NEW; END IF;
        END IF;
        actor := NEW.updated_by_userid;
        event_kind := 'update';
        SELECT (to_jsonb(c)->>'law_firm_tenant_id')::uuid INTO owner_id FROM public.cases c WHERE c.caseid=NEW.caseid;
    ELSE
        IF NEW.isclosed IS NOT TRUE OR OLD.isclosed IS TRUE OR NEW.closed_by_userid IS NULL THEN RETURN NEW; END IF;
        actor := NEW.closed_by_userid;
        event_kind := 'close';
        owner_id := (to_jsonb(NEW)->>'law_firm_tenant_id')::uuid;
    END IF;
    -- Never attribute a customer's or cross-office user's action to the team.
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.userid=actor AND u.role IN ('Admin','Lawyer')
        AND (to_jsonb(u)->>'law_firm_tenant_id')::uuid IS NOT DISTINCT FROM owner_id) THEN RETURN NEW; END IF;
    INSERT INTO public.manager_case_activity(law_firm_tenant_id,caseid,actor_id,kind)
        VALUES(owner_id,NEW.caseid,actor,event_kind);
    RETURN NEW;
END $body$;

DROP TRIGGER IF EXISTS manager_activity_stage ON public.casedescriptions;
CREATE TRIGGER manager_activity_stage AFTER INSERT OR UPDATE ON public.casedescriptions
    FOR EACH ROW EXECUTE FUNCTION public.record_manager_case_activity();
DROP TRIGGER IF EXISTS manager_activity_close ON public.cases;
CREATE TRIGGER manager_activity_close AFTER UPDATE OF isclosed ON public.cases
    FOR EACH ROW EXECUTE FUNCTION public.record_manager_case_activity();

DO $migration$
BEGIN
    IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
        ALTER TABLE public.manager_case_activity ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id();
        ALTER TABLE public.manager_case_activity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.manager_case_activity FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS office_access ON public.manager_case_activity;
        DROP POLICY IF EXISTS office_boundary ON public.manager_case_activity;
        CREATE POLICY office_access ON public.manager_case_activity AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
        CREATE POLICY office_boundary ON public.manager_case_activity AS RESTRICTIVE FOR ALL
            USING (public.office_row_allowed(law_firm_tenant_id)) WITH CHECK (public.office_row_allowed(law_firm_tenant_id));
        DROP TRIGGER IF EXISTS office_owner_guard ON public.manager_case_activity;
        CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.manager_case_activity FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner();
        DROP TRIGGER IF EXISTS manager_activity_case_scope ON public.manager_case_activity;
        CREATE TRIGGER manager_activity_case_scope BEFORE INSERT OR UPDATE ON public.manager_case_activity
            FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('cases','caseid','caseid');
        DROP TRIGGER IF EXISTS manager_activity_actor_scope ON public.manager_case_activity;
        CREATE TRIGGER manager_activity_actor_scope BEFORE INSERT OR UPDATE ON public.manager_case_activity
            FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('users','actor_id','userid');
    END IF;
END $migration$;

-- Keep existing application roles working when migrations are applied by an
-- administrator. The trigger is SECURITY INVOKER and needs only INSERT rights.
DO $grants$
DECLARE app_role record;
BEGIN
    FOR app_role IN SELECT rolname,oid FROM pg_roles WHERE NOT rolsuper AND rolname !~ '^pg_' LOOP
        IF has_table_privilege(app_role.oid,'public.cases','SELECT') THEN
            EXECUTE format('GRANT SELECT ON public.manager_case_activity TO %I',app_role.rolname);
        END IF;
        IF has_table_privilege(app_role.oid,'public.cases','UPDATE')
            OR has_table_privilege(app_role.oid,'public.casedescriptions','INSERT') THEN
            EXECUTE format('GRANT INSERT ON public.manager_case_activity TO %I',app_role.rolname);
            EXECUTE format('GRANT USAGE ON SEQUENCE public.manager_case_activity_id_seq TO %I',app_role.rolname);
        END IF;
    END LOOP;
END $grants$;
COMMIT;
