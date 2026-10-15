# Follow-up scope checkpoint — 8 October 2026

Local candidate based on91fb179. Not production approval.

## Problem and behavior

A targeted reminder previously reused a shared person's run-wide signing link. Its approval hash did not bind task versions, and a queued request could wait for a future stage instead of preserving the approved stage. A sender's current permission also was not rechecked at dispatch.

The confirmation now binds exact ready task IDs, document IDs, versions and stages. Dispatch checks the active revision, current sender role/tenant/package assignment, contact version, grant and deadline. If the reviewed tasks finished, it records skipped_completed. Changed or expanded tasks cancel instead of silently inviting a new stage. Current link/contact checks run again after the task fence, under shared locks. Unknown provider outcomes retain the existing quarantine.

A successfully dispatched reminder/resend receives a new encrypted capability limited to the selected PDFs and task IDs. Its published task allowlist is immutable. Public description, session creation and issue reporting honor that list, including later roles on the same PDF. Original invitations retain their existing behavior; completed-copy grants remain read-only. No authentication, OTP, stamping or consent flow is replaced.

The existing action dialog explains cancellation in Hebrew, Arabic and English. It counts distinct PDFs and appears beside a ready participation instead of a future role; one person still has one action entry. Effect text now describes the selected-document link accurately.

## Evidence and limits

Outer directory: outputs/signing-implementation-20261007/workflow-ux-20261008; detailed ledger and hashes live beside it.

23 unique focused backend scenarios pass across followup-scope-backend07 and unchanged dependent regression01. New coverage includes eight packages sharing one person, future tasks on the same PDF, no accidental run-wide link, immutable task allowlist, current custom-role/assignment checks, stale task versions, completed-stage skipping, and deterministic contact/link changes while dispatch waits for a real DB lock. Existing public consent/OTP/returning-stage/real-PDF/completed-copy/task-issue tests pass.

33 focused UI scenarios pass (32 unchanged + final UI07 focused assertion); lint03 and Build02 pass. Actual local8130 browser in Hebrew390px, Arabic390px and English1280px demonstrated changed-task cancellation, new explicit review, fake-provider acceptance, a scoped incumbent signing session with auto-verified OTP, and Done-only completion. The snapshot and previous peer acceptance remained unchanged. The later-stage PDF was not completed by this test. Browser work preceded the final contact/link guard; the final guard has real DB race and dependent signing/PDF proof, not a new browser claim.

All failures remain: wrong fixture field key; helper cwd mistakes; asynchronous preview assertion; ambiguous opener/confirm labels; direct-node-access test lint. These were fixed without weakening assertions or source authorization. Original logs were never overwritten.

No actual SMS/email/push messages were sent. No current remote benchmark, liveQA deployment, push, customer deployment or production tag is included. Frozen bulk selection/aggregation and people/capacity/authority remain unfinished.

## Deployment and reuse

Apply additive2026-10-08_06 before this code. Pending historical manual follow-ups without a recorded sender/task manifest are cancelled with a review-required/access-changed result; operators must review and enqueue again. Do not auto-upgrade their selection. Original invitation jobs are unaffected.

Rollback to code unaware of allowed_task_ids could broaden an issued scoped capability. Before such a rollback, stop workers and revoke the scoped follow-up grants; preserve original invitations, artifacts and evidence. Never drop the allowlist column to restore behavior.

Changes to actions/delivery/followupScope/grants/publicSigning/taskIssues or the grant schema invalidate related scope/privacy/dispatch/consent evidence. UI/locales changes invalidate the affected confirmation and placement tests. Lock-order changes require the deterministic race tests. No performance claim follows from local test duration.
