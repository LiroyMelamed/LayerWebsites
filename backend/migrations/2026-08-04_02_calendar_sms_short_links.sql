-- Public short links for calendar SMS (Waze / Maps / RSVP) and similar redirects.
-- SMS uses https://<WEBSITE_DOMAIN>/n/<slug> → SPA resolves via API → target URL.

CREATE TABLE IF NOT EXISTS public_short_links (
    slug        VARCHAR(16) PRIMARY KEY,
    target_url  TEXT NOT NULL,
    kind        VARCHAR(32) NOT NULL DEFAULT 'nav',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_public_short_links_expires_at
    ON public_short_links (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public_short_links TO CURRENT_USER;
DO $$
BEGIN
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public_short_links TO morlevy_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public_short_links TO ashrafessa_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public_short_links TO liroym'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Per-event SMS template overrides (still use {{vars}}; rendered at send time)
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS client_reminder_sms TEXT NULL;
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS invite_sms TEXT NULL;

COMMENT ON COLUMN calendar_events.client_reminder_sms IS
    'Optional override for client calendar reminder SMS template ({{vars}}).';
COMMENT ON COLUMN calendar_events.invite_sms IS
    'Optional override for calendar invite / RSVP SMS template ({{vars}}).';

-- Platform default SMS templates (calendar)
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
(
    'templates',
    'CALENDAR_CLIENT_REMINDER_SMS',
    E'שלום {{recipientName}},\nזוהי תזכורת לפגישה שנקבעה עבורך ב{{firmName}}\nבתאריך {{date}} בשעה {{time}}.\nכתובתנו הינה {{address}}\nלהוראות הגעה בוויז {{wazeUrl}}\nלבירור או שינוי נא להתקשר ל {{firmPhone}}\nמידע נוסף ניתן למצוא באתר שלנו\n{{websiteUrl}}',
    'string',
    'תבנית SMS - תזכורת פגישה ללקוח',
    'תבנית SMS לתזכורת יומן ללקוח. משתנים: {{recipientName}}, {{firmName}}, {{date}}, {{time}}, {{address}}, {{wazeUrl}}, {{mapsUrl}}, {{firmPhone}}, {{websiteUrl}}, {{lawyerName}}, {{title}}'
),
(
    'templates',
    'CALENDAR_INVITE_SMS',
    E'שלום {{recipientName}}, נקבעה לך פגישה, בתאריך {{date}} בשעה {{time}},\nכתובתנו היא {{address}}. בברכה, {{firmName}},\nלאישור הגעה, אנא לחץ/י על הקישור {{rsvpUrl}}\nלהוראות הגעה בוויז: {{wazeUrl}}\nלבירור או שינוי נא להתקשר ל {{firmPhone}}',
    'string',
    'תבנית SMS - אישור הגעה לפגישה',
    'תבנית SMS להזמנה / אישור הגעה. משתנים: {{recipientName}}, {{firmName}}, {{date}}, {{time}}, {{address}}, {{wazeUrl}}, {{mapsUrl}}, {{rsvpUrl}}, {{firmPhone}}, {{websiteUrl}}, {{lawyerName}}, {{title}}'
)
ON CONFLICT (category, setting_key) DO NOTHING;
