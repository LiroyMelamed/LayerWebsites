# Approved document workflow — 18 November 2026

Base: 28289e0573a7c4774d73bc837dca7431792dc045.

Implemented: explicit Word title/source binding, independent manual fields, stable selection, scoped missing-value preflight and document-only completion, record-switch override reset; shared case-stage checklists with audited status and file links; configured stage-entry requests, durable per-recipient/channel deliveries, reminder history/cancel/explicit retry, safe unknown outcomes; display-only comma-separated client phones; once-per-user/day reduced-motion-aware dashboard introduction.

Validation before QA: 84 backend scenarios, 91 frontend scenarios; frontend production build; changed UI lint (zero errors, two existing hook dependency warnings). Evidence in /Users/liroymelamed/.cache/melamedia-builds/document-workflow-20261117/release-backend.log and release-frontend.log. The canonical signing TEST-LEDGER.md includes every test run, including failed intermediate runs. No protected signing-baseline source hashes changed.

Deploy order: main → Melamedia QA → actual browser/API checks → production tag/main → MelamedLaw, MorLevi, AshrafEssa separately. Idm retired. New SQL migration defaults automatic reminders off and does not backfill/send requests for historical cases. Shared-office RLS is installed conditionally using the existing isolation functions.

Still pending: actual QA, active client rollout, Figma alignment. Do not describe these as passed based on local tests.
