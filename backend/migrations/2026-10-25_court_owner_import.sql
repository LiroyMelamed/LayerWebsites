BEGIN;

-- Owner-assisted QA exports are real files, not a portal/session/API grant.
CREATE TABLE IF NOT EXISTS public.court_import_documents (
    id uuid PRIMARY KEY,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    case_id integer REFERENCES public.cases(caseid) ON DELETE SET NULL,
    original_case_id integer NOT NULL,
    court_number text NOT NULL,
    title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
    issued_on date NOT NULL,
    filename text NOT NULL,
    sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
    page_count integer NOT NULL CHECK(page_count BETWEEN 1 AND 50),
    pdf_bytes bytea NOT NULL CHECK(octet_length(pdf_bytes) BETWEEN 1 AND 5242880),
    imported_by integer NOT NULL REFERENCES public.users(userid) ON DELETE RESTRICT,
    source_attestation text NOT NULL DEFAULT 'owner-export-v1' CHECK(source_attestation='owner-export-v1'),
    update_id uuid NOT NULL UNIQUE,
    imported_at timestamptz NOT NULL DEFAULT now(),
    CHECK(case_id IS NULL OR case_id=original_case_id),
    UNIQUE NULLS NOT DISTINCT(law_firm_tenant_id,original_case_id,court_number,sha256)
);
CREATE TABLE IF NOT EXISTS public.court_import_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id uuid NOT NULL,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES public.court_import_documents(id) ON DELETE RESTRICT,
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    actor_user_id integer NOT NULL REFERENCES public.users(userid) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT(law_firm_tenant_id,action_id)
);
ALTER TABLE public.court_updates ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'demo';
ALTER TABLE public.court_updates ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.court_import_documents(id) ON DELETE RESTRICT;
ALTER TABLE public.court_updates DROP CONSTRAINT IF EXISTS court_updates_is_demo_check;
DO $migration$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.court_updates'::regclass AND conname='court_update_source_guard') THEN
        ALTER TABLE public.court_updates ADD CONSTRAINT court_update_source_guard CHECK
            ((is_demo AND source_kind='demo' AND document_id IS NULL) OR
             (NOT is_demo AND source_kind='owner_file' AND document_id IS NOT NULL));
    END IF;
END $migration$;

CREATE OR REPLACE FUNCTION public.guard_court_import_snapshot() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF to_jsonb(NEW)-'case_id' IS DISTINCT FROM to_jsonb(OLD)-'case_id' THEN
        RAISE EXCEPTION 'Court import snapshot is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS court_import_snapshot_guard ON public.court_import_documents;
CREATE TRIGGER court_import_snapshot_guard BEFORE UPDATE ON public.court_import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_court_import_snapshot();
CREATE OR REPLACE FUNCTION public.guard_court_import_action_snapshot() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'Court import action is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS court_import_action_snapshot_guard ON public.court_import_actions;
CREATE TRIGGER court_import_action_snapshot_guard BEFORE UPDATE ON public.court_import_actions FOR EACH ROW EXECUTE FUNCTION public.guard_court_import_action_snapshot();

CREATE OR REPLACE FUNCTION public.guard_court_owner_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source public.court_import_documents;
BEGIN
    IF TG_OP='UPDATE' AND OLD.source_kind='owner_file' AND to_jsonb(NEW)-'case_id' IS DISTINCT FROM to_jsonb(OLD)-'case_id' THEN
        RAISE EXCEPTION 'Court import update is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.source_kind='owner_file' THEN
        SELECT * INTO source FROM public.court_import_documents WHERE id=NEW.document_id;
        IF NOT FOUND OR source.law_firm_tenant_id IS DISTINCT FROM NEW.law_firm_tenant_id OR
            source.court_number IS DISTINCT FROM NEW.court_number OR source.update_id IS DISTINCT FROM NEW.id OR
            NEW.source_id IS DISTINCT FROM 'owner-file:'||source.id::text OR NEW.is_demo OR
            (NEW.case_id IS NOT NULL AND NEW.case_id IS DISTINCT FROM source.original_case_id) THEN
            RAISE EXCEPTION 'Court import source mismatch' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS court_owner_update_guard ON public.court_updates;
CREATE TRIGGER court_owner_update_guard BEFORE INSERT OR UPDATE ON public.court_updates FOR EACH ROW EXECUTE FUNCTION public.guard_court_owner_update();

DO $migration$
DECLARE tbl text; baseline_owner text; grant_row record;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO baseline_owner FROM pg_class WHERE oid='public.court_updates'::regclass;
    FOREACH tbl IN ARRAY ARRAY['court_import_documents','court_import_actions'] LOOP
        IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()',tbl);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
            EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I',tbl);
            EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I',tbl);
            EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING(true) WITH CHECK(true)',tbl);
            EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING(public.office_row_allowed(law_firm_tenant_id)) WITH CHECK(public.office_row_allowed(law_firm_tenant_id))',tbl);
            EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I',tbl);
            EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()',tbl);
        END IF;
        FOR grant_row IN SELECT pg_get_userbyid(a.grantee) role_name,a.privilege_type FROM pg_class c,
            LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.court_updates'::regclass
            AND a.grantee<>0 AND a.privilege_type IN('SELECT','INSERT','UPDATE','DELETE') LOOP
            EXECUTE format('GRANT %s ON public.%I TO %I',grant_row.privilege_type,tbl,grant_row.role_name);
        END LOOP;
        EXECUTE format('ALTER TABLE public.%I OWNER TO %I',tbl,baseline_owner);
    END LOOP;
    IF to_regprocedure('public.guard_office_reference()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS court_document_case_scope ON public.court_import_documents;
        CREATE TRIGGER court_document_case_scope BEFORE INSERT OR UPDATE ON public.court_import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('cases','case_id','caseid');
        DROP TRIGGER IF EXISTS court_action_document_scope ON public.court_import_actions;
        CREATE TRIGGER court_action_document_scope BEFORE INSERT OR UPDATE ON public.court_import_actions FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('court_import_documents','document_id','id');
        DROP TRIGGER IF EXISTS court_document_actor_scope ON public.court_import_documents;
        CREATE TRIGGER court_document_actor_scope BEFORE INSERT OR UPDATE ON public.court_import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('users','imported_by','userid');
        DROP TRIGGER IF EXISTS court_action_actor_scope ON public.court_import_actions;
        CREATE TRIGGER court_action_actor_scope BEFORE INSERT OR UPDATE ON public.court_import_actions FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('users','actor_user_id','userid');
    END IF;
END $migration$;
COMMIT;
