-- Platform-owned subscription plans + tenant subscriptions + retention run tracking (documents only)
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    plan_key text PRIMARY KEY,
    name text NOT NULL,
    documents_retention_days integer NOT NULL,

    -- Future placeholders (not enforced in this iteration)
    cases_quota integer NULL,
    clients_quota integer NULL,
    storage_gb_quota integer NULL,
    documents_monthly_quota integer NULL,

    feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT subscription_plans_documents_retention_days_chk CHECK (documents_retention_days > 0)
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    -- In this codebase, tenant is derived from signingfiles.lawyerid (a users.userid).
    tenant_id integer PRIMARY KEY,
    plan_key text NOT NULL REFERENCES public.subscription_plans(plan_key),
    status text NOT NULL DEFAULT 'active',
    starts_at timestamptz NULL,
    ends_at timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_subscriptions_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.tenant_subscriptions
            ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_key
    ON public.tenant_subscriptions (plan_key);

-- Seed the 3 platform-owned plans.
-- Values can be changed later via a migration (or platform admin tooling).
INSERT INTO public.subscription_plans (plan_key, name, documents_retention_days, feature_flags)
VALUES
    ('BASIC', 'Basic', 60, '{}'::jsonb),
    ('PRO', 'Pro', 180, '{}'::jsonb),
    ('ENTERPRISE', 'Enterprise', 365, '{}'::jsonb)
ON CONFLICT (plan_key) DO UPDATE
SET name = EXCLUDED.name,
    documents_retention_days = EXCLUDED.documents_retention_days,
    updated_at = now();

-- Retention run audit trail (for both dry-run and execute).
CREATE TABLE IF NOT EXISTS public.data_retention_runs (
    run_id uuid PRIMARY KEY,
    tenant_id integer NULL,
    plan_key text NULL,
    dry_run boolean NOT NULL,

    started_at timestamptz NOT NULL,
    finished_at timestamptz NULL,

    summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    deleted_counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    errors_json jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_data_retention_runs_started_at
    ON public.data_retention_runs (started_at DESC);

COMMIT;
