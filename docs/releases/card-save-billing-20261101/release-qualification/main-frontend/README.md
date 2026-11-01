# Final common frontend qualification

The actual complete test run and production compile used committed source
**`9dd9cb3607ee79434fcfb1aed5a40773e5713789`**, with the same HEAD at finish.
This subtask changed only this new evidence folder; no product code, tests,
assertions, timeouts, signing manifest, dependency installation, environment
file or live configuration was changed.

## Actual results on 9dd9cb36

- **920 passed, 0 failed, 0 skipped**, in **107 suites**. Jest's independent
  discovery lists precisely those 107 files, with no omitted or extra files.
- The full CRACO **production compile passed**, producing **253 hashed files**.
  Main assets: `main.36516af8.js` and `main.4d9ec64c.css`.
- Both gates have `sourceStable:true`, strict committed-HEAD binding, and stable
  dependency locks. They ran under OS network denial and the existing shared
  local heavy-work mutex. Queue time was not reported as test execution.

[Test receipt and exact source/dependency hashes](frontend-tests-receipt.json),
[full test log](frontend-tests.log), [Jest result](frontend-tests-result.json),
[independent discovery](jest-discovery-proof.json),
[production receipt and all output hashes](production-build-receipt.json),
[compiler log](production-build.log), [initial source pins](source-pins.json).

The final test source pin covers all tracked frontend and backend code/tests
and scripts. These are frontend unit/component results, including actual
imported backend Word helpers; they do not replace the parent's backend gate.

## Carry-forward to donor 6fab2887

The later donor is **`6fab2887d056262cf52ddb773a377e5ad804f0d7`**. No test or
compiler run on that donor is claimed. Instead, the
[byte-equivalence and compile-input provenance proof](input-equivalence-6fab.json)
establishes:

- All **834 frontend files**, including all test code/assets/configuration, and
  **28 scripts** have identical path lists, bytes and Git tree identities.
- A full frontend AST scan finds four actual backend import expressions, all
  into the Word helpers. The conservative superset of **ten backend Word/profile
  helper files** is also byte-identical. The only nonliteral import is the
  reviewed bounded frontend locale-JSON expression.
- Frontend and backend package/lock inputs match, and the installed toolchain
  lock hashes still equal those captured during the successful original gates.
- Original receipt/log hashes are verified. The proof records the exact frozen
  archive, original CRACO and temporary cache-wrapper hashes, compiler public
  environment/resource limits, and the generated PDF-worker byte identity.

Thus the successful frontend-input qualification can be carried to the
equivalent donor inputs. **The original execution receipts remain bound to
9dd9cb36.** The donor changes seven backend notification/runtime/email/test paths;
the proof lists them explicitly, and none intersects the imported helper scope.
Their backend behavior requires the parent's separate fresh backend tests.
This is not whole-application, provider, browser or deployment acceptance for
6fab2887. [Read-only reproduction script](prove-input-equivalence.cjs).

## Frozen dependencies and build boundary

Node **24.14.0**. Required package-version mismatches: **zero**. The existing
frontend installation was checked against **1,599 installed packages**; ten
optional platform packages were absent. The temporary exact backend installation
matched **520 packages**, with 36 optional platform packages absent.

Source lock SHA256 values:

- Frontend: `ed0b4c398ffe0d47a2d91e735ee48bf494a0b718534293b59056f91973a6a4ac`.
- Backend: `d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651`.

Compilation exports the exact committed frontend/scripts to a disposable
archive. It retains normal CRACO bundler/lint logic and uses a temporary wrapper
only to route webpack/Babel/ESLint caches into unique `/tmp` paths and limit
resources (two minifier workers, 4 GiB heap). The PDF-worker copy writes only
inside that archive. No `.env` file exists or is sourced there. Inherited
`REACT_APP_*` variables are removed, the public API is explicitly synthetic
localhost, and source maps are explicitly disabled. Common tracked branding is
retained; this is not a customer-configured release artifact.

ESLint remains active and reports **11 warning lines in six files**, covering
unused code, control-character regexes, hook dependencies and mixed boolean
operators. Warnings are preserved; none was suppressed to obtain a pass.

[Complete test recipe](run-tests-only.py) and
[frozen compiler recipe](compile-frozen.py) pin the original source and task
cache paths. Reproduction should use that pinned commit and fresh disposable
outputs, retaining the shared resource mutex and network denial.

## Limits and handling

No browser run was added, and no real payment, invoice/receipt, email, database,
remote, push, deployment, environment provisioning or access grant occurred.
The existing full-signup fixture, provider sandbox/document-settings and live
complimentary-period preservation holds remain separate and unchanged. Unit
fixture runtime settings do not establish or alter any live configuration.

Temporary output remains under
`/tmp/layer-billing-release-qualification-20261101-frontend-cache` for review;
these recipes start no server. No protected ledger or manifest was modified.
