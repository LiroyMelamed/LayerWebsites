-- Expand subscription plan limits model + add signingfile retention markers (two-phase delete) + plan-at-signing snapshot.
-- Additive + idempotent.

BEGIN;

-- Expand subscription_plans with more explicit fields.
ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS price_monthly_cents integer NULL,
    ADD COLUMN IF NOT EXISTS price_currency text NULL,

    ADD COLUMN IF NOT EXISTS documents_retention_days_core integer NULL,
    ADD COLUMN IF NOT EXISTS documents_retention_days_pii integer NULL,

    ADD COLUMN IF NOT EXISTS users_quota integer NULL,

    -- Keep placeholders for future enforcement.
    ADD COLUMN IF NOT EXISTS cases_quota integer NULL,
    ADD COLUMN IF NOT EXISTS clients_quota integer NULL,
    ADD COLUMN IF NOT EXISTS documents_monthly_quota integer NULL,
    ADD COLUMN IF NOT EXISTS storage_gb_quota integer NULL,

    ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill new retention columns from legacy documents_retention_days.
UPDATE public.subscription_plans
SET documents_retention_days_core = COALESCE(documents_retention_days_core, documents_retention_days),
    documents_retention_days_pii  = COALESCE(documents_retention_days_pii, documents_retention_days)
WHERE documents_retention_days_core IS NULL OR documents_retention_days_pii IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_documents_retention_days_core_chk'
    ) THEN
        ALTER TABLE public.subscription_plans
            ADD CONSTRAINT subscription_plans_documents_retention_days_core_chk
            CHECK (documents_retention_days_core IS NULL OR documents_retention_days_core > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_documents_retention_days_pii_chk'
    ) THEN
        ALTER TABLE public.subscription_plans
            ADD CONSTRAINT subscription_plans_documents_retention_days_pii_chk
            CHECK (documents_retention_days_pii IS NULL OR documents_retention_days_pii > 0);
    END IF;
END $$;

-- Expand tenant_subscriptions timestamps (keep existing columns; add created_at).
ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Two-phase retention delete markers on signingfiles.
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS pendingdeleteatutc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS pendingdeletereason text NULL,

    -- Snapshot retention policy at signing time (for evidence).
    ADD COLUMN IF NOT EXISTS plan_key_at_signing text NULL,
    ADD COLUMN IF NOT EXISTS retention_days_core_at_signing integer NULL,
    ADD COLUMN IF NOT EXISTS retention_days_pii_at_signing integer NULL,
    ADD COLUMN IF NOT EXISTS retention_policy_hash_at_signing text NULL;

CREATE INDEX IF NOT EXISTS idx_signingfiles_pendingdeleteatutc
    ON public.signingfiles (pendingdeleteatutc);

-- Deletion warning scheduling placeholder (T-7 days, no messaging in this iteration).
CREATE TABLE IF NOT EXISTS public.signing_retention_warnings (
    warning_id uuid PRIMARY KEY,
    tenant_id integer NOT NULL,
    signingfileid integer NOT NULL,
    warn_at_utc timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'scheduled',
    sent_at_utc timestamptz NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT signing_retention_warnings_tenant_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE,

    CONSTRAINT signing_retention_warnings_signingfile_fkey
        FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_signing_retention_warnings_signingfile
    ON public.signing_retention_warnings (signingfileid);

CREATE INDEX IF NOT EXISTS idx_signing_retention_warnings_warn_at
    ON public.signing_retention_warnings (warn_at_utc);

COMMIT;
