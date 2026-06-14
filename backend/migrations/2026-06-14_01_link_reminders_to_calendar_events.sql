-- Migration: Bidirectional link between scheduled_email_reminders and calendar_events.
--
-- Adds a FK so a reminder row can reference its paired calendar event of
-- event_type = 'reminder'. The unique partial index keeps the relationship 1:1.
-- Backfills both directions for existing data so the calendar and the reminders
-- screen stay in sync without manual cleanup.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FK column + uniqueness
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE scheduled_email_reminders
    ADD COLUMN IF NOT EXISTS calendar_event_id INTEGER NULL
        REFERENCES calendar_events(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ser_calendar_event_id
    ON scheduled_email_reminders (calendar_event_id)
    WHERE calendar_event_id IS NOT NULL;

COMMENT ON COLUMN scheduled_email_reminders.calendar_event_id IS
    'Optional 1:1 link to the calendar_events row that mirrors this reminder. '
    'When the calendar event is deleted, the reminder is removed too (cascade). '
    'Synced rows have empty reminder_offsets / all-false reminder_channels so '
    'dispatchCalendarReminder is a no-op — the reminders worker is the sender.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill 1 — every PENDING reminder gets a paired calendar event
-- ─────────────────────────────────────────────────────────────────────────────
DO $backfill_reminders_to_calendar$
DECLARE
    r RECORD;
    new_event_id INT;
BEGIN
    FOR r IN
        SELECT id, user_id, client_name, to_email, subject, template_key,
               scheduled_for, created_by
          FROM scheduled_email_reminders
         WHERE status = 'PENDING'
           AND calendar_event_id IS NULL
           AND created_by IS NOT NULL
    LOOP
        BEGIN
            INSERT INTO calendar_events
                (owner_id, title, event_type, client_user_id, client_name,
                 lead_name, lead_email,
                 start_time, end_time, all_day,
                 reminder_offsets, reminder_channels, reminders_sent_offsets)
            VALUES (
                r.created_by,
                COALESCE(NULLIF(BTRIM(r.subject), ''), r.template_key, 'תזכורת'),
                'reminder',
                r.user_id,
                CASE WHEN r.user_id IS NOT NULL THEN NULLIF(BTRIM(r.client_name), '') END,
                CASE WHEN r.user_id IS NULL     THEN NULLIF(BTRIM(r.client_name), '') END,
                CASE WHEN r.user_id IS NULL     THEN NULLIF(BTRIM(r.to_email), '')    END,
                r.scheduled_for,
                -- 15-minute slot so listEvents tstzrange queries actually match.
                r.scheduled_for + INTERVAL '15 minutes',
                FALSE,
                '[]'::jsonb,
                '{"push":false,"sms":false,"email":false}'::jsonb,
                '[]'::jsonb
            )
            RETURNING id INTO new_event_id;

            UPDATE scheduled_email_reminders
               SET calendar_event_id = new_event_id
             WHERE id = r.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE
                'reminder→calendar backfill skipped reminder id=% (%): %',
                r.id, SQLSTATE, SQLERRM;
        END;
    END LOOP;
END
$backfill_reminders_to_calendar$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill 2 — every calendar 'reminder' event with a recipient gets a
--    paired scheduled_email_reminders row (only when no link already exists).
-- ─────────────────────────────────────────────────────────────────────────────
DO $backfill_calendar_to_reminders$
DECLARE
    e RECORD;
    resolved_email TEXT;
    resolved_name  TEXT;
    new_rid INT;
BEGIN
    FOR e IN
        SELECT ce.id,
               ce.title,
               ce.client_user_id,
               ce.client_name,
               ce.lead_name,
               ce.lead_email,
               ce.start_time,
               ce.owner_id,
               u.email AS user_email,
               u.name  AS user_name
          FROM calendar_events ce
     LEFT JOIN users u ON u.userid = ce.client_user_id
         WHERE ce.event_type = 'reminder'
           AND ce.start_time >= NOW()
           AND NOT EXISTS (
                   SELECT 1 FROM scheduled_email_reminders ser
                    WHERE ser.calendar_event_id = ce.id
               )
    LOOP
        resolved_email := COALESCE(
            NULLIF(BTRIM(e.user_email), ''),
            NULLIF(BTRIM(e.lead_email), '')
        );
        resolved_name := COALESCE(
            NULLIF(BTRIM(e.client_name), ''),
            NULLIF(BTRIM(e.lead_name),   ''),
            NULLIF(BTRIM(e.user_name),   '')
        );

        IF resolved_email IS NULL OR resolved_name IS NULL THEN
            CONTINUE;
        END IF;

        BEGIN
            INSERT INTO scheduled_email_reminders
                (user_id, client_name, to_email, subject, template_key,
                 template_data, scheduled_for, status, created_by, calendar_event_id)
            VALUES (
                e.client_user_id,
                resolved_name,
                resolved_email,
                NULLIF(BTRIM(e.title), ''),
                'GENERAL',
                '{}'::jsonb,
                e.start_time,
                'PENDING',
                e.owner_id,
                e.id
            )
            RETURNING id INTO new_rid;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE
                'calendar→reminder backfill skipped event id=% (%): %',
                e.id, SQLSTATE, SQLERRM;
        END;
    END LOOP;
END
$backfill_calendar_to_reminders$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants — re-run for safety on existing tenant roles (no-op if already granted)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduled_email_reminders TO %I',
            role_name
        );
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_events TO %I',
            role_name
        );
    END LOOP;
END $$;

COMMIT;
