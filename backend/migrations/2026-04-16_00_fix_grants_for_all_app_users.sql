-- Fix grants: ensure all known app DB users have proper permissions on all tables.
-- Adds morlevy_app alongside liroym and neondb_owner.
-- Also grants to current_user as a catch-all.

DO $$
DECLARE
    role_name TEXT;
    tbl RECORD;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;

        -- Grant on all existing tables in public schema
        FOR tbl IN
            SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        LOOP
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I', tbl.tablename, role_name);
        END LOOP;

        -- Grant on all sequences in public schema
        FOR tbl IN
            SELECT sequencename AS tablename FROM pg_sequences WHERE schemaname = 'public'
        LOOP
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO %I', tbl.tablename, role_name);
        END LOOP;
    END LOOP;
END $$;
