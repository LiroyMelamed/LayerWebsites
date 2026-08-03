-- Hebrew holidays / non-business days (Hebcal sync → calendar hints).
CREATE TABLE IF NOT EXISTS holidays_date (
    id              SERIAL PRIMARY KEY,
    holiday_date    DATE NOT NULL,
    title           TEXT NOT NULL,
    title_he        TEXT,
    category        TEXT NOT NULL DEFAULT 'holiday',
    hebcal_uid      TEXT,
    is_business_day BOOLEAN NOT NULL DEFAULT FALSE,
    source          TEXT NOT NULL DEFAULT 'hebcal',
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_holidays_date_uid UNIQUE (hebcal_uid)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date_day_title
  ON holidays_date (holiday_date, title);

CREATE INDEX IF NOT EXISTS idx_holidays_date_day
  ON holidays_date (holiday_date);
