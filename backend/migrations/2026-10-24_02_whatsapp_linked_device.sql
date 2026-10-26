BEGIN;

-- A queued operation is bound to the device generation that authorized it.
-- Reconnecting a device never reauthorizes a previous operation implicitly.
ALTER TABLE public.case_whatsapp_groups ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'meta';
ALTER TABLE public.case_whatsapp_groups ADD COLUMN IF NOT EXISTS session_name text;
ALTER TABLE public.case_whatsapp_groups ADD COLUMN IF NOT EXISTS connection_generation text;
ALTER TABLE public.case_whatsapp_groups ADD COLUMN IF NOT EXISTS is_pilot boolean NOT NULL DEFAULT false;
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.case_whatsapp_groups'::regclass AND conname='case_whatsapp_groups_gateway_valid') THEN
  ALTER TABLE public.case_whatsapp_groups ADD CONSTRAINT case_whatsapp_groups_gateway_valid CHECK(gateway IN ('meta','waha'));
 END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS public.whatsapp_contact_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),
 allowed boolean NOT NULL,
 evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 5 AND 300),
 actor_user_id integer REFERENCES public.users(userid) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN ('staff','inbound_optout')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE NULLS NOT DISTINCT(law_firm_tenant_id,phone)
);

-- Only delivery identifiers and a digest are retained; chat content is discarded.
-- The signed event window is ten minutes. Dedupe rows are retained one day and
-- pruned in bounded batches on event ingestion, so pruning cannot permit replay.
CREATE TABLE IF NOT EXISTS public.whatsapp_linked_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
 connection_id uuid NOT NULL REFERENCES public.office_integrations(id) ON DELETE CASCADE,
 event_id text NOT NULL CHECK(char_length(event_id) BETWEEN 4 AND 128),
 session_name text NOT NULL CHECK(session_name ~ '^off_[a-f0-9]{32}_[a-f0-9]{16}$'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 event_timestamp timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(connection_id,event_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_linked_webhook_expiry ON public.whatsapp_linked_webhook_events(received_at);

DO $migration$
DECLARE tbl text;
BEGIN
 IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
  FOREACH tbl IN ARRAY ARRAY['whatsapp_contact_permissions','whatsapp_linked_webhook_events'] LOOP
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()',tbl);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
   EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I',tbl);
   EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I',tbl);
   EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING(true) WITH CHECK(true)',tbl);
   EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING(public.office_row_allowed(law_firm_tenant_id)) WITH CHECK(public.office_row_allowed(law_firm_tenant_id))',tbl);
   EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()',tbl);
  END LOOP;
  DROP TRIGGER IF EXISTS whatsapp_permission_actor_scope ON public.whatsapp_contact_permissions;
  CREATE TRIGGER whatsapp_permission_actor_scope BEFORE INSERT OR UPDATE ON public.whatsapp_contact_permissions FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('users','actor_user_id','userid');
  DROP TRIGGER IF EXISTS whatsapp_linked_event_connection_scope ON public.whatsapp_linked_webhook_events;
  CREATE TRIGGER whatsapp_linked_event_connection_scope BEFORE INSERT OR UPDATE ON public.whatsapp_linked_webhook_events FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('office_integrations','connection_id','id');
 END IF;
END $migration$;

-- Existing application writers get only the rights needed by this integration.
DO $migration$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='office_integrations' AND privilege_type='UPDATE' AND grantee<>'PUBLIC'
 LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_contact_permissions TO %I',r.grantee);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON TABLE public.whatsapp_linked_webhook_events TO %I',r.grantee);
 END LOOP;
END $migration$;
COMMIT;
