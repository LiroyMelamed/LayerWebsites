# Existing customer's due month, then a full-price monthly renewal

Scope follows the owner's latest clarification: **one existing monthly debt**,
not accumulated arrears. Saving a verified card must collect that month's agreed
amount rather than grant a free month. The next due cycle must collect the full
agreed price again. Initial-signup `1 ILS + three calendar months` stays intact.
No multi-period debt feature, ledger, historical backfill or inferred balance
was added. Source discovery found current account state and payment attempts;
attempt counts and elapsed months are not invoices.

The isolated branch is `codex/verified-billing-debt-20261101`. Its source parent
`c21c897b` merges the prior qualified billing candidate `7fe900c9` with freshly
observed shared main `e3ab31d3`. This preserves the newer shared profile, Word
and recipient work. Active/canonical/customer branches remain untouched. The
only additional executable changes in this follow-up are **two test fixtures
and their twelve new regression cases**. The existing payment fix remains the
runtime implementation; no further runtime defect was found in these chains.

## Final gates

| Gate | Result | Evidence |
| --- | --- | --- |
| 26 billing/signup backend files | **203 passed, 0 failed, 1 skipped** | [full backend report](backend/README.md) |
| 10 updated common profile/permission/router files | **124 passed, 0 failed, 1 skipped** | [full backend report](backend/README.md) |
| Real PostgreSQL 17 card/debt suite | **57/57**, including six new full-cycle chains | [full backend report](backend/README.md) |
| Targeted legacy PGlite suite | **57/57** | [output](legacy-targeted.tap), [pins](legacy-targeted.json) |
| Targeted self-service PGlite suite | **22/22** | [output](signup-targeted.tap) |
| All discovered current frontend tests | **920/920**, 107 suites, no skips | [frontend report](frontend/README.md) |
| Frozen production compile | **Passed**, 253 hashed artifacts | [frontend report](frontend/README.md) |
| Existing protected signing source guard | **103/103**, current upstream manifest retained | [backend report](backend/README.md) |

Counts overlap and must not be added as unique scenarios. All 520 backend and
1599 frontend packages match the current lockfiles with no required version
drift. Final sources/dependencies stayed stable. No assertion or timeout was
weakened. The production compiler retained existing lint warnings rather than
suppressing them. Temporary caches stayed separate from shared dependencies.

## Current client patch compatibility

The focused application/test patch was checked against pinned main `e3ab31d3`
and fresh client tips Ashraf `ab271c53`, Melamed `5f3a4459`, Mor `08f1a988`
and QA `ca31b04e`. The shared patch passes **4/5**: Melamed's locale key ordering
requires different patch context. All nine billing JavaScript baselines are
identical across those targets.

A separate [Melamed review patch](compatibility/MELAMED-ADAPTED.md) replaces only
the three locale hunks with surgical additions of `billing.paymentUnconfirmed`.
Its other 21 application/test sections remain identical. The adapted patch
passes, and a disposable-export application verifies exact candidate code/tests
plus preservation of every existing client locale value and key order.

See [shared context results](compatibility/README.md). These are context and
disposable-source checks, not a new full functional/customer-runtime gate for
each tenant. No active customer source, branch, configuration or remote was
changed, and no whole locale file was copied over a client.

## What the new continuous tests prove

`cardSetupDebtCollection.test.js` runs each of these for dedicated and scoped
legacy accounts, using the actual service and SQL:

1. `existing customer pays the due month on card save and the full agreed price
   at next monthly renewal`: verified setup is 1 ILS, the separate subscription
   dispatch is **1353**, and the account is still unpaid at dispatch. Success
   advances renewal to 1 December. At one millisecond before that date there is
   no extra charge. Advancing the controlled service clock to the due date and
   racing maintenance, owner retry and old callback produces exactly one new
   **1353** charge and advances renewal to 1 January. The old callback alone
   never authorizes the new cycle. Two confirmed subscription payments produce
   two notices/events, with the stored agreed amount unchanged.
2. `declined card-save debt grants no free month; explicit recovery is followed
   by a full-price next renewal`: a decline preserves the original due date,
   grace and unpaid state. Replaying setup never retries it. An explicit owner
   retry succeeds; the next scheduled month then charges 1353 once. A declined
   dispatch is not counted as a successful payment.
3. `uncertain card-save charge grants no free month; the same verified
   transaction settles before next full-price renewal`: uncertain verification
   retains one pending reservation and no paid period. Later verification
   settles that same provider transaction without another dispatch. The next
   monthly cycle then charges 1353 once.

`selfServiceCardSetupCollection.test.js` adds six further chains:

- Separate **532** and **1353** agreed-price cases: due-month collection,
  before-due skip, concurrent next-cycle renewal and replay protection.
- A recorded three-calendar-month trial from November to February remains
  unchanged by replacement-card saving. Full 1353 renewals occur only at its end
  and in the following month; the next date also respects Israel's DST change.
- A definite decline, explicit owner recovery and the next full renewal.
- Timeout and unverified approval preserve pending/unpaid state even after
  advancing to next month; no additional dispatch or free period occurs.

The self-service uncertainty cases intentionally require reconciliation of the
existing reservation. They do not claim automatic recovery through that service
or invent a DB settlement to get a passing result.

Both fixtures now bind each synthetic transaction to its own dispatched amount.
Different months have different synthetic transaction IDs, so a second payment
cannot pass using a recycled approval from the first month.

## Proof boundaries and existing affected records

The legacy 57-case SQL gate uses a real, owned PostgreSQL cluster and real
multi-client row/advisory locks. PGlite also executes the actual SQL for its
portable cases. Provider writes/reads, payment approvals, document responses,
email and provisioning boundaries are **synthetic** in every test. No live
cron, customer payment, provider operation or email was performed. The owned
55449 SQL cluster was stopped and its listener verified absent afterward.

These are backend service/SQL end-to-end chains across a simulated clock, not a
real payment-provider checkout or production future-charge guarantee. The
self-service trial is seeded as a recorded agreement; complete signup
provisioning is not newly claimed. The earlier browser exercise has its own
source/API-fixture scope and is not silently relabeled as this fresh run.

Existing records incorrectly advanced by a historical 1 ILS setup remain a
separate recovery action. Deployment alone does not rewrite them, and an old
successful setup callback deliberately cannot initiate retrospective billing.
The separately authorized affected-account read-only diagnosis is retained
privately outside Git. No customer billing evidence or identifiers were copied
into this source report.

The existing renewal rule is unchanged: after verified payment the next monthly
date is based on successful collection, using the existing calendar helper. No
new fixed-anchor or historical accounting policy was chosen. A one-off recovery
of an already-corrupted account still needs a separately authorized, reviewed
operation and confirmation of its exact due period and current payment state.

## Remaining environment/release holds

- Complete signup/office-isolation QA still lacks its named release database and
  `SIGNUP_RELEASE_QA_CONFIG`; that parent test is explicitly skipped.
- The separately owned client-profile PostgreSQL fixture was not supplied;
  its one parent test is explicitly skipped in the common gate.
- New Takbull sandbox payment/document/delivery remains untested: independent
  current non-settlement merchant identity and safe document-settings/defaults
  verification are still missing. No provider call was made by this follow-up.
- The broader common-main Word/schema/app-role and tenant release requirements
  remain deployment work. No customer migration, setting, source, process or
  remote branch was changed. Retired Idm remains excluded.

All work is local. No push, deployment, receipt, email, real charge or production
billing correction was executed.
