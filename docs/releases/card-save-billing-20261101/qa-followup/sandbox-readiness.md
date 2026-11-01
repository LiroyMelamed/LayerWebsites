# Existing Takbull sandbox readiness — 2026-11-01

Scope: existing legal signup sandbox configuration and one previously created
synthetic order only. No new credentials, access, order, payment, document,
email, account or settings were created or updated. No production endpoint was
called with production credentials. Provider writes: **0**.

## Verified now

- The private existing legal QA configuration selects `TAKBULL_MODE=test` and
  has a complete named `TEST_TAKBULL_API_KEY` / `TEST_TAKBULL_API_SECRET` pair.
  It contains no production or legacy payment credential pair and no
  `TAKBULL_DOCUMENT_TYPE` override. Values were never printed or copied.
- A current authenticated `GetOrder` read of the owned historical synthetic
  order returned HTTP 200 and exactly matched its recorded identity, ILS,
  amount 1, completed status and a single transaction.
- The corresponding authenticated `GetTransaction` read returned HTTP 200 with
  matching identity, ILS 1, approved card charge status and a saved-token field.
  It reports `isDocumentCreated=false` and no document reference, consistent
  with the previous setup implementation requesting no document.
- The returned order/transaction objects did not expose a boolean test/sandbox
  indicator. These reads prove that the existing TEST credentials remain usable
  for their historical fixture; they do not independently certify that a new
  payment cannot settle in a real account.

Sanitized response evidence: [`sandbox-readonly-probe.json`](sandbox-readonly-probe.json).
Order, transaction, token, card, contact and merchant identifiers are excluded.

## Document type and delivery evidence

[Current official Takbull API documentation](https://api.takbull.co.il/ApiDocs)
confirms `320` as tax invoice/receipt and `400` as receipt. Document creation is
requested with `CreateDocument`; the customer object supports `Email`.
`GetDocumentSettings` exposes per-language defaults, tax treatment, email
content and merchant-copy settings. The documentation explicitly says that a
first call can initialize missing language defaults from the merchant profile.

Because no existing Hebrew settings record could be proven locally, the
settings endpoint was **not called** under the instruction to avoid changes.
Consequently the sandbox merchant's actual default document type, customer
email delivery behavior and sender/copy settings remain **unverified**. The
historical payment has no document and cannot establish delivery of the new
document flow.

## Remaining holds

| Action | Exact target | Status and reason |
| --- | --- | --- |
| New sandbox charge / receipt flow | Existing named TEST merchant through `api.takbull.co.il` | Not attempted. API reads provide no explicit sandbox/non-settlement flag; no new transaction was submitted on the basis of a local variable name alone. Existing credential designation and historical test evidence are recorded, but independent current merchant sandbox identification is still needed before a new provider write. |
| Read document settings | `GET /api/Account/GetDocumentSettings?lang=he` for that merchant | Not attempted. Officially documented initialization side effect conflicts with the no-settings-change scope unless existing settings are first proven. |
| Verify actual document delivery | A newly issued test document to a controlled test recipient | Pending the preceding two holds. No document or email was issued; the payment API's document reference does not acknowledge email delivery. |

No action was denied by automatic approval review. The initial restricted
network read failed DNS resolution; the exact read-only probe then succeeded
with network permission. Remaining holds are unexecuted actions, not uncertain
payment outcomes. No new payment outcome exists to reconcile.
