-- Consolidate SMS sender setting to a single row.
--
-- History: originally seeded as messaging/SMOOVE_SENDER_PHONE with Hebrew
-- label "מספר שולח SMS". The InforU migration renamed it to
-- INFORU_SENDER_PHONE, but on DBs where the rename never ran (or where
-- activateSmsSenderChange upserted a second row without a label) the UI
-- can show BOTH "מספר שולח SMS" and "INFORU_SENDER_PHONE".
--
-- This migration leaves exactly one live sender row:
--   category=messaging, setting_key=INFORU_SENDER_PHONE, label=מספר שולח SMS

-- 1) Only legacy key exists → rename it.
UPDATE platform_settings
SET setting_key = 'INFORU_SENDER_PHONE',
    label = COALESCE(NULLIF(TRIM(label), ''), 'מספר שולח SMS'),
    description = COALESCE(
        NULLIF(TRIM(description), ''),
        'מספר הטלפון ממנו נשלחות הודעות SMS'
    )
WHERE category = 'messaging'
  AND setting_key = 'SMOOVE_SENDER_PHONE'
  AND NOT EXISTS (
      SELECT 1 FROM platform_settings p2
      WHERE p2.category = 'messaging'
        AND p2.setting_key = 'INFORU_SENDER_PHONE'
  );

-- 2) Both keys exist → keep INFORU, fill empty value/label from legacy, drop legacy.
UPDATE platform_settings AS inforu
SET setting_value = COALESCE(
        NULLIF(TRIM(inforu.setting_value), ''),
        NULLIF(TRIM(smoove.setting_value), '')
    ),
    label = COALESCE(
        NULLIF(TRIM(inforu.label), ''),
        NULLIF(TRIM(smoove.label), ''),
        'מספר שולח SMS'
    ),
    description = COALESCE(
        NULLIF(TRIM(inforu.description), ''),
        NULLIF(TRIM(smoove.description), ''),
        'מספר הטלפון ממנו נשלחות הודעות SMS'
    )
FROM platform_settings AS smoove
WHERE inforu.category = 'messaging'
  AND inforu.setting_key = 'INFORU_SENDER_PHONE'
  AND smoove.category = 'messaging'
  AND smoove.setting_key = 'SMOOVE_SENDER_PHONE';

DELETE FROM platform_settings
WHERE category = 'messaging'
  AND setting_key = 'SMOOVE_SENDER_PHONE';

-- 3) Ensure the surviving INFORU row always has the Hebrew label (covers
--    rows created by upsert without a label, which rendered as the raw key).
UPDATE platform_settings
SET label = 'מספר שולח SMS',
    description = COALESCE(
        NULLIF(TRIM(description), ''),
        'מספר הטלפון ממנו נשלחות הודעות SMS'
    )
WHERE category = 'messaging'
  AND setting_key = 'INFORU_SENDER_PHONE'
  AND (label IS NULL OR TRIM(label) = '' OR label = 'INFORU_SENDER_PHONE');
