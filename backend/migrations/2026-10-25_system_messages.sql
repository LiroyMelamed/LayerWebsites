BEGIN;

-- Platform subscription owners only. Case contacts, office WhatsApp connections
-- and billing consent never create rows in these tables.
CREATE TABLE IF NOT EXISTS public.central_system_message_consents (
    deployment_id text NOT NULL,
    office_key text NOT NULL,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    owner_user_id integer NOT NULL REFERENCES public.users(userid) ON DELETE RESTRICT,
    recipient text NOT NULL CHECK (recipient ~ '^\+[1-9][0-9]{7,14}$'),
    recipient_name text NOT NULL,
    opted_in boolean NOT NULL,
    consent_version text NOT NULL,
    captured_at timestamptz NOT NULL,
    proof_ref text NOT NULL,
    consent_event_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (deployment_id, office_key, owner_user_id),
    CHECK ((law_firm_tenant_id IS NULL AND office_key='dedicated') OR (law_firm_tenant_id IS NOT NULL AND office_key=law_firm_tenant_id::text))
);

CREATE TABLE IF NOT EXISTS public.central_system_message_outbox (
    id uuid PRIMARY KEY,
    deployment_id text NOT NULL,
    config_fingerprint text NOT NULL,
    office_key text NOT NULL,
    law_firm_tenant_id uuid REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT,
    owner_user_id integer NOT NULL REFERENCES public.users(userid) ON DELETE RESTRICT,
    recipient text NOT NULL CHECK (recipient ~ '^\+[1-9][0-9]{7,14}$'),
    event_family text NOT NULL CHECK (event_family IN ('consent','payment_received','subscription_update')),
    source_key text NOT NULL,
    semantic_hash text NOT NULL CHECK (semantic_hash ~ '^[a-f0-9]{64}$'),
    consent_event_id uuid,
    prepared jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','blocked','reconciliation','cancelled')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_id uuid,
    lease_until timestamptz,
    central_queue_id uuid,
    central_status text,
    last_code text,
    occurred_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deployment_id, office_key, event_family, source_key, recipient),
    CHECK ((law_firm_tenant_id IS NULL AND office_key='dedicated') OR (law_firm_tenant_id IS NOT NULL AND office_key=law_firm_tenant_id::text))
);
CREATE INDEX IF NOT EXISTS central_system_message_ready_idx
    ON public.central_system_message_outbox (deployment_id,next_attempt_at,created_at)
    WHERE status IN ('pending','sending');

CREATE OR REPLACE FUNCTION public.guard_central_system_message_event() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
    IF ROW(NEW.id,NEW.deployment_id,NEW.config_fingerprint,NEW.office_key,NEW.law_firm_tenant_id,NEW.owner_user_id,
        NEW.recipient,NEW.event_family,NEW.source_key,NEW.semantic_hash,NEW.consent_event_id,NEW.prepared,NEW.occurred_at,NEW.expires_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.deployment_id,OLD.config_fingerprint,OLD.office_key,OLD.law_firm_tenant_id,OLD.owner_user_id,
        OLD.recipient,OLD.event_family,OLD.source_key,OLD.semantic_hash,OLD.consent_event_id,OLD.prepared,OLD.occurred_at,OLD.expires_at) THEN
        RAISE EXCEPTION 'SYSTEM_MESSAGE_EVENT_IMMUTABLE';
    END IF;
    RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS central_system_message_event_immutable ON public.central_system_message_outbox;
CREATE TRIGGER central_system_message_event_immutable BEFORE UPDATE ON public.central_system_message_outbox
    FOR EACH ROW EXECUTE FUNCTION public.guard_central_system_message_event();

-- Follow the shared deployment's existing restrictive office boundary. Dedicated
-- databases do not install these functions and keep their existing role model.
DO $migration$
DECLARE tbl text; billing_owner text; permission record;
BEGIN
    -- Use the established billing data owner and its explicit app-role grants.
    -- Never make these private rows readable to PUBLIC, or make the runtime
    -- role the table owner (which the shared isolation readiness guard forbids).
    SELECT pg_get_userbyid(relowner) INTO billing_owner FROM pg_class WHERE oid='public.firm_billing'::regclass;
    FOREACH tbl IN ARRAY ARRAY['central_system_message_consents','central_system_message_outbox'] LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO %I',tbl,billing_owner);
        FOR permission IN SELECT pg_get_userbyid(a.grantee) AS role_name,a.privilege_type
            FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE c.oid='public.firm_billing'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner
            AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE') LOOP
            EXECUTE format('GRANT %s ON public.%I TO %I',permission.privilege_type,tbl,permission.role_name);
        END LOOP;
    END LOOP;
    IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
        FOREACH tbl IN ARRAY ARRAY['central_system_message_consents','central_system_message_outbox'] LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
            EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I',tbl);
            EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I',tbl);
            EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)',tbl);
            EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING (public.office_row_allowed(law_firm_tenant_id)) WITH CHECK (public.office_row_allowed(law_firm_tenant_id))',tbl);
            EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I',tbl);
            EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()',tbl);
        END LOOP;
    END IF;
END $migration$;
COMMIT;
