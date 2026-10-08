# Package cancellation and responsibility checkpoint — 8 October 2026

Local candidate on parent2038dc9. Not production ready. No migrations, real messages, customer deployment, push or production tag.

Cancellation requires explicit package_cancel plus management access, a current effect review and reason. It serializes with consent/acceptance and delivery, preserves immutable snapshots/actions/artifacts, cancels only remaining tasks, closes frozen consent sessions that include this revision and retains other shared-grant packages. A completed signing task invalidates an older cancellation review. Fully accepted packages cannot be cancelled while final output is being prepared. Started network messages cannot be recalled; the dialog says so.

Obsolete preparation/activation jobs retire as cancelled rather than failing/retrying. Delivery workers still record their actual outcomes; bundled messages are never globally cancelled from one member package. Initial invitations now use the package fence already required by follow-ups.

Responsibility uses explicit package_assign plus management access, named eligible office users, current version review, idempotency and reason/audit. Creator access remains; assignment does not broaden staff action permissions. Client/other-tenant/inactive-role users cannot be selected. Removing assignment removes that data-scope path. Existing people/signatures/delivery profiles are not modified.

UI reuses incumbent inputs/buttons, he/ar/en, RTL/LTR. Staff picker has search, review and explicit save. No new message on cancellation/assignment.

## Evidence
-8unique newbackend children: lifecycle-backend01 (5pass/2failed),02 (HTTP pass;1unfinished),03 (remainingpreservation pass),04 (newinvitation race pass). Failedfixture/assertions preserved; passingcases notrerun.
-7newUI scenarios: lifecycle-ui01 (6pass/1Arabic formatting mismatch),02 (Arabic onlypass).
-lifecycle-build01/lint01 pass.
-Actual browser37/8136: Hebrew1280 assignment,Arabic390 cancellation,English1280 savedassignment readback; screenshots/layouts and immutableDBproofs lifecycle-browser1-db01/02.json. Existing action/snapshot preserved, no newfakeoutboundcalls, no realmessages.

## Invalidation and remaining gates
Newlifecycle service/routes/access/catalog, jobs/runtime/delivery cancellation handling, managementcapabilities and lifecycleUI/API/translations are bound to this checkpoint. Earlier unrelated successful evidence is reused, as the owner directed; no broad regression suite was rerun. Do not treat earlier delivery performance measurements as current production approval. Representative performance and exactQA remain outstanding, alongside internalapproval/replacement and remaining projection/permission integrations. No change to incumbent PDF geometry/OTP/SignatureCanvas.
