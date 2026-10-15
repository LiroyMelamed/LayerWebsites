-- Add canonical case tenancy without guessing from case manager or memberships.
-- Dedicated legacy databases retain NULL scope. No existing rows are reassigned.
-- Shared-tenant rollout requires a separately reviewed ownership backfill before enabling staff access.
BEGIN;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid NULL
    REFERENCES public.law_firm_tenants(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_cases_law_firm_tenant_scope
    ON public.cases (law_firm_tenant_id, caseid);
COMMIT;
