-- Seed contractor_monitor category in platform_settings.
-- MelamedLaw-only: controls the contractor-monitor PM2 process behavior.
-- Run on MelamedLaw DB only (melamedlaw / liroym user).

INSERT INTO platform_settings (category, setting_key, value_type, setting_value, label, description)
VALUES
  ('contractor_monitor', 'CM_ENABLED',                   'boolean', 'true',                   'מעקב קבלנים פעיל',                         'הפעלה/כיבוי של מערכת מעקב הקבלנים'),
  ('contractor_monitor', 'CM_CHECK_INTERVAL_DAYS',        'number',  '1',                      'מרווח ימים בין בדיקות',                    'כל כמה ימים לבדוק שינויים במאגרים'),
  ('contractor_monitor', 'CM_ALWAYS_SEND_REPORT',         'boolean', 'true',                   'שלח דוח גם ללא שינויים',                   'שליחת אימייל דוח יומי גם כשאין שינויים'),
  ('contractor_monitor', 'CM_REPORT_HOUR',                'time',    '07:00',                  'שעת שליחת הדוח',                           'באיזו שעה לשלוח את הבדיקה היומית'),
  ('contractor_monitor', 'CM_GLOBAL_EMAIL_RECIPIENTS',    'string',  'liav@melamedlaw.co.il',  'כתובות אימייל לדוח (ברירת מחדל)',          'כתובות אימייל מופרדות בפסיק — ישמשו כברירת מחדל לכל המאגרים'),
  ('contractor_monitor', 'CM_GLOBAL_SMS_RECIPIENTS',      'string',  '0506789898',             'טלפונים ל-SMS (ברירת מחדל)',               'מספרי טלפון מופרדים בפסיק — ישמשו כברירת מחדל'),
  ('contractor_monitor', 'CM_PINKASH_ENABLED',            'boolean', 'true',                   'פנקס קבלנים — פעיל',                       ''),
  ('contractor_monitor', 'CM_PINKASH_EMAIL_RECIPIENTS',   'string',  '',                       'פנקס קבלנים — אימייל (ריק = ברירת מחדל)', ''),
  ('contractor_monitor', 'CM_PINKASH_SMS_RECIPIENTS',     'string',  '',                       'פנקס קבלנים — SMS (ריק = ברירת מחדל)',     ''),
  ('contractor_monitor', 'CM_MANPOWER_ENABLED',           'boolean', 'true',                   'כח אדם — פעיל',                            ''),
  ('contractor_monitor', 'CM_MANPOWER_EMAIL_RECIPIENTS',  'string',  '',                       'כח אדם — אימייל (ריק = ברירת מחדל)',       ''),
  ('contractor_monitor', 'CM_MANPOWER_SMS_RECIPIENTS',    'string',  '',                       'כח אדם — SMS (ריק = ברירת מחדל)',           ''),
  ('contractor_monitor', 'CM_CRANE_ENABLED',              'boolean', 'true',                   'עגורנאי צריח — פעיל',                      ''),
  ('contractor_monitor', 'CM_CRANE_EMAIL_RECIPIENTS',     'string',  '',                       'עגורנאי צריח — אימייל (ריק = ברירת מחדל)',''),
  ('contractor_monitor', 'CM_CRANE_SMS_RECIPIENTS',       'string',  '',                       'עגורנאי צריח — SMS (ריק = ברירת מחדל)',     ''),
  ('contractor_monitor', 'CM_SERVICE_ENABLED',            'boolean', 'true',                   'שירות (שמירה/ניקיון) — פעיל',              ''),
  ('contractor_monitor', 'CM_SERVICE_EMAIL_RECIPIENTS',   'string',  '',                       'שירות — אימייל (ריק = ברירת מחדל)',         ''),
  ('contractor_monitor', 'CM_SERVICE_SMS_RECIPIENTS',     'string',  '',                       'שירות — SMS (ריק = ברירת מחדל)',            ''),
  ('contractor_monitor', 'CM_LAST_RUN_AT',                'string',  '',                       'הרצה אחרונה',                              '(אוטומטי — לא לערוך) מתעדכן אחרי כל הרצה'),
  ('contractor_monitor', 'CM_LAST_RUN_RESULT',            'string',  '',                       'תוצאת הרצה אחרונה',                        '(אוטומטי — לא לערוך)')
ON CONFLICT (category, setting_key) DO NOTHING;
