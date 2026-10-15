BEGIN;
ALTER TABLE public.office_integrations ADD COLUMN IF NOT EXISTS next_sync_at timestamptz;
ALTER TABLE public.office_integrations ADD COLUMN IF NOT EXISTS last_scheduled_sync_date date;
CREATE INDEX IF NOT EXISTS office_integrations_court_due ON public.office_integrations(next_sync_at)
    WHERE provider='court_demo' AND enabled=true AND next_sync_at IS NOT NULL;
-- Existing connections keep working; enable their daily demo import at 08:00 Israel time.
UPDATE public.office_integrations
SET settings = '{"dailySyncEnabled":true,"syncTime":"08:00"}'::jsonb || settings
WHERE provider='court_demo' AND (NOT settings ? 'dailySyncEnabled' OR NOT settings ? 'syncTime');
UPDATE public.office_integrations
SET next_sync_at = (((now() AT TIME ZONE 'Asia/Jerusalem')::date
    + CASE WHEN (((now() AT TIME ZONE 'Asia/Jerusalem')::date + (settings->>'syncTime')::time) AT TIME ZONE 'Asia/Jerusalem') <= now() THEN 1 ELSE 0 END)
    + (settings->>'syncTime')::time) AT TIME ZONE 'Asia/Jerusalem'
WHERE provider='court_demo' AND enabled AND settings->>'dailySyncEnabled'='true' AND next_sync_at IS NULL;
COMMIT;
