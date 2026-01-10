-- Ensure signingfiles client foreign key is ON DELETE SET NULL.
-- This allows deleting a customer without deleting signing history.
-- Safe/idempotent: adjusts column nullability + constraint delete action.

DO $$
DECLARE
    deltype_client "char";
    client_not_null boolean;
BEGIN
    -- clientid must be nullable for ON DELETE SET NULL to work.
    SELECT a.attnotnull
      INTO client_not_null
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'signingfiles'
       AND a.attname = 'clientid'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    IF client_not_null THEN
        ALTER TABLE public.signingfiles ALTER COLUMN clientid DROP NOT NULL;
    END IF;

    -- clientid -> users(userid)
    SELECT c.confdeltype
    INTO deltype_client
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'signingfiles_clientid_fkey'
      AND n.nspname = 'public'
      AND t.relname = 'signingfiles';

    IF deltype_client IS NULL THEN
        ALTER TABLE public.signingfiles
            ADD CONSTRAINT signingfiles_clientid_fkey
            FOREIGN KEY (clientid) REFERENCES public.users(userid)
            ON DELETE SET NULL;
    ELSIF deltype_client <> 'n' THEN
        ALTER TABLE public.signingfiles DROP CONSTRAINT signingfiles_clientid_fkey;
        ALTER TABLE public.signingfiles
            ADD CONSTRAINT signingfiles_clientid_fkey
            FOREIGN KEY (clientid) REFERENCES public.users(userid)
            ON DELETE SET NULL;
    END IF;
END$$;
