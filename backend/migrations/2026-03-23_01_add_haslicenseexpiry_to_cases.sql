-- Add HasLicenseExpiry boolean column to cases table
-- Allows checking the license toggle without requiring a date
ALTER TABLE cases ADD COLUMN IF NOT EXISTS haslicenseexpiry BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: if a date was already set, mark the flag as true
UPDATE cases SET haslicenseexpiry = TRUE WHERE licenseexpirydate IS NOT NULL;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON cases TO neondb_owner;
