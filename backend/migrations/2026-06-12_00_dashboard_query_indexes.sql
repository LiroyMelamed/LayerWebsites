-- Speed up dashboard aggregate queries on cases and active-customer lookups.

CREATE INDEX IF NOT EXISTS idx_cases_isclosed ON cases (isclosed);
CREATE INDEX IF NOT EXISTS idx_cases_istagged_casemanager ON cases (istagged, casemanagerid) WHERE istagged = true;
CREATE INDEX IF NOT EXISTS idx_cases_userid_isclosed ON cases (userid, isclosed) WHERE isclosed = false;
CREATE INDEX IF NOT EXISTS idx_case_users_userid_caseid ON case_users (userid, caseid);
