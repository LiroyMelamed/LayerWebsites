-- Backfill: calendar reminder events missing a paired scheduled_email_reminders row.
-- Earlier API rejected lead_* on event_type='reminder', so some calendar markers
-- never got a reminders-screen row. Re-link future (and recently past) events that
-- still have a resolvable email + name.

BEGIN;

DO $backfill$
DECLARE
    e RECORD;
    resolved_email TEXT;
    resolved_name TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'scheduled_email_reminders'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'calendar_events'
    ) THEN
        RETURN;
    END IF;

    FOR e IN
        SELECT
            ce.id,
            ce.owner_id,
            ce.title,
            ce.start_time,
            ce.client_user_id,
            ce.client_name,
            ce.lead_name,
            ce.lead_email,
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
                LOWER(resolved_email),
                NULLIF(BTRIM(e.title), ''),
                'GENERAL',
                '{}'::jsonb,
                e.start_time,
                'PENDING',
                e.owner_id,
                e.id
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE
                'calendar→reminder backfill skipped event id=% (%): %',
                e.id, SQLSTATE, SQLERRM;
        END;
    END LOOP;
END
$backfill$;

COMMIT;
