-- MelamedLaw production: complimentary through 30/09/2026, first renewal/charge 01/10/2026.
-- Run on the melamedlaw database only (not morlevy / ashrafessa / idm).
-- Resets a stuck post-trial row so billing maintenance can charge and send grace emails.

UPDATE public.firm_billing
SET complimentary_until = TIMESTAMPTZ '2026-09-30 23:59:59.999+03',
    renews_at           = TIMESTAMPTZ '2026-09-30 23:59:59.999+03',
    status              = 'complimentary',
    grace_until         = NULL,
    last_failed_at      = NULL,
    last_payment_error  = NULL,
    updated_at          = now()
WHERE id = 1;
