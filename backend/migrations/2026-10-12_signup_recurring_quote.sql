-- New self-service agreements freeze the final renewal charge (legal VAT rate is zero).
-- No backfill: existing contracts keep the amount to which their owners consented.
ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS recurring_amount_ils numeric(12,2)
 CHECK (recurring_amount_ils > 0);
ALTER TABLE signup_intents ADD COLUMN IF NOT EXISTS vat_percent numeric(5,2)
 CHECK (vat_percent >= 0 AND vat_percent <= 100);
