# MorLevi isolated billing release qualification

**PASS for pinned local source `af9e8c50e5a5714f6ba4e04d83a71580ee676583`** on `codex/billing-final-mor-20261101`. This is a real, conflict-free integration of client base `f5220552918507a8b34b30cb7fb0cc41f3f0710b`, guarded billing donor `9dd9cb3607ee79434fcfb1aed5a40773e5713789`, and final donor `6fab2887d056262cf52ddb773a377e5ad804f0d7` including shared main `4917ca1a3d25e4224bd64fa8c05048285c0741dd`. The final evidence commit changes documentation only. No claim is made about later upstream changes or deployed software.

| Check | Result |
| --- | --- |
| Final billing and pause gate | 27 files; 217 pass, 0 fail, 1 explicit real-PostgreSQL signup skip |
| Final common boundaries | 10 files; 124 pass, 0 fail, 1 explicit isolated profile-PostgreSQL skip |
| Final transport/consent/outbox/SDK recovery | 6 files; 40 pass, 0 fail or skips |
| Full frontend | All 108 discovered files; 923 pass, 0 fail or skips; `REACT_APP_APP_NAME=morlevy` |
| Full production compile | Three commands succeeded; 253 artifact hashes; own tenant logo matched |
| Client preservation | 111/111 original client paths byte-identical; 103/103 protected signing files pass |
| Donor source binding | All 41 donor-changed application/test/script paths exactly match final donor |
| Dependencies | 520 backend and 1599 frontend installed versions checked; zero drift; optional platform absences 36/10 |

The final backend and six transport files were rerun on `af9e8c50e5a5714f6ba4e04d83a71580ee676583` under the shared global resource lock with the native offline guard. They assert unchanged source and HEAD. The financial suite includes all 14 pause-gate cases: unset/default compatibility and fail-closed configured values; zero protected mutation/provider/mail assertions while paused; read-only snapshots; callback/outbox retention; retryable GET/POST IPN 503 with Retry-After; and replay after resume. Enabled synthetic cases collect one due period once and charge the following scheduled cycle at the full stored agreed price, including ₪532/₪1,353 scenarios. Declines and uncertain results grant no free month; trials, zero debt and future free periods remain protected. There were no runtime adaptations or test fixture changes in this client branch.

The frontend tests and full compile remain honestly pinned to original source `3217781317b54b3143d8bfba29475f2ab42485bd`. They finished cleanly before the final merge. [Equivalence evidence](frontend-build-carry.json) verifies all 865 tracked frontend/scripts inputs, 10 conservatively selected imported backend Word helpers, four package inputs, both Git tree objects, source and installed dependency locks, locked PDF worker, original CRACO, frozen compiler wrapper and receipt log hashes are unchanged. Those prior passing receipts are carried to the final source; they are **not a new compile at the final HEAD**. The old backend proofs are retained under [pinned-9dd](pinned-9dd/).

Compilation used a frozen Git export, no `.env` files, own `morlevy` branding, synthetic API `http://127.0.0.1:55799/api`, original CRACO behavior with isolated caches and constrained minimizer parallelism, OS network denial and the shared resource lock. It completed with lint/deprecation warnings retained in [build.log](build.log). Its output is QA evidence and is not an actual deployment payload.

All database rows/provider responses were synthetic or PGlite. No external PostgreSQL, provider, mail, document, customer data, live configuration, push or deployment operation occurred. Owner-waived periods were preserved; customer-specific evidence stays private outside Git. The pause proof covers guarded new-process paths; it cannot retract existing hosted pages or prevent provider operations already in flight.

The two environment skips are explicit: `paid signup and renewal with real PostgreSQL office policies` and `client profile migration and controller persist on isolated PostgreSQL`. Real PostgreSQL qualification remains with the root agent; the absent signup/profile environments, provider sandbox/document type/delivery validation, production draining and rollback readiness remain separate release gates. No provider document reference proves actual email delivery.

Evidence: [backend](backend.json), [transport](transport.json), [frontend](frontend.json), [compile](build.json), [carry](frontend-build-carry.json), [preservation](preservation.json), [donor binding](donor-binding.json), [guard](source-guard.json), [merge](merge.json). Logs and reproduction tools are included here. `qualify-final-client.py` backend/transport execution must be outer-wrapped in `with-build-lock.py`.
