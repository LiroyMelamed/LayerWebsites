-- Native template lifecycle CAS is independent from immutable publication numbering.
ALTER TABLE signing_templates ADD COLUMN IF NOT EXISTS lifecycle_version integer NOT NULL DEFAULT 1 CHECK (lifecycle_version > 0);
