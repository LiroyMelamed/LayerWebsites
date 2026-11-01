# Melamedia billing qualification at cutoff074

**PASS for the recorded local source, with two explicit environment skips.** Qualified runtime `efe1ee371ad96bc76963ac1848076055cb83066b` includes donor `6a3bd299227291feb0065ae3afa89a1f3ba2967a`, cutoff shared main `074df7520497a0cd6bd95ad70353201c905f0aa6` and client history `545779e4b99e111959f4684167dfdf46da1f3186`. Only isolated merges and evidence were added; no runtime or test adaptation was made. The client locale objects retain every prior value and add only the donor billing confirmation key.

| Check | Result |
| --- | --- |
| [Fresh billing and pause gate](billing-and-gate.tap) | 217 pass, 0 fail, 1 explicit real-PostgreSQL signup skip; all 14 pause cases included |
| [Fresh common profile/auth/portal/Word boundaries](common.tap) | 124 pass, 0 fail, 1 explicit profile-PostgreSQL fixture skip |
| [Fresh notification transport/consent/outbox/SDK](transport-and-outbox.tap) | 40 pass, 0 fail, no skips across six files |
| [Complete discovered frontend suite](frontend.json) | 112 files / 960 tests pass, no failure or pending |
| [Frozen own-brand production compile](build.json) | Three commands pass, 256 artifacts, matching tenant logo |
| [Client preservation](preservation.json) | 111 paths preserved, 41 donor changes matched with prior locale values retained; all seven cutoff client/shared-main updates match |
| [Protected source guard](source-guard.json) | 103/103 |
| [Exact locked dependencies](dependencies.json) | 520 backend + 1,599 frontend versions, zero drift; unavailable optional platform packages recorded |

The three backend groups executed freshly at the stated final runtime. The complete frontend suite executed at `7c3131f2b87bcbf69d2e0fb2650aa6d6ab7aef51`, and the full compiler at `7c3131f2b87bcbf69d2e0fb2650aa6d6ab7aef51`. They were **not rerun or recompiled at the cutoff runtime**. The [updated equivalence proof](frontend-build-carry.json) carries those passing receipts through 879 tracked frontend/scripts inputs and matching Git trees, ten imported backend Word helpers, four package inputs, installed locks, original CRACO, isolated cache wrapper, locked PDF worker and log hashes. [AST import analysis](frontend-import-scope.json) bounds the dependency scope. Original [frontend log](frontend.log), [compiler log](build.log), [test details](frontend-result.json), [first backend receipts](pinned-9dd/backend.json) and [complete preceding snapshot](pinned-6fab/README.md) remain available.

The synthetic billing suite covers one due-period collection on verified saved-card setup, the following full agreed-price renewal with simulated time, signup promotions/free future periods, decline, uncertainty, replay, concurrent routes and idempotent provider-document references. The 14 pause cases prove no financial reservation, settlement, provider or mail side effects within the guarded process and retryable 503 callbacks. This does not retract old hosted checkout pages, stop old workers, or cancel provider work already in flight.

Backend fixtures use a native outbound guard; frontend/build use OS deny-network protection. All final heavy groups serialize through the shared global mutex. The compiler uses actual tenant branding and a synthetic loopback API, retained linting and isolated temporary caches with resource caps. It is not an approved production payload. No real customer database, provider, document, mail, live configuration, push or deployment was used. Owner-waived periods were preserved; customer-specific evidence stays private outside Git.

Full signup needs its designated QA database/configuration, the independent profile PostgreSQL fixture remains external, and provider sandbox document/delivery plus operational drain, durable callbacks, rollback and release authorization remain separate gates. This report is bound to cutoff074 observed at2026-11-01T22:47:52Z. Any later remote movement is a release hold; it is not covered by these receipts. No further ref chasing or live acceptance is implied.

See [machine summary](qualification-summary.json), [fresh backend receipt](backend.json), [fresh transport receipt](transport.json) and [reproduction runner](reproduce/qualify-final-client.py). Backend/transport reproduction must be wrapped by the shared global mutex; frontend/build actions already wrap it internally.
