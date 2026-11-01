# Card saving and due subscription collection

Status: local implementation and synthetic-provider verification; **not deployed**.
Product base: `origin/main` at `047567a8`. The reported MelamedLaw release
`0631caf7` has the same legacy setup settlement defect. No customer billing data
was used to infer a new bill or changed by this work.

## Behavior

- Hosted card verification is an independently verified payment with a saved
  token. It never clears subscription debt, grace, errors, or changes the plan,
  price, renewal date or last subscription payment.
- After verification commits, a separate durable payment reservation collects
  the agreed due subscription amount. The billing row and unresolved payments
  serialize hosted checkout, callbacks, manual retries and maintenance.
- Setup authorization is bound to its recorded due cycle. Old successful setup
  records and setups performed without debt cannot fund a later cycle. A setup
  blocked by an existing unresolved payment cannot become a fresh charge when
  that payment later fails.
- A positive agreed amount, an enabled billable account, and an existing due
  date or recorded delinquency are required. A canceled future renewal does not
  create debt. Recovery of an existing failed payment does not enable auto-renew.
- Initial signup retains its separate three-calendar-month agreement. Zero-price
  agreements remain readable and cause no charge or paid-period advancement.
- Verified success commits the payment, account transition, audit and existing
  payment notification outbox together. Definite declines preserve the original
  grace window. Timeout, malformed response, missing transaction or failed
  independent verification leave a reservation pending; they never authorize a
  second charge. An unpaid notification/browser cancellation cannot clear it.
- Payment return and confirmation use the result of the specific payment rather
  than an existing `active` account flag.
- Both billing screens retain the checkout identity and confirm it with the
  server before showing success. The dialog accepts only its own gateway iframe
  messages, deduplicates them, and refreshes account/access state after an
  unconfirmed result. Saving a plan without collecting money is not labeled paid.

## Documents

Takbull hosted checkout and token charges request `CreateDocument:true` within
the single payment operation, including an actually collected verification fee.
The stored shared-office owner's details or the signup agreement contact supply
the recipient. Dedicated offices use an explicitly verified deployment contact:
`BILLING_CUSTOMER_EMAIL`, optionally `BILLING_CUSTOMER_NAME` and
`BILLING_CUSTOMER_PHONE` (name falls back to `FIRM_DISPLAY_NAME`). With no
configured email the request omits it; an arbitrary administrator's inbox is
never substituted. These variables were not changed on any live tenant.
No separate document-creation retry is attempted after an uncertain
payment. Safe provider document references are stored on the payment intent and
exposed in billing history; a reference never establishes email delivery.

The existing merchant default determines document type. An optional
`TAKBULL_DOCUMENT_TYPE=320` (tax invoice/receipt) or `400` (receipt) overrides it;
invalid values fail before a provider write. Confirm the merchant's document,
tax and email delivery settings and the actual recipient in QA before release.
The provider payment API has no delivery acknowledgment in the charge response.
Primary reference: [Takbull API documentation](https://api.takbull.co.il/ApiDocs).

## Verification and reproduction

Final backend gate: **122 passed, 0 failed, 1 skipped** in
[`focused-tests.tap`](focused-tests.tap); the skipped test is the separately
configured full signup/office-policy integration. The isolated HTTP identity
regression also passed (1/1; Supertest required a local-listener sandbox allowance).
The real PostgreSQL multi-client gate passed **35/35**, with no skips, in
[`postgres-tests.tap`](postgres-tests.tap).
Frontend Jest: **13/13** passed with mocked confirmation responses, spoofed
messages and duplicate callbacks; see [`frontend-tests.log`](frontend-tests.log).
The four changed frontend JavaScript files compile through the existing Babel
configuration, and the Hebrew/English/Arabic locale JSON parses; see
[`frontend-compile.log`](frontend-compile.log). A later follow-up completed six
actual browser flows against synthetic loopback API/iframe services and reran
the UI tests after an agreed-price display correction; see
[`qa-followup/REPORT.md`](qa-followup/REPORT.md). A full production build and a
real-provider browser/payment/receipt flow were not run.

All provider writes, provider reads, email and signup provisioning in the focused
billing fixtures are synthetic. No real payment, document, email, cron, production
database operation or deployment was run. No new database migration is required;
durable collection metadata uses the existing intent JSON column.

Run the focused tests using `node --test` on the changed regression files and the
existing billing, signup payment verification and settlement tests. Dependency
versions come from the backend lockfile; this run used Node 24.14.0 and PGlite
0.5.10. Installed test-only PGlite was outside the source tree in `/tmp`.

`cardSetupDebtCollection.test.js` normally uses disposable PGlite. For real locks,
`BILLING_TEST_POSTGRES=1` uses only the fixed synthetic target
`127.0.0.1:55449`, database `billing_card_setup_qa`, user `billing_qa`, and a fresh
schema per test with `pg.Pool` up to eight connections. This run initialized a new
PostgreSQL 17 cluster under `/tmp`, listened only on loopback, ran the suite and
stopped that cluster. Never redirect this fixture to customer databases.

The separately gated complete signup/office-policy integration test still
requires `SIGNUP_RELEASE_QA_CONFIG` for its named disposable release database.
It is skipped when that configuration is absent; the targeted signup renewal
and initial-signup boundaries are covered by the portable mocked-provider tests.

## Release holds

No branch was merged, no tenant deployed, and no live accounting correction was
made. Land reviewed code on `main`, then follow the existing Melamedia QA gate
before any customer branch or deployment. Confirm the full signup/office-policy
suite and the real-provider sandbox receipt/email flow during QA. The exact
missing environment and provider settings holds are recorded in the follow-up.

Existing customer records previously advanced by the setup bug are deliberately
not rewritten or billed by an old setup callback. Their actual payment history,
period, amount and recovery action require a separate approved reconciliation.
Uncertain payments must be reconciled using provider evidence before retrying;
this patch intentionally provides no automatic replay of an unknown charge or
unknown document creation.

## Wider payment and tenant reconciliation follow-up

The later comprehensive QA includes stricter hosted-order binding, saved-card
operation validation, fresh locked annual amounts and due checks, frozen paid
periods, and pending-payment guards on package edits. Its current-source test
results supersede the earlier backend counts above; see
[`comprehensive-qa/README.md`](comprehensive-qa/README.md).

The additional mailbox search found a contemporaneous 1 ILS purchase
notification, not a fiscal document:
[`receipt-search/README.md`](receipt-search/README.md).
Current branch/deployment identity and the preservation-first consolidation
plan are in [`version-audit/REPORT.md`](version-audit/REPORT.md). Shared code is
not yet published or deployed to any tenant by this task.
