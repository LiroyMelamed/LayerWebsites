-- Migrate SMS provider Smoove → InforU.
-- The SMS "sender" lives in platform_settings under category 'messaging'.
-- Rename the active sender key SMOOVE_SENDER_PHONE → INFORU_SENDER_PHONE,
-- preserving its current value, label and description.
--
-- Idempotent: only renames when the old key exists and the new one does not.
-- Pending-sender rows (INFORU_SENDER_PHONE_PENDING and its *_REQUESTED_* metadata)
-- are created lazily by the sender-change flow, so no seed is needed here.

UPDATE platform_settings
SET setting_key = 'INFORU_SENDER_PHONE'
WHERE category = 'messaging'
  AND setting_key = 'SMOOVE_SENDER_PHONE'
  AND NOT EXISTS (
      SELECT 1 FROM platform_settings p2
      WHERE p2.category = 'messaging'
        AND p2.setting_key = 'INFORU_SENDER_PHONE'
  );
