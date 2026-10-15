-- Additive: old paid/pending signups remain recoverable. New signups require a validated logo.
ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS logo jsonb;
