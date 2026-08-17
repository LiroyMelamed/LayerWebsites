-- Firm-level SaaS billing (MelaMedia charges the law firm via Takbull).
-- One row per database (one firm). Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.firm_billing (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    platform_id text NOT NULL DEFAULT 'site_app',
    resource_id text NOT NULL DEFAULT 'pro',
    signing_id text NOT NULL DEFAULT '500',
    price_monthly_ils numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'complimentary',
    billing_enabled boolean NOT NULL DEFAULT true,
    complimentary_until timestamptz NULL,
    renews_at timestamptz NULL,
    grace_until timestamptz NULL,
    last_payment_error text NULL,
    last_failed_at timestamptz NULL,
    last_paid_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT firm_billing_status_chk CHECK (
        status IN ('complimentary', 'active', 'past_due', 'suspended')
    )
);

CREATE TABLE IF NOT EXISTS public.firm_payment_methods (
    id serial PRIMARY KEY,
    provider text NOT NULL DEFAULT 'takbull',
    token_encrypted text NOT NULL,
    last4 text NULL,
    exp_month text NULL,
    exp_year text NULL,
    card_brand text NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS firm_payment_methods_one_active
    ON public.firm_payment_methods (is_active)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.firm_payment_intents (
    id uuid PRIMARY KEY,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    amount_ils numeric(12,2) NOT NULL,
    currency text NOT NULL DEFAULT 'ILS',
    order_reference text NOT NULL,
    takbull_uniq_id text NULL,
    takbull_transaction_id text NULL,
    purpose text NULL,
    error_message text NULL,
    package_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz NULL,
    CONSTRAINT firm_payment_intents_status_chk CHECK (
        status IN ('pending', 'succeeded', 'failed', 'cancelled')
    ),
    CONSTRAINT firm_payment_intents_kind_chk CHECK (
        kind IN ('setup', 'renewal', 'upgrade', 'retry')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS firm_payment_intents_order_reference_uidx
    ON public.firm_payment_intents (order_reference);

CREATE INDEX IF NOT EXISTS firm_payment_intents_uniq_id_idx
    ON public.firm_payment_intents (takbull_uniq_id);

CREATE TABLE IF NOT EXISTS public.firm_payment_events (
    id serial PRIMARY KEY,
    intent_id uuid NULL REFERENCES public.firm_payment_intents(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firm_payment_events_intent_idx
    ON public.firm_payment_events (intent_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_billing TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_payment_methods TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_payment_intents TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_payment_events TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE public.firm_payment_methods_id_seq TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE public.firm_payment_events_id_seq TO CURRENT_USER;

DO $$
DECLARE
    role_name TEXT;
    tbl TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY[
        'liroym', 'neondb_owner', 'morlevy_app', 'ashrafessa_app',
        'melamedlaw_app', 'melamedia_app', 'idm_app'
    ]
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;
        FOREACH tbl IN ARRAY ARRAY[
            'firm_billing', 'firm_payment_methods', 'firm_payment_intents', 'firm_payment_events'
        ]
        LOOP
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
                tbl, role_name
            );
        END LOOP;
        BEGIN
            EXECUTE format(
                'GRANT USAGE, SELECT ON SEQUENCE public.firm_payment_methods_id_seq TO %I',
                role_name
            );
        EXCEPTION WHEN undefined_table THEN NULL;
        END;
        BEGIN
            EXECUTE format(
                'GRANT USAGE, SELECT ON SEQUENCE public.firm_payment_events_id_seq TO %I',
                role_name
            );
        EXCEPTION WHEN undefined_table THEN NULL;
        END;
    END LOOP;
END $$;

COMMIT;
