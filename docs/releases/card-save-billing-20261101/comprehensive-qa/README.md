# Comprehensive payment QA — 1 November 2026

Final result on the pinned service/test sources: **191 passed, 0 failed, 1
skipped** across **26 backend payment/signup files**. The expanded card/debt
suite separately passed **51/51 with real PostgreSQL row/advisory locks**, no
skips. These overlap: do not add the two counts as unique coverage.

- [Final broad output](backend-broad-final.tap), [exact selection](backend-test-selection.json).
- [Expanded real PostgreSQL output](card-setup-expanded-postgres.tap), [standalone PGlite output](card-setup-expanded-pglite.tap).
- [Source hashes](final-source.sha256), [runtime](runtime.json).
- [Initial dependency/listener failures](backend-broad.tap), [intermediate notes](intermediate-failures.md).

The sole skip remains the full signup/office-policy integration requiring the
absent `SIGNUP_RELEASE_QA_CONFIG` and named local release database. This is not
reported as a passing full signup release. See the separate
[environment discovery](../qa-followup/full-signup-readiness.md).

## Scope and safety

All payment provider calls, document responses and email transports in these
tests are synthetic. The broad suite runs without the test preload that masks
billing snapshots. It also runs with an explicit outbound-network guard: native
fetch/TCP to external hosts and application PostgreSQL ports are blocked before
a socket opens. Only ephemeral loopback HTTP test servers are allowed. The guard
was independently checked against three blocked paths;
[guard checks](network-guard-check.json).

The real SQL suite uses the previously owned isolated PostgreSQL 17 cluster at
`127.0.0.1:55449`, database `billing_card_setup_qa`, user `billing_qa`. It imports
no application DB configuration, uses a fresh schema per test, and a real pool
of up to eight clients. It does not access the unrelated QA cluster on 55440 or
any customer database. No new role, account, access or provider transaction was
created. No production code was changed by this QA subtask; the parent applied
the implementation corrections identified below.

Dependencies used here are the backend lockfile top-level versions: PGlite
0.5.10 and Sharp 0.35.4, installed only in `/tmp/layer-billing-deps`. The initial
Sharp install temporarily advanced a caret PGlite dependency; both were then
pinned with `--save-exact` before the final broad run. No source-tree dependency
or lockfile was modified.

## New meaningful regressions

The card/debt suite grew from 35 to 51 cases; the controller error boundary also
gained a regression. Existing successful assertions were retained. The following
cases use real settlement SQL against both PGlite and PostgreSQL unless noted:

| Risk | Final observed behavior |
| --- | --- |
| Hosted page timeout after provider request | Durable pending reservation; retry and alternate hosted checkout cannot dispatch another payment. |
| Hosted page created but local unique-reference write lost | Pending remains unresolved. A foreign approved order supplied through callback `order_reference` is rejected before transaction verification or account settlement. |
| Saved-card request uses `setup`, unknown or unsupported manual kind | Rejects before intent creation/provider dispatch; controller returns HTTP 400 for the invalid kind. |
| Agreed price changes before annual reservation lock | The charged annual amount derives from the current locked agreement, not the earlier snapshot. |
| Billing is disabled before annual reservation | No provider dispatch. |
| Scheduled annual requests race or repeat after success | One charge for the cycle; later automatic invocation skips instead of buying another year. |
| Monthly payment reconciles after row interval changed to yearly | The frozen monthly intent period governs settlement; a monthly payment cannot grant a year. |
| Legacy interval-only package edit during unresolved payment | Row-locked pending guard rejects the edit. |
| Interval-only save on an agreed-price legacy account | Preserves the stored monthly price instead of silently repricing from the catalogue. |
| Provider succeeds but local transaction-reference persistence fails | Account remains unpaid/pending; later retry does not dispatch again without reconciliation. |
| Two different card setups and repeated callbacks race | At most one subscription payment, one active saved card, and replay does not replace the current card. |
| Successful payment has no provider document reference | Payment settles but document remains explicitly uncreated/unknown; replay does not recharge to create a receipt. |
| Saved-token charge finishes after a newer card was verified | Settlement keeps the newer active card; a `SaveToken:false` charge response cannot rotate it back to the older token. |
| Dedicated deployment has multiple admins and no verified billing contact | No arbitrary admin is selected for receipt delivery. Explicit configured synthetic recipient is covered separately; scoped office owner mapping remains covered. |

The broader 26-file gate also covers provider order/transaction identity,
amount/currency/status/card checks, wrong office, initial signup boundary,
pricing combinations and annual rounding, grace preservation/cancellation,
HTTP signup gating and polling limits, access/privacy, optional consent,
logo validation, welcome email rendering/transport outcomes, package charge
ordering/recovery, audit/outbox rollback, document option validation and
definite versus uncertain provider failure classification.

## Corrections driven by this review

The parent corrected these implementation defects before the final run:

1. A legacy hosted callback without a stored unique reference could otherwise
   settle via an unrelated same-amount transaction obtained through the fallback
   order reference. All hosted callbacks now require the stored identity.
2. `kind=setup` on the saved-card endpoint could otherwise dispatch a full
   subscription charge and then fail setup settlement. Unsupported kinds now
   fail before dispatch.
3. Manual annual pricing could use a stale pre-lock agreement, and automatic
   annual requests could buy an additional period. Pricing/due checks now use
   the locked current row.
4. Legacy plan changes could bypass the pending-payment guard, and settlement
   could use a newly changed interval rather than the paid intent. The common
   guard and frozen interval prevent a monthly payment granting a year.
5. A completed saved-token charge could rotate a newer card back to the older
   token. Only an independently verified hosted order can replace the active card.
6. Interval-only edits could overwrite agreed pricing, and a dedicated database
   could guess the first admin as a receipt recipient. Agreement preservation
   and explicit billing contact configuration replace those behaviors.

## Reproduction and remaining limits

For the broad offline gate, provide dependency paths and run:

```sh
NODE_PATH=/tmp/layer-billing-deps/node_modules:/Users/liroymelamed/Projects/LayerWebsites/backend/node_modules node docs/releases/card-save-billing-20261101/comprehensive-qa/run-offline-suite.cjs
```

The HTTP tests require an ephemeral-loopback listener allowance in the sandbox.
For the separate real SQL gate, start only the existing isolated billing fixture
cluster, then run `BILLING_TEST_POSTGRES=1 node --test
backend/tests/cardSetupDebtCollection.test.js` with the same dependency path.
The fixture itself fixes the local host/port/database/user and drops only its
own fresh schemas. Stop only that owned test cluster afterward.

Still unverified: the unavailable full signup/office-policy release fixture,
a new actual Takbull sandbox document/payment, the merchant's current document
type and delivery settings, and receipt email delivery. The provider readiness
holds in [the follow-up report](../qa-followup/sandbox-readiness.md) remain in
force. The existing browser exercise used synthetic API/iframe boundaries and
does not substitute for a real-provider end-to-end test. No customer deployment,
charge, billing repair or retroactive receipt was performed.
