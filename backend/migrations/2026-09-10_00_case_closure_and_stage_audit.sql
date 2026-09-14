-- Case closure audit + stage updater tracking

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS closed_by_userid INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS reopened_by_userid INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL;

COMMENT ON COLUMN cases.closed_at IS 'When the case was closed (distinct from updatedat)';
COMMENT ON COLUMN cases.closed_by_userid IS 'User who closed the case';
COMMENT ON COLUMN cases.reopened_at IS 'When the case was last reopened after closure';
COMMENT ON COLUMN cases.reopened_by_userid IS 'User who reopened the case';

ALTER TABLE casedescriptions
    ADD COLUMN IF NOT EXISTS updated_by_userid INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL;

COMMENT ON COLUMN casedescriptions.updated_by_userid IS 'User who marked this stage complete';

-- Best-effort backfill for already-closed cases (no historical actor)
UPDATE cases
SET closed_at = updatedat
WHERE COALESCE(isclosed, false) = true
  AND closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cases_closed_at
    ON cases (closed_at DESC)
    WHERE closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_closed_by_userid
    ON cases (closed_by_userid)
    WHERE closed_by_userid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_casedescriptions_updated_by_userid
    ON casedescriptions (updated_by_userid)
    WHERE updated_by_userid IS NOT NULL;
