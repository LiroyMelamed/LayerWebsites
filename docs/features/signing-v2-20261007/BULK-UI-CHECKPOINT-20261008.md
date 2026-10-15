# Bulk selection, approval and recovery — local checkpoint 8 October

Office staff with existing signing upload permission can select explicit packages across pages or explicitly freeze all matching packages. Nothing is selected automatically. Filters cannot silently replace or widen an existing selection. The immutable ten-minute selection is reviewed with exact eligible package, participation, person, PDF and message counts; same-person future-stage roles are excluded. Names, capacities, masked destination, PDF names, prior invitation and each exclusion are shown before a distinct confirmation.

The server persists grouped work before returning queued. The UI polls actual results, distinguishes provider acceptance from queueing, reports uncertain outcomes without automatic resend, and recovers the current result through private server history after leaving or reloading. Lost-response retries retain their operation key. Changed/expired reviews need another explicit approval. Revoked access clears cached sensitive UI details. Explicit selections retain packages that completed since a pending-filter selection, reporting their exclusion instead of failing the whole selection.

Uses incumbent platform controls, restrained Back link, translated he/ar/en labels, locale dates/numbers, RTL/LTR and minimum44px controls. No new public signing screen, invitation locale override or real notifications.

## Focused evidence

External immutable evidence folder: `outputs/signing-implementation-20261007/workflow-ux-20261008` in the parent task workspace. Read parent `TEST-LEDGER.md` for failed attempts and invalidation.

-39unique backend scenarios: bulk13/review11 in `bulk-ui-backend03.txt`, management7/selections8 in backend02. Flat picker current ACL/counts/pagination, creator-private recovery, HTTP gates, contact/task/link/permission shrink, current role counts, explicit newly completed rows, frozen retries and existing durable queue races pass.
-48UI: bulk15 in `bulk-ui-tests05.txt`, incumbent workspace33 in tests02. Selection/page/filter boundaries, frozen retries, stale/expired approval, queued vs provider, recovery, revocation privacy, exclusions and1000package cap. Final lint03 and build03 pass.
-Actual Hebrew1280 select3packages→review1person/3participations/6PDFs/1message→queued0→fake-provider1; reload+English1280 recovery. Arabic390 all-matching preserved under search changes, duplicate cooldown excludes3, final layout no overflow and controls>=44px.
-Actual incumbent Arabic signing:6distinct ready PDFs with Arabic-digit OTP, Finish-only completion; same person later3PDFs require new consent/OTP. DB confirms9accepted tasks/2sessions, prior actions and original snapshot retained. All9protected office final-PDF hashes match stored artifacts. Original scoped grant reads only its6PDFs; later3denied404. `bulk-ui-final-proof04.txt` and `bulk-ui-browser1-final-proof.json`.

## Environment and limits

Original synchronized node_modules stalled/failed before collection. Tests/build used an exact git-archive ce83e4d plus hashed working-source overlay in `/tmp/signing-runtime-20261008`, with clean unchanged lockfile dependencies and repository `.npmrc` legacy-peer setting. Original dependencies preserved. No package manifest or lockfile change. Setup/test failures are recorded, not hidden.

This is local focused functional evidence, not representative capacity or liveQA approval. Customer deployments remain prohibited. Remaining people/capacity/authority and lifecycle/projection F1 gates plus exact representative200/600+ and1200PDF measurements/liveQA remain open. Historical PDF timing still fails readiness. No push, deployment or production tag.

Invalidation: any changes to bulk UI/API/locales/scoped styles invalidate dependent UI/visual evidence; changes to management/selections/review/queue/dispatch/routes/access invalidate dependent backend/privacy/recovery tests; public/grant/worker/PDF changes invalidate signing and protected artifact evidence.
