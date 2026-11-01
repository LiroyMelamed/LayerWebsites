# QA follow-up — 1 November 2026

Result: the local browser gap is closed for the changed billing screens. Full
signup and a new provider sandbox receipt/delivery remain blocked for the exact
environment and read-side-effect reasons below. No deployment or production
billing change was made.

## Actual browser exercise

The Codex in-app browser rendered the real `PlanUsageScreen`,
`PlansPricingScreen`, `TakbullCheckoutDialog`, billing API client, providers,
hooks, translations and styles. Only unrelated navigation imports were replaced.
The API and the separate-origin iframe were synthetic loopback services; a CSP
blocked nonlocal application requests. The invalid local marker only enabled the
real billing-lock provider against this mock API and grants no actual access.
No application token was issued and no account was created.

This is real browser verification of UI behavior and integration boundaries,
not a browser-to-real-Express-to-Takbull end-to-end test. Simulated fee/charge
counters are fixture data, not provider payments. The earlier real PostgreSQL
and mocked-provider backend tests remain the settlement evidence.

Six flows completed successfully through visible UI controls:

| Flow | Observed result | Evidence |
| --- | --- | --- |
| PlanUsage success | A forged parent message left confirmation count 0 and the modal open. Three genuine iframe messages produced one exact intent/order confirmation. Loading appeared before the server response; only afterward did the page show success, saved card, active account and the new renewal date. Plan and lock status were refreshed. | [DOM](browser-success.txt), [image](browser-success.jpg) |
| PlanUsage decline | The verified card remained saved, but the subscription stayed past due with the same date/debt. No subscription success was shown. One confirmation, one simulated verification fee, zero simulated successful subscription payments. | [DOM](browser-decline.txt), [image](browser-decline.jpg) |
| PlanUsage unknown and retry | The pending result remained unpaid and past due. Duplicate iframe messages still produced only one confirmation. A saved-card retry returned pending and showed the unconfirmed message, without showing success or changing the simulated charge count. | [DOM](browser-unknown.txt), [retry DOM](browser-unknown-retry.txt), [image](browser-unknown.jpg) |
| PlanUsage no debt | Saving the card completed its verification only. The future renewal date and active account stayed intact, with no simulated subscription payment. | [DOM](browser-no-debt.txt), [image](browser-no-debt.jpg) |
| PlansPricing success | The hosted order identity from saving the package reached the confirmation endpoint. The screen navigated to PlanUsage with success only after the server response. | [DOM](browser-pricing-success.txt), [image](browser-pricing-success.jpg) |
| PlansPricing unknown | The screen stayed on pricing, showed the unconfirmed message and refreshed plan/lock state. No paid navigation or success notice occurred. | [DOM](browser-pricing-unknown.txt), [image](browser-pricing-unknown.jpg) |

Browser QA found one additional display defect: the current-plan header preferred
the live catalogue total (972 in this synthetic fixture) over the stored agreed
monthly amount (1353). `PlanUsageScreen` now prefers `billing.priceMonthlyIls`;
the browser verified 1,353 in both the header and the next-charge display. The
selection calculator still presents catalogue prices for proposed plan changes.

The final UI source passed **13/13 Jest tests**, four-file Babel compilation and
three-locale JSON parsing again: [tests](frontend-final-tests.log),
[compile](frontend-final-compile.log). The actual browser bundle built
successfully; a full production build was not run.

Source pins, fixture details and setup history:
[hashes](browser-source.sha256), [build](browser-build.txt),
[fixture instructions](BROWSER-FIXTURE.md), [fixture](browser-fixture.cjs).
CUA iframe pointer actions were unavailable, so the actual iframe buttons were
operated using normal keyboard focus and Enter. No JavaScript event injection
was used to activate the production component. The valid browser tab was closed,
visibility restored and both owned loopback servers stopped;
[cleanup](browser-cleanup.txt).

## Full signup gate — blocked, not passed

Action: run `signupLifecycle.officeIsolation.integration.test.js` with its
existing authorized release fixture at `127.0.0.1:55440`, database
`legal_signup_release_20261013_qa`, and `SIGNUP_RELEASE_QA_CONFIG`.

The QA PostgreSQL cluster is running, but that database and the older
`signup_legal_qa` are absent; the referenced private release config is also
absent. Only database names were read. The actual config gate ran and reported
**0 passed, 0 failed, 1 skipped**. No environment was recreated, no new role or
access issued, and no unrelated database was used.

Status: **pending the missing authorized environment/config**, not denied and
not an uncertain execution. [Discovery](full-signup-readiness.md),
[gate output](full-signup-config-gate.tap).

## Existing Takbull TEST access — read-only verified

The existing named TEST pair still authenticates reads of the owned historical
synthetic order and transaction. The provider returned the matching approved
1 ILS card payment and saved-token field. That historical payment has no
document, consistent with the old `CreateDocument:false` implementation.
Identifiers, card data, token and credential values are excluded from evidence.

Two provider writes/settings checks remain unexecuted:

- A new sandbox payment/document/email was not submitted. The authenticated
  responses do not expose a test/non-settlement flag. The local TEST designation
  and historical record establish intended QA use but do not independently
  prove that a new transaction cannot settle real money.
- `GET /api/Account/GetDocumentSettings?lang=he` was not called. The official
  documentation says the first read can initialize missing defaults. Existing
  settings could not be proven, so that call was outside the no-change scope.

Supported document types were checked against the official API documentation:
320 tax invoice/receipt and 400 receipt. There is no type override in the
existing QA config. **The merchant's actual default type and delivery/sender/copy
settings remain unverified**, and no document delivery was claimed.

Status: **pending current merchant sandbox identification and a settings read
that is known not to initialize data**. No new payment outcome exists to
reconcile. Provider writes: **0**. [Provider report](sandbox-readiness.md),
[sanitized authenticated reads](sandbox-readonly-probe.json).

Production deployments, production charges, retroactive receipts, customer
email and changes to customer billing records remain unperformed.
