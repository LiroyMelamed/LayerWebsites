# Unified document packages — 18 November 2026

Mixed Word/PDF recipes, private/office access, immutable source revisions, source-bound Word signature anchors, shared data IDs, separate data roles, common field editor, private drafts and existing signing-engine handoff implemented behind SIGNING_PACKAGE_RECIPES_ENABLED=true (default off).

Qualification: LOCAL-QUALIFICATION.json binds source hashes to evidence logs. 70 backend tests passed, including actual supplied rental conversion/reflow 7 to 8 pages and native publish/send idempotency; backend sources are unchanged since that run. The final frontend regression run passed 172 tests in 10 suites at main 68c8f46b. The branded QA production build and protected release check passed at QA 7294a165. QA backend is 602a8fca (later changes are frontend-only).

Live QA passed for source upload, stable numeric text selection, private draft save/reopen, mixed Word/PDF shared manual values, missing role-linked identity override, clearing an override when changing a person, fresh use without prior client values, review invalidation after input changes, and 390px layout. The supplied rental was converted and inspected but never sent or signed.

Synthetic submission b8192dd2-e539-42f1-8058-0724136c25e6 completed end to end: invitation received in the owner's iCloud inbox, actual SMS OTP for both documents, both signatures accepted, admin status 2/2 complete, signed Word-derived PDF and original PDF downloaded and visually inspected, two-page evidence downloaded, completed-copy email received and personal receipt downloaded through its public link. Evidence is under the private build cache `document-workflow-20261117/live-qa`; private documents and token URLs are not committed. 390px recipient completion page has no horizontal overflow.

QA delivery exposed a stale sender domain. QA sender was aligned to the already documented `noreply-melamedia@mela-media.co.il`, and inbox receipt then passed. The exact test-recipient allowlist was temporary; restore both the QA environment file and PM2 runtime to an empty allowlist after testing. No client sender settings are changed by this release.

Production rollout, final tag and Figma remain pending. Historical two-Google-account/Gmail/native-iOS checks are not qualified by this feature suite. Existing single-document signing UI is reused, including per-document OTP; the synthetic package was signed through that actual production path, not a simulated provider.

QA runbook: land on main, merge main into registered Melamedia QA worktree, deploy exact backend commit with migrations 2026-11-18_01/02/03, enable SIGNING_PACKAGE_RECIPES_ENABLED only in QA, build branded Melamedia frontend, test admin and signer on marked synthetic packages. Tenant rollout only after live acceptance.

Do not overwrite original rental. Use only QA recipients and synthetic values; recipes retain no filled per-client data. Immutable preparations and native artifacts are actor-private. Shared recipe sources retain original permissions and existing private packages are unchanged.
