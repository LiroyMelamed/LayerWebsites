# AshrafEssa isolated billing qualification

This report currently records the first pinned candidate; final qualification is pending. No live provider, customer database, mail, production configuration, push or deployment was used. Owner-waived periods were preserved; customer-specific evidence stays private outside Git.

Candidate `7309eb636748a8081bbe159053bfba710ffd9bc0` merges client base `bc964428a38bfa63a62b3ef6a5782c9b2e86d28a` with billing donor `9dd9cb3607ee79434fcfb1aed5a40773e5713789`, based on shared main `9f01a42d`. The merge had no conflicts or subsequent runtime edits. This does not qualify newer main `4917ca1a`.

- Billing and pause gate: **217 passed, 1 skipped, 0 failed** from 27 files.
- Common document/profile/identity/portal/auth/Word boundaries: **124 passed, 1 skipped, 0 failed** from 10 files.
- The skipped suites require separate real PostgreSQL fixtures: paid signup/renewal office policies and client-profile migration/controller. They were not enabled here; root owns PostgreSQL qualification.
- Protected release guard: **103/103**; preserved client/branding/PM2/defaults/source preimages: **111/111**. All 34 changed backend/frontend application and test files match donor bytes.
- Initial frontend full run: **918/923 passed; 5 failed across 4/108 suites**, no skipped tests. All discovered test files ran with `REACT_APP_APP_NAME=ashrafessa`. The first result and all failure evidence are retained; no clean full frontend acceptance is claimed.
- Frozen full production compile: **PASS**, 255 hashed artifacts; built firm logo matches AshrafEssa. It ran the existing tenant-branding script in an owned export, with a synthetic loopback API and no `.env` files. This synthetic build is not a deployment payload.

The initial frontend failures are recorded in `frontend-result.json` and `frontend.log`: queued reminder focus and issue-details refresh in SigningPackagesWorkspace; a CaseStageAutomationPanel 5000ms timeout; ClientPopUp invalid-phone update-button state; and SignatureCanvas package completion. The focused rerun passed all 75 tests in those four unchanged suites, with stable source. This does not replace the failed full run or establish clean full-suite acceptance. A second full run at the final merged source is required. No assertions, fixtures, timeout values or production code were weakened.

The 14 pause-gate cases use synthetic providers, PGlite and guarded local HTTP. They prove protected new-process entry points stop before DB mutation, provider dispatch and financial mail, and IPN GET/POST return retryable 503. They do not prove cancellation of previously created external hosted pages, in-flight provider requests or older running processes. Root retains operational draining/replay prerequisites.

Evidence: [provenance](provenance.json), [backend](backend.json), [first full frontend](frontend.json), [build](build.json), [preservation](preservation.json), [donor parity](donor-source-parity.json), [source guard](source-guard.json), [exact dependencies](dependencies.json). Reproduction runners are copied alongside these receipts. External network is blocked by the native test guard and OS deny-network sandbox; heavy frontend/compiler work is serialized by the shared mutex.
