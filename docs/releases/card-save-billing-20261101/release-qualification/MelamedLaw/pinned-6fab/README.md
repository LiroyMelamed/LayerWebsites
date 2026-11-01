# MelamedLaw pinned local billing qualification

**PASS for the recorded local source, with two explicit environment skips.** Runtime candidate `693921c7c20879f3b14e855a958579b1fda9c30b` includes final donor `6fab2887`, current shared main `4917ca1a` and MelamedLaw target history `5e2da32b`. The initial client base was `5e2da32b`. Only isolated branch merges and evidence files were added. Exactly three locale conflicts were resolved by a single insertion of the new billing confirmation key, preserving every prior client byte and value; see [locale preservation](locale-preservation.json). No runtime or test adaptation was made. The current client already contains the required MemoryRouter accessibility fixture context, with all assertions retained.

| Check | Result |
| --- | --- |
| [Billing and pause gate](billing-and-gate.tap) | 217 pass, 0 fail, 1 explicit real-PostgreSQL signup skip; all 14 pause cases included |
| [Common profile, auth, portal and Word boundaries](common.tap) | 124 pass, 0 fail, 1 explicit profile-PostgreSQL fixture skip |
| [Changed notification transport, consent, outbox and SDK](transport-and-outbox.tap) | 40 pass, 0 fail, no skips across six files |
| [All discovered frontend tests](frontend.json) | 110 files / 938 tests pass, 0 failures or pending |
| [Frozen own-brand production compile](build.json) | All three commands succeed, 253 artifacts, matching MelamedLaw tenant logo |
| [Client preservation](preservation.json) | 111 client hashes preserved; all 41 donor changes exact except preserved locale order/values; all seven shared-main updates match the qualified main snapshot |
| [Protected source guard](source-guard.json) | 103/103 |
| [Locked dependencies](dependencies.json) | 520 backend + 1,599 frontend package versions checked; zero drift; optional unavailable platform packages are explicit |

The backend, common and transport suites executed freshly at the final runtime candidate. The complete frontend suite and compiler executed at `cc3d2fecc6f02230f88485c55d38295d5aff1e75`, before the final seven backend-only updates. They were **not rerun or recompiled at the final runtime**. The [input-equivalence proof](frontend-build-carry.json) carries those passing receipts after verifying all 873 tracked frontend/scripts inputs, their Git trees, the ten backend Word helpers imported by frontend tests, four package inputs, installed locks, original CRACO configuration, frozen cache wrapper, PDF worker and logs. The [AST import proof](frontend-import-scope.json) records the conservative dependency scope. All original [frontend output](frontend.log), [compiler output](build.log), [test result details](frontend-result.json) and [initial backend receipts](pinned-9dd/backend.json) are retained.

The billing suite covers verified saved-card collection of one due period, the following full agreed-price renewal with simulated time, preserved signup promotions and free future periods, decline/uncertainty/races/replay, and idempotent provider-document reference handling. The pause suite checks no financial reservation, settlement, provider or mail side effect in the guarded process and retryable 503 callbacks. It cannot retract already-created hosted checkout pages, stop old processes or cancel provider operations already in flight.

All tests use synthetic fixtures with a native outbound guard; frontend tests and builds use OS deny-network protection and a shared serialization mutex. The frozen compiler uses the actual MelamedLaw branding with a synthetic loopback API, retained linting and temporary isolated caches. Its heap/minimizer resource caps do not create an approved production payload. No actual customer DB, provider, document, mail, push, deployment, live configuration or customer data change occurred. Owner-waived periods were preserved; customer-specific evidence stays private outside Git.

Full signup still needs its designated QA database/configuration, the profile PostgreSQL fixture remains external, and provider sandbox document type/delivery and operational release/rollback gates are outside this local acceptance. No release or provider behavior is claimed. See the [machine summary](qualification-summary.json), [fresh backend receipt](backend.json), [fresh transport receipt](transport.json) and [reproduction scripts](reproduce/qualify-final-client.py).

A subsequent shared-main snapshot `074df752` was observed after these runs. This report remains bound to the stated `6fab2887` integration and does not claim qualification of the later snapshot. The coordinator owns its next isolated integration.
