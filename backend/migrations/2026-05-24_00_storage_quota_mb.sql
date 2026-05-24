-- Storage quotas: GB -> MB (finer granularity). Idempotent.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_plans'
          AND column_name = 'storage_gb_quota'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_plans'
          AND column_name = 'storage_mb_quota'
    ) THEN
        ALTER TABLE public.subscription_plans
            RENAME COLUMN storage_gb_quota TO storage_mb_quota;

        UPDATE public.subscription_plans
        SET storage_mb_quota = storage_mb_quota * 1024
        WHERE storage_mb_quota IS NOT NULL;
    END IF;
END $$;

-- Seed defaults in MB (100 MB / 500 MB).
UPDATE public.subscription_plans
SET storage_mb_quota = COALESCE(storage_mb_quota,
    CASE plan_key
        WHEN 'BASIC' THEN 100
        WHEN 'PRO' THEN 500
        ELSE NULL
    END
)
WHERE plan_key IN ('BASIC', 'PRO');

COMMIT;
