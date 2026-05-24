-- Lower default storage quotas to practical MB values (1 GB / 10 GB).
BEGIN;

UPDATE public.subscription_plans
SET storage_mb_quota = CASE plan_key
        WHEN 'BASIC' THEN 1024
        WHEN 'PRO' THEN 10240
        ELSE storage_mb_quota
    END,
    updated_at = now()
WHERE plan_key IN ('BASIC', 'PRO');

COMMIT;
