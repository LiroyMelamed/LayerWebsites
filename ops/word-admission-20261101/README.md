# Host-wide managed Word conversion admission

This source is prepared for root review and staged qualification. Committing it
does not install the gate or prove a real DOCX conversion. All real remote
installation, environment changes, promotion and recovery remain explicit
operator operations bound to a reviewed immutable packet.

`managed-admission.py` delegates the original converter arguments, cwd and exit
status to the byte-identical incumbent inner coordinator. Its fixed production
configuration uses two host-wide kernel `flock` slots. The inner copy must be
`/opt/melamedia-qa-word-converter-20261023/managed-soffice-inner-e3b0019497b69890.py`,
with SHA256 `e3b0019497b698906678070f39102230581c3e8120618ca5267635e0f8169052`.
No CLI or inherited environment variable changes that policy. The existing inner
RootDirectory, UID65534, network isolation, 768MiB memory,64 tasks,100% CPU,
60-second runtime,1-second stop timeout, control-group kill and independent
bounded reaper remain byte-identical. Existing rootfs/runner/reaper/manifest and
both retention pins are retained and verified separately by the operator.

Excess admission and uncertain observation return75. The application converts
that into `WORD_CONVERSION_BUSY`, HTTP429 and `Retry-After: 2`; original source
and bindings remain available for a user retry. The one-worker mapping admission
also reports a retryable429 rather than an operational server failure.

## Lease and crash behavior

The root-owned0700 persistent state directory is
`/var/lib/melamedia-word-admission-20261101`. Its coordinator/slot lock files are
0600, regular, single-link, opened without symlink traversal. **Never unlink,
replace or rotate these lock files**, including during recovery. The QA state
directory has the `-qa` suffix and is independent while qualification runs.

A detached guardian holds a slot while the exact inner coordinator also
inherits that same kernel lock FD. Killing the caller closes its socket; the
guardian signals the inner to complete its incumbent cleanup. Killing just the
guardian leaves the inherited inner lease held. If all holders die, the lease
FD closes but its persistent journal retains actual generated unit/stage names.
New admission checks systemd and owned stage absence before reusing that slot;
it never interprets a PID or elapsed age as proof that resources are gone.
An unlearned journal requires global quiescence. Unaccounted units/stages,
malformed state, symlinks, changed inner bytes and failed observations all refuse
admission. A known cleaned stale slot can be reused while the other slot runs.

The guardian normally finishes when the inner has exited and its exact unit,
reaper and stage are absent. It is bounded by82 seconds plus a bounded resource
observation/kill wait; it retains the journal on uncertainty. The independent
original reaper remains responsible for cleanup; this gate never deletes a real
stage, stops a discovered unit or kills a process based on a journal PID.

## Qualification and promotion contract

1. Bind exact source commit/file hashes, original shared entry SHA, inner copy
   SHA, cgroup properties, runner/reaper/rootfs manifest hashes and retention
   pins. Require fresh provider-OFF, source/env/PM2, DB control hashes and backup
   evidence. Root reviews the complete payload before any installation.
2. Qualify fake Linux processes/resources first using
   `admission-fixture-tests.py <unique-owned-0700-fixture-parent>`. It injects only
   a synthetic inner and resource inspector into the actual wrapper. It never
   calls systemd, a real converter, providers or application services. Run under
   global shared maintenance and exclusive QA release locks, append both ledgers,
   and preserve exact hashes/output. Fixtures alone do not qualify real DOCX.
3. Keep QA per-process `WORD_TEMPLATE_MAX_CONCURRENT=1`. A separately reviewed
   single-key cap exception stores exact original env bytes0600, preserves
   launch env and all unrelated controls, and restarts only `melamedia-api`.
   On1Nov this cap was applied by root with a recorded private checkpoint.
   Reverting to the old implicit2 requires a new resource/recovery review.
4. Root creates the state directories/lock files without replacing existing
   inodes. Install the exact original inner copy and versioned candidate outer
   and QA entry beside it, with root ownership and reviewed modes. They are not
   reachable by production consumers yet. Back up pre-existing target bytes and
   CAS all install targets. No modification to the original inner or its pins.
5. For live QA, explicitly change only QA
   `WORD_TEMPLATE_SOFFICE_PATH` to the reviewed versioned `qa-admission.py`, with
   an exact private env backup, before/after key projections and no PM2 root or
   nested override. Restart QA only. This entry allows **one** converter while
   three incumbent production admissions stay at one each. Existing mapping
   admission remains one per process. Test synthetic DOCX, cancellation, busy
   retry and normal PDF output on QA; bind a fresh API/source/runtime receipt.
   This is a separate qualified environment exception, not an unchanged-env
   claim. Root must implement/review that exact switch before running it.
6. Promotion holds global shared and **all four** tenant exclusive release
   locks throughout. Store0600 original shared entry/env and source-bound
   recovery material in a root0700 checkpoint. Switch QA back to the original
   shared path using its reviewed single-key env exception, restart QA only,
   then CAS-replace the shared entry with the reviewed `busy-barrier.py`.
   Every modern process must now resolve that exact busy-only shared entry;
   no process may retain an ungated QA path. No new conversion may start.
7. Allow incumbent bounded jobs/reapers to finish. Observe all owned conversion
   units/timers and stage directories quiescent twice, with fixed timeouts.
   **Do not delete jobs, pins, source or customer data to manufacture quiescence.**
   If uncertain, retain the barrier/checkpoint and stop for operator review.
   Never install a two-slot path while old ungated jobs can still start.
8. CAS-replace only the shared entry with the qualified exact outer bytes.
   Verify actual all-four effective paths, inner hash/caps/pins, lock inodes,
   source/provider/env preservation and fresh local/public health. Retain at
   least three versioned operator rollback payloads/checkpoints; no R2 code or
   maintenance archive upload. No global PM2 restart is needed for the shared
   path replacement. Any backend runtime change has its separate named restart.
9. Only after step8 has a fresh qualified receipt may the backend resource gate
   use **2×768MiB converters +4×384MiB mapping workers +1024MiB reserve =4096MiB**.
   The previous four-process admission was1+1+1+2=5 converters; with four future
   mapping workers it required6400MiB. A lower threshold without the installed
   and verified shared gate is prohibited. Unknown legacy consumers invalidate
   the global admission proof; Idm is retired and LawyerPlatform is separate.

There is no automatic rollback. On failure after a barrier/env/source mutation,
retain state and exact checkpoint, inspect actual unit/stage/source/env state,
then root may issue an explicit CAS-bound recovery packet. Recovery must also
block new work and prove quiescence before returning to an ungated original
entry; otherwise it could oversubscribe running gated jobs. Never reset unknown
Git changes, restore a whole customer DB, reclaim a slot by age, or remove a
lock/journal while its resource absence is unproven.

## Test scope

The fixture suite covers two-slot saturation, exact argument delegation, stable
lock inodes, caller SIGKILL, guardian crash and inherited FD ownership, all-holder
crash with reaper delay, exact stale-slot reuse while the other slot is active,
bounded guardian failure, changed-inner refusal and uncertain/malformed/symlink/
unaccounted state. The application tests exercise wrapper75→typed busy, local
cleanup/re-admission and actual Express/central-error retry headers. The global
signing release guard checks all103 existing protected entries unchanged.
Actual kernel fixture receipts and both protected ledgers state which commit or
working bytes passed; no unexecuted live installation/recovery test is implied.
