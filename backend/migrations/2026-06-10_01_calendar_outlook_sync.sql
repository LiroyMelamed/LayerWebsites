-- Outlook Calendar sync: firm toggle, per-user OAuth tokens, event idempotency key.

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'OUTLOOK_SYNC_ENABLED', 'true', 'boolean',
     'אפשר סנכרון Outlook Calendar',
     'כאשר מופעל, עורכי דין יכולים לחבר את חשבון Microsoft Outlook האישי שלהם ממסך היומן. כאשר כבוי, חיבור Outlook חדש וסנכרון ידני ייחסמו.')
ON CONFLICT (category, setting_key) DO NOTHING;

ALTER TABLE user_calendar_tokens
    ADD COLUMN IF NOT EXISTS outlook_connected        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS outlook_email            TEXT        NULL,
    ADD COLUMN IF NOT EXISTS outlook_access_token     TEXT        NULL,
    ADD COLUMN IF NOT EXISTS outlook_refresh_token    TEXT        NULL,
    ADD COLUMN IF NOT EXISTS outlook_token_expiry      TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS outlook_scope             TEXT        NULL;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS outlook_event_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_owner_outlook_event
    ON public.calendar_events (owner_id, outlook_event_id)
    WHERE outlook_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cal_events_outlook_event_id
    ON calendar_events (outlook_event_id)
    WHERE outlook_event_id IS NOT NULL;

COMMIT;
