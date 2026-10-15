-- Notifications schema indexes / constraints hardening
-- Safe/idempotent: can be run multiple times.

-- UserDevices: used for push token storage.
-- Ensure basic indexes/uniqueness so re-association logic stays sane.

CREATE INDEX IF NOT EXISTS idx_userdevices_userid
    ON public.userdevices (userid);

-- A token should not belong to multiple rows. We keep it partial to avoid NULL uniqueness issues.
CREATE UNIQUE INDEX IF NOT EXISTS uq_userdevices_fcmtoken_notnull
    ON public.userdevices (fcmtoken)
    WHERE fcmtoken IS NOT NULL;

-- UserNotifications: used for notification list queries.
CREATE INDEX IF NOT EXISTS idx_usernotifications_userid_createdat
    ON public.usernotifications (userid, createdat DESC);
