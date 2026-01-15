-- Add per-spot field type + signer assignment metadata (production-safe, idempotent)
-- Also ensure OTP policy columns exist on signingfiles (backward compatible)

BEGIN;

-- 1) signaturespots: field type + signer index + optional label
ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS fieldtype text NOT NULL DEFAULT 'signature',
    ADD COLUMN IF NOT EXISTS signerindex integer NULL,
    ADD COLUMN IF NOT EXISTS fieldlabel text NULL;

-- Ensure defaults for legacy rows
UPDATE public.signaturespots
SET fieldtype = 'signature'
WHERE fieldtype IS NULL;

-- Helpful index for page queries
CREATE INDEX IF NOT EXISTS idx_signaturespots_signingfile_page
    ON public.signaturespots (signingfileid, pagenumber);

-- 2) signingfiles: OTP policy fields (ensure present)
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS requireotp boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledged boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledgedatutc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledgedbyuserid integer NULL;

COMMIT;