-- Additive; rules bind stable description identities, never mutable stage numbers.
BEGIN;
CREATE TABLE IF NOT EXISTS signing_case_stage_rules (
 id uuid PRIMARY KEY,
 owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
 case_id integer NOT NULL REFERENCES cases(caseid),
 description_id integer NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 enabled boolean NOT NULL DEFAULT true,
 configured_by integer NOT NULL REFERENCES users(userid),
 template_version_id uuid NOT NULL,
 template_name text NOT NULL,
 template_metadata jsonb NOT NULL,
 input jsonb NOT NULL,
 preview_hash text NOT NULL,
 contact_hash text NOT NULL,
 case_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_context_id,id),
 UNIQUE(owner_context_id,case_id,description_id),
 FOREIGN KEY(owner_context_id,template_version_id) REFERENCES signing_template_versions(owner_context_id,id)
);
CREATE TABLE IF NOT EXISTS signing_case_stage_runs (
 id uuid PRIMARY KEY,
 owner_context_id uuid NOT NULL,
 rule_id uuid NOT NULL,
 case_id integer NOT NULL REFERENCES cases(caseid),
 description_id integer NOT NULL,
 stage_title text NOT NULL,
 rule_version integer NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 configured_by integer NOT NULL REFERENCES users(userid),
 transition_by integer NOT NULL REFERENCES users(userid),
 input jsonb NOT NULL,
 preview_hash text NOT NULL,
 contact_hash text NOT NULL,
 case_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','created','blocked','cancelled')),
 error_code text,
 submission_id uuid REFERENCES signing_submissions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_context_id,id),
 -- Once per rule for the entire case, including backward/reentry and rule edits.
 UNIQUE(owner_context_id,rule_id),
 FOREIGN KEY(owner_context_id,rule_id) REFERENCES signing_case_stage_rules(owner_context_id,id),
 CHECK ((status='created')=(submission_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signing_case_stage_queue ON signing_case_stage_runs(created_at,id) WHERE status='queued';
CREATE INDEX IF NOT EXISTS signing_case_stage_case ON signing_case_stage_runs(owner_context_id,case_id,created_at DESC);
ALTER TABLE signing_error_alerts ADD COLUMN IF NOT EXISTS stage_run_id uuid REFERENCES signing_case_stage_runs(id);
ALTER TABLE signing_error_alerts ADD COLUMN IF NOT EXISTS case_id integer REFERENCES cases(caseid);
-- Existing dedicated databases keep their current behavior. When explicit
-- shared-office isolation is already installed, new tables must be protected
-- before the next application startup. Ownership comes only from their context.
DO $isolation$
DECLARE t text; fk record; trigger_name text; args text; i integer;
        previous_mode text; previous_id text; predicate text; invalid_reference boolean;
BEGIN
 IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
  previous_mode:=current_setting('app.office_mode',true);
  previous_id:=current_setting('app.office_id',true);
  PERFORM set_config('app.office_mode','system',true),set_config('app.office_id','',true);
  FOREACH t IN ARRAY ARRAY['signing_case_stage_rules','signing_case_stage_runs',
      'signing_word_sources','signing_word_source_versions','signing_word_previews'] LOOP
   IF to_regclass(format('public.%I',t)) IS NULL THEN CONTINUE; END IF;
   EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid',t);
   -- These two incumbent triggers reject every UPDATE. Only this privileged,
   -- transactional ownership-column backfill temporarily suspends their named
   -- guard; all original immutable payload fields remain byte-identical.
   IF t='signing_word_source_versions' THEN
    ALTER TABLE public.signing_word_source_versions DISABLE TRIGGER signing_word_versions_immutable;
   ELSIF t='signing_word_previews' THEN
    ALTER TABLE public.signing_word_previews DISABLE TRIGGER signing_word_previews_immutable;
   END IF;
   EXECUTE format('UPDATE public.%I child SET law_firm_tenant_id=context.law_firm_tenant_id FROM public.signing_owner_contexts context WHERE child.owner_context_id=context.id AND child.law_firm_tenant_id IS DISTINCT FROM context.law_firm_tenant_id',t);
   IF t='signing_word_source_versions' THEN
    ALTER TABLE public.signing_word_source_versions ENABLE TRIGGER signing_word_versions_immutable;
   ELSIF t='signing_word_previews' THEN
    ALTER TABLE public.signing_word_previews ENABLE TRIGGER signing_word_previews_immutable;
   END IF;
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()',t);
   EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(law_firm_tenant_id)','office_scope_'||t,t);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I',t);
   EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I',t);
   EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING(true) WITH CHECK(true)',t);
   EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING(public.office_row_allowed(law_firm_tenant_id)) WITH CHECK(public.office_row_allowed(law_firm_tenant_id))',t);
   EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I',t);
   EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()',t);
  END LOOP;
  -- RLS does not validate parent references. Match the incumbent installer for
  -- every office FK, including composite context/version references.
  FOR fk IN SELECT child.relname AS child,parent.relname AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=parent.oid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns
      FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid
      JOIN pg_namespace n ON n.oid=child.relnamespace
      WHERE c.contype='f' AND n.nspname='public' AND child.relname IN
        ('signing_case_stage_rules','signing_case_stage_runs','signing_word_sources','signing_word_source_versions','signing_word_previews','signing_error_alerts')
  LOOP
   IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=fk.parent AND column_name='law_firm_tenant_id') THEN CONTINUE; END IF;
   predicate:='';
   FOR i IN 1..array_length(fk.columns,1) LOOP
    predicate:=predicate||CASE WHEN predicate='' THEN '' ELSE ' AND ' END||format('child.%I=parent.%I',fk.columns[i],fk.parent_columns[i]);
   END LOOP;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I child JOIN public.%I parent ON %s WHERE child.law_firm_tenant_id IS DISTINCT FROM parent.law_firm_tenant_id)',fk.child,fk.parent,predicate) INTO invalid_reference;
   IF invalid_reference THEN RAISE EXCEPTION 'OFFICE_REFERENCE_MAPPING_REQUIRES_REVIEW:%:%',fk.child,fk.parent USING ERRCODE='42501'; END IF;
   trigger_name:='office_ref_'||substr(md5(fk.child||':'||fk.parent||':'||array_to_string(fk.columns,',')),1,24);
   args:=quote_literal(fk.parent);
   FOR i IN 1..array_length(fk.columns,1) LOOP
    args:=args||','||quote_literal(fk.columns[i])||','||quote_literal(fk.parent_columns[i]);
   END LOOP;
   EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',trigger_name,fk.child);
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference(%s)',trigger_name,fk.child,args);
  END LOOP;
  PERFORM set_config('app.office_mode',COALESCE(previous_mode,''),true),set_config('app.office_id',COALESCE(previous_id,''),true);
 END IF;
END $isolation$;

-- Preserve the incumbent runtime/migration-owner split. Only existing
-- application writers receive the new DML rights; audit rows are not deletable.
DO $$ DECLARE r record; t text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
     WHERE table_schema=current_schema() AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee<>'PUBLIC'
 LOOP
  FOREACH t IN ARRAY ARRAY['signing_case_stage_rules','signing_case_stage_runs'] LOOP
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE %I.%I TO %I',current_schema(),t,r.grantee);
  END LOOP;
 END LOOP;
END $$;
COMMIT;
