BEGIN;
INSERT INTO platform_settings(category,setting_key,setting_value,value_type,label,description)
VALUES
('calendar','CALENDAR_LAWYER_REMINDER_DEFAULTS','30,60,120,1440,2880','string','ברירת מחדל — תזכורות לעורכי דין','מרווחים בדקות המסומנים מראש באירוע חדש. ריק = ללא תזכורות. אירועים קיימים אינם משתנים.'),
('calendar','CALENDAR_CLIENT_REMINDER_DEFAULTS','30,60,120,1440,2880','string','ברירת מחדל — תזכורות ללקוחות','מרווחים בדקות המסומנים מראש באירוע חדש. ריק = ללא תזכורות. אירועים קיימים אינם משתנים.')
ON CONFLICT(category,setting_key) DO NOTHING;
COMMIT;
