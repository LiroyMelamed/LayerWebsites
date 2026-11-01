# Local release qualification — 1 November 2026

**Status: local qualification in progress; deployment and financial activation remain HOLD.**
No push, deployment, restart, live configuration/permission change, customer data mutation, provider call, charge, document or email is authorized or performed by this work.

## Frozen source and integration

The previously observed main was `9f01a42dcf85ec36a1e4a6d980c86f44e1eab5e9`. It advanced during qualification to `4917ca1a3d25e4224bd64fa8c05048285c0741dd`; QA advanced from `615078693afd117e2d488f5c5355f1338d622ad8` to `1d61825c2fac7503f5cf7f25ff3543cde471914d`. The three customer branch baselines did not change at that observation.

The current isolated integration commit is `6fab2887d056262cf52ddb773a377e5ad804f0d7` (`codex/billing-current-main-20261101`), merging main `4917ca1a` into the financial-gate candidate `9dd9cb36` without conflicts. It preserves both current main updates: hiding SMS-sender editing and correctly distinguishing simulated QA signing deliveries. The increment changes seven backend paths only; all frontend/compiler inputs and lockfiles remain byte-identical. Earlier source-bound receipts are retained with their actual commit IDs; this is not a claim that an earlier run executed a later commit.

## Common candidate results

| Gate | Actual result and provenance |
| --- | --- |
| Billing/signup, 27 automatically selected files including pause tests | 217 passed, 0 failed, 1 fixture skip on `6fab2887` |
| Profile/auth/tenant/Word boundaries, 10 files | 124 passed, 0 failed, 1 fixture skip on `6fab2887` |
| Pause alone | 14/14 on `6fab2887`; included in the billing group |
| Consent/outbox/actual SDK recovery | 33/33 on `6fab2887`; synthetic loopback transports |
| Incoming QA signing/transport delta plus the outbox trio | 40/40 on `6fab2887`; overlaps the 33 above |
| Real PostgreSQL normal card-save/debt/renewal flow | Fresh 57/57 on `6fab2887`, no skips; owned local cluster stopped afterwards |
| Protected signing source guard | 103/103; existing manifest unchanged |
| Full frontend | 920/920 tests, 107/107 suites actually run on `9dd9cb36`; exact input-equivalence proof carries them to `6fab2887` |
| Frozen production compile | 253 hashed outputs actually built on `9dd9cb36`; identical compiler inputs carry to `6fab2887`, synthetic API only |

The two fixture skips are the unavailable full signup/office-policy database/config and the dedicated profile PostgreSQL socket. They remain HOLD; the separate owned billing SQL fixture does not replace them. Provider payments/documents/delivery are synthetic throughout, including the real-SQL run. The 57 and 14 overlap billing coverage and must not be summed as unique tests.

Evidence: [fresh current-main backend](current-main-backend/README.md), [incoming main delta and unchanged approved retry](current-main-delta/README.md), [actual frontend/build and byte-equivalence provenance](main-frontend/README.md), [earlier exact-source backend retained](main-backend/README.md). The delta's first synthetic HTTP listener attempt encountered execution-sandbox EPERM; the identical approved loopback retry passed. Its initial evidence remains retained. No source, assertion or dependency was changed to obtain a pass.

## Financial contract and pause

Card verification alone never pays or advances a subscription. A newly verified card can collect the single current due period at its stored agreed amount. A confirmed real payment settles that period once; a decline or uncertain result does not grant an extra month. Existing signup promotion and agreed renewal pricing remain intact. No multi-month debt ledger, backfill or customer repair was introduced.

The optional application flag `BILLING_OPERATIONS_ENABLED=false` blocks new financial mutations, provider operations and financial messages in this candidate. Unset preserves existing behavior; configured invalid/empty values also pause. Paused callbacks return `503` and `Retry-After: 60`; billing snapshots use existing rows without financial normalization. No live flag was changed. See the [gate contract, tests and limits](../billing-pause-gate/README.md).

Application guards cannot drain old/in-flight processes, prevent submission of an already-issued external payment page, revoke an accepted payment, or guarantee provider callback redelivery. No durable callback inbox was added. Approved drain, issued-order disposition, callback retention/reconciliation and safe resume procedures remain required before any code-only deployment is described as financially quiescent.

## Read-only readiness and remaining holds

The [read-only readiness audit](readiness/README.md) verified the selected live catalog primitives on all four targets and read existing healthy backup reports. Those reports referenced database generations about 19.69 hours old, not new release backups. No customer row was queried. Existing full-signup/profile QA fixtures were absent.

Release still requires exact final source/client qualification; authorized full-signup/profile fixtures; a separately verified non-settling sandbox; document type, billing recipient and delivery evidence; fresh DB-only backup/readback/restore evidence; at least three complete inactive rollback versions per component; a restricted startup/deployment contract; operational financial quiescence/reconciliation; and explicit source/infrastructure/financial activation approval. Selected schema metadata and directory/report counts do not establish these broader gates.

Owner-waived periods remain waived. All previous individual recovery proposals are cancelled, not awaiting approval; no retrospective charge, old setup replay, date/price/card/paid-field correction or gift cancellation is permitted. Customer-specific evidence and instructions remain private outside Git.

The proposed eventual order remains QA → AshrafEssa → MorLevi → MelamedLaw, one target at a time after its own prerequisites. Idm is retired and excluded. Synthetic-API compile artifacts are qualification artifacts only and must never be deployed.
