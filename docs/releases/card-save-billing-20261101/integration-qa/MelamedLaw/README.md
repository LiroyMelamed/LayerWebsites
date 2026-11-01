# Local MelamedLaw unified candidate — 1 November 2026

Prepared on isolated branch `codex/melamed-billing-integration-20261101`.
This is local source qualification, not a push, deployment, accounting action or
customer-runtime acceptance.

## Source and integration

- Dedicated client parent: `0631caf7b1c829673887e12c1d2e3ffc36c1715b`.
- Reviewed common parent: `176ff60a377136ce6a01b43c1defd23f2fe0674b`, containing
  fresh main `53d177ee` and the four reviewed billing commits.
- Actual two-parent merge: `3a7cb009af25794fc33d3f2e11258a6cbd208916`.
- Final source/test fixture: `b54a4b22f22f0439e312d2faae5d412c49fb597b`.
  Later QA-only commits do not change the tested production source.

All **31 conflicts** were reviewed; see [exact resolutions](conflict-resolution.json).
Shared protected Word units match the reviewed Ashraf/common source. The
existing main release manifest was retained byte-for-byte, without regenerating
hashes. The source-release guard passes **103/103** protected files;
[source guard](source-guard.json).

Locales were merged by key. No client-only changed key existed relative to the
three-way ancestor. The twelve divergent keys per language were shared
`signingWord` wording; their reviewed common values were adopted. No locale
file was used to overwrite tenant-specific content blindly. Historical tenant
system-message preparation notes remain explicitly historical; Idm remains
excluded from current integration/deployment.

Twelve dedicated code/configuration/branding units are byte-identical to the
client parent, including contractor policy/settings/admin enforcement, the
contractor UI, tenant billing defaults, PM2 configuration, public recovery
rules and tenant logos/associations. All 103 protected units equal the reviewed
common source. [Preservation matrix](preservation.json).
No live setting, credential, billing row or customer data was read or changed.

## Final gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Billing/signup portable suite, 26 files | **191 passed, 0 failed, 1 skipped** | [output](billing-tests.tap), [selection and pins](backend-summary.json) |
| Common profile/privacy/portal/router boundaries, 10 files | **98 passed, 0 failed, 1 skipped** | [output](common-tests.tap), [selection and pins](backend-summary.json) |
| Portable Word, 11 files | **83 passed, 0 failed, 6 skipped** | [output](word-portable-tests.tap), [pins](backend-portable-word-summary.json) |
| All discovered frontend tests, 108 files | **880 passed, 0 failed, 0 skipped** | [result](frontend-jest.json), [source/runtime receipt](frontend-summary.json) |
| Preserved contractor accessibility fixture | **3/3 passed**, included in the 880 total | [focused result](frontend-fixture-focused.json) |
| Signing source guard | **103 protected entries passed** | [result](source-guard.json) |
| Full production compile of frozen candidate | **Passed**, exit 0, stable source/dependencies, 253 hashed artifacts | [receipt and artifact hashes](production-build-receipt.json) |

Counts overlap and must not be added as unique product scenarios. Backend gates
used the exact locked dependency tree with no billing-masking preload. External
native fetch/TCP and application database ports were blocked; only ephemeral
loopback HTTP fixtures were permitted. The frontend used an OS-level network
deny profile and explicit non-secret `REACT_APP_APP_NAME=melamedlaw`.
[Dependency evidence](dependencies.json). The backend tested at the merge has
exactly the same backend tree and all 808 recorded file hashes at the final
frontend-fixture candidate; [identity check](backend-final-identity.json).

Initial failures are retained instead of reported as passes:

- The initial complete frontend run had 877 passes and three failures in the
  preserved accessibility fixture. It lacked Router context. The test-only
  repair adds `MemoryRouter` while retaining every accessibility/save assertion.
  A focused attempt also identified the missing public tenant app-name setting;
  the final runner supplies the actual MelamedLaw name. No product code was
  modified to expose the contractor controls.
- Initial broad Word execution had 82 passes, two failures and six skips. One
  failure was a missing unversioned HTTP fixture, and one was the owned fake
  converter's existing three-second startup deadline under parallel heavy load.
  The serialized portable rerun passed without changing any timing assertion;
  only the unavailable external HTTP fixture file was excluded.
- Nested OS sandbox setup initially returned `sandbox_apply: Operation not
  permitted`. The same network-denied tests then executed with the necessary
  local process allowance. No action was rejected by approval review.

The production compiler used an exact Git archive at `b54a4b22`, retained the
existing MelamedLaw public branding, supplied only an explicit public tenant
name and synthetic localhost API, copied the matching PDF worker only inside
the frozen archive, and redirected compiler caches outside shared dependencies.
Original CRACO split logic was retained; only cache/resource settings changed.
It compiled with existing lint warnings (`CI=false`); this is not a strict lint
gate or a build using private deployment configuration. All 253 output files
are hashed in the receipt.

The initial Word group means the broad-attempt `backend-summary.json` correctly
retains an overall failure; use its passing billing/common rows and the separate
final portable Word receipt. Raw logs are retained in the worktree; compressed
copies accompany this report for compact Git preservation: [final frontend](frontend-tests.log.gz),
[initial frontend failure](frontend-initial-fixture.log.gz), [focused fixture](frontend-fixture-focused.log.gz),
[production compiler](production-build.log.gz).

## Remaining environment and release holds

- Full signup/isolation release: `SIGNUP_RELEASE_QA_CONFIG` and named authorized
  `legal_signup_release_20261013_qa` fixture are absent. The skipped test is not
  a successful complete signup lifecycle.
- Actual profile PostgreSQL fixture: `CLIENT_PROFILE_TEST_SOCKET` is not supplied.
  Only portable profile/controller/tenant-scope checks ran here.
- Word HTTP integration imports the absent external file
  `/private/tmp/outputs/workflow-improvements-20261023/http-qa/fixture.cjs` before
  its opt-in gate. It was not altered, replaced or claimed passing. Actual
  PostgreSQL Word service and real-converter/multilingual fixtures remain gated
  off; the six Word skips identify that unavailable scope.
- This full common integration adds
  `backend/migrations/2026-10-26_01_signing_word_authoring_renders.sql` and adds the
  table to the isolation allowlist. Portable tests consumed the exact migration,
  but no customer migration or app-role grant was applied. Before release,
  verify the actual per-client schema and existing signing-table-derived
  SELECT/INSERT grants, plus current `users.client_profile`/bounded-object
  requirements and office-isolation gates.
- A new real-provider sandbox payment/receipt/email remains unexecuted pending
  independent current non-settlement identification and safe merchant document
  settings verification. Dedicated billing recipient configuration must be
  verified separately for this firm. No existing 1 ILS fee was retried.
- No browser-to-real-backend/provider/customer flow was executed on this tenant
  candidate. Production compilation and local unit/mock boundaries do not claim
  that acceptance. No server, PM2, provider, customer DB or remote branch changed.

Temporary worktree owner: delegated integration agent under the billing task.
Keep it until the parent preserves/reviews this branch and shuts down its local
consumers; subsequent cleanup must not discard unpushed source or QA evidence.
