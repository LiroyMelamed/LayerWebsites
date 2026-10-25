-- Optional consent for MelaMedia's subscription/payment WhatsApp notices.
-- Existing billing consent and office case-group settings are independent.
ALTER TABLE signup_intents
    ADD COLUMN IF NOT EXISTS system_whatsapp_opted_in boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS system_whatsapp_consent_version text,
    ADD COLUMN IF NOT EXISTS system_whatsapp_captured_at timestamptz;
-- No backfill or grant for existing signup records.
