-- Migration: Deprecate uploadedfiles table
-- Date: 2026-02-15
-- Status: NOT RUN YET — awaiting explicit confirmation
-- Reason: Table has no active INSERT/SELECT in application code.
--         File uploads now use R2 presigned URLs directly.

-- Step 1: Mark as deprecated (safe, no data loss)
COMMENT ON TABLE uploadedfiles IS 'DEPRECATED 2026-02-15: No active application code references. File uploads use R2 presigned URLs. Pending DROP after confirming zero production rows.';

-- Step 2: (future, after confirmation) DROP TABLE uploadedfiles;
-- DO NOT UNCOMMENT WITHOUT VERIFYING:
--   SELECT count(*) FROM uploadedfiles;
--   If count > 0, investigate before dropping.
