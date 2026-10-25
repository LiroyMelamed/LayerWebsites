# Legal subscription-message OFF release operators

These are byte-exact recovery copies of the reviewed task operators. They are
not general-purpose deployment scripts or a production release approval. The
Python runners deliberately retain the original protected task paths. Execute
only the original hash-bound packet in that task, after checking current state.
No environment values, customer records, launch preimages or database dumps are
included here. `SOURCE-HASHES.json` binds each copied source file.

## Current state and holds — 25 October 2026

Product source `7a9d36fa` is on main. Melamedia QA runs `1161fd68` with capture
and dispatch OFF; its reviewed frontend is published. The four customer
candidates are prepared, but the customer rollout is **not complete**.

The first Ashraf backend attempt at `46abb4e6` failed its liveness gate. The
reviewed forward-only rollback succeeded: named branch `AshrafEssa` is at
`dc8f235d`, whose tree exactly matches the original `72225ebc` source. No
customer frontend was published and the other three customers were not updated
by this rollout. Public normal-browser `/health` rendered `{"ok":true}` after
rollback. This is liveness evidence, not full feature approval.

Saved startup milestones are consistent with a health-check/startup race; no
source crash was established. Operator 01 exhausted 20 fast-refused requests in
about five seconds, although stalled requests could consume about 25 seconds.
Operator 02 uses one monotonic 25-second deadline, absolute one-second HTTP
probes and exact response validation. Two PM2 snapshots must have the same PID
and start timestamp, with process age at least five seconds (waiting only the
remaining age if necessary), followed by a final healthy HTTP response. All
snapshots stay within the same deadline.
`min_uptime` is checked before stage creation and participates in launch-state
preservation, so later drift stops before forwarding/restart. No PM2 setting is
changed. The HTTP endpoint does not prove completion of every async startup job.

The original 18 focused helper cases, three changed budget/precheck cases and
one new preservation assertion are recorded separately with their exact source
hashes in the two existing ledgers. Unchanged product tests were not repeated.
Both original operators and all failures remain preserved.

**Maintenance coordination HOLD is active.** No checkpoint, activation,
publication or fresh remote-binding operation is running. Do not execute this
packet until that coordination clears and root reviews the exact tenant phase.
All capture/dispatch flags remain OFF. No migration, dependency installation,
environment/key change, real test message, customer-data change or production tag is
authorized by these scripts or by this archive.

## Authoritative continuation packet

Protected task root:
`/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2`

Read its current `work/signing-implementation-20261007/continuation-state.json`
and both `outputs/office-whatsapp-20261023/TEST-LEDGER.md` and
`outputs/signing-implementation-20261007/TEST-LEDGER.md` before any test or phase.
Append every attempt, failure, commit, evidence and invalidation rule there.

Under `outputs/legal-system-messages-20261025/`, preserve:

- `ops-prod-off/SEALED-OFF-PRODUCTION-CONTRACTS02.json`: exact scripts,
  tenant/source/rollback contracts and future phase commands. Observations are
  historical CAS expectations, never fabricated fresh proof. Unknown current
  `min_uptime` on the other tenants must pass the upfront numeric-5000 gate.
- `customer-rollout/frontend/PUBLISHER-V2-SEALED-HANDOFF01.json`: original
  artifact source remains labelled `46abb4e6`; new runtime `ea7df270` descends
  actual rollback `dc8f235d` and has the exact same full Git tree and build
  inputs. Its new forward rollback is `7e1aa666`. No rebuild is claimed.
- `ROOT-MAINTENANCE-HOLD18.json` and the backend/frontend protected-path
  component handoffs: current release/recovery ownership and preservation.

For each tenant, finish checkpoint -> own activation -> strict verification ->
frontend publication and narrow browser smoke before starting the next tenant.
Use the shared maintenance lock and correct per-target mutex, retain named
branches, use only ordinary guarded fast-forward merges, and stop on drift.
No reset, detached checkout, forced ref, environment equivalence waiver or
blind automatic retry is allowed. Rollback requires the exact reviewed forward
child and current own-state CAS; never restore an entire production database
for a code rollback. Retain immutable chunks and all private recovery history.

The automatic Court transport/grant remains unverified and is a separate task.
The approved Court IT inquiry was sent once; do not resend it. The modern shared
LawyerPlatform source is `ce3cb6a9`; an older cached missing-module conclusion
was withdrawn. Its static integration plan is preparation only, not a fifth
customer release or runtime/owner/permission verification.
