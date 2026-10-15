-- Preserve accepted recipients/channels across retries; interrupted attempts stay uncertain.
ALTER TABLE user_daily_agenda_settings
    ADD COLUMN IF NOT EXISTS delivery_receipts JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN user_daily_agenda_settings.delivery_receipts IS
    'Per-day hashed-recipient/channel dispatch receipts. sending/uncertain must be inspected before resending.';
