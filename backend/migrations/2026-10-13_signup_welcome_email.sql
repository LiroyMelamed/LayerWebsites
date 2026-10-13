-- No backfill: only newly provisioned accounts enqueue welcome messages.
ALTER TABLE signup_intents
 ADD COLUMN IF NOT EXISTS welcome_email jsonb,
 ADD COLUMN IF NOT EXISTS welcome_email_status text CHECK (welcome_email_status IN ('pending','sending','sent','failed','uncertain')),
 ADD COLUMN IF NOT EXISTS welcome_email_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS welcome_email_next_at timestamptz,
 ADD COLUMN IF NOT EXISTS welcome_email_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz,
 ADD COLUMN IF NOT EXISTS welcome_email_error text;
CREATE INDEX IF NOT EXISTS signup_welcome_pending ON signup_intents(welcome_email_next_at)
 WHERE welcome_email_status = 'pending';
