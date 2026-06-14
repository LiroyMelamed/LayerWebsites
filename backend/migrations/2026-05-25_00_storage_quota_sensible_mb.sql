-- Lower default storage quotas to practical MB values (100 MB / 500 MB).
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
