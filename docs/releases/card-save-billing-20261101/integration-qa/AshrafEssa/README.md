# AshrafEssa local combined candidate — 1 November 2026

Result: **the real local three-way merge and scoped automated gates passed**.
No active customer branch was moved, pushed or deployed. No customer database,
provider, payment, email, receipt, server, process or live configuration action
was performed.

## Source identity and preservation

- Original Ashraf source: `c469ee2e0fb5bee403902c698f6621cb7a08cab3`.
- Unified common source: `176ff60a377136ce6a01b43c1defd23f2fe0674b`, based on
  shared main `53d177ee` and the four local billing/evidence commits.
- Tested merge: **`97b73f91041b0a8d74e07e94fa4d36cdca914f65`**, with those
  two inputs as parents. Git `ort` merged it with **zero conflicts**.
- Review branch: `codex/ashraf-billing-integration-20261101`.

Both inputs are ancestors. All tracked public branding, source logos,
`backend/ecosystem.config.js`, `tenantBillingDefaults.js`, tracked frontend
environment paths and the signing release manifest were preserved from Ashraf.
The original signing guard passed **all 103 protected files**, without changing
its manifest or bypassing its required ancestor. New common client-profile,
tagged-case, text and Word-label behavior comes from the shared source; the QA
branch and its separate Word-overlay changes were not imported wholesale.

[Exact preservation/dependency evidence](integration-preservation.json),
[tested changed-source hashes](candidate-source.sha256).
Git preservation is not a new read or validation of Ashraf's complimentary
period, sender, meetings, ACLs or other live business settings. Those remain
outside this local operation.

## Final tests on that merged source

| Gate | Result | Evidence |
| --- | --- | --- |
| Payment/signup offline backend, 26 files | **191 passed, 0 failed, 1 skipped** | [Output](billing.tap), [selection/commands](backend-results.json) |
| Common profile, exact-read authorization, office-role/customer identity and stubbed rollout guards, 8 files | **89 passed, 0 failed, 1 skipped** | [Output](common.tap), [selection/commands](backend-results.json) |
| Every discovered frontend test, 106 files | **865 passed, 0 failed, 0 skipped**, 106 suites | [Receipt](frontend-results.json), [Jest result](frontend-jest-result.json), [log](frontend-tests.log) |
| Existing signing source-release guard | **103 protected files passed** | [Recorded result](integration-preservation.json) |
| Full local production compilation with Ashraf branding | **PASS**, all four preparation/compiler steps exit 0 | [Receipt](production-compile.json), [log](production-compile.log) |

These are scoped gates, not browser/provider/customer acceptance. Do not add
the counts across separate candidates or combine them with the earlier payment
report as unique coverage. No real PostgreSQL billing race suite was started by
this client subtask; that gate belongs to the root's combined-source run.

The backend uses the exact locked tree `/tmp/layer-billing-lock-deps/node_modules`;
all 512 required packages checked here match the merged lock. The frontend
reuses the existing exact-locked QA dependency tree read-only; all 1,595 required
packages match. No install, dependency mutation or lockfile change was made here.
All frontend source/dependency hashes remained stable during its run.

Backend tests import an explicit offline guard before any test: external native
fetch/TCP and application database ports fail before connection. Only ephemeral
loopback HTTP fixtures are allowed; no application environment was sourced.
The complete frontend run used OS `deny network*` and a unique `/tmp` Jest cache.

### Initial infrastructure failures, resolved

The first backend run in the outer sandbox passed 188 tests and failed three
HTTP fixtures because the sandbox prohibited their ephemeral loopback listeners.
Those were infrastructure errors, not accepted failures or weakened assertions.
The final complete run above used the exact lock tree and local-listener
permission, retaining the offline guard, and passed all 191 executable cases.
[Initial output](initial-billing.tap), [initial selection](initial-backend-results.json).
The initial common run already passed 89 cases with one skip; it was rerun with
the exact dependencies too. A preliminary nested sandbox capability probe was
blocked by the outer sandbox; the actual frontend and build runs then completed
inside the explicitly network-denied sandbox with permission. No automatic
approval denial remains unresolved.

## Production compile boundary

The ordinary local preparation scripts copied Ashraf's own branding and the
installed matching PDF worker. The public configuration was explicitly
synthetic: loopback API/central URLs, `ashrafessa`, single-office mode and Hebrew.
No existing environment file was read or replaced. The original CRACO webpack,
lint and optimization rules were retained. The wrapper only moved filesystem,
Babel and ESLint caches into its unique `/tmp` directory and capped minimizer
parallelism. Heavy compilation held the root's local build mutex; OS network
was denied for all preparation and compilation commands.

The output has **346 files / 26,660,170 bytes**. Main entries are
`main.bb4ccd94.js` and `main.7f3b6bb7.css`; exact output hashes are in the receipt.
Its firm-logo hash equals Ashraf's own source logo. Expected scratch branding,
association and worker changes were restored, owned generated environment files
were removed, and every frontend source/public hash returned to its initial
value. Dependency hashes also remained unchanged. Output/cache lives at
`/tmp/layer-billing-integration-20261101/ashraf-production-compile`.

This is a **compile review artifact with synthetic URLs**, not a deployable
release or authorization to publish, regardless of CRA's generic closing text.
Reproduction scripts: [backend](run-backend-offline.cjs),
[frontend](run-frontend.py), [compile](run-production-compile.py).

## Remaining holds

- The full signup/office-policy integration is skipped because its existing
  authorized `SIGNUP_RELEASE_QA_CONFIG` / named release fixture is absent.
- The common client-profile PostgreSQL integration is separately skipped because
  its approved `CLIENT_PROFILE_TEST_SOCKET` opt-in was not supplied. Its unit,
  actual-route authorization and identity boundaries passed here; no tenant
  schema/RLS/ACL acceptance is inferred.
- New Takbull sandbox payment/document and email delivery remain unexecuted.
  Current non-settlement merchant identity and document default/delivery settings
  are still unverified; the settings GET can initialize data. The original
  [read-only provider holds](../../qa-followup/sandbox-readiness.md) remain.
- No client browser smoke, production API, live schema/grants, loaded runtime or
  billing recipient configuration was validated. Dedicated billing contact and
  exact per-client release acceptance remain pre-deployment requirements.

No unknown mutation outcome exists. The pending actions above were not attempted.
The temporary worktree is owned by this billing integration task and must remain
until the parent has preserved its branch/evidence and finished the local review;
it is not a permanent second client source folder.
