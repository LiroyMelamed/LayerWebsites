-- Calendar UX overhaul: reminder targets, invite RSVP, firm address, type colors, daily agenda.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS reminder_targets JSONB NOT NULL DEFAULT '{"client":true,"managers":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invite_responded_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_invite_status_check'
  ) THEN
    ALTER TABLE calendar_events
      ADD CONSTRAINT calendar_events_invite_status_check
      CHECK (invite_status IN ('none', 'pending', 'accepted', 'declined'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_invite_token
  ON calendar_events (invite_token)
  WHERE invite_token IS NOT NULL;

-- Expand reminder offset options
UPDATE platform_settings
SET setting_value = '15,30,60,120,1440,2880,10080',
    updated_at = NOW()
WHERE category = 'calendar'
  AND setting_key = 'CALENDAR_REMINDER_OPTIONS'
  AND (setting_value IS NULL OR setting_value = '' OR setting_value = '15,30,60,120,1440');

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_REMINDER_OPTIONS', '15,30,60,120,1440,2880,10080', 'string',
       'אפשרויות תזכורת לאירוע', 'דקות לפני תחילת האירוע'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'CALENDAR_REMINDER_OPTIONS'
);

-- Firm office address (used as default location + nav links)
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'FIRM_OFFICE_ADDRESS', '', 'string',
       'כתובת המשרד', 'כתובת ברירת מחדל למיקום פגישות וקישורי ניווט'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'FIRM_OFFICE_ADDRESS'
);

-- Default colors per event type
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_EVENT_TYPE_COLORS', '{
  "appointment":"#2A4365",
  "hearing":"#B83280",
  "leave":"#718096",
  "holiday":"#B7791F",
  "reminder":"#3182CE"
}', 'json',
       'צבע ברירת מחדל לפי סוג אירוע', 'צבעים ליומן כאשר לאירוע אין צבע מותאם'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'CALENDAR_EVENT_TYPE_COLORS'
);

-- Daily agenda digest settings
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'DAILY_AGENDA_ENABLED', 'false', 'boolean',
       'שיתוף יומן יומי', 'שליחת סיכום יומי של האירועים'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'DAILY_AGENDA_ENABLED'
);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'DAILY_AGENDA_CHANNELS', 'email', 'string',
       'ערוץ שיתוף יומן יומי', 'email / sms / email,sms'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'DAILY_AGENDA_CHANNELS'
);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'DAILY_AGENDA_RECIPIENTS', '', 'string',
       'נמעני יומן יומי', 'טלפונים ואימיילים מופרדים בפסיק'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'DAILY_AGENDA_RECIPIENTS'
);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'DAILY_AGENDA_SEND_TIME', '07:30', 'string',
       'שעת שליחת יומן יומי', 'HH:MM שעון ישראל'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'DAILY_AGENDA_SEND_TIME'
);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'DAILY_AGENDA_LAST_SENT_DATE', '', 'string',
       'תאריך שליחה אחרון ליומן יומי', 'פנימי — YYYY-MM-DD'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'DAILY_AGENDA_LAST_SENT_DATE'
);
