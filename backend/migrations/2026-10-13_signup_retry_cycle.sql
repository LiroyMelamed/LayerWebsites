-- Retain declined attempts as receipts. At most one unresolved/successful
-- attempt may reserve a billing cycle; owner retries serialize on firm_billing.
CREATE UNIQUE INDEX IF NOT EXISTS firm_signup_renewal_active_cycle_unique
 ON firm_payment_intents(law_firm_tenant_id,signup_cycle_at)
 WHERE signup_cycle_at IS NOT NULL AND status <> 'failed';
DROP INDEX IF EXISTS firm_signup_renewal_cycle_unique;
