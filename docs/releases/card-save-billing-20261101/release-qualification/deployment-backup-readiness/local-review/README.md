> **Latest owner constraint: no new environment anywhere.** Do not invoke a historical helper that creates a per-run cluster. Existing QA requires proven isolation, synthetic data and no-charge capability. No new environment plan remains pending.

> **Owner constraint update:** Existing QA only. New Mac DB/cluster/role/fixture/extension plans are CANCELLED, not pending, and none were performed. Prior local restore proposals are withdrawn. See [current action boundary](ACTIONS.md).

# Local backup / rollback routine review

**HOLD for deployment-readiness claims.** Existing backup/encryption/readback routines and maintenance locks are documented. This local review does not establish that the installed producer/configuration is DB-only, that a current generation was restored locally, or that each legal component has three complete inactive rollback versions. The coordinator owns current remote metadata inspection.

This review read local rules, source and sanitized prior readiness documentation only. No network or remote command was used; no environment values, private keys, customer/member payload or database rows were read. Later explicitly authorized checks listed headers and hashed two known public frontend build archives without reading member contents or extracting files. No tests, backup, extraction, restore, source modification or live action was run. The existing client qualification branch remains clean at its previously frozen audit tip.

## Governing rules

- [WORKSPACE.md](/Users/liroymelamed/Projects/WORKSPACE.md:62) is the owner's newer scope: routine R2 backups contain databases and necessary verification/restore metadata only. Verified remote Git carries source history; private configuration and release rollback material remain separately protected. No code/customer files/caches/logs/build/system image may be added to routine R2, and no new maintenance archive upload may resume without a new explicit owner need. Historical archives stay preserved.
- [Global AGENTS.md](/Users/liroymelamed/Projects/AGENTS.md:47) requires the existing shared `/run/lock/melamedia-release-maintenance.lock` for an entire remote deploy, rollback, build or QA operation and at least three complete inactive rollback versions per canonical component. Respect tenant locks and all pins; no cleanup is authorized by this review.
- [LayerWebsites AGENTS.md](/Users/liroymelamed/Projects/LayerWebsites/AGENTS.md:79) still describes an older `tenant_backup.sh` cron and retired targets. The knowledge index's 11 October finalization records replacement of five duplicate tenant DB jobs by the encrypted routine. These older instructions are insufficient evidence of the current job or retention settings. Do not reactivate those legacy jobs or retired targets.

## Current coordinator observations and local-source boundary

The coordinator subsequently reported current backend configuration `backup_scope=database-only`, four legal project definitions with empty recovery paths and false object snapshots, and existing storage. The installed backend producer hash begins `085b3d946f` and frontend begins `bb00`, both distinct from the local candidates reviewed below. These are coordinator-supplied remote metadata, not remote observations by this subtask. No matching DB-only source copy was found in the scoped canonical ops/knowledge `.py/.sh/.md` search. Exact installed-source review is still needed before reusing a CLI or proving its payload contract. The local format description below is explicitly bound to local SHA `331ff...`, not assumed to describe `085b...`.

The coordinator corrected a historical substring-alias error: Melamedia names had been counted as MelamedLaw. Known frontend checkpoint roots now report QA 9 / Ashraf 5 / Mor 2 / Melamed 0 candidates; these remain directory counts, not certification. Melamed frontend uses a separate FTP boundary detailed in [the addendum](MELAMED-FRONTEND.md).

## Producer already available locally

The current reviewed local producer is [server_backup.py](/Users/liroymelamed/Projects/ops/server-backup/server_backup.py:244), SHA-256 `331ff393559c183cccc608a5552f57940fd13b043aad3184fe535687d6a5fcdf`, 18,430 bytes. Expected installed counterpart is `/usr/local/sbin/melamedia-server-backup.py`; expected existing configuration is `/etc/melamedia-backup.d/config.json`. A known 18 October transport baseline has hash `e8e21e09b6ca159302ccdcffe250eb5882f7ef3057b4e1d5115d717b230fdfe9`; matching an old filename alone is insufficient. All read-source hashes and schema-only metadata are in [sources-and-format.json](sources-and-format.json).

For PostgreSQL it creates a custom-format `pg_dump -Fc`, parses the TOC with `pg_restore --list`, and decodes it with `pg_restore --file=/dev/null`. It hashes the dump, packages an inner manifest and a `recovery-files.tar.gz`, encrypts the tar as CMS DER AES-256-GCM, writes a complete local generation manifest, and uses PUT followed by GET plus ciphertext hash verification when direct storage is configured. `local_generation_only` separates generation from the existing publisher; its exit success does not by itself establish remote publication. Expiry is delegated to the existing retention service.

**There is no `--db-only` CLI switch.** The reviewed producer is capable of broader historical recovery payloads. DB-only requires independently reviewed current configuration: correct target database, empty `recovery_paths`, and absent/false `object_snapshot`. This revision still emits an empty `recovery-files.tar.gz` when no paths are selected. Its empty TOC and absence of any object-storage payload should be certified, rather than treating a file with that name as proof of extra customer files. A different installed revision needs review before reuse. No config was opened or changed here.

The credential variable names are `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET`; no values were read. The reviewed producer outer manifest does not bind a producer/configuration fingerprint. Current empty-path configuration therefore does not retrospectively establish a prior encrypted generation's payload scope; use its creation provenance or authorized inner allowlist validation.

The current service credential and existing Mac private recovery key should be reused in their original boundaries. No new key, bucket, OS account, publisher allowlist or timer is required merely to inspect or use an already configured target. Never source an application `.env` as shell code.

## What each existing verification establishes

| Existing evidence/tool | It establishes | It does not establish |
| --- | --- | --- |
| Backup-watch health JSON | Existing health/freshness/readback assertions | Fresh archive bytes, new readback or local restore |
| Producer `pg_restore --list` and `--file=/dev/null` | Dump TOC and full decoding succeed | Schema/data can be restored into a real PostgreSQL database |
| Ciphertext size/hash plus full offsite readback | Exact uploaded encrypted object was retrieved | Successful authentication/decryption/inner hashes/SQL restore |
| Historical `verify-completed-backups.py` | A broader offsite-and-remote-restore workflow exists | Local-only restore safety, current payload scope, or current locks |
| Cleaner reports/checkpoint directory counts | Directories and cleanup status were observed | Three complete, distinct, inactive legal component rollbacks |

The prior readiness audit's healthy reports were about a minute old, but the database generation was about 19.69 hours old. Those are historical observation ages, not the current state. The release plan does not define a numeric DB snapshot RPO; a fresh pre-deployment generation and accepted recovery point still need to be selected. Old reported health cannot be carried as a present release approval.

## Existing restore tools must not be run as-is for a local-only gate

[verify-completed-backups.py](/Users/liroymelamed/Projects/social-publish/engine/knowledge/audits/2026-10-11-r2-storage/recovery-tools/verify-completed-backups.py:83) installs receiver/restore helpers on a server, downloads offsite ciphertext through server credentials, decrypts with the Mac key, streams plaintext back over SSH, invokes a server-side restore, and removes its remote receiver tree. It lacks the current shared server-maintenance lease in its own code.

Its [restore-in-isolation.py](/Users/liroymelamed/Projects/social-publish/engine/knowledge/audits/2026-10-11-r2-storage/recovery-tools/restore-in-isolation.py:31) creates `melabackupcheck` if missing, creates `/var/lib` state and a new PostgreSQL 16 cluster on a private socket/port 55489, reads a live catalog table count, and includes application-specific record/media checks for another product. Those are additional infrastructure and plaintext/customer-data operations. **Do not invoke it for this local-only review or silently adapt its scope.**

The [manual cache archive verifier](/Users/liroymelamed/Projects/ops/server-cleanup/manual-review/verify_pack.py:19) is also not a DB-generation verifier: it expects a different compressed archive/nonce/snapshot manifest format and restores one artifact sample. It cannot certify a PostgreSQL database restore just because both formats use `bundle.cms`.

A reviewed local-only verifier for the exact current DB-only generation format is not established by the examined source set. The command plan in [ACTIONS.md](ACTIONS.md) is a reviewable next-step recipe, not executed verification.

## Three complete inactive rollbacks

This requirement applies independently to each backend and frontend component of all four active legal targets; a matching paired generation can count for both only when each component is complete and independently proven. Keep the active version as well. Three copies of one current version are not evidence of three distinct previous versions. A source commit alone is not a ready compiled frontend or a configuration snapshot.

For each candidate version, certify privately: exact tenant/component/version and deployment root; full code SHA and dirty-source state; complete required frontend asset set and branded API/public manifest; backend entrypoint, lock/dependency/runtime recovery path; correct tenant PM2/nginx/startup configuration preimage without exposing values; archive/file hashes, size, safe member paths; no active process/config/symlink/dependency references; no conflicting pin; and a tested, bounded code/artifact/config restoration procedure. No customer DB/media belongs in this reserve certification output.

The [cleaner](/Users/liroymelamed/Projects/ops/server-cleanup/release_cleaner.py:243) explicitly checks complete Next.js and .NET publications, while `cache-only` units fall through to true. The tracked legal rules are cache-only staging patterns and protected canonical roots; the two checkpoint roots are not configured as legal release components. Thus cleaner success or an absent `rollback-reserve` reason **cannot certify legal Express/CRA archives**. Existing metadata counts remain HOLD; there is no examined turnkey legal rollback validator/creator that closes this requirement.

The generic deploy scripts are not safe release orchestration by themselves. Backend deploy performs mutable fetch/pull, dependency installation, migration/backfill and PM2 restart; frontend uses `rsync --delete`; both notify the central deploy system. Their source contains no current maintenance lease, fresh DB/restore gate or three-version reserve gate. `rollback-melamedlaw.sh` also resets remote and local branches with `git reset --hard` and rebuilds/uploads frontend. Do not run these as unreviewed shortcuts for the frozen candidate.

Rollback for this billing release must restore compatible code/artifacts/config only while preserving current payment intents, settlements, outbox/idempotency state and owner-waived periods. Restoring an old production DB as an ordinary code rollback could erase payments and permit duplicate charging. A pre-gate old process cannot be assumed to obey the new pause flag; drain/route/callback handling stays a separate operational gate.

## Remaining gates and approvals

1. Match installed producer/hash and current DB-only config summary through existing read-only access; inspect existing generation/checkpoint metadata. This is already the coordinator's read-only scope.
2. Certify existing offsite/ciphertext/archive integrity and complete distinct inactive reserves; no payload execution, extraction, backup or restore happened here.
3. A fresh run of an already configured DB-only producer uses existing infrastructure but is a live backup/storage operation: DB read locks/load, local plaintext/encrypted disk writes, possible R2 PUT/GET and possible watcher status changes. It is beyond this local metadata-only task and needs release-coordinator authorization under the owner's conditional deploy scope. Do not change timer, retention, key, bucket, project mapping or backup payload scope as part of that run.
4. Owner decision: new Mac PostgreSQL databases/clusters/roles/fixtures/extensions and local customer-backup restore test plans are CANCELLED, not pending. Use existing QA only after isolation, synthetic records and no-charge capability are proven. No destructive fixture test or real customer-backup restore into QA is authorized. The denied app-role schema export remains denied; any export through an existing backup identity needs separate review/approval and no new grant.
5. If reserves are insufficient, report exactly which component/version evidence is missing. Reusing existing local checkpoint paths and preserving existing archives is different from introducing a cloud archive workflow. New maintenance archives to R2, new infrastructure/access or retention/cleanup changes require the owner's explicit new need/approval; do not bypass the three-version gate by duplicating or deleting evidence.
6. Financial configuration, pausing/resuming live operations, provider routing/credentials, document/email settings, migrations, restarts and activation remain separate coordinated actions. No backup/restore approval implies a charge, document, email or recovery of an owner-waived period.

No operation was denied, pending with an uncertain outcome, or partially applied in this local review. Missing certification is an evidence gap, not a failed live backup or demonstrated restore failure.
