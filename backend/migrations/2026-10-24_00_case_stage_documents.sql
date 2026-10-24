-- Additive; rules bind stable description identities, never mutable stage numbers.
BEGIN;
CREATE TABLE IF NOT EXISTS signing_case_stage_rules (
 id uuid PRIMARY KEY,
 owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
 case_id integer NOT NULL REFERENCES cases(caseid),
 description_id integer NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 enabled boolean NOT NULL DEFAULT true,
 configured_by integer NOT NULL REFERENCES users(userid),
 template_version_id uuid NOT NULL,
 template_name text NOT NULL,
 template_metadata jsonb NOT NULL,
 input jsonb NOT NULL,
 preview_hash text NOT NULL,
 contact_hash text NOT NULL,
 case_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_context_id,id),
 UNIQUE(owner_context_id,case_id,description_id),
 FOREIGN KEY(owner_context_id,template_version_id) REFERENCES signing_template_versions(owner_context_id,id)
);
CREATE TABLE IF NOT EXISTS signing_case_stage_runs (
 id uuid PRIMARY KEY,
 owner_context_id uuid NOT NULL,
 rule_id uuid NOT NULL,
 case_id integer NOT NULL REFERENCES cases(caseid),
 description_id integer NOT NULL,
 stage_title text NOT NULL,
 rule_version integer NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 configured_by integer NOT NULL REFERENCES users(userid),
 transition_by integer NOT NULL REFERENCES users(userid),
 input jsonb NOT NULL,
 preview_hash text NOT NULL,
 contact_hash text NOT NULL,
 case_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','created','blocked','cancelled')),
 error_code text,
 submission_id uuid REFERENCES signing_submissions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_context_id,id),
 -- Once per rule for the entire case, including backward/reentry and rule edits.
 UNIQUE(owner_context_id,rule_id),
 FOREIGN KEY(owner_context_id,rule_id) REFERENCES signing_case_stage_rules(owner_context_id,id),
 CHECK ((status='created')=(submission_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signing_case_stage_queue ON signing_case_stage_runs(created_at,id) WHERE status='queued';
CREATE INDEX IF NOT EXISTS signing_case_stage_case ON signing_case_stage_runs(owner_context_id,case_id,created_at DESC);
ALTER TABLE signing_error_alerts ADD COLUMN IF NOT EXISTS stage_run_id uuid REFERENCES signing_case_stage_runs(id);
ALTER TABLE signing_error_alerts ADD COLUMN IF NOT EXISTS case_id integer REFERENCES cases(caseid);
COMMIT;
