# AshrafEssa isolated billing qualification

**PASS for pinned candidate `fc6f3b46378daa05b87f06ddfe6b2f58b97c6ab8`, based on shared main `4917ca1a3d25e4224bd64fa8c05048285c0741dd`.** A later main update `074df752` was reported during these checks and is not covered by this receipt; integration of that delta is pending root coordination.

The candidate preserves client base `bc964428a38bfa63a62b3ef6a5782c9b2e86d28a`, merges billing donor `9dd9cb3607ee79434fcfb1aed5a40773e5713789` at `7309eb63`, and then merges updated donor `6fab2887d056262cf52ddb773a377e5ad804f0d7` at `fc6f3b46`. Both real merges had no conflicts or subsequent runtime edits. The second merge introduced exactly seven backend notification and QA-allowlist source/test paths.

- Billing and pause gate: **217 passed, 1 skipped, 0 failed** from 27 files.
- Common document/profile/identity/portal/auth/Word boundaries: **124 passed, 1 skipped, 0 failed** from 10 files.
- Transport, notification consent, outbox and SDK recovery: **40/40 passed** from six files, no skips.
- Fresh complete frontend run at `fc6f3b46`: **923/923 passed, 108/108 suites**, no skipped tests. Every discovered test file ran with `REACT_APP_APP_NAME=ashrafessa`.
- Protected release guard: **103/103**; preserved client branding, PM2, defaults and source preimages: **111/111**. All 41 backend/frontend application and test files changed from earlier main `9f01a42d` to donor `6fab2887` match donor bytes.
- Frozen full production compile at earlier source `7309eb63`: **PASS**, 255 hashed artifacts. Existing tenant-branding logic ran only in an owned export, with a synthetic loopback API and no `.env` files. Fifteen public branding/association paths, four source logos and the index title match AshrafEssa.
- Source equivalence proof: **PASS** for 865 tracked frontend/scripts inputs, exact frontend/scripts Git trees, ten conservatively imported backend helpers, four package inputs, both exact dependency trees/locks, PDF worker, original CRACO, frozen compiler wrapper and matching log hashes. Frontend and build receipts keep their actual source pins. No recompile at `fc6f3b46` or production payload acceptance is claimed.

The two skipped suites require separate real PostgreSQL fixtures: paid signup/renewal office policies and client-profile migration/controller. They were not enabled here; root owns PostgreSQL qualification. This local report does not establish provider sandbox, real receipt/document/email delivery, full tenant-provisioning environment or current-production acceptance.

The first complete frontend run at `7309eb63` had **918/923 pass and five failures across four suites**. The failure evidence is retained under [pinned-9dd](../pinned-9dd/README.md). A focused unchanged rerun passed 75/75 in those four files; a later complete run passed all 923 tests at `fc6f3b46`. The eight involved test/component files were unchanged from the client base and donor; this source identity does not alone diagnose the initial failures. No assertions, fixtures, timeout values or production source were weakened. Final backend/transport and frontend runs used the same exclusive global resource mutex.

The 14 pause-gate cases use synthetic providers, PGlite and guarded local HTTP. They prove protected new-process entry points stop before DB mutation, provider dispatch and financial mail, and IPN GET/POST return retryable 503. They do not establish cancellation of previously created external hosted pages, in-flight provider requests or older processes. Root retains operational draining and replay prerequisites.

No live provider, customer database, mail, production configuration, push or deployment was used. **Owner-waived periods were preserved; customer-specific evidence stays private outside Git.**

Evidence: [provenance](provenance.json), [backend](backend.json), [transport/outbox](transport.json), [fresh complete frontend](frontend.json), [frozen build](build.json), [input equivalence](frontend-build-carry.json), [branding](branding-build-proof.json), [preservation](preservation.json), [donor parity](donor-source-parity.json), [source guard](source-guard.json), [exact dependencies](dependencies.json). Reproduction runners and the conservative import inspector are copied alongside these receipts. Backend network access is blocked by the native test guard; frontend/build use OS deny-network sandboxing.
