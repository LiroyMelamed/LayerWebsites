-- A durable cycle reservation for newly consented self-service contracts.
ALTER TABLE firm_payment_intents ADD COLUMN IF NOT EXISTS signup_cycle_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS firm_signup_renewal_cycle_unique
 ON firm_payment_intents(law_firm_tenant_id,signup_cycle_at) WHERE signup_cycle_at IS NOT NULL;
