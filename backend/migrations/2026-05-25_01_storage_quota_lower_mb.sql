-- Align storage quotas with real usage (~few MB per tenant).
BEGIN;

UPDATE public.subscription_plans
SET storage_mb_quota = CASE plan_key
        WHEN 'BASIC' THEN 100
        WHEN 'PRO' THEN 500
        ELSE storage_mb_quota
    END,
    updated_at = now()
WHERE plan_key IN ('BASIC', 'PRO');

COMMIT;
