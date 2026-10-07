# Signing review — 8 October 2026

Local candidate on `codex/signing-templates-20261006`, based on `df49308`.
No push, merge, deployment or real outbound test messages. This is not F1 production approval.

## Owner corrections implemented

- All package signing uses the incumbent `SignatureCanvas`, its existing drawing pad, OTP and consent controls, required-field flow and completion screen. No separate bulk signing screen.
- “Sign all documents” appears only for at least two **distinct ready PDFs** for the current person, within the existing server admission limit. Multiple pages or multiple roles in one PDF do not qualify. Waiting/accepted tasks are excluded.
- Group selection is fixed before consent/OTP. A later task for the same person after other signers cannot join an earlier approval; it requires a new explicit session and OTP.
- Each original PDF is displayed separately. No client PDF merge, page offsets, coordinate rescaling, new PDF dependency or backend stamping changes. Only one PDF viewer/download is active at a time.
- After aggregate completion only Finish is offered. Real Finish navigation tested: Admin/Lawyer/Staff → admin home; User/Client → client home; no account session → login. The local public harness deliberately opens as a guest.
- Arabic/Persian keypad digits work with incumbent six-digit auto-verification; incorrect codes remain editable.
- Adapter resends retain the same OTP session. Lost acceptance responses reuse an immutable payload/idempotency key; overlapping failed clicks cannot leave local fields falsely signed.
- Builder uses the platform components and a three-step flow: generic roles/order, original PDFs/fields, review/save. Roles can be any person; shared signer can be a client, representative, lawyer or another person. Moving roles preserves IDs and field geometry.
- “Send from template” routes to the v2 composer when enabled; selects the latest published import, or requires explicit conversion of the current version. It never silently sends an older imported revision.
- Removed the alternative public signing UI. Existing platform language drives the UI/invitations; no recipient language picker and no automatic document translation. Added missing date control accessibility labels in Arabic/English.
- Recipient preview counts explicit identities including shared signers, not deduplicated name/contact strings. Stale directory responses cannot replace a newer selection.

## Focused evidence

Workspace evidence: `outputs/signing-implementation-20261007/codex-review-20261008/`.
Exact tested file content: `candidate-final-source-hashes.json`. Shared ledger: `../TEST-LEDGER.md`.

- 51 unique focused UI tests: unchanged template/recovery suites in `ui-09.log`; updated public entry and adapter in `ui-11.log`; actual Canvas and Finish buttons in `ui-12.log`. Failed setup attempts remain preserved; no failures are hidden.
- Backend `backend-01.log`: creation/idempotency for 200 packages plus real public signing/PDF integration. `backend-returning-01.log`: same person signs at stage1 and stage3; early selection rejected, replay cannot sign newly ready PDF, fresh consent/OTP required.
- Lint: `lint-02.log`, updated adapter `lint-03.log`. Isolated browser bundle: `build-08.log`. This is not a production build.
- Browser: original Canvas used for 3 PDFs + 9 required fields in Arabic, and 9 PDFs across 3 packages for a shared signer in Hebrew. Fake OTP only; wrong/correct Arabic digits verified. Narrow 351px view had no horizontal overflow.
- Browser screenshots: `incumbent-he-sign-all-button.png`, `incumbent-ar-three-documents-complete.png`, `incumbent-complete-only-finish.png`.
- 9 final PDFs + 3 evidence PDFs: `final-pdfs/proof.json`, `final-pdfs-01.log`. All final flags and task states confirmed; page boxes/rotation preserved and signature image operators present on both pages. This is **not** a pixel-diff proof of final positions.
- Browser signing proof predates only the final adapter concurrent-failure guard. That path is covered by its focused test; do not present historical browser evidence as a new end-to-end run of the committed candidate.
- Builder exercised in Hebrew/Arabic: role reorder, unchanged original fields, saved revision, narrow review; screenshots preserved. Existing broad system QA was not rerun. Native testing waived explicitly by the owner; responsive browser checks replace it.

## Remaining F1 gates and concrete gaps

1. Server manifests currently allow 200 tasks. A shared signer with 200×3 PDFs exceeds that cap; the current group action is not offered above it. A production-capacity solution needs measured bulk database acceptance and a clear bounded-scope UX, not only a larger frontend number.
2. Full candidate browser pass after the final concurrency guard; final PDF visual geometry comparison, admin-screen downloads and remote Excel path still need completion where not already valid in the ledger.
3. Decline/clarification, completed-copy notifications and v1 projection remain incomplete. The v2 adapter's rejection method is still a stub; do not treat that action as working.
4. Targeted pending actions exist; full frozen bulk-management actions remain incomplete.
5. 600 PDF preparation previously measured 33.8–41.4s locally against 30s; representative p95 durable-creation proof is still unavailable. Existing local timings are not infrastructure acceptance.
6. Crash/restart/dedupe and the unexplained historical no-claim run remain open. No blind retries were added to conceal it.
7. Real provider remains untested under the owner's no-real-send constraint. Do not restore native/store monitoring or deploy to customer environments.

Continue from the ledger/status/state; keep these boundaries visible. Do not restore the superseded standalone UI.
