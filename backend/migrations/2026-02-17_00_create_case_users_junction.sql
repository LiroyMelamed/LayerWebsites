-- Migration: Create case_users junction table for many-to-many case ↔ client relationship
-- Also backfill from existing cases.userid

BEGIN;

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS case_users (
    id          SERIAL PRIMARY KEY,
    caseid      INTEGER NOT NULL REFERENCES cases(caseid) ON DELETE CASCADE,
    userid      INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(caseid, userid)
);

CREATE INDEX IF NOT EXISTS idx_case_users_caseid  ON case_users(caseid);
CREATE INDEX IF NOT EXISTS idx_case_users_userid  ON case_users(userid);

-- 2. Backfill: copy existing cases.userid into junction table
INSERT INTO case_users (caseid, userid)
SELECT caseid, userid FROM cases WHERE userid IS NOT NULL
ON CONFLICT (caseid, userid) DO NOTHING;

-- 3. Grant permissions to application user
GRANT SELECT, INSERT, UPDATE, DELETE ON case_users TO liroym;
GRANT USAGE, SELECT ON SEQUENCE case_users_id_seq TO liroym;

COMMIT;
