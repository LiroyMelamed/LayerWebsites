-- Yearly billing interval (10% off vs 12 monthly charges).

BEGIN;

ALTER TABLE public.firm_billing
    ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.firm_billing
    DROP CONSTRAINT IF EXISTS firm_billing_interval_chk;

ALTER TABLE public.firm_billing
    ADD CONSTRAINT firm_billing_interval_chk
    CHECK (billing_interval IN ('monthly', 'yearly'));

ALTER TABLE public.firm_payment_intents
    DROP CONSTRAINT IF EXISTS firm_payment_intents_kind_chk;

ALTER TABLE public.firm_payment_intents
    ADD CONSTRAINT firm_payment_intents_kind_chk
    CHECK (kind IN ('setup', 'renewal', 'upgrade', 'retry', 'annual'));

COMMIT;
