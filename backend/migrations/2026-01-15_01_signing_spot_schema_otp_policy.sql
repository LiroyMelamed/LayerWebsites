-- Harden signing schema for public/client signing (production-safe, idempotent)

BEGIN;

-- 1) signaturespots: ensure required columns exist
ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS fieldtype text NOT NULL DEFAULT 'signature',
    ADD COLUMN IF NOT EXISTS isrequired boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS signerindex integer NULL,
    ADD COLUMN IF NOT EXISTS fieldlabel text NULL;

-- If signeruserid is missing in older DBs, add it (nullable)
ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS signeruserid integer NULL;

-- Backfill legacy rows
UPDATE public.signaturespots
SET fieldtype = 'signature'
WHERE fieldtype IS NULL;

UPDATE public.signaturespots
SET isrequired = true
WHERE isrequired IS NULL;

-- Helpful index for page queries
CREATE INDEX IF NOT EXISTS idx_signaturespots_signingfile_page
    ON public.signaturespots (signingfileid, pagenumber);

-- 2) signingfiles: OTP policy fields (ensure present)
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS requireotp boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS otpwaivedbyuserid integer NULL,
    ADD COLUMN IF NOT EXISTS otpwaivedatutc timestamptz NULL;

-- Backfill legacy rows
UPDATE public.signingfiles
SET requireotp = false
WHERE requireotp IS NULL;

-- If legacy waiver fields exist, copy into new columns when empty
UPDATE public.signingfiles
SET otpwaivedbyuserid = otpwaiveracknowledgedbyuserid
WHERE otpwaivedbyuserid IS NULL AND otpwaiveracknowledgedbyuserid IS NOT NULL;

UPDATE public.signingfiles
SET otpwaivedatutc = otpwaiveracknowledgedatutc
WHERE otpwaivedatutc IS NULL AND otpwaiveracknowledgedatutc IS NOT NULL;

COMMIT;
