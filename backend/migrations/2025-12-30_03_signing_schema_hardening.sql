-- Signing schema hardening for production
-- Safe/idempotent: can be run multiple times.

-- signingfiles: add columns used by the signing flow (if missing)
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS filekey TEXT,
    ADD COLUMN IF NOT EXISTS originalfilekey TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS expiresat TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signedfilekey TEXT,
    ADD COLUMN IF NOT EXISTS signedat TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejectionreason TEXT;

-- Basic helpful indexes for list/detail queries
CREATE INDEX IF NOT EXISTS idx_signingfiles_lawyerid_createdat
    ON public.signingfiles (lawyerid, createdat DESC);

CREATE INDEX IF NOT EXISTS idx_signingfiles_clientid_createdat
    ON public.signingfiles (clientid, createdat DESC);

-- signaturespots: add columns used by the signing flow (if missing)
ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS signername TEXT,
    ADD COLUMN IF NOT EXISTS isrequired BOOLEAN,
    ADD COLUMN IF NOT EXISTS issigned BOOLEAN,
    ADD COLUMN IF NOT EXISTS signaturedata TEXT,
    ADD COLUMN IF NOT EXISTS signedat TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill defaults for existing rows (if these columns existed but were NULL)
UPDATE public.signaturespots
SET isrequired = TRUE
WHERE isrequired IS NULL;

UPDATE public.signaturespots
SET issigned = FALSE
WHERE issigned IS NULL;

-- Ensure defaults going forward
ALTER TABLE public.signaturespots
    ALTER COLUMN isrequired SET DEFAULT TRUE,
    ALTER COLUMN issigned SET DEFAULT FALSE;

-- Indexes for common reads
CREATE INDEX IF NOT EXISTS idx_signaturespots_signingfileid
    ON public.signaturespots (signingfileid);

CREATE INDEX IF NOT EXISTS idx_signaturespots_signingfileid_required_signed
    ON public.signaturespots (signingfileid, isrequired, issigned);

-- Ensure FK exists (naming varies across DBs; we only add our canonical name if absent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'signaturespots_signingfileid_fkey'
    ) THEN
        ALTER TABLE public.signaturespots
            ADD CONSTRAINT signaturespots_signingfileid_fkey
            FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid)
            ON DELETE CASCADE;
    END IF;
END$$;
