# Signing workflow error email alerts

Owner requirement, 8 October 2026: errors in the signing templates/packages process must also notify platform administrators by email.

## Coverage

- PDF preparation, validation, activation, stage/final/evidence jobs: an error is recorded atomically with `retry`, `needs_attention` or `uncertain` state.
- Invitation/reminder/resend delivery failures and unknown provider outcomes are recorded even when the delivery job itself completes normally.
- Signing office/public HTTP failures (5xx), including OTP delivery failures, produce durable events. Expected validation errors, expired authentication and incorrect OTP entries do not generate technical error emails.
- Worker lease recovery produces the same events. A database outage that prevents all writes cannot be durably recorded in that same database; the existing server error log remains the fallback.

Only active users in the existing `platform_admins` registry receive alerts. Office administrators are not implicitly recipients. Repeated email addresses are deduplicated. Revocation or email change is rechecked immediately before attempting delivery. Historical email receipts do not block deleting a user.

## Delivery

Apply `2026-10-08_01_signing_error_alerts.sql` with the feature migrations. The existing enabled signing worker starts the independent alert scheduler when `SIGNING_V2_PROVIDER=notifications`. It uses the existing transactional HTML email adapter and SMTP configuration, including the existing Melamedia QA outbound guard.

An event waits 15 seconds for aggregation; the scheduler checks every 10 seconds and processes at most four emails concurrently. Summaries group up to 1,000 pending events by office and error/stage/run. Each platform admin gets their own mail. The mail identifies the deployment, the recorded stage/error/state and affected work count, and links to the exact submission when known. No recipient names, document contents, attachments, signatures, OTPs, public grants, exception messages, request headers or bodies are included. Links require ordinary authenticated permissions.

An error is reported once per work item, error code and severity; retry exhaustion escalates separately. Repeated HTTP failures are grouped in five-minute buckets. The body explicitly distinguishes the recorded failure from a potentially recovered current state.

| Email state | Meaning |
| --- | --- |
| `pending` | Durably queued, or retry scheduled after a known pre-send configuration failure |
| `dispatching` | Claimed with a unique token and a five-minute lease |
| `provider_accepted` | The existing adapter confirmed acceptance; this does not claim inbox delivery |
| `simulated` | QA/noop/development result, never described as actually sent |
| `uncertain` | An ambiguous response or process loss after claiming; no blind resend |
| `failed` | Five safe configuration retries exhausted |
| `cancelled` | Recipient no longer an active platform administrator at the same address |

If no valid platform admin address exists, events remain unassigned. The alert worker never calls itself recursively for its own transport errors. Alert failures are retained in `signing_error_emails` and logged without the recipient or content. Neither SMTP latency nor alert failure blocks signing workers.

## Focused verification

`tests/signingV2.errorAlerts.integration.test.js` covers real PostgreSQL trigger commit/rollback and idempotent migrations; repeat/escalated errors; concurrent claims; active recipients; revoked/deleted users; configuration retries; uncertain/noop states; sensitive-input exclusion; exact submission links; and an actual public HTTP failure through the error middleware. All adapters are synthetic.

`tests/signingV2.workerRecovery.integration.test.js` kills actual worker processes after upload, after database publication and after fake-provider acceptance. Restart publishes once, reuses committed artifacts, rejects stale workers and preserves uncertain delivery without resending.

Exact candidate, results, failures and invalidation rules are in the shared `outputs/signing-implementation-20261007/TEST-LEDGER.md`. This document does not grant production approval; representative performance and other F1 gates remain outstanding.
