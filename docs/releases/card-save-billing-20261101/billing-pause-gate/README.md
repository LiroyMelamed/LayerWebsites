# Local financial pause gate qualification — 2026-11-01

This is a local candidate, not a production change or an authorization to activate billing. No live configuration, provider, customer, document, email or database operation was performed. An owner-waived period must not be recovered or changed; customer-specific instructions remain private outside Git.

## Contract

`BILLING_OPERATIONS_ENABLED` is optional. Unset preserves the existing enabled behavior. Explicit `true`/`1` (case-insensitive, trimmed) enables operations; every other configured value, including empty or invalid values, pauses them. No existing credentials are removed or replaced, and a paused request is never classified as a payment decline.

The gate is checked at application entry points before new intents, account normalization, token storage, provisioning, settlement or failure mutations. It is also checked at Takbull transport boundaries, including direct verification fetches that do not use the main gateway. Paused financial actions and callbacks respond HTTP 503 with `Retry-After: 60`. The webhook specifically does **not** return its normal HTTP 200 acknowledgement during a pause. Billing and signup status reads remain available; billing snapshots use existing rows without creating rows or expiring grace in the database. Existing access-lock calculations still apply.

Billing maintenance and renewal scans skip before database access. Renewal and welcome workers do not start timers while paused. Failed-payment email and welcome delivery stop before lookups/SMTP. Central financial event capture skips before querying, and Central dispatch excludes `payment_received` and `subscription_update` from claims, leaving pending and stale sending reservations unchanged. Other message families retain their existing consent and delivery rules. A second financial transport guard handles a pause observed after a claim, leaving the existing lease for review/recovery instead of declaring failure.

## Runtime map

| Boundary | Files / functions covered |
| --- | --- |
| Flag and HTTP response | `backend/lib/billing/billingOperations.js`: parsing, assertion, error detection, 503 response |
| Dedicated / legacy billing | `firmBillingService.js`: `ensureBillingRow`, `updateBilling`, token save, grace normalization, subscription synchronization, audit, intent creation, upgrade recovery, failure marking, package application, setup follow-up, settlement, checkout, saved-card charge, package upgrade/save, notification/return/cancel, subscription cancellation and maintenance |
| Read-only billing during pause | `getBillingSnapshot`, `getDisabledOptions`: existing SELECTs, pure pricing/lock calculations |
| Shared signup renewals and upgrades | `selfServiceRenewal.js`: renew/owner retry/card-setup follow-up/due scan/failure mutation; `selfServiceUpgrade.js`: upgrade entry and pause-error preservation |
| Signup | `signupService.js`: intent creation, checkout, verified provisioning, payment completion, sync and welcome SMS transport guard; existing new-customer promotion retained |
| Takbull transports | `takbullClient.js`: hosted page, token charge, notification validation and definite-decline verification; `verifySignupPayment.js`: hosted order/transaction verification and direct charged-transaction verification, native or injected fetch |
| HTTP | `paymentWebhookRoutes.js`, `billingController.js`, `publicSignupController.js`: retryable pause; signup return/cancel do not redirect as completion during pause |
| Workers and financial messages | `billingRenewal/scheduler.js`, `billingEmails.js`, `signupWelcomeEmail.js`, `systemMessages/index.js` |

## Local evidence

This table retains the original development qualification on base `a5500556` plus the then-uncommitted gate patch; evidence was recorded after commit `9dd9cb36`. It is not a strict committed-HEAD execution claim. Fresh committed-source runs on `9dd9cb36` and `6fab2887`, including the final 14-case gate run, are separately bound in the [release index](../release-qualification/README.md).

All runs used `offline-network-guard.cjs`. Synthetic ephemeral loopback HTTP was allowed after the sandbox initially denied listening; the guard continued to block external/provider and application database sockets. No application server boot, environment file, sandbox credential or live billing data was needed.

| Evidence | Result |
| --- | --- |
| `billing-plus-gate.tap` | 217 passed, 0 failed, 1 existing real-PostgreSQL fixture skip; existing billing selection plus the new gate suite |
| `gate-final.tap` | Final new gate file: 14 passed, 0 failed, 0 skipped, including the final scheduler and read-option assertions |
| `common-boundaries.tap` | 124 passed, 0 failed, 1 existing real-PostgreSQL fixture skip |
| `outbox-recovery.tap` | 33 passed, 0 failed, 0 skipped; consent controller, outbox and actual SDK recovery against a synthetic loopback server |

The gate suite verifies actual native/injected fetch call counts of zero; legacy and shared services before the first database query; initial signup before consent/account/token changes; SELECT-only status; real PGlite row preservation for active, overdue, suspended and missing accounts; unchanged debt, dates, tokens, pending intents and financial queue rows; zero SMTP and worker timers; financial queue filtering that still admits an unrelated consent family; and real GET/POST HTTP 503 responses. A synthetic resumed callback replay verifies that the same supplied payload reaches the handler once enabled. Existing positive payment, promotion, renewal, failure, uncertainty, concurrency and idempotency tests remain enabled and unchanged in their assertions. Two old VM fixtures import the new helper to preserve their existing tests.

## Required operational limits

This proves the candidate's local application behavior. It does **not** prove a global absence of financial effects during a real deployment:

1. Old processes do not understand this flag. All relevant instances/jobs must run the qualified gate implementation, and old instances plus in-flight requests/worker claims must be drained. A process environment flag is not an instantaneous cross-process transaction barrier.
2. Already-issued external Takbull hosted pages may still be submitted directly to Takbull during an application pause. Vendor-side actions can also occur independently. Inventory, disposition/expiry and reconciliation of those outstanding pages/orders require a separate approved operational procedure. No such provider action was attempted here.
3. HTTP 503 avoids a false local acknowledgement, but these tests do not establish Takbull redelivery or retry retention. This change does not add a durable callback inbox: preserving a request body in a local replay test does not persist an inbound callback. An independently demonstrated retry/ingress/reconciliation procedure is required before treating a paused release as recoverable.
4. A payment already accepted outside the application can include its provider document/delivery. Blocking application fetches prevents new application-triggered payment/document calls; it cannot revoke an external transaction or document already in flight. Existing dispatches need draining and reconciliation.
5. Do not resume ambiguous payments by creating another charge. Existing durable intent/order/transaction reservations must be reconciled before replay or activation. Missing authorized QA fixtures, provider sandbox/document/email evidence and deployment authorization remain separate release prerequisites owned by the release plan.

No schema, ledger, backfill, customer exception or recovery job was introduced. The gate does not change the agreed monthly amount, renewal anchoring or new-customer three-month promotion. No production flag, infrastructure or permissions were changed.
