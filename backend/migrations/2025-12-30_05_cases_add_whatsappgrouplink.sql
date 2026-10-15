-- Adds cases.whatsappgrouplink for WhatsApp group linking feature
-- Safe/idempotent: can be run multiple times.

ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS whatsappgrouplink TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_whatsappgrouplink
    ON public.cases (whatsappgrouplink);
