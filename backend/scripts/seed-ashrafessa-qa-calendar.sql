-- AshrafEssa QA seed: calendar appointments for dual-side notification testing.
-- Lawyer/admin: userid 13 (לירוי מלמד)
-- Client: userid 30 (לקוח בדיקה 1)
-- One event is RSVP-accepted (green ✓ badge). Safe to re-run (deletes prior seed tags).

BEGIN;

-- Remove previous seed events (identified by title prefix)
DELETE FROM calendar_event_clients
 WHERE event_id IN (SELECT id FROM calendar_events WHERE title LIKE '[QA]%');
DELETE FROM calendar_event_managers
 WHERE event_id IN (SELECT id FROM calendar_events WHERE title LIKE '[QA]%');
DELETE FROM calendar_events WHERE title LIKE '[QA]%';

-- 1) Accepted RSVP appointment (tomorrow 10:00) — green ✓
WITH ev AS (
  INSERT INTO calendar_events (
    owner_id, title, description, location, start_time, end_time, all_day,
    event_type, color, client_user_id, client_name, manager_user_id, manager_name,
    invite_status, invite_token, invite_responded_at,
    reminder_channels, reminder_targets,
    lawyer_reminder_offsets, client_reminder_offsets, reminder_offsets,
    reminders_sent_offsets
  ) VALUES (
    13,
    '[QA] פגישה מאושרת — לקוח אישר הגעה',
    'אירוע בדיקה עם RSVP accepted לבדיקת תג ירוק',
    'משרד אשראף עיסא',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '1 day' + INTERVAL '10 hours')
      AT TIME ZONE 'Asia/Jerusalem',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '1 day' + INTERVAL '11 hours')
      AT TIME ZONE 'Asia/Jerusalem',
    FALSE,
    'appointment',
    '#2B6CB0',
    30,
    'לקוח בדיקה 1',
    13,
    'לירוי מלמד',
    'accepted',
    md5(random()::text || clock_timestamp()::text),
    NOW(),
    '{"push":true,"sms":true,"email":true}'::jsonb,
    '{"client":true,"managers":true}'::jsonb,
    '[60,15]'::jsonb,
    '[1440,60]'::jsonb,
    '[60,15]'::jsonb,
    '[]'::jsonb
  ) RETURNING id, invite_token
)
INSERT INTO calendar_event_clients (event_id, user_id, invite_token, invite_status, invite_responded_at, sort_order)
SELECT id, 30, invite_token, 'accepted', NOW(), 0 FROM ev;

INSERT INTO calendar_event_managers (event_id, user_id)
SELECT id, 13 FROM calendar_events WHERE title = '[QA] פגישה מאושרת — לקוח אישר הגעה'
ON CONFLICT DO NOTHING;

-- 2) Pending invite appointment (day after tomorrow 14:30)
WITH ev AS (
  INSERT INTO calendar_events (
    owner_id, title, description, location, start_time, end_time, all_day,
    event_type, color, client_user_id, client_name, manager_user_id, manager_name,
    invite_status, invite_token,
    reminder_channels, reminder_targets,
    lawyer_reminder_offsets, client_reminder_offsets, reminder_offsets,
    reminders_sent_offsets
  ) VALUES (
    13,
    '[QA] פגישה ממתינה לאישור',
    'אירוע בדיקה עם RSVP pending',
    'משרד אשראף עיסא',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '2 days' + INTERVAL '14 hours 30 minutes')
      AT TIME ZONE 'Asia/Jerusalem',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '2 days' + INTERVAL '15 hours 30 minutes')
      AT TIME ZONE 'Asia/Jerusalem',
    FALSE,
    'appointment',
    '#805AD5',
    30,
    'לקוח בדיקה 1',
    13,
    'לירוי מלמד',
    'pending',
    md5(random()::text || clock_timestamp()::text),
    '{"push":true,"sms":true,"email":true}'::jsonb,
    '{"client":true,"managers":true}'::jsonb,
    '[120,30]'::jsonb,
    '[1440,30]'::jsonb,
    '[120,30]'::jsonb,
    '[]'::jsonb
  ) RETURNING id, invite_token
)
INSERT INTO calendar_event_clients (event_id, user_id, invite_token, invite_status, invite_responded_at, sort_order)
SELECT id, 30, invite_token, 'pending', NULL, 0 FROM ev;

INSERT INTO calendar_event_managers (event_id, user_id)
SELECT id, 13 FROM calendar_events WHERE title = '[QA] פגישה ממתינה לאישור'
ON CONFLICT DO NOTHING;

-- 3) Multi-client hearing in 3 days (clients 30 + 31), accepted by first
WITH ev AS (
  INSERT INTO calendar_events (
    owner_id, title, description, location, start_time, end_time, all_day,
    event_type, color, client_user_id, client_name, manager_user_id, manager_name,
    invite_status, invite_token, invite_responded_at,
    reminder_channels, reminder_targets,
    lawyer_reminder_offsets, client_reminder_offsets, reminder_offsets,
    reminders_sent_offsets
  ) VALUES (
    13,
    '[QA] דיון — שני לקוחות',
    'בדיקת התראות multi-client',
    'בית המשפט',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '3 days' + INTERVAL '9 hours')
      AT TIME ZONE 'Asia/Jerusalem',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '3 days' + INTERVAL '10 hours')
      AT TIME ZONE 'Asia/Jerusalem',
    FALSE,
    'hearing',
    '#C05621',
    30,
    'לקוח בדיקה 1',
    13,
    'לירוי מלמד',
    'accepted',
    md5(random()::text || clock_timestamp()::text),
    NOW(),
    '{"push":true,"sms":true,"email":true}'::jsonb,
    '{"client":true,"managers":true}'::jsonb,
    '[1440,60]'::jsonb,
    '[1440,60]'::jsonb,
    '[1440,60]'::jsonb,
    '[]'::jsonb
  ) RETURNING id
)
INSERT INTO calendar_event_clients (event_id, user_id, invite_token, invite_status, invite_responded_at, sort_order)
SELECT id, 30, md5(random()::text || clock_timestamp()::text || random()::text), 'accepted', NOW(), 0 FROM ev
UNION ALL
SELECT id, 31, md5(random()::text || clock_timestamp()::text || random()::text), 'pending', NULL, 1 FROM ev;

INSERT INTO calendar_event_managers (event_id, user_id)
SELECT id, 13 FROM calendar_events WHERE title = '[QA] דיון — שני לקוחות'
ON CONFLICT DO NOTHING;

-- 4) Immediate-ish reminder event later today for lawyer push testing
INSERT INTO calendar_events (
  owner_id, title, description, start_time, end_time, all_day,
  event_type, color, manager_user_id, manager_name,
  invite_status,
  reminder_channels, reminder_targets,
  lawyer_reminder_offsets, client_reminder_offsets, reminder_offsets,
  reminders_sent_offsets
) VALUES (
  13,
  '[QA] תזכורת פנימית לעורך דין',
  'בדיקת תזכורת ללא לקוח',
  NOW() + INTERVAL '45 minutes',
  NOW() + INTERVAL '75 minutes',
  FALSE,
  'reminder',
  '#718096',
  13,
  'לירוי מלמד',
  'none',
  '{"push":true,"sms":false,"email":true}'::jsonb,
  '{"client":false,"managers":true}'::jsonb,
  '[30,0]'::jsonb,
  '[]'::jsonb,
  '[30,0]'::jsonb,
  '[]'::jsonb
);

INSERT INTO calendar_event_managers (event_id, user_id)
SELECT id, 13 FROM calendar_events WHERE title = '[QA] תזכורת פנימית לעורך דין'
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, title, event_type, start_time, invite_status, client_name
FROM calendar_events
WHERE title LIKE '[QA]%'
ORDER BY start_time;
