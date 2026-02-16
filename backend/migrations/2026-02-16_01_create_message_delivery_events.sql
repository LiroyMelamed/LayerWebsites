-- message_delivery_events
-- Single-tenant (one DB per firm).  No firm_id column.
-- Used for SMS / EMAIL delivery metering (monthly counts, quota enforcement).

CREATE TABLE IF NOT EXISTS message_delivery_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         TEXT NOT NULL,            -- 'SMS' | 'EMAIL'
    type            TEXT,                     -- optional subtype ('OTP', 'NOTIFICATION', 'SIGN_INVITE', etc.)
    idempotency_key TEXT UNIQUE,              -- prevents double-counting retries
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast monthly count per channel
CREATE INDEX IF NOT EXISTS idx_mde_channel_created
    ON message_delivery_events (channel, created_at);

-- Grant access to app role (adjust role name if different)
GRANT SELECT, INSERT ON message_delivery_events TO PUBLIC;
