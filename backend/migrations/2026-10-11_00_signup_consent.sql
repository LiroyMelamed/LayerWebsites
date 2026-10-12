ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS consented_at timestamptz;
ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS request_hash text;
