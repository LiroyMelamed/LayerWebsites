-- Separate renewal consent from paid access. Existing exemptions stay unchanged.
ALTER TABLE firm_billing ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true;
