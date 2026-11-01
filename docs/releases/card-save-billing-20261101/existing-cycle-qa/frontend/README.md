# Fresh combined frontend gate

Exact source: **`c21c897b00fb3a969bd977d62615e6325879a1fc`**, the local
combined candidate incorporating fresh main `e3ab` and the existing tested
billing implementation. This subtask changed only this new QA evidence folder;
no product source, test assertions, timeouts, dependency installation, manifest,
environment file or branch was changed.

## Results

- **920 passed, 0 failed, 0 skipped**, in **107 suites**. The first complete
  attempt passed. Jest's own discovery independently lists exactly the same 107
  files; nothing was omitted or added.
- The full CRACO **production compile passed**, with **253 output files hashed**.
  Main assets are `main.b4be0e64.js` and `main.4d9ec64c.css`.
- Tested/compiled source and installed dependency locks remained stable. Both
  gates ran under OS network denial and the existing local build/test mutex.

[Full test log](frontend-tests.log), [Jest result](frontend-tests-result.json),
[test receipt, source/dependency hashes and exact command](frontend-tests-receipt.json),
[independent discovery](jest-discovery-proof.json),
[compiler log](production-build.log),
[compiler receipt and artifact hashes](production-build-receipt.json).

The single-current-debt-cycle and next-full-month renewal behavior has its
separate backend verification. These frontend results do not by themselves
establish a money movement or settlement outcome.

## Frozen inputs and reproduction

Node **24.14.0**. Source lock SHA256 values:

- Frontend: `ed0b4c398ffe0d47a2d91e735ee48bf494a0b718534293b59056f91973a6a4ac`.
- Backend: `d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651`.

The existing frontend installation matched **1,599 installed packages** with
zero required version mismatches; ten optional platform packages were absent.
The existing temporary exact backend installation matched **520 packages**, with
zero required mismatches and 36 optional platform packages absent. The backend
dependency link also allows frontend tests to import actual backend Word
modules. No package or lock file was edited.

The test source pin covers tracked frontend code/tests, scripts and backend
runtime. It deliberately excludes `backend/tests/`, where sibling agents were
editing their separately owned billing regression files. No frontend or backend
runtime drift was observed. Both receipts also record the actual HEAD at finish.

Run [the complete test recipe](run-tests-only.py), then
[the frozen compiler](compile-frozen.py), using fresh disposable output paths.
They use `/tmp/layer-billing-integration-20261101/tools/with-build-lock.py` to
serialize heavy work. All child test/compiler processes use `sandbox-exec` with
`deny network*`. Historical evidence folders are not overwritten.

Compilation exports the exact committed frontend/scripts into a disposable
archive, retains the original CRACO bundler/lint logic, and applies a temporary
wrapper only for unique `/tmp` webpack/Babel/ESLint caches and resource limits
(two minifier workers, 4 GiB heap). The normal PDF worker copy writes only to the
archive. No `.env` file is present or sourced. The public API is explicitly
synthetic localhost; inherited `REACT_APP_*` variables are removed. Source maps
are explicitly disabled. Tracked common-source branding is retained; this is
not a customer-configured release artifact.

ESLint was active and reported **11 warning lines across six files**. They cover
unused code, control-character regular expressions, hook dependencies and mixed
boolean operators; the current `WordSourceViewer` has three hook warnings.
Warnings were preserved, with no suppression or assertion change. A passing
compile is not a zero-warning claim.

## Limits and handling

This is the discovered frontend unit/component suite plus production
compilation. No browser run was added by this subtask, and it does not claim
full signup, a real provider payment/document, email delivery, tenant runtime or
deployment acceptance. The previously recorded signup-fixture and provider
sandbox/document-settings holds are unchanged.

No database, provider, email, remote, push, deployment, new environment or access
operation was performed. Temporary artifacts are retained only under
`/tmp/layer-billing-debt-20261101-frontend-cache` for review; no server was started.
