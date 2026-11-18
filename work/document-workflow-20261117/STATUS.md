# Approved document workflow — 18 November 2026

Base: 28289e0573a7c4774d73bc837dca7431792dc045.

Implemented: explicit Word title/source binding, independent manual fields, stable selection, scoped missing-value preflight and document-only completion, record-switch override reset; shared case-stage checklists with audited status and file links; configured stage-entry requests, durable per-recipient/channel deliveries, reminder history/cancel/explicit retry, safe unknown outcomes; display-only comma-separated client phones; once-per-user/day reduced-motion-aware dashboard introduction.

Validation before QA: 84 backend scenarios, 91 frontend scenarios; frontend production build; changed UI lint (zero errors, two existing hook dependency warnings). Evidence in /Users/liroymelamed/.cache/melamedia-builds/document-workflow-20261117/release-backend.log and release-frontend.log. The canonical signing TEST-LEDGER.md includes every test run, including failed intermediate runs. No protected signing-baseline source hashes changed.

Deploy order: main → Melamedia QA → actual browser/API checks → production tag/main → MelamedLaw, MorLevi, AshrafEssa separately. Idm retired. New SQL migration defaults automatic reminders off and does not backfill/send requests for historical cases. Shared-office RLS is installed conditionally using the existing isolation functions.

Baseline workflow and shared-checkbox follow-up completed actual QA and deployed to MelamedLaw, MorLevi and AshrafEssa. Word import/library reload/dedupe/PDF probes passed on all three using synthetic documents and cleaned-up records; no real provider messages were sent. Protected branding remained unchanged.

18 November follow-up: empty case-stage requests and case-type defaults are revealed only by “הוספת דרישת מסמכים”; subsequent rows use shared inputs/buttons/checkboxes. Request-history control removed. Existing string-normalized stage counts validated and incremented numerically. Product 1bc4b8af passed 11 focused tests and actual QA 257ce8d7 including saved/reopened type defaults. The optional-request follow-up and shared compact plus (7b1d64bd) were deployed and HTTPS verified on all three clients. Ashraf case5/type10 stage2 list was converted to 22 structured checklist entries, with a private before-state backup; no requests/messages were sent and the current case stage was unchanged.

Remaining limits: Figma alignment blocked by Starter connector quota; no design writes occurred. Additional live Word missing-client-value test was interrupted before completion (unit coverage passed). Earlier Google two-account/Gmail/iOS tasks are not claimed complete by this release.

Latest stage layout: 274520cf shares the existing dashed upload-action appearance with Add document request, places both in one row, and groups updater/date metadata. Updater UI remains management-only (2 dedicated tests). 11 focused tests and lint passed, all 103 protected signing source hashes passed. Actual QA desktop passed. Follow-up 124a43d8 reduces only mobile horizontal padding; actual 390×844 QA passed with both buttons on the same baseline and unchanged font size. Evidence: stage-actions-release/qa-desktop.jpg and stage-actions-mobile-release/qa-mobile.jpg under the private build cache. Synthetic case309 current stage/updater were restored after testing.

Final stage-action release 124a43d8 deployed: QA e511da73; Ashraf 478bad16; Mor 433fa670; Melamed 5cee2903. All HTTPS entrypoint bytes matched their branded builds; protected root branding unchanged, old chunks retained. Backend source fast-forwarded with zero backend diff and no restarts. Evidence: stage-actions-mobile-release/{https-proof.json,server-source.log,*-publish.log}.
