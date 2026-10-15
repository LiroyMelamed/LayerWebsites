BEGIN;

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS integration_demo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.office_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    provider text NOT NULL CHECK (provider IN ('court_demo', 'whatsapp')),
    enabled boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'disconnected',
    settings jsonb NOT NULL DEFAULT '{}',
    secret_ciphertext text,
    phone_number_id text,
    waba_id text,
    display_phone text,
    token_expires_at timestamptz,
    last_checked_at timestamptz,
    last_synced_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (law_firm_tenant_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS office_integrations_phone_unique ON public.office_integrations(phone_number_id) WHERE phone_number_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.integration_signup_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    user_id integer NOT NULL,
    state_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.court_case_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    case_id integer NOT NULL REFERENCES public.cases(caseid) ON DELETE CASCADE,
    court_number text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (law_firm_tenant_id, court_number)
);
CREATE TABLE IF NOT EXISTS public.court_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    source_id text NOT NULL,
    court_number text NOT NULL,
    case_id integer REFERENCES public.cases(caseid) ON DELETE SET NULL,
    title text NOT NULL,
    body text NOT NULL,
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    is_demo boolean NOT NULL DEFAULT true CHECK (is_demo),
    UNIQUE NULLS NOT DISTINCT (law_firm_tenant_id, source_id)
);

CREATE TABLE IF NOT EXISTS public.case_whatsapp_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    case_id integer NOT NULL REFERENCES public.cases(caseid) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES public.office_integrations(id) ON DELETE RESTRICT,
    mode text NOT NULL CHECK (mode IN ('demo', 'live')),
    status text NOT NULL DEFAULT 'queued',
    subject text NOT NULL,
    recipients jsonb NOT NULL DEFAULT '[]',
    template_name text,
    template_language text,
    template_parameters jsonb NOT NULL DEFAULT '[]',
    group_id text,
    invite_link text,
    request_id text,
    phone_number_id text,
    waba_id text,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (case_id)
);
CREATE INDEX IF NOT EXISTS case_whatsapp_groups_pending ON public.case_whatsapp_groups(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS case_whatsapp_groups_remote_unique ON public.case_whatsapp_groups(group_id) WHERE group_id IS NOT NULL;

-- An already isolated shared database must protect new tables before the app starts.
-- Dedicated databases keep their existing isolation model. The normal installer also
-- knows these tables and will protect them when a dedicated database becomes shared.
DO $migration$
DECLARE tbl text;
BEGIN
  IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
    FOREACH tbl IN ARRAY ARRAY['office_integrations','integration_signup_sessions','court_case_links','court_updates','case_whatsapp_groups'] LOOP
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I', tbl);
      EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)', tbl);
      EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING (public.office_row_allowed(law_firm_tenant_id)) WITH CHECK (public.office_row_allowed(law_firm_tenant_id))', tbl);
      EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY ARRAY['court_case_links','court_updates','case_whatsapp_groups'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS integration_case_scope ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER integration_case_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference(''cases'',''case_id'',''caseid'')', tbl);
    END LOOP;
    DROP TRIGGER IF EXISTS integration_connection_scope ON public.case_whatsapp_groups;
    CREATE TRIGGER integration_connection_scope BEFORE INSERT OR UPDATE ON public.case_whatsapp_groups FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('office_integrations','connection_id','id');
  END IF;
END $migration$;
COMMIT;
