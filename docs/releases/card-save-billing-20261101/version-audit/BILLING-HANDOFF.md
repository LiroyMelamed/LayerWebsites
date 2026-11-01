# Billing candidate handoff to the legal-system workstream

This is a reviewable local candidate, not a deployment or a tenant-state reset.
Production code and tests are committed through **`446aff92`** on
`codex/card-save-collect-due-20261101`, following `6758f644` and `5cf245f2`.
Later audit-only commits do not change these tested production inputs.

## What is ready

- Card verification never settles a subscription. A separate durable reservation
  collects only the current agreed due amount, and successful payment/period/
  audit/outbox settlement is atomic.
- Hosted payment identity is bound to its stored order. Missing references,
  provider timeouts and unknown transaction outcomes remain unresolved instead
  of authorizing a second charge. Unsupported saved-card operations fail before
  dispatch.
- Annual amount/due checks run under the account lock. Paid intent periods are
  preserved, pending payments block plan edits, interval-only edits preserve the
  agreed amount, and completion of an old token charge cannot replace a newer
  saved card.
- Native document creation is requested within the payment operation. No
  uncertain payment/document retry creates another charge or document. Legacy
  recipient configuration is explicit; the first admin is never assumed to be
  the invoice customer. UI success requires server confirmation.

Current-source gates: **191 passed, 0 failed, 1 skipped** across 26 backend
files; **51/51** actual PostgreSQL cases; **13/13** UI unit tests; six actual
browser flows with synthetic API/iframe boundaries. Counts overlap and must not
be added as unique tests. See [comprehensive QA](../comprehensive-qa/README.md)
and [browser evidence](../qa-followup/REPORT.md).

## Integration boundary

The active conversation **המשך שיחת MelamedLaw** owns reconciliation of the
recent Cursor work, client profiles, tagged-case filtering and Word/mobile
behavior. Its current progress and refreshed main/client tips are recorded in
the [version audit](REPORT.md). Do not reset that work to this candidate's
older base, and do not substitute the payment gate for the signing/profile gate.

Review this focused payment change on the **current** shared main, preserving
the newer common work. The production-only compatibility patch and exact file
hashes are in [the context check](patch-compatibility.md). A successful context
check is neither a three-way merge nor runtime acceptance of the combined
release; run the current gates on the exact resulting source.

Use QA's own branch lineage and then a separate integration for each active
client. Keep customer branding, providers, PM2 identity, schema/ACL state,
contractor monitoring, existing tagged-case behavior and per-office business
settings intact. Ashraf's existing free-period/sender/meeting fixes are not
global billing defaults. Do not copy billing rows, email addresses, credentials
or environment values across offices. Idm stays excluded.

## Release holds and existing payment

The full signup/isolation fixture is absent. Current Takbull merchant document
defaults and email delivery are not verified; the settings GET may initialize
data. A new sandbox payment was not attempted without current independent
non-settlement evidence. These remain explicit holds, not failed real payments.

Dedicated deployments need separately verified `BILLING_CUSTOMER_EMAIL` and,
where appropriate, `BILLING_CUSTOMER_NAME` / `BILLING_CUSTOMER_PHONE`. No live
configuration was added here. Configuring one firm's recipient must not change
another firm's recipient.

The existing 1 ILS setup transaction is historical and is not retried or billed
by this patch. The additional [mailbox search](../receipt-search/README.md)
found a purchase notification but no target fiscal document. Collection of the
subscription, correction of its historical billing period and issuing/sending a
document for the existing fee are separate accounting actions; none was run.

After the combined QA candidate is accepted and a deployment is separately
authorized, record a per-tenant manifest containing source SHA, loaded backend
binding, frontend asset/build hashes, schema set, test evidence and rollback
point. Recheck unresolved payments immediately before any separately authorized
billing recovery. No branch was pushed, customer merged/deployed, process
restarted or live billing/receipt/email action performed by this handoff.
