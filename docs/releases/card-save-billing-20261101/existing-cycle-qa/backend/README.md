# Existing monthly cycle: final backend integration gates

Tested source: `c21c897b00fb3a969bd977d62615e6325879a1fc`, merging the retained
billing candidate `7fe900c9` with current shared main `e3ab31d3`, plus the two
uncommitted test files named and hashed in [the receipt](offline-gates.json).
The parent will commit those reviewed tests and this evidence. No runtime code,
test assertion, active branch or protected-source manifest was changed by this
QA subtask.

This follow-up checks the **existing current monthly cycle only**. It adds no
multi-arrears calculation, billing ledger, runtime capability or historical
customer repair. The five payment runtime files are byte-identical to the
retained `7fe900c9` candidate. Their difference from incoming main `e3ab31d3`
is the existing billing patch; merging the newer common work did not replace
that implementation. Exact per-file comparisons are in the receipt.

## Final results

| Gate | Result | Evidence |
| --- | --- | --- |
| 26 payment/signup files | **203 passed, 0 failed, 1 skipped** | [TAP](billing.tap), [selection, hashes and timestamps](offline-gates.json) |
| 10 current common profile/auth/tenant/Word-route files | **124 passed, 0 failed, 1 skipped** | [TAP](common-boundaries.tap), [receipt](offline-gates.json) |
| Real PostgreSQL 17 card verification/debt/renewal suite | **57 passed, 0 failed, 0 skipped** | [TAP](real-postgres.tap), [source-pinned receipt](real-postgres.json) |
| Existing signing source-release guard | **103/103 accepted**, manifest unchanged | [receipt](source-release-guard.json) |

The 57 SQL cases overlap the 203 payment tests; do not add them as unique
coverage. All tracked backend/test/migration/guard inputs remained stable during
the offline runs. The two test-file diffs and current worktree source hashes are
recorded, so these results do not imply that the tests were already committed
at `c21c897b`.

## Clock-driven behavior exercised

The two test files add twelve scenarios to the earlier 191-payment gate.
Provider payment, document, email, transaction-verification and dispatch
boundaries are synthetic; production settlement SQL is exercised in PGlite
and, for the 57 legacy cases, actual PostgreSQL.

- Both dedicated and scoped legacy offices collect **1,353 ILS** for the due
  month after the separate 1 ILS verification. Verification cannot advance the
  paid period. Before the next due instant there is no renewal; at that instant,
  competing maintenance calls, manual retry and old setup callbacks result in
  one new payment at the same full agreed price, not a free month.
- A definite decline preserves the unpaid period and produces no paid notice.
  Old setup callbacks do not retry it. A fresh explicit retry can settle it, and
  the next monthly cycle again charges the full agreed amount.
- An uncertain legacy collection does not grant paid access or dispatch a second
  charge. When the same original transaction becomes independently verifiable,
  it settles once; the later due cycle then charges the full price once.
- Self-service agreement chains cover both **532 ILS** and **1,353 ILS** stored
  prices, two service-level renewals with synthetic approvals, distinct verified transactions, and duplicate
  callback protection. Only a separately recorded three-calendar-month trial
  defers billing; replacing a card does not create or extend that trial. Trial
  expiry and the following cycle both charge the full agreed price.
- Self-service decline/recovery and timeout/unverified-approval chains preserve
  the unpaid date. Merely advancing the clock cannot authorize another charge
  while the original outcome is unresolved.

These are direct local service calls under controlled clocks. No actual cron,
worker, application server, provider payment or customer action was executed.

## Dependencies and isolation

Node **24.14.0** used the existing
`/tmp/layer-billing-lock-deps/node_modules` installation. All **520 installed
packages** still match source lock SHA256
`d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651`, with zero
missing required packages or version drift. Unavailable optional packages are
for other operating systems/architectures. No dependency was installed or
changed in this follow-up; [fresh dependency proof](dependency-proof.json).

The [offline runner](run-offline-gates.cjs) uses a clean environment, the exact
dependency tree and the existing network guard, without the billing snapshot
preload. External requests and application DB ports are blocked before opening
a connection. Temporary synthetic HTTP tests ran with the local-network sandbox
allowance. The runner never supplies signup or profile-PostgreSQL opt-in values.

The SQL run restarted **only** the existing owned cluster
`/tmp/layer-billing-pg.dJ0RrF/data`, on `127.0.0.1:55449`, database
`billing_card_setup_qa`, user `billing_qa`. Every test uses a fresh schema and a
real pool of up to eight clients. The additional [guard](real-postgres-network-guard.cjs)
allows only that TCP target and blocks native fetch; fresh
[negative checks](real-postgres-guard-checks.json) verified that external TCP,
application/signup DB and native HTTP cannot connect. No cluster, database,
role or access was created. A `finally` block stopped the owned cluster after
the run: status reports no server and the listener check is empty;
[cleanup evidence](postgres-cleanup.json).

## Remaining gates

The two skips remain explicit:

1. Full signup/office-policy integration requires the existing named release
   database and `SIGNUP_RELEASE_QA_CONFIG`; neither was supplied or recreated.
2. Client-profile PostgreSQL migration/RLS integration requires its owned
   `CLIENT_PROFILE_TEST_SOCKET` fixture at the test's fixed 55487/55488 socket.
   This task did not receive or borrow that fixture. Other active QA clusters
   were not used.

The separate Takbull sandbox identity, merchant document settings and actual
receipt/email-delivery holds remain unverified. These gates do not establish
live billing correctness, deployed schema/ACL state or real-provider delivery.
No customer data, private reconciliation evidence, live billing row or provider
credential was copied into this evidence. There was no push, deployment,
production mutation, real charge, document issuance or email.
