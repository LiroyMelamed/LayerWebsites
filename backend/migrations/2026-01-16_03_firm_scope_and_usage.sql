-- Firm-scoped plans/subscriptions + usage metering (additive, idempotent).

BEGIN;

-- Expand subscription_plans for additional cost drivers.
ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS otp_sms_monthly_quota integer NULL,
    ADD COLUMN IF NOT EXISTS evidence_generations_monthly_quota integer NULL,
    ADD COLUMN IF NOT EXISTS evidence_cpu_seconds_monthly_quota integer NULL;

-- Create firms + memberships.
CREATE TABLE IF NOT EXISTS public.firms (
    firmid serial PRIMARY KEY,
    firm_key text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.firm_users (
    firmid integer NOT NULL REFERENCES public.firms(firmid) ON DELETE CASCADE,
    userid integer NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (firmid, userid)
);

CREATE INDEX IF NOT EXISTS idx_firm_users_userid
    ON public.firm_users (userid);

-- Firm-scoped subscriptions.
CREATE TABLE IF NOT EXISTS public.firm_subscriptions (
    firmid integer PRIMARY KEY REFERENCES public.firms(firmid) ON DELETE CASCADE,
    plan_key text NOT NULL REFERENCES public.subscription_plans(plan_key),
    status text NOT NULL DEFAULT 'active',
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_subscriptions_status
    ON public.firm_subscriptions (status);

-- Temporary/explicit overrides (e.g., Unlimited until a date).
CREATE TABLE IF NOT EXISTS public.firm_plan_overrides (
    firmid integer PRIMARY KEY REFERENCES public.firms(firmid) ON DELETE CASCADE,
    unlimited_until_utc timestamptz NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Attach firm to signingfiles (nullable for backward compatibility).
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS firmid integer NULL REFERENCES public.firms(firmid) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unsignedpdfbytes bigint NULL,
    ADD COLUMN IF NOT EXISTS signedpdfbytes bigint NULL;

CREATE INDEX IF NOT EXISTS idx_signingfiles_firmid
    ON public.signingfiles (firmid);

-- Fine-grained usage events for monthly metering.
CREATE TABLE IF NOT EXISTS public.firm_usage_events (
    event_id uuid PRIMARY KEY,
    firmid integer NOT NULL REFERENCES public.firms(firmid) ON DELETE CASCADE,
    meter_key text NOT NULL,
    quantity numeric NOT NULL,
    unit text NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_firm_usage_events_firm_time
    ON public.firm_usage_events (firmid, occurred_at desc);

CREATE INDEX IF NOT EXISTS idx_firm_usage_events_meter
    ON public.firm_usage_events (meter_key);

-- Seed a deterministic default firm (single-firm-per-deployment default).
INSERT INTO public.firms (firm_key, name)
SELECT 'default', 'Default Firm'
WHERE NOT EXISTS (SELECT 1 FROM public.firms WHERE firm_key = 'default');

-- Backfill reasonable defaults for existing seeded plans (warn-only by default in app).
UPDATE public.subscription_plans
SET
    documents_monthly_quota = COALESCE(documents_monthly_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 100
            WHEN 'PRO' THEN 500
            ELSE NULL
        END
    ),
    storage_gb_quota = COALESCE(storage_gb_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 10
            WHEN 'PRO' THEN 100
            ELSE NULL
        END
    ),
    users_quota = COALESCE(users_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 3
            WHEN 'PRO' THEN 10
            ELSE NULL
        END
    ),
    otp_sms_monthly_quota = COALESCE(otp_sms_monthly_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 200
            WHEN 'PRO' THEN 2000
            ELSE NULL
        END
    ),
    evidence_generations_monthly_quota = COALESCE(evidence_generations_monthly_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 200
            WHEN 'PRO' THEN 2000
            ELSE NULL
        END
    ),
    evidence_cpu_seconds_monthly_quota = COALESCE(evidence_cpu_seconds_monthly_quota,
        CASE plan_key
            WHEN 'BASIC' THEN 600
            WHEN 'PRO' THEN 6000
            ELSE NULL
        END
    )
WHERE plan_key IN ('BASIC', 'PRO', 'ENTERPRISE');

COMMIT;
