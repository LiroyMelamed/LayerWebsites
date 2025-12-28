-- Makes signingfiles.caseid optional to support "client only" or "case only" flows.
-- NOTE: This changes delete behavior to SET NULL (so deleting a case won't delete signing files).
-- Review before running in production.

ALTER TABLE public.signingfiles
    ALTER COLUMN caseid DROP NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'signingfiles_caseid_fkey'
    ) THEN
        ALTER TABLE public.signingfiles
            DROP CONSTRAINT signingfiles_caseid_fkey;
    END IF;
END$$;

ALTER TABLE public.signingfiles
    ADD CONSTRAINT signingfiles_caseid_fkey
    FOREIGN KEY (caseid) REFERENCES public.cases(caseid)
    ON DELETE SET NULL;
