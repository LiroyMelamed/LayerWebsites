-- Widen UserNotifications.Message from VARCHAR(500) to TEXT.
-- Calendar reminder SMS bodies (with short nav/RSVP links) can exceed 500 chars,
-- which made sendAndStoreNotification fail with "value too long for type character varying(500)".
ALTER TABLE usernotifications ALTER COLUMN message TYPE TEXT;
