-- Initial internal operational budgets live in application code. This durable
-- shared-connection state survives worker restarts and manual pause/resume.
BEGIN;
ALTER TABLE public.office_integrations
    ADD COLUMN IF NOT EXISTS safety_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.office_integrations ADD COLUMN IF NOT EXISTS dispatch_claim jsonb;
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.office_integrations'::regclass
        AND conname = 'office_integrations_safety_state_object') THEN
        ALTER TABLE public.office_integrations ADD CONSTRAINT office_integrations_safety_state_object
            CHECK (jsonb_typeof(safety_state) = 'object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.office_integrations'::regclass
        AND conname = 'office_integrations_dispatch_claim_object') THEN
        ALTER TABLE public.office_integrations ADD CONSTRAINT office_integrations_dispatch_claim_object
            CHECK (dispatch_claim IS NULL OR jsonb_typeof(dispatch_claim) = 'object');
    END IF;
END $migration$;
ALTER TABLE public.case_whatsapp_groups ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS case_whatsapp_groups_dispatch_due
    ON public.case_whatsapp_groups(connection_id, next_attempt_at, created_at)
    WHERE status IN ('queued', 'created');
COMMIT;
