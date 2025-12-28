-- Adds multi-signer support for signature spots
-- Safe to run multiple times.

ALTER TABLE public.signaturespots
    ADD COLUMN IF NOT EXISTS signeruserid INTEGER;

-- Optional: index for quick lookups
CREATE INDEX IF NOT EXISTS idx_signaturespots_signeruserid
    ON public.signaturespots (signeruserid);

-- Optional: FK to users (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'signaturespots_signeruserid_fkey'
    ) THEN
        ALTER TABLE public.signaturespots
            ADD CONSTRAINT signaturespots_signeruserid_fkey
            FOREIGN KEY (signeruserid) REFERENCES public.users(userid)
            ON DELETE SET NULL;
    END IF;
END$$;
