-- Add HasLicenseExpiry boolean column to cases table
-- Allows checking the license toggle without requiring a date
ALTER TABLE cases ADD COLUMN IF NOT EXISTS haslicenseexpiry BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: if a date was already set, mark the flag as true
UPDATE cases SET haslicenseexpiry = TRUE WHERE licenseexpirydate IS NOT NULL;

-- Grant permissions (role-safe: works on both dev and prod)
DO $$
DECLARE role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cases TO %I', role_name);
        END IF;
    END LOOP;
END $$;
