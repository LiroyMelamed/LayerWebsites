-- Recalculate storage quotas from measured real usage, and heal schema drift.
--
-- Measured DB-tracked usage (signing + stage + template) at time of writing:
--   MelamedLaw 24.29 MB, MorLevi 4.96 MB, AshrafEssa 0.16 MB.
-- True R2 footprint is ~2x higher (untracked users/ uploads), so tiers carry headroom.
--
-- New tiers:  BASIC = 250 MB,  PRO = 1024 MB (1 GB),  ENTERPRISE = NULL (unlimited).
-- Idempotent: safe to re-run.
BEGIN;

-- Part A: heal GB->MB schema drift (MelamedLaw still had storage_gb_quota).
-- Only rename+convert when the old column exists and the new one does not, so
-- this is a no-op on tenants already migrated. (Same guard as 2026-05-24_00.)
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

    -- Defensive: ensure the column exists even if neither was present.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_plans'
          AND column_name = 'storage_mb_quota'
    ) THEN
        ALTER TABLE public.subscription_plans
            ADD COLUMN storage_mb_quota integer NULL;
    END IF;
END $$;

-- Part B: set the recalculated quota values.
UPDATE public.subscription_plans
SET storage_mb_quota = CASE plan_key
        WHEN 'BASIC' THEN 250
        WHEN 'PRO' THEN 1024
        WHEN 'ENTERPRISE' THEN NULL
        ELSE storage_mb_quota
    END,
    updated_at = now()
WHERE plan_key IN ('BASIC', 'PRO', 'ENTERPRISE');

COMMIT;
