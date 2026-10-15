-- Calendar UX: meeting type, multi-lead participants, last editor audit trail
-- Email OTP login channel on otps

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(32),
    ADD COLUMN IF NOT EXISTS lead_participants JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(userid) ON DELETE SET NULL;

COMMENT ON COLUMN calendar_events.meeting_type IS
    'frontal | zoom | phone | other — how the meeting is held';
COMMENT ON COLUMN calendar_events.lead_participants IS
    'Additional prospective clients [{name, phone, email}] when intake is lead mode';
COMMENT ON COLUMN calendar_events.updated_by IS
    'User who last edited this event (owner on create)';

ALTER TABLE otps
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- phonenumber was the PK; email OTP rows need nullable phone + separate unique keys
ALTER TABLE otps
    ADD COLUMN IF NOT EXISTS id SERIAL;

ALTER TABLE otps
    DROP CONSTRAINT IF EXISTS otps_pkey;

ALTER TABLE otps
    ADD PRIMARY KEY (id);

ALTER TABLE otps
    ALTER COLUMN phonenumber DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_otps_phonenumber
    ON otps (phonenumber)
    WHERE phonenumber IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_otps_email_lower
    ON otps (LOWER(email))
    WHERE email IS NOT NULL;
