-- AshrafEssa production init ONLY. Removes demo users/data; keeps users 1 (Ashraf Essa) and 13 (Liroy).
-- Run: psql -d ashrafessa -v ON_ERROR_STOP=1 -f ashrafessa-init-prod.sql
-- NEVER run against melamedlaw, morlevy, or any other database.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF current_database() <> 'ashrafessa' THEN
        RAISE EXCEPTION 'Refusing to run: expected database ashrafessa, got %', current_database();
    END IF;
END $$;

BEGIN;

SELECT set_config('app.audit_events_allow_delete', 'true', true);

DELETE FROM refresh_tokens WHERE userid NOT IN (1, 13);
DELETE FROM userdevices WHERE userid NOT IN (1, 13);
DELETE FROM usernotifications WHERE userid NOT IN (1, 13);
DELETE FROM otps;

DELETE FROM chatbot_messages
WHERE session_id IN (SELECT id FROM chatbot_sessions WHERE user_id IS NOT NULL AND user_id NOT IN (1, 13));
DELETE FROM chatbot_sessions WHERE user_id IS NOT NULL AND user_id NOT IN (1, 13);

DELETE FROM audit_events;

-- Calendar (must clear before users/cases that events may reference)
DELETE FROM calendar_event_managers;
UPDATE scheduled_email_reminders SET calendar_event_id = NULL WHERE calendar_event_id IS NOT NULL;
DELETE FROM calendar_events;
DELETE FROM user_calendar_tokens WHERE user_id NOT IN (1, 13);

-- Signing
DELETE FROM signing_short_links;
DELETE FROM signing_retention_warnings;
DELETE FROM signing_otp_challenges;
DELETE FROM signing_consents;
DELETE FROM signaturespots;
DELETE FROM signingfiles;

DELETE FROM stage_files;
DELETE FROM template_attachments;
DELETE FROM case_users;
DELETE FROM casedescriptions;
DELETE FROM uploadedfiles;
DELETE FROM cases;

DELETE FROM scheduled_email_reminders WHERE user_id IS NOT NULL AND user_id NOT IN (1, 13);
DELETE FROM birthday_greetings_sent WHERE user_id NOT IN (1, 13);
DELETE FROM message_delivery_events;

DELETE FROM platform_admins WHERE user_id NOT IN (1, 13);
DELETE FROM users WHERE userid NOT IN (1, 13);

INSERT INTO platform_admins (user_id, is_active)
VALUES (1, true), (13, true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

UPDATE users SET role = 'Admin' WHERE userid IN (1, 13);

COMMIT;

SELECT 'users_remaining' AS check, count(*)::int AS n FROM users;
SELECT userid, role, name, phonenumber FROM users ORDER BY userid;
SELECT user_id, is_active FROM platform_admins ORDER BY user_id;
SELECT 'cases' AS t, count(*)::int AS n FROM cases
UNION ALL SELECT 'signingfiles', count(*)::int FROM signingfiles
UNION ALL SELECT 'calendar_events', count(*)::int FROM calendar_events
UNION ALL SELECT 'signing_short_links', count(*)::int FROM signing_short_links
UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events;
