-- Add completionEmail column to signingfiles
-- Stores email address to receive signed documents and evidence upon completion
ALTER TABLE signingfiles ADD COLUMN IF NOT EXISTS completionemail VARCHAR(255) DEFAULT NULL;

-- Grant access
GRANT SELECT, INSERT, UPDATE ON signingfiles TO neondb_owner;
