# MorLevi local combined-source candidate

This is a local integration and verification record, not a deployment or a
claim about current customer data, schema, configuration or provider behavior.

Client base: `a50afb3fccaaee17633328ef62b5695336d73090`.
Incoming common candidate: `176ff60a377136ce6a01b43c1defd23f2fe0674b`, based on
shared main `53d177ee` and the four billing implementation/evidence commits.
Tested three-way merge: **`4d41c5c18eaf4dc53868d2d83f82603c63cc7d1d`**, branch
`codex/mor-billing-integration-20261101`. Later evidence-only changes do not
alter the tested production sources. Root owns the temporary worktree at
`/tmp/layer-billing-integration-20261101/MorLevi`; retain it until review,
Git/bundle preservation and consumer shutdown are confirmed.

## Final gates on the merged source

| Gate | Result | Evidence |
| --- | --- | --- |
| Billing/signup offline selection, 26 files | **191 passed, 0 failed, 1 skipped** | [Output](billing-backend.tap), [exact full-attempt selection](backend-full-attempt-runs.json) |
| Portable Word/profile boundary selection, 16 files | **135 passed, 0 failed, 7 skipped** | [Output](common-backend.tap), [exact selection and exclusion](common-portable-backend-run.json) |
| Entire discovered frontend, 106 files | **865 passed, 0 failed, 0 pending** | [Receipt and selection](frontend-receipt.json), [result](frontend-full.json), [log](frontend-full.log) |
| Source release guard | **103 protected files passed**, required shipped ancestor retained | [Guard result](source-guard.json), [precommit manifest comparison](precommit-protected-check.json) |
| Preserved environment guards | **10 checks passed**, actual tracked-environment guard passed | [Tests](env-safety-tests.log), [guard](env-safety-check.log) |
| Production compiler with Mor branding and synthetic public API | **Passed**, 253 artifact hashes; source and installed lock stable | [Build receipt](production-build.json), [log](production-build.log), [reproduction](run-build.py) |

Counts overlap and must not be added as unique scenarios. No real PostgreSQL
fixture was started or used by this tenant subtask. The common root task owns
the separate real-lock gate.

The frontend gate reran with the shared local build mutex, unchanged assertions
and unchanged default timeouts. A prior resource-contended full run had three
failures (one explicit 5-second deadline and two asynchronous element waits);
all three suites then passed **37/37** in isolation and the final entire gate
passed **865/865**. Both attempts remain in
[the full contention result](frontend-full-contention.json) and
[the focused result](frontend-focused.json). An earlier dependency-path attempt
lacked the backend `saxes` resolution and is retained separately. Initial backend
loopback-listener `EPERM` failures are preserved; the final run used a local
listener allowance while retaining the outbound network guard.

The full common selection also exposed a missing top-level private fixture in
`wordTemplates.http.integration.test.js`, before that file could reach its
opt-in skip. A contended fake-converter startup deadline also failed once.
[That complete attempt](common-full-attempt-missing-fixture-and-contention.tap)
is retained. The final portable selection excludes **only** that missing HTTP
fixture file, explicitly; all remaining assertions and test timeout limits are
unchanged. This is not a passing full Word HTTP integration gate.

## Merge and tenant preservation

The merge had 30 conflicts. [Original stage hashes](conflicts-before.json) and
[resolution records](conflict-resolution.json) preserve the review boundary.
Incoming reviewed conflict hunks were used while retaining auto-merged source:

- The client's billing service was byte-identical to the original common
  baseline. Its replacement is the reviewed billing implementation.
- The Word service, API, picker, native handoff and protected UI units follow
  the already-reviewed Ashraf/common lineage. The incoming release manifest
  was retained unchanged, only together with its matching source; **no manifest
  hash was regenerated**. All 103 protected working files matched before the
  merge commit and the actual committed release guard passed afterward.
- The isolation-schema addition admits `signing_word_authoring_renders` and
  matches the incoming additive Word migration. Attribution/navigation imports
  are additive. Word locale wording follows the reviewed common version;
  there were no client-only locale keys to discard.
- Mor's existing nested `Users` array guard remains. The current main's
  top-level array guards and recomputed tagged-case filters are also present.
- Mor branding and PM2 identity remain. Nineteen tracked Mor branding/runtime
  configuration paths were compared with the client base; only its index HTML
  changed, by the shared accessibility-script inclusion. No logo or firm
  metadata was copied from another customer. Historical system-message source
  preparation notes are retained and explicitly marked historical/Idm-retired.

[Tenant preservation evidence](tenant-preservation.json) records exact hashes.
The remaining runtime JavaScript agrees with the incoming common candidate;
tenant branding, ecosystem configuration and existing environment guards/tests
are retained independently. No private environment file was read or copied.

## Dependencies, compilation and source binding

[The final dependency audit](dependency-final.json) checks **1,599 frontend**
and **520 backend** installed package versions against this candidate's exact
lockfiles: zero required mismatches. Platform-optional absences are explicit.
An initial canonical-backend version mismatch was discovered and replaced by
the separately prepared exact lock tree, not hidden by a mixed overlay.

Backend tests use only `/tmp/layer-billing-lock-deps/node_modules` and the
existing offline guard. Native fetch/TCP access to external hosts and application
DB ports remains blocked; only ephemeral test HTTP listeners are allowed.
No provider, email or application database action was submitted.

The production compiler uses `git archive` of the tested merge in a disposable
`/tmp` source copy, Mor's own branding and generated PDF worker. It uses an
explicit `https://mor-billing-qa.invalid/api` public API value and no `.env`
file. A temporary config changes only webpack/Babel/ESLint cache destinations;
normal compiler/lint behavior is retained and caches/builds stay outside shared
dependencies. Source maps are explicitly disabled. This proves compilation,
not acceptance with actual tenant configuration or a deployed runtime.

[Source pins](tested-source.sha256) cover 1,537 tracked source/test/script files;
[the final stability check](source-stability.log) passed. Compiler source and
installed-lock stability are also recorded in its receipt.

## Remaining release holds

All following actions are pending or unattempted; none is an uncertain live
mutation or a newly denied operation:

- Full signup/office-policy fixture: the authorized named release database and
  `SIGNUP_RELEASE_QA_CONFIG` remain absent (the billing suite's one skip).
- Actual PostgreSQL client-profile, Word-service, converter and multilingual
  suites remain explicitly gated (seven portable common skips). No socket,
  role, account, database or provider access was created to replace them.
- Word HTTP integration additionally requires the missing private
  `outputs/workflow-improvements-20261023/http-qa/fixture.cjs` and its authorized
  local socket fixture. The failed full attempt is not counted as acceptance.
- The new Word authoring-render migration and the actual application's
  table grants/RLS/client-profile state require qualification on the authorized
  release fixture and per-tenant preflight. No customer schema was inspected or
  changed here.
- A fresh actual Takbull sandbox charge/document/email still needs independently
  verified non-settlement identity and safe document-settings observation;
  merchant document type/delivery and the billing recipient remain unverified.
- Mor's deployed frontend identity remains unverified because the existing
  release lock is absent and its public manifest returned HTTP 403 in the
  earlier read-only audit. A successful local compile does not close that hold.

No push, active client-branch change, deployment, restart, real charge, receipt,
email, customer-data/configuration change or stopped court-mail WIP import was
performed. Idm remains excluded. Review and qualify the exact combined QA source
before any separately authorized customer rollout.
