-- Add per-spot field value storage for non-signature fields (idempotent)

BEGIN;

ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS fieldvalue text NULL;

COMMIT;
