# Temporary QA pause: execution and return contract

**Smallest path: stop the whole existing `melamedia-api` process, then resume the same retained PM2 entry. Installing the candidate is not required for a temporary process-down pause. Current result: conditional only; the final pre-action business-work, clean drain and return/window checks are not certified by this report.**

The owner has approved that temporary QA pause and restart subject to those conditions. This is not a request to approve the same pause again. No stop, restart, environment/configuration change, code installation, database/restore operation or provider call was performed by this review. No customer data from the excluded client was queried. The separate release backup/restore/three-inactive-version gates remain open.

## Actual incumbent and why nine flags are insufficient

Current QA is clean source `545779e4b99e111959f4684167dfdf46da1f3186`, backend tree `4ffd075308c7054a9f46ddac59f74accee4c6a4b`, at `/root/Melamedia/backend/server.js`. Observed PID is `2729957`, PM2 ID `5`, name `melamedia-api`, fork mode. This source **does not contain the new financial gate**. `BILLING_OPERATIONS_ENABLED=false` therefore cannot block its checkout/charge/callback HTTP paths. Background false also does not disable its independent signing, WhatsApp demo and court-demo workers.

The observed boot projection already has background false, signing worker true from the existing `.env`, and WhatsApp demo/court-demo workers true. Nine overrides plus restart could stop consumers, but would leave financial HTTP available on old code and introduce an exact unset/value restoration problem. That is not a complete financial pause.

A named manual PM2 STOP makes that Node process unable to serve HTTP or execute its timers while it stays stopped. It avoids new code, all nine environment writes, dependency changes, migrations and DB changes. It is the smallest local producer boundary for a short offline testing window. It does not revoke external hosted pages or recall already-accepted supplier/Central work, and it is not a claim of global external financial quiescence.

## Fresh evidence and remaining idle uncertainty

[The inventory](inventory.json) sampled QA three times at **04:26:06–04:26:15 UTC, 2 November 2026**. It found no QA HTTP connections, pending payment intents, enabled billing, auto-renewal, due accounts, active cards, signup/welcome work or running/leased/due signing jobs. The one observed own-role database session was idle, with no active transaction. The two historical successful hosted intents, 38 pending signing deliveries and three needs-attention jobs are preserved; no queue or record was cleared.

The 04:26 samples contained one established **nonloopback connection of unknown purpose**. That historical classification cannot be retrospectively repaired. The newer [04:35:29–04:35:33 socket observations](socket-metadata.json) supersede it for the current window: only one QA-owned loopback PostgreSQL socket on 5432, zero QA HTTP and zero nonloopback connections, with stable source/PID/config fingerprints. Its PostgreSQL byte counters increase across the samples; that can be polling and is not proof of a dormant process or no current transaction. The external-socket classification gap is closed for the new window, while a fresh pre-action distinction between empty worker polls and business work, followed by a clean drain receipt, is still required. Samples alone are not an atomic no-ongoing-work barrier.

The separate [04:30:43 worker classification](final-worker-classification.json) resolved the six previously redacted WhatsApp rows as simulated; the other two are invitations-sent. Active/awaiting/sending counts are zero. That classification gap is closed and must not remain listed as a blocker. The later socket record closes the current external-connection gap; it does not certify a clean stop or future return.

## PM2 stop, timeout and resurrection

Read-only inspection of installed **PM2 6.0.8** confirmed:

- `God/ActionMethods.js:284–314` marks a manual stop STOPPING then STOPPED. `God.js:419–424` suppresses normal autorestart in those states even when `autorestart=true`.
- `God/Methods.js:158,179–195` uses the current per-app kill timeout or the PM2 constant, then can send SIGKILL. `constants.js:105` has a **1,600 ms fallback**. Initial process and daemon timeout overrides were unset; the current daemon-internal per-app setting was not extracted. Do not assume that the application's ten-second default shutdown grace is available.
- The incumbent server's shutdown closes HTTP and eventually awaits signing stop and the DB pool, but does not join every timer/flush. A forced exit, absent PID or a successful PM2 command is not proof of a clean drain.
- Both existing `dump.pm2` and `dump.pm2.bak` retain QA as **online**, with autorestart true. The enabled `pm2-root.service` starts with **resurrect**. A daemon/host restart can therefore bring old unguarded QA back. Manual STOP is not a restart-durable financial barrier. Monitoring is not such a barrier either.

The bounded pause contract must explicitly keep the same daemon/host stable and exclude alternate starts during the window. If the requirement is prevention even across daemon/host resurrection, the current saved-state contract fails and remains HOLD: a separately reviewed exact QA-only persistent startup exclusion is needed. Do not silently patch the dump/unit, add a preload or firewall, use global `pm2 save`, or deploy candidate code to conceal this gap. No new guard was installed here.

## Private preimage and safe return

The local private nine-field preimage (`../private/nine-field-pause-preimage.json`, excluded from public/Git transfer) records only these nonsecret fields, with **presence/unset and literal value kept separately** for initial process, current file and boot projection:

`BILLING_OPERATIONS_ENABLED`, `BACKGROUND_JOBS_ENABLED`, `BILLING_RENEWAL_SCHEDULER_ENABLED`, `SIGNING_V2_WORKER_ENABLED`, `WHATSAPP_WORKER_ENABLED`, `WHATSAPP_DEMO_WORKER_ENABLED`, `COURT_DEMO_SYNC_WORKER_ENABLED`, `CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED`, `GIT_SHA`.

It also retains source, lock/config fingerprints and the exact dependency symlink. It is mode 0600 in a 0700 directory. Unrelated credentials were not exported or copied into a full PM2/env dictionary. The recorded process environment is a birth-time view plus current-file projection; it is not arbitrary in-process runtime introspection. In particular, initial `status=launching` is stale spawn metadata, not current PM2 status.

Installed PM2 `ActionMethods.js:405` **merges** environment on restart. Merely omitting a previously introduced flag from a shell, or using `env -u`, does not prove its stored PM2 value was removed. For example, restoring an originally absent process override is required to let the existing file's signing-worker true apply again. Minimal STOP avoids this problem by changing none of those fields.

The approved return path retains the same PM2 entry, source `545779e4`, `.env`, ecosystem file and dependencies. The source commit predates the observed process start by four minutes, supporting that return basis; the absent `GIT_SHA` still means no cryptographic proof of already-loaded code is claimed. No `--update-env`, entry deletion/recreation, ecosystem reload, global restart/save/resurrect, npm installation, Git checkout/merge or migration is part of it. Stop all owned synthetic test processes first, compare private fingerprints and exact nine-field state, then resume only the same entry with no environment/configuration merge. Verify new PID/cwd/script, post-guard startup completion and health. A source/config/daemon drift means stop and reassess; never overwrite a changed global dump with an old copy. Financial process-down isolation ends when the old service resumes; that return does not install the billing fix.

These fingerprints and an unchanged-entry return are not full dependency byte verification, a database restore rehearsal or certification of three complete inactive rollback versions. Temporary pause/backout and full release recovery are separate gates.

## Offline host tests require their own boundary

QA `backend/node_modules` is a symlink to `/root/qa-new-features-20261023-5ce621ee/staging/source02/backend/node_modules`. **PGlite and Supertest are absent**; pg and Express are present. Do not run npm/ci or alter this protected shared installation for the pause. Broad 40/217 test groups cannot be claimed runnable unchanged with these missing dependencies. An existing separately approved compatible test installation could resolve this; none was installed by this review.

The previously used offline network guard allows arbitrary loopback ports except three PostgreSQL ports and ignores Unix-socket paths. On this shared host, other clients' real local APIs remain reachable. Stopping QA alone therefore does not make a generic test suite offline. Correctly isolated no-IO VM tests can proceed independently without stopping the service; a pause is not intrinsically required for those exports. Only separately reviewed no-IO VM tests can run unchanged; broader groups require a reviewable, explicitly approved **test-process-only** network boundary and exact available dependencies. No new preload, firewall, credentials, `.env`, QA environment or PostgreSQL cluster is authorized or created here. Frozen scratch code is not a deployment, but it must contain no production `.env`, must not write active source/dependencies and must not load the production application against live data.

## Exact execution gates

1. Refresh the authorized QA-only observations and exact source/PID/entry/preimage under the existing shared maintenance lock plus exclusive QA release lock. No lock creation. Use the latest socket record and refresh business-work/claim/transaction checks: the historical external unknown is superseded, but PostgreSQL traffic continues. Sampled zeros are not an atomic drain proof.
2. Review the precise named STOP and unchanged-entry return, including actual timeout/clean-exit receipt and the bounded daemon/host/no-alternate-start condition. If restart-durable exclusion is required, do not act until that separate control is approved and proven.
3. Only after those conditions pass, apply the already-approved temporary whole-process pause. Confirm clean exit, old PID/children absent, QA listener absent and retained entry stopped. Do not accept SIGKILL/timeout as clean success.
4. Execute only the separately qualified offline test selection and resource/network/dependency boundary. Keep the existing code/dependencies/env untouched. No schema/restore/new access/provider/charge operation or excluded-client action.
5. End owned test processes, compare preimages and return the same incumbent entry. Verify startup guards and health, document the new PID and restore the approved normal availability. Do not claim candidate deployment, full restore/rollback readiness or lasting financial protection.

[Machine-readable decision, concrete blockers and source evidence](pause-execution-contract.json). No live mutation was attempted; this report's hold is incomplete no-ongoing/window/test-boundary evidence, not a failed or uncertain payment. The earlier broad credential-extraction rejection was not retried: successful metadata reads used a strict streaming nonsecret projection only.
