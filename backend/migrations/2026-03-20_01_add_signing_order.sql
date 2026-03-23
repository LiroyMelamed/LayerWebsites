-- Add signing order mode to signingfiles.
-- 'parallel' = all signers can sign simultaneously (current default behavior)
-- 'sequential' = signers must sign in order based on signerindex
BEGIN;

ALTER TABLE signingfiles
    ADD COLUMN IF NOT EXISTS signingorder TEXT NOT NULL DEFAULT 'parallel';

COMMIT;
