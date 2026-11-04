# Google sync, document fields and component consistency — 4 November 2026

Source base: af86028b. Work in progress; no production qualification.

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

## Remaining gates

Live Google API create/update/delete/retry/deduplication and automatic worker proof on QA-GSYNC-only events; real Word save/reopen/convert proof; responsive visual review; branded build and rollout. Native-device OTP/signature and Gmail Android owner checks remain separate and unverified.
