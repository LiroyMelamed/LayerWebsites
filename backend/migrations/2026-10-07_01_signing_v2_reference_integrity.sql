BEGIN;
ALTER TABLE signing_people ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(userid);
ALTER TABLE signing_parties ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(userid);
CREATE UNIQUE INDEX IF NOT EXISTS signing_participations_person_ref ON signing_participations(owner_context_id,id,person_id);
CREATE UNIQUE INDEX IF NOT EXISTS signing_profiles_revision_person_ref ON signing_delivery_profiles(owner_context_id,id,person_id,revision_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_actions_participation_person') THEN
        ALTER TABLE signing_actions ADD CONSTRAINT signing_actions_participation_person
            FOREIGN KEY (owner_context_id,participation_id,person_id) REFERENCES signing_participations(owner_context_id,id,person_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_grant_items_profile_revision') THEN
        ALTER TABLE signing_grant_items ADD CONSTRAINT signing_grant_items_profile_revision
            FOREIGN KEY (owner_context_id,delivery_profile_id,person_id,revision_id)
            REFERENCES signing_delivery_profiles(owner_context_id,id,person_id,revision_id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION signing_v2_artifact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.state='ready' THEN RAISE EXCEPTION 'Ready signing artifact is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION signing_v2_session_manifest_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.exact_manifest IS DISTINCT FROM OLD.exact_manifest OR NEW.manifest_hash <> OLD.manifest_hash
        OR NEW.person_id <> OLD.person_id OR NEW.grant_id <> OLD.grant_id
        OR NEW.owner_context_id <> OLD.owner_context_id OR NEW.consent_snapshot IS DISTINCT FROM OLD.consent_snapshot
        OR NEW.expires_at <> OLD.expires_at THEN
        RAISE EXCEPTION 'Signing session manifest is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_artifacts_immutable') THEN
        CREATE TRIGGER signing_artifacts_immutable BEFORE UPDATE OR DELETE ON signing_artifacts
            FOR EACH ROW EXECUTE FUNCTION signing_v2_artifact_immutable();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_sessions_v2_immutable') THEN
        CREATE TRIGGER signing_sessions_v2_immutable BEFORE UPDATE ON signing_sessions_v2
            FOR EACH ROW EXECUTE FUNCTION signing_v2_session_manifest_immutable();
    END IF;
END $$;
COMMIT;
