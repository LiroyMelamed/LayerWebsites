> **Latest owner constraint: no new environment anywhere.** Do not invoke a historical helper that creates a per-run cluster. Existing QA requires proven isolation, synthetic data and no-charge capability. No new environment plan remains pending.

# Reviewable next actions — templates only, not executed

These templates identify operations and their gates for the reviewed local producer revision. The coordinator reports a different installed DB-only producer hash (`085b...`); verify that exact source/CLI/format first, and do not blindly run these templates against it. All targets, generation selectors, credentials and private destinations must be bound privately to verified existing values before use. No backup, download, decryption, extraction, restore, service start, data query or deployment was performed by this review.

## A. Finish the existing read-only inventory

The coordinator can match installed code with the hashes in [sources-and-format.json](sources-and-format.json), inspect the allowed configuration key/boolean/count summary, list known generation/checkpoint filenames and sizes, and compare stored hashes. Use the existing shared maintenance and tenant locks opened read-only, with no new access or environment disclosure.

A read-only script/config summary should report only: code SHA, configured project name, database kind/presence, `recovery_paths` count, `object_snapshot` presence, `storage` presence, `local_generation_only`, recipient-path existence, existing generation timestamp/size/hash/readback status. It must not print credential values, raw `.env`, raw PM2 environments, database contents, customer file keys or decrypted inner manifests.

Known legal project/lock selectors from the existing readiness source are:

| Target | Existing recovery project selector | Existing tenant lock suffix |
| --- | --- | --- |
| Melamedia QA | `melamedia-recovery` | `melamedia` |
| AshrafEssa | `ashrafessa-recovery` | `ashrafessa` |
| MorLevi | `morlevi-recovery` | `morlevy` |
| MelamedLaw | `melamedlaw-recovery` | `melamedlaw` |

Verify current installed mappings; do not infer a database or storage identity from spelling alone. Do not recreate retired targets.

## B. A fresh existing DB-only generation, if separately authorized

The reviewed producer's actual CLI is:

```sh
python3 -I /usr/local/sbin/melamedia-server-backup.py \
  --config /etc/melamedia-backup.d/config.json \
  --project "$REVIEWED_BACKUP_PROJECT"
```

This command is **mutating backup/storage work**, not read-only inspection. Before it is allowed: confirm exact installed revision; correct existing project/database mapping; empty recovery paths and no object snapshot; free disk/load; current service credentials; accepted backup recovery-point age; no active backup producer/publisher conflict; existing watcher/retention behavior; and release-coordinator authorization under the owner-approved deployment scope.

Hold existing locks for the whole operation, for example in a single reviewed remote shell with already validated values:

```sh
exec 8</run/lock/melamedia-release-maintenance.lock
exec 9<"$EXISTING_REVIEWED_TENANT_LOCK"
flock --shared 8
flock --shared 9
# Run only the reviewed existing producer/orchestrator here.
```

Opening with `<` intentionally fails if an expected lock is absent; do not create a replacement lock path silently. The producer additionally takes its own existing backup-root lock. A missing/busy lock is HOLD, not a reason to remove locks or restart other work.

If `local_generation_only=true`, inspect the current publisher contract first. The historical publisher accepts a complete current-day set with identical generation start across all its configured projects; blindly running just one project with a new stamp may not form an eligible cohort. Reuse the established whole-run orchestration, or obtain an explicitly reviewed seed protocol. Never backdate or alter completion/readback receipts. The source-only command above is not a universally safe per-project publication shortcut.

Expected side effects: a consistent PostgreSQL snapshot read and read locks; CPU/I/O load; private plaintext temporary dump/tar before encryption; new encrypted local generation and manifests; potential R2 PUT/GET/readback for direct publication; existing watcher status/alert effects if failures are observed. It does not intentionally mutate application records. It does not certify an SQL restore. Do not run a legacy backup script, source `.env`, create an object snapshot or change scope/retention/keys/timers as a convenience.

## C. Owner cancellation: use existing QA only

**CANCELLED BY OWNER, NOT PENDING:** new Mac PostgreSQL databases, clusters, roles, fixtures and extension-installation plans. None were performed. All earlier local customer-backup restore/fixture command proposals are withdrawn from this test plan; no `createdb`, new cluster or Mac extension procedure is authorized or offered as a pending option.

The owner requires the existing QA environment. It may be used only after isolation, synthetic-only records and inability to charge are proven. Do not restore real customer-backup data into QA under this testing request, overwrite an existing database, run destructive fixture tests, invoke a provider/mailer/document worker, or install accounts/services/extensions. The historical restore tools remain reference material and must not be invoked.

The current QA catalog was read through the existing mapped app role, but its schema-only `pg_dump` was denied and emitted zero DDL. That boundary was not bypassed. A separately reviewed **metadata-only export through an existing backup identity** is the precise remaining read-access proposal; it is not a request for a new Mac role/database or a live grant. See the parent report's [identity/approval addendum](../OWNER-QA-ONLY.md).

## D. Certify rollback reserves without running a deployment

For each of eight web/API components, select three distinct complete inactive versions plus the active version; verify version identity, source and lock hashes, frontend full asset graph and branding/API/CSP metadata, backend entrypoint/runtime/dependency recovery, current tenant-only PM2/nginx/startup configuration preimage, archive integrity and lack of active references/pins/dependency links. Protect private configuration separately; source Git and DB-only R2 are different recovery layers.

Inventory and safe archive header/hash checks can identify candidates but do not restore or certify them alone. If content proof is insufficient, obtain a bounded local artifact verification/restore scope; do not extract private configuration/customer material opportunistically. No examined existing legal Express/CRA validator automatically certifies these reserves. Do not invoke the scheduled cleaner, `--apply`, manual archive `prepare/apply`, `rsync --delete`, `git reset --hard`, migration scripts or deployment scripts merely to gather evidence.

A coordinated code rollback must select a known compatible artifact/configuration set and preserve all current DB state. Never restore a stale production DB to undo a code deployment; that can erase payment/idempotency/outbox state and enable double collection. The new pause flag cannot be assumed to control older loaded processes, issued hosted pages or in-flight provider operations. Financial drain, callback persistence/routing and safe resume remain independent gates.

## Authorization boundary

- Existing read-only inventory: within the coordinator's granted scope; no new access.
- Existing DB-only backup run: uses existing infrastructure if mappings already exist, but needs explicit release-coordinator execution authorization beyond this local review. New account/key/bucket/allowlist/job/scope/retention or maintenance-archive-to-R2 need owner approval.
- Mac DB/cluster/role/fixture/extension and local customer-backup restore test plans: CANCELLED by owner, not pending. Existing QA only, after proven isolation/synthetic data/no-charge checks. A schema-only export through an existing identity needs separate approval and is not an automatic fallback. Historical remote account/cluster/helper installation is excluded.
- Local release checkpoint creation/certification: only under separately reviewed target/path/artifact scope, with three-version/pin/lease rules preserved. No cleanup permission is implied.
- Live migrations, config, process restart, financial pause/resume, provider setup, documents, email or charges: separate authorized actions; this review performed none.
