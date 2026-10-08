# Client-card sending checkpoint — 8 October 2026

A persisted client card and the read-only client list now open the incumbent signing composer. Entry requires signing upload/client view and an enabled signing API. The card remains mounted so returning retains unsaved edits; only a persisted client ID is passed, and the API reloads contact details after checking access. Selecting the client never assigns a signer role or grants authority. Staff explicitly fill the intended role from the client/case suggestions. Every package in the send has the reviewed client association.

The additive `2026-10-08_04_signing_client_context.sql` stores a nullable, indexed client ID on packages. Historical package revisions and source PDFs are untouched. The association is deliberately not an access grant or a foreign-key cascade; deleting a client must not erase signing history. Client availability/tenant/directory permissions are rechecked on preview, private draft save/recovery and submission, with a transactional share-lock protecting creation from concurrent deletion. Client choice participates in the preview/idempotency hashes.

A stale draft URL from another client/case is rejected before either an editing form or a submitted receipt is restored. The user can start a new send while the previous private draft remains available in recovery. The created run opens directly in pending management.

## Focused evidence

Base `629c7ed` plus this checkpoint. Immutable evidence root: outer workspace `outputs/signing-implementation-20261007/workflow-ux-20261008/`.

- `client-context-backend03.txt`: 9 unique scenarios /11 including parents pass. Actual HTTP scope/tenant/deleted-client protection, client-bound preview, concurrent identical requests, revoked private drafts, deterministic concurrent-deletion blocking, case regression, 200-package creation and durable-draft regression.
- `client-context-ui05.txt`:54 pass —43 composer,6 draft hook,5 client entry. Explicit he/ar/en role selection, load failure/removal, stale-context editing/submitted receipts, no-edit permission entry and retained unsaved card changes.
- `client-context-migration01.txt`: additive migration and repeat on isolated local55442 only.
- `client-context-lint03.txt`: zero warnings/errors; `client-context-build02.txt`: browser build passes.
- Actual synthetic browser: Hebrew card edit→entry→return, Arabic390px save/reload→review→creation, English1280px layout; no horizontal overflow or console errors. `client-context-browser-db.json` and protected real2-page PDF establish unchanged source/signature geometry, unchanged client record, correct immutable package/client association and one submitted draft. Rebuilt browser restores the submitted receipt without duplication. Mismatched-client UI actions themselves are only unit-tested.
- Earlier failed runs remain in the test ledger. Transient HTTP ECONNRESET did not recur after using one persistent loopback test server; exact prior transport cause is not claimed fixed. An initial browser email equality probe was redacted/false and is not passing evidence; visible company edits and unit email blur prove the retention paths.

## Invalidation / rollback

Access/routes/creation/submission/draft/schema changes invalidate their related backend evidence. Composer/draft-hook/client-entry/locale changes invalidate related UI/browser evidence. Existing signature rendering/public consent is unchanged, but the final candidate still needs focused dependent QA.

Deploy the additive migration before this code. Reverting the code may leave nullable association data/index in place; do not delete signing records or rewrite immutable snapshots. No customer or QA deployment, push or production tag was performed. This is not whole-feature production approval: people/capacity/authority authoring, decline/clarification/completed-copy, frozen bulk management and exact representative/liveQA gates remain.
