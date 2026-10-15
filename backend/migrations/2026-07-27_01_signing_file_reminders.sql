-- Signing-file auto reminders: schedule per-signer reminders after invite,
-- configurable via platform_settings (enable + offset hours).

BEGIN;

CREATE TABLE IF NOT EXISTS signing_file_reminders (
    id                SERIAL PRIMARY KEY,
    signing_file_id   INTEGER     NOT NULL REFERENCES signingfiles(signingfileid) ON DELETE CASCADE,
    signer_user_id    INTEGER     NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    scheduled_for     TIMESTAMPTZ NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'SENT', 'CANCELLED', 'FAILED')),
    auto_managed      BOOLEAN     NOT NULL DEFAULT TRUE,
    offset_hours      INTEGER     NOT NULL,
    invited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error             TEXT        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at           TIMESTAMPTZ NULL,
    cancelled_at      TIMESTAMPTZ NULL
);

-- At most one PENDING reminder per (file, signer)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sfr_pending_file_signer
    ON signing_file_reminders (signing_file_id, signer_user_id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_sfr_due_pending
    ON signing_file_reminders (status, scheduled_for)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_sfr_file
    ON signing_file_reminders (signing_file_id);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    (
        'signing',
        'SIGN_REMINDER_AUTO_ENABLED',
        'false',
        'boolean',
        'תזכורת חתימה אוטומטית',
        'יצירה ושליחה אוטומטית של תזכורת חתימה לכל חותם לאחר שליחת המסמך'
    ),
    (
        'signing',
        'SIGN_REMINDER_OFFSET_HOURS',
        '72',
        'number',
        'שעות עד לתזכורת חתימה',
        'מספר השעות מרגע שליחת ההזמנה ועד שליחת תזכורת (אם המסמך עדיין לא נחתם)'
    )
ON CONFLICT (category, setting_key) DO NOTHING;

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app', 'ashrafessa_app', 'melamedlaw_app']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signing_file_reminders TO %I',
                role_name
            );
            EXECUTE format(
                'GRANT USAGE, SELECT ON SEQUENCE public.signing_file_reminders_id_seq TO %I',
                role_name
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
