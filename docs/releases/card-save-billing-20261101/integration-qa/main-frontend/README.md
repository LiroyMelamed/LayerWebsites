# Combined main frontend gates

Exact tested source: **`176ff60a377136ce6a01b43c1defd23f2fe0674b`**, combining
shared main `53d177ee` and the committed billing candidate. No product source,
test assertion, signing manifest or shared dependency installation was changed
by this subtask. Later documentation commits do not change the pinned inputs.

## Final results

- **862 passed, 0 failed, 0 skipped** in **105 suites**. Jest's own discovery
  independently returns exactly the same 105 files: no omitted or extra files.
- The full CRACO production compiler passed, with **253 output files hashed**.
  Source and dependency hashes stayed stable during both gates.
- Node 24.14.0; all test/compile child processes used an OS sandbox denying
  network access. The final complete test run and compilation used the shared
  local build/test mutex to avoid competing heavy tasks.

[Final test receipt](frontend-tests-receipt.json),
[full test output](frontend-tests.log), [Jest result](frontend-tests-result.json),
[independent discovery](jest-discovery-proof.json),
[compiler receipt and output hashes](production-build-receipt.json),
[compiler output](production-build.log).

The test receipt includes exact source hashes, dependency proofs, commands,
selection, runtime and stability checks. Tests that import actual backend Word
modules resolve the same verified backend dependency tree used by the backend
gate; no application database or provider is contacted.

## Dependencies and compiler boundary

The frontend source lock SHA256 is
`ed0b4c398ffe0d47a2d91e735ee48bf494a0b718534293b59056f91973a6a4ac`.
The existing preserved frontend installation was checked against the complete
candidate lock: **1,599 installed packages checked, zero required version
mismatches**, ten absent optional packages. The exact temporary backend
installation was also checked: **520 packages, zero required mismatches**.
See the final test receipt and [initial frontend proof](dependency-proof.json).
Only the owned worktree dependency links were created; no shared package tree
or package/lock file was modified.

Compilation exported the exact committed frontend/scripts to a disposable
archive. It retained the original CRACO optimization/lint configuration, adding
a temporary wrapper only for unique `/tmp` webpack, Babel and ESLint caches,
two minifier workers and a 4 GiB Node heap. The normal PDF worker copy ran only
inside the disposable archive. No `.env` file was present or sourced; inherited
public React variables were removed and the public API was explicitly set to
`http://127.0.0.1:55701/api`. Source maps were explicitly disabled. The existing
tracked main branding was retained; this is a common-source compile rather
than a tenant-configured artifact.

ESLint ran normally and reported nine warning lines in six files, including
control-character regular expressions, unused code, hook dependencies and mixed
boolean operators. No warning was suppressed or product code changed to make
the compiler pass. Build success is not a zero-warning claim.

## Earlier attempts

- The first nested `sandbox-exec` launch could not apply a second sandbox and
  executed no tests. The local command was then permitted outside that outer
  sandbox while retaining OS network denial. Its output/receipt are preserved
  as `initial-sandbox-tests*`.
- The first complete run had **853 passes and nine failures**: four Word
  backend-import tests lacked the backend dependency link, and five asynchronous
  focus/callback/UI assertions failed while heavy tasks ran concurrently. Its
  complete logs/result/receipt are preserved as `first-full-frontend-tests*`.
  Supplying the verified backend link and serializing the unchanged full suite
  produced the final green gate; no assertions or timeouts were changed.
- One intermediate rerun was intentionally terminated when the parent required
  the shared resource mutex. Only processes holding its unique owned test log
  were stopped. This is recorded in
  [the interruption record](interrupted-before-resource-lock.json), not counted
  as a test result. Two launcher-only issues (a Python print argument and macOS
  `/tmp` canonical-path comparison) were corrected before the final gate.
- The initial queued build phase was stopped before compilation by an existing
  temporary-directory guard. The successful compiler used the separate
  cache-isolated, mutex-protected recipe.

Current entry points are [the test runner](run-tests-only.py) and
[the frozen compiler](compile-frozen.py). They pin the source and use dedicated
task cache paths; reproduction requires fresh disposable output paths.

## Scope and remaining holds

These results cover the discovered frontend unit/component suite and production
compilation. Browser evidence is owned by the parent integration gate. They do
not prove full signup, real payment, invoice/receipt delivery, tenant runtime,
branding/configuration activation or deployment. The previously recorded full
signup fixture and provider sandbox/document-settings holds remain unchanged.
No remote, provider, email, database or deployment action was performed here.
No protected ledger was modified. The temporary build and cache remain under
`/tmp/layer-billing-integration-20261101/main-frontend-cache` for review; no
server is started by these scripts.
