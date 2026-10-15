# Completed-copy checkpoint — 8 October 2026

Local checkpoint based on 6e40b95; not production readiness or deployment approval.

## Behavior

The existing participant action dialog can send a completed copy after the package is complete and every document visible to that recipient has a ready final artifact. The reviewed manifest binds document IDs, artifact IDs, content hashes, profile version and destination. It never uses the office's broader visibility or a shared person's other packages.

The existing durable dispatch fence rechecks the immutable document visibility, exact final artifacts, current revision and contact version. It creates a package-scoped encrypted `download` capability atomically with dispatch, using the existing grant/item schema. Copies have independent cooldown/history and the established unknown-outcome quarantine; pending is never described as sent. No schema migration is needed.

The existing public route renders a read-only final-document list for download capabilities. Such a capability cannot create a signing session, send/verify an OTP or accept a signature. Downloads always read the protected, hash-checked final PDF; personal evidence never falls back to the full office certificate. The existing download bridge and session-home navigation are reused. Signing tokens retain the incumbent SignatureCanvas flow. Copy links have their own expiry/revocation and do not inherit an elapsed signing deadline.

Delivery reuses the incumbent DOC_SIGNED campaign with scoped document/receipt links and no administrator CC. SMS copy is translated in Hebrew, Arabic and English. The existing platform language preference governs the page; source PDF content/names remain unchanged. No real transport was exercised.

## Evidence

Outer evidence directory: `outputs/signing-implementation-20261007/workflow-ux-20261008`.

- `completed-copy-backend03.txt`: 10 passes including one parent (9 unique scenarios), real PDFs, incumbent OTP/manifest/returning-stage regressions, client denial, package-scoped final copy, exact final bytes, personal receipt, no signing via download grant, profile revocation, capability revocation/expiry, immutable artifacts/frozen manifest and uncertain-send quarantine. The existing signed-document notification adapter is tested with a fake transport.
- `completed-copy-ui04.txt`: 43 focused passes across public signing and pending management, including he/ar/en copy controls, one confirmed request, no signing canvas/session for read-only links and failed-download handling. `completed-copy-lint02.txt` is clean.
- Actual local8127 browser: office selects Client1/shared lawyer, reviews one authorized contract, queues once and observes fake provider acceptance. The public copy excludes the private client annex and Client2. Arabic390px/English1280px have no horizontal overflow; final UI uses existing platform buttons and a scrollable page.
- `completed-copy-browser-db.json`: all four stored final artifacts and six signing-action rows unchanged. `completed-copy-browser-final.pdf` is byte-identical to the actual browser download; `completed-copy-browser-download.json` records hash/time. `completed-copy-browser-receipt.{pdf,json}` proves the downloaded personal receipt matches only the authorized document.
- Guest Finish route observed as LoginStack/LoginScreen. The synthetic harness does not render the actual login page; do not call this a full login test. Office/client role routing remains covered by the reused session-home path checks.
- Build03 adds a scoped44px minimum to action-dialog controls after a measured40px Close control. Its final browser check is recorded in TEST-LEDGER.

## Preserved failed attempts

Backend01 attempted to change immutable synthetic revision/artifact rows; the database correctly rejected those writes, leaving a queued fixture and causing a dependent failure. The corrected test asserts the artifact guard and fault-injects only the queued manifest. Backend02 expiry setup violated expires-after-created; both synthetic timestamps were corrected. No immutability guard was disabled. UI01 used a hardcoded label; UI02 exposed a nested alert, corrected to use the shared StatusNotice's alert once and copy-specific error wording.

The browser download-event wait timed out, but the file was saved by that exact click and its filesystem timestamp/hash/bytes were verified against the protected artifact. Preserve both facts; do not discard the timeout log.

## Reuse and rollback

Changes to actions/completedCopy/delivery/grants/publicSigning/runtime or authorization/routes invalidate their backend/purpose/privacy/delivery evidence. Changes to public view, action dialog, workspace, locale strings or scoped styles invalidate affected UI/visual checks. Public signing/grant changes also require returning-stage consent/OTP regression. This checkpoint does not establish 200/600+ capacity, real-provider or live-QA approval.

Rollback the code checkpoint with the established worker stop/drain procedure; do not delete immutable packages/artifacts or historical evidence. Older code will not read download capabilities or dispatch completed-copy jobs; keep this in a deployment rollback plan before any release. No production tag, push or customer deployment is part of this checkpoint.
