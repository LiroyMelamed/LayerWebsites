# Melamedia local merged billing candidate

This is an isolated local integration, **not a pushed or deployed QA release**.
The temporary worktree is `/tmp/layer-billing-integration-20261101/Melamedia`,
owned by this billing integration task. Keep it until the parent records the
Git/bundle handoff and checks active consumers; do not treat it as another
canonical project or remove the separate legal workstream's QA environment.

## Exact source and preservation

- Branch: `codex/qa-billing-integration-20261101`.
- Frozen tenant base: `4a766a35921263260c3139632378444e6550a5e3`.
- Shared candidate merged: `176ff60a` (main `53d177ee` plus the billing series).
- Tested merge: **`2d9c7040ade76ff30aab7026a7c5ccd54d18bafa`**.
- Actual non-fast-forward merge, preserving both parents; **zero conflicts**.
- No product source or test assertion was edited by this QA task.

The QA measured-width `PdfViewer.js` fix, the existing release manifest and all
103 manifest entries are preserved. The source gate passed unchanged with
103 entries: [source-guard.json](source-guard.json). The selected preservation
set contains **107 unchanged paths** covering both protected files, tenant
assets, PM2 ecosystem source and billing defaults; see
[preservation.json](preservation.json). Existing QA private features and branch
lineage remain ancestors. No live configuration or business settings were read
or copied, and none were modified. This does not certify a deployment's loaded
runtime or provider state.

## Current-source results

| Gate | Result | Evidence |
| --- | --- | --- |
| Full discovered frontend tests | **110 suites, 902 passed, 0 failed, 0 skipped** | [receipt](frontend-receipt.json), [Jest result](frontend-results.json), [log](frontend.log) |
| Broad billing/signup backend | **26 files, 191 passed, 0 failed, 1 skipped** | [receipt](billing-receipt.json), [log](billing.log) |
| Common profile/scope/Word-boundary backend | **5 files, 53 passed, 0 failed, 1 skipped** | [receipt](common-receipt.json), [log](common.log) |
| Signing release source guard | **103 protected entries passed** | [result](source-guard.json) |

Counts are per gate and are not added as unique scenarios. The billing skip is
the missing full signup/office-policy release fixture. The common-gate skip is
the separately opt-in `clientDocumentProfile.postgres.test.js` socket fixture;
this task did not connect to it. Real PostgreSQL billing-race testing is owned
by the parent and is separate evidence, not an extra local pass claimed here.

All tested tracked runtime/test/style/schema/config source hashes and HEAD
stayed stable. Backend runs use a pre-socket guard blocking external native
fetch/TCP and application database ports. HTTP tests use ephemeral local
listeners only. The frontend run used an OS sandbox denying all networking.
Provider and email behavior is synthetic; no cron or application server was run.

The final dependency set has **zero installed-manifest version drift** from
the merged lockfiles: 520 backend and 1599 frontend entries, including all
34/34 and 37/37 direct dependencies. The owned backend symlink points to the
exact fresh `/tmp/layer-billing-lock-deps/node_modules`; the frontend reuses the
existing compatible QA installation without changing it. Source and installed
manifest hashes are in [dependency-readiness.json](dependency-readiness.json).
The old canonical dependency mismatch was corrected before the final backend
gate; initial dependency/listener/sandbox evidence is retained separately.

[run-current-tests.cjs](run-current-tests.cjs) reproduces all three test modes.
Backend HTTP fixtures require a local-listener sandbox allowance. The frontend
sandbox needs permission to initialize its deny-network profile. Neither
allowance enables a provider or application database connection in these tests.

## Branded compile

The separate frozen production compile uses Melamedia assets, synthetic
`http://127.0.0.1:55799` public API configuration and an exported copy of the
exact merge. **The full branded compile passed (exit 0)**, with source and
dependency manifests stable. It does not build against a real tenant API or
publish anything.
All generated source scratch, webpack/Babel/ESLint caches and output remain in
the owned `/tmp/layer-integration-Melamedia-build` directory; shared dependencies
and the tested worktree are not build scratch. See
[build-frozen.py](build-frozen.py), [build log](build.log) and
[build-receipt.json](build-receipt.json). Its result is recorded separately from the
unit-test gates and does not constitute browser or runtime acceptance.

The initial export harness stopped before compilation because the local Python
3.9 lacks the newer tar extraction filter API. Explicit path/link validation
replaced that unsupported helper. An optional Python bytecode-cache check was
blocked from writing the system cache; AST syntax validation passed without a
cache write. Neither issue changed product source or a test assertion.

## Remaining release holds

- Full signup/isolation: the authorized release database and
  `SIGNUP_RELEASE_QA_CONFIG` remain unavailable; no fixture or access was created.
- A new actual Takbull sandbox payment/document/email has not been run. Current
  non-settlement identification and safe document-settings inspection remain
  unresolved; the settings GET can initialize defaults.
- Actual merchant document type, sender/copy behavior and receipt email delivery
  remain unverified. Each dedicated office needs a separately verified billing
  contact; this task changes no live contact configuration.
- Combined live QA/browser/customer activation remains outside this local
  integration. Preserve the legal workstream's current Word/profile acceptance
  and run required schema/ACL gates on an independently authorized environment.

No push, remote merge, process restart, deployment, live payment, receipt,
email, customer-data read or billing-state correction was performed.
