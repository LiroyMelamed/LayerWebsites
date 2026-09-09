-- Multi-tenant law firm platform (lawyer.mela-media.co.il).
-- Additive + idempotent. Legacy single-tenant DBs keep working (law_firm_tenant_id NULL).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.law_firm_tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    branding jsonb NOT NULL DEFAULT '{}'::jsonb,
    admin_phone text NULL,
    admin_email text NULL,
    practice_areas text[] NOT NULL DEFAULT '{}',
    lawyer_count integer NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT law_firm_tenants_slug_chk CHECK (
        slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS law_firm_tenants_slug_uidx
    ON public.law_firm_tenants (lower(slug));

CREATE TABLE IF NOT EXISTS public.signup_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    firm_name text NOT NULL,
    admin_name text NOT NULL,
    admin_phone text NOT NULL,
    admin_email text NULL,
    lawyer_count integer NULL,
    practice_areas text[] NOT NULL DEFAULT '{}',
    platform_id text NOT NULL DEFAULT 'site_app',
    resource_id text NOT NULL DEFAULT 'pro',
    signing_id text NOT NULL DEFAULT '500',
    billing_interval text NOT NULL DEFAULT 'monthly',
    price_monthly_ils numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending_payment',
    law_firm_tenant_id uuid NULL REFERENCES public.law_firm_tenants(id) ON DELETE SET NULL,
    payment_intent_id uuid NULL,
    error_message text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NULL,
    CONSTRAINT signup_intents_status_chk CHECK (
        status IN ('pending_payment', 'provisioning', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT signup_intents_billing_interval_chk CHECK (
        billing_interval IN ('monthly', 'yearly')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS signup_intents_slug_pending_uidx
    ON public.signup_intents (lower(slug))
    WHERE status IN ('pending_payment', 'provisioning');

CREATE INDEX IF NOT EXISTS signup_intents_status_idx
    ON public.signup_intents (status, created_at DESC);

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid NULL
    REFERENCES public.law_firm_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_law_firm_tenant_phone_idx
    ON public.users (law_firm_tenant_id, phonenumber)
    WHERE phonenumber IS NOT NULL;

ALTER TABLE public.firm_billing
    DROP CONSTRAINT IF EXISTS firm_billing_id_check;

ALTER TABLE public.firm_billing
    ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid NULL
    REFERENCES public.law_firm_tenants(id) ON DELETE CASCADE;

-- Allow multiple billing rows (one per tenant). Legacy singleton keeps id=1.
ALTER TABLE public.firm_billing
    DROP CONSTRAINT IF EXISTS firm_billing_pkey;

CREATE SEQUENCE IF NOT EXISTS firm_billing_id_seq;

SELECT setval(
    'firm_billing_id_seq',
    GREATEST(COALESCE((SELECT MAX(id) FROM public.firm_billing), 0), 1)
);

ALTER TABLE public.firm_billing
    ALTER COLUMN id SET DEFAULT nextval('firm_billing_id_seq');

ALTER TABLE public.firm_billing
    ADD CONSTRAINT firm_billing_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS firm_billing_legacy_singleton_uidx
    ON public.firm_billing (id)
    WHERE law_firm_tenant_id IS NULL AND id = 1;

CREATE UNIQUE INDEX IF NOT EXISTS firm_billing_law_firm_tenant_uidx
    ON public.firm_billing (law_firm_tenant_id)
    WHERE law_firm_tenant_id IS NOT NULL;

ALTER TABLE public.firm_payment_methods
    ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid NULL
    REFERENCES public.law_firm_tenants(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.firm_payment_methods_one_active;

CREATE UNIQUE INDEX IF NOT EXISTS firm_payment_methods_one_active_legacy
    ON public.firm_payment_methods (is_active)
    WHERE is_active = true AND law_firm_tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS firm_payment_methods_one_active_tenant
    ON public.firm_payment_methods (law_firm_tenant_id, is_active)
    WHERE is_active = true AND law_firm_tenant_id IS NOT NULL;

ALTER TABLE public.firm_payment_intents
    ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid NULL
    REFERENCES public.law_firm_tenants(id) ON DELETE SET NULL;

ALTER TABLE public.firm_payment_intents
    ADD COLUMN IF NOT EXISTS signup_intent_id uuid NULL
    REFERENCES public.signup_intents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.global_platform_masters (
    id serial PRIMARY KEY,
    userid integer NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT global_platform_masters_user_uidx UNIQUE (userid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.law_firm_tenants TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_intents TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_platform_masters TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE public.global_platform_masters_id_seq TO CURRENT_USER;

COMMIT;
