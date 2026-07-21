-- Persist structured push payload so the in-app notification list can deep-link.
ALTER TABLE public.usernotifications
    ADD COLUMN IF NOT EXISTS data jsonb NULL;

COMMENT ON COLUMN public.usernotifications.data IS
    'Expo push data payload (deepLink, caseId, signingFileId, token, type, …)';
