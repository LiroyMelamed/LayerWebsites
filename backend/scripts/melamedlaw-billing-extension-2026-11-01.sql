-- MelamedLaw production: extend complimentary through 31/10/2026, first renewal/charge 01/11/2026.
-- Run on the melamedlaw database only (not morlevy / ashrafessa / idm).
-- Resets suspended/past_due so billing maintenance skips charge until renews_at.

UPDATE public.firm_billing
SET complimentary_until = TIMESTAMPTZ '2026-10-31 23:59:59.999+02',
    renews_at           = TIMESTAMPTZ '2026-10-31 23:59:59.999+02',
    status              = 'complimentary',
    grace_until         = NULL,
    last_failed_at      = NULL,
    last_payment_error  = NULL,
    updated_at          = now()
WHERE id = 1;
