# Google sync, document fields and component consistency — 4 November 2026

Source base: af86028b. Product implementation:68c2455f, scope-status correction:fcd96f45, shared-invitation identity:a9503fdb. Production fleet rollout completed; follow-up component qualification below.

- Automatic owner-scoped bidirectional Google synchronization, deterministic remote IDs, compare-and-merge conflicts, personal-copy deletion isolation, OAuth callback derivation and account/QA boundaries.
- Independent reminder channels and defaults by recipient audience; operational emergency stop retained.
- Named manual Word fields persisted as binding metadata; per-document values only, no client/case record writes. Existing source/version checks preserved.
- Calendar toolbar layout, signing list margins/centered scope, Word start/editor entry/preview fit and dashboard rows.
- Sitewide static inventory: 127 source files containing native/shared controls (component-inventory.json). Native controls inside shared primitives, file/checkbox/radio/canvas controls are not automatically defects. TemplateBuilder and TemplateRoles text inputs migrated to SimpleInput; conflicting local control styles removed. Other native form controls remain follow-up candidates, not claimed visually verified.

## Local verification

Evidence root: /Users/liroymelamed/.cache/melamedia-builds/google-two-way-20261104

- backend-final-1.log: 9 pass, actual isolated PostgreSQL/fake Google transport; includes concurrency, retries, cancellations, permissions, shared-copy deletion and QA prefix boundaries.
- word-custom-backend-1.log: 40 pass, 1 skipped (isolated service DB suite requires separate opt-in); manual block/parcel values differ across documents, leading zeros retained, source untouched, required values enforced.
- word-custom-frontend-2.log: 80 pass across Word workspace, native/legacy template builder and shared input disabled behavior. Earlier failed run retained.
- frontend-final-1.log: 37 pass across personal sync, reminder defaults, signing context, workflow and selector.
- OAuth QA account connected and refresh authorization present, confirmed read-only after owner completed consent. No token included in evidence.

## Live QA evidence

QA58cd5fab, followed by468d0c92/4f3ec27e backend corrections; frontendmain.01dc8ca8.js.

- Real Google authorization includes calendar.events. Automatic scheduler creates, edits and cancels in both directions; repeated cycles preserve exactly2testidentities, then0activeGoogleevents after cancellation. Evidence live-google-{create,edit,verify,cancel-verify}.log. QA limited to owner account and QA-GSYNC prefix, other outbound jobs disabled.
- Fresh manual Word template uploaded, two text selections mapped to named manual fields גוש and חלקה, saved, browser reloaded and template reopened. Fields appear for each use; required blanks disable preparation. Real conversion displays00123/00456 with leading zeros. Evidence word-manual-live-mobile.png. Values do not alter client/case records.
- Calendar desktop toolbar shows centered day/week/month and advanced filter left of enlarge. Narrow Word page446px has no fit-mode overflow; readable mode expands document.
- shared-invitation-dedupe.log:3PASS including actual PostgreSQL, fake provider, reuse of the same invitation identity for an alreadyassigned manager without another exported copy. Scope-status regression3PASS.

## Connection onboarding

Every manager authorizes their own Google account once using personal sync. The scheduled service discovers connected accounts automatically; no per-manager cron or server secret is needed. Office databases, identity links and provider accounts remain separate. Account reuse by another manager and changes to an alreadylinked Google account fail visibly instead of duplicating calendars. A participant deleting their personal copy does not cancel the office event.

Google OAuth consent still requires each human account owner once. Audience is Production; QA, Ashraf, Mor and Melamed callback URIs were saved with owner authorization. New managers no longer require test-user registration. Branding is verified; sensitive Calendar data-access verification was submitted with the approved unlisted video and remains under Google review. The warning/user cap must not be described as removed until Google approves. Imports retain the approved30daysback/365daysforward window; linked events moved outside it are still checked byID.

## Remaining qualification

Production branded builds, rollout and exact HTTPS asset/API verification passed for all four active sites (Google/Word release08ab3a72, agenda/forms6938f148). Idm is retired. Installed native OTP/signature coordinates and Gmail Android owner checks remain unverified. Native source/export/tests are ready, but tenant app rollout is not claimed. Real multi-account provider shared-invitation proof is not claimed; that branch has isolatedPostgreSQL/fakeprovider coverage. No new live send/signature proof was needed or claimed for manual Word fields (earlier owner-confirmed Word signature remains separately recorded).


## Follow-up component audit and compact agenda

Evidence root: /Users/liroymelamed/.cache/melamedia-builds/closure-agenda-20261104.

- Agenda/forms6938f148:198 frontend form regressions,9 calendar tests and4 backend settings/reminder checks passed. First94PASS/10FAIL form run exposed overwritten aria-invalid; corrected and rerun. QA6762b96f browser: desktop agenda50px rows,390px mobile without overflow; no-channel setting persists across reload and new-event form; form validation focuses/labels the correct shared input, corrected values reach review without dispatch.
- All active web tenants deployed and verified: QA6762b96f, Ashraf1fdafffc, Morb68e6f68, Melamed36c4b56a. Main and each release branch have remotely verified annotated AGENDA_FORMS tags. Melamed's existing contractor empty-recipient rule was retained and tested4PASS at merge. Other product deltas are byte-identical; branding differs intentionally.
- AST native-control inventory reviewed. Ordinary composer/directory/template/stage controls now use shared SimpleInput/SimpleTextArea. Follow-up replaces remaining list rename, upload notes/signer/delivery pickers and manager role picker with existing platform controls.27 handoff/context/selector regressions passed; live QA and rollout of this follow-up recorded separately.
- Intentional native controls: underlying shared primitives; file, checkbox and radio controls; HTML-source code editors; OTP/typed-signature and signed-document field capture where exact input behavior is specialized. Legacy CreateCaseType, SignatureSpotMarker and ClientTicketScreen are not routed/imported by the active app; ClientStack redirects support to the current shared support screen. No claim that every native tag is an inconsistency.
- Existing installed-native and Gmail Android checks remain deferred by owner. Real two-account Google shared-event behavior has isolated PostgreSQL/fake-provider coverage, not live two-account proof. WhatsApp QR still needs the office phone scan; official Meta onboarding remains external.
