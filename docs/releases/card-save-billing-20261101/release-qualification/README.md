> **Current status — 3 November 2026:** QA and all three active customers are deployed. See the [completion report](../completion-20261103/README.md) for exact versions, preserved data, verification and remaining limits. The planning/HOLD statements and test counts below are historical snapshots, not the current deployment status.

# Local release qualification — 1 November 2026

**Status: common source and all four client candidates locally qualified at cutoff `074df752`; deployment and financial activation remain HOLD.**
No push, deployment, restart, live configuration/permission change, customer data mutation, provider call, charge, document or email has been performed by this work. The owner now requests staged deployment after the safety gates close; financial configuration, infrastructure and access changes must be presented for separate approval before execution. No intentional charge or new provider transaction is authorized, and owner-waived periods remain untouched.

## Frozen source and integration

The original main baseline `9f01a42d` advanced during qualification to `4917ca1a`, then to **`074df7520497a0cd6bd95ad70353201c905f0aa6`**. All four client refs also advanced through the concurrent legal-system workstream. Their observed complete IDs are retained in the [22:47:52 UTC cutoff](freeze-cutoff.json) and [read-only ref observation](remote-refs.json). Those changes were inspected: they are the shared QA notification/recipient guards, with no private customer/config/branding drift. This run freezes that explicit source cutoff; later refs require a new preflight before any push/deployment.

The final common runtime candidate is **`6a3bd299227291feb0065ae3afa89a1f3ba2967a`** on `codex/billing-current-main-20261101`. Its history preserves the billing fix, original current-main merge `6fab2887`, the complete qualification snapshot, and main `074df752`. All integrations were local, with clean runtime merges and no active/canonical branch overwrite. The later audit commits change documentation only.

The two latest upstream paths are `backend/lib/qaOutboundNoop.js` and its existing recovery test. They tighten channel/full-phone allowlisting. The preceding seven-path update preserves simulated-vs-real signing delivery outcomes. The SMS-sender editor removal is retained. All frontend/compiler inputs, imported backend Word/profile helpers and lockfiles remain byte-identical; earlier actual execution receipts retain their real source IDs.

## Common candidate results

| Gate | Actual result and provenance |
| --- | --- |
| Billing/signup, 27 automatically selected files including pause tests | 217 passed, 0 failed, 1 fixture skip on `6a3bd299` |
| Profile/auth/tenant/Word boundaries, 10 files | 124 passed, 0 failed, 1 fixture skip on `6a3bd299` |
| Pause alone | 14/14 on `6a3bd299`; included in the billing group |
| Consent/outbox/actual SDK recovery | 33/33 on `6a3bd299`; synthetic loopback transports |
| Incoming QA signing/transport delta plus the outbox trio | 40/40 on `6a3bd299`; overlaps the 33 above |
| Real PostgreSQL normal card-save/debt/renewal flow | Fresh 57/57 on `6a3bd299`, no skips; owned local cluster stopped afterwards |
| Protected signing source guard | 103/103; existing manifest unchanged |
| Full frontend | 920/920 tests, 107/107 suites actually run on `9dd9cb36`; exact input-equivalence proof carries them to `6a3bd299` |
| Frozen production compile | 253 hashed outputs actually built on `9dd9cb36`; identical compiler inputs carry to `6a3bd299`, synthetic API only |

The two fixture skips are the unavailable full signup/office-policy database/config and the dedicated profile PostgreSQL socket. They remain HOLD; the separate owned billing SQL fixture does not replace them. Provider payments/documents/delivery are synthetic throughout, including the real-SQL run. The 57 and 14 overlap billing coverage and must not be summed as unique tests.

Evidence: [fresh final-cutoff backend](latest-main-backend/README.md), [fresh cutoff delta](latest-main-delta/README.md), [actual frontend/build](main-frontend/README.md), and [latest byte-equivalence proof](main-frontend/INPUT-EQUIVALENCE-6A3BD299.md). Earlier exact-source results are retained in [9dd backend](main-backend/README.md), [6fab backend](current-main-backend/README.md) and [6fab incoming delta](current-main-delta/README.md). The earlier delta's first synthetic HTTP listener attempt encountered execution-sandbox EPERM; the identical approved loopback retry passed. Its initial evidence remains retained. The final-cutoff delta passed on its first approved execution. No source, assertion or dependency was changed to obtain a pass.

## Final client candidates

Each final client source includes the common `6a3bd299` integration and its own complete latest remote history at the frozen cutoff. Original client branches and the canonical legal-system checkout were preserved. Fresh backend/transport execution on each exact final runtime passed **217 billing, 124 common and 40 transport/consent/outbox/SDK cases**, with zero failures and the same two explicit unavailable-environment skips. The 14 pause cases are included in billing. No client run used an external PostgreSQL database; the fresh 57-case real billing-SQL run belongs to the common source.

| Target | Actual final backend-qualified source | Complete frontend result | Frozen compile | Own evidence |
| --- | --- | --- | --- | --- |
| Melamedia QA | `efe1ee371ad96bc76963ac1848076055cb83066b` | 960/960, 112 suites | 256 outputs, own logo | [report](Melamedia/README.md) |
| AshrafEssa | `9eaebbdb6c23d56d974546e233b8905d19570ef5` | 923/923, 108 suites | 255 outputs, own logo | [report](AshrafEssa/README.md) |
| MorLevi | `b05d66f9f7873753e520c554f4b2c1c540e6682b` | 923/923, 108 suites | 253 outputs, own logo | [report](MorLevi/README.md) |
| MelamedLaw | `21d51f5766e5df0b0ac497fce4cc9d16bdd8bbf5` | 938/938, 110 suites | 253 outputs, own logo | [report](MelamedLaw/README.md) |

All frontend/compile receipts retain their actual execution source: QA `7c3131f2`; Mor `32177813`; Melamed `cc3d2fec`; Ashraf's successful full frontend `fc6f3b46` and build `7309eb63`. They carry to the final runtimes through exact frontend/scripts/imported-backend-helper/package/toolchain/worker/compiler/log equivalence, not a claim of a fresh compile at the final HEAD. Ashraf's first full run had five timing failures in four files; it is retained together with the unchanged focused 75-case pass and the genuinely successful complete 923-case rerun. No assertion, timeout or dependency was weakened.

Each target passed the original 103-file signing guard, 111 original-client-path preservation checks and donor/cutoff source binding. Melamed's three locale conflicts were resolved by adding only `billing.paymentUnconfirmed` while preserving every pre-existing client value/order. No other runtime adaptation or fixture change was introduced by this integration.

For transfer, new `codex/billing-delivery-{melamedia,ashraf,mor,melamed}-20261101` refs are constructed from the clean upstream client cutoff plus the final common audit commit. Their complete tracked product/config/test input trees must exactly equal the corresponding actually-qualified source above. Only the sanitized current evidence trees are exported; all original local qualification branches remain intact. The package metadata records actual delivery SHAs, clean parents and byte-equivalence proofs. No new test execution on the delivery/audit commits is claimed. [Reproduction](reproduce/create-clean-delivery.py).

## Reconnection verification

After the Mac reconnected, the committed runtimes and all client audit tips were verified before continuing. [Backend persistence](reconnection-backend/README.md) verifies eleven source-pinned receipts, nineteen primary log hashes and unchanged code inputs across the five repositories. [Frontend persistence](reconnection-frontend/README.md) verifies receipts, dependency/compiler inputs and all still-present hashed outputs: common253, QA256, Ashraf255, Mor253 and Melamed253. No missing or corrupted artifact was found and no product rerun or code change was needed. The qualified source cutoff remains frozen.

## Financial contract and pause

Card verification alone never pays or advances a subscription. A newly verified card can collect the single current due period at its stored agreed amount. A confirmed real payment settles that period once; a decline or uncertain result does not grant an extra month. Existing signup promotion and agreed renewal pricing remain intact. No multi-month debt ledger, backfill or customer repair was introduced.

The optional application flag `BILLING_OPERATIONS_ENABLED=false` blocks new financial mutations, provider operations and financial messages in this candidate. Unset preserves existing behavior; configured invalid/empty values also pause. Paused callbacks return `503` and `Retry-After: 60`; billing snapshots use existing rows without financial normalization. No live flag was changed. See the [gate contract, tests and limits](../billing-pause-gate/README.md).

Application guards cannot drain old/in-flight processes, prevent submission of an already-issued external payment page, revoke an accepted payment, or guarantee provider callback redelivery. No durable callback inbox was added. Approved drain, issued-order disposition, callback retention/reconciliation and safe resume procedures remain required before any code-only deployment is described as financially quiescent.

## Read-only readiness and remaining holds

The [read-only readiness audit](readiness/README.md) verified the selected live catalog primitives on all four targets and read existing healthy backup reports. Those reports referenced database generations about 19.69 hours old, not new release backups. No customer row was queried. Existing full-signup/profile QA fixtures were absent.

Release still requires authorized full-signup/profile fixtures; a separately verified non-settling sandbox; document type, billing recipient and delivery evidence; fresh DB-only backup/readback/restore evidence; at least three complete inactive rollback versions per component; a restricted startup/deployment contract; operational financial quiescence/reconciliation; and the reviewed deployment contract plus the required separate infrastructure/financial configuration approvals. Conditional deployment intent does not authorize intentional charges or new provider transactions. Selected schema metadata and directory/report counts do not establish these broader gates.

Owner-waived periods remain waived. All previous individual recovery proposals are cancelled, not awaiting approval; no retrospective charge, old setup replay, date/price/card/paid-field correction or gift cancellation is permitted. Customer-specific evidence and instructions remain private outside Git.

The proposed eventual order remains QA → AshrafEssa → MorLevi → MelamedLaw, one target at a time after its own prerequisites. Idm is retired and excluded. Synthetic-API compile artifacts are qualification artifacts only and must never be deployed.
