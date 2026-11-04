# Existing routine backend backup review — 2026-11-02

**Existing routine availability/readback receipts: PASS metadata. Fresh cutover seal: PENDING. Authenticated restore: HOLD. No redundant backup executed.**

The coordinator chose to retain the normal 02:30 UTC overnight receipts while rollout gates remain open. The unchanged installed database-only producer is an existing backup operation, not an infrastructure change. A fresh normal same-config backup can be run as routine deploy preparation if a future cutover requires it; this review did not execute one.

Installed producer SHA-256: `085b3d946f475d1ad8ebd78f60aed389d6fea661963e34389b8991d339b2d160`. Existing config SHA-256: `a9368f14409c3c8551af638d2de5a679fde66e2fb90e803f65655fe1c06286f9`.

| Target | Exact selector | Database | Existing generation | Created UTC |
|---|---|---|---|---|
| MelamedLaw | `melamedlaw-recovery` | `melamedlaw` | `20261102T023039Z-2da02ae6` | 02:30:40.899337 |
| MorLevi | `morlevi-recovery` | `morlevy` | `20261102T023039Z-e956fe4d` | 02:30:42.503704 |
| AshrafEssa | `ashrafessa-recovery` | `ashrafessa` | `20261102T023039Z-20f90fe3` | 02:30:43.615641 |
| Melamedia | `melamedia-recovery` | `melamedia` | `20261102T023039Z-3a7c5edf` | 02:30:44.970728 |

The existing watchdog source hardcodes a **30-hour freshness threshold** (line84; source SHA `6c4bd6bf8f04c0381aebfcb5de22c65e4387c266a4ca8b96b71d120af71994ae`). Retention is separately 72 hours. The approximately four-hour-old receipts fit that routine freshness age, but this is not an accepted cutover RPO or a new full watchdog run.

All four receipts say `local_complete=true`, encrypted, database-only PostgreSQL and `offsite=verified_readback`; each encrypted file exists. This review did not independently GET/hash/decrypt them or execute SQL restore.

At 06:31:23 UTC no backup/retention/watch process was observed. At 06:33:29 both existing backup and retention lock probes succeeded, no dump/restore/openssl/curl/tar/rsync helper was observed, and all four legal folders had no partial/readback/orphan-final directory. Producer service was inactive/success; next producer timer is 2026-11-03 02:38:11 UTC. Retention was inactive/success, with next timer 2026-11-02 06:40:20 UTC. Observations do not reserve a future execution window.

Use the frozen source/config hashes and exact selector/tenant-lock mappings in `routine-backup-review.json`. The review-only command template takes existing maintenance/tenant shared locks and holds the existing retention lock shared for the whole manual run. The producer itself takes the existing global backup lock exclusively/nonblocking. Retention's source checks systemd service state rather than manual invocation, so the retention lock closes that coordination gap without changing configuration. Missing/busy locks mean HOLD. A coordinator already holding the maintenance lock exclusively must reuse that lifetime rather than reopen it and deadlock.

The job uses the existing `postgres` backup execution identity, validates an exactly database-only payload, renders the PostgreSQL archive to `/dev/null`, encrypts with CMS AES256GCM, then R2 PUT/GET-verifies ciphertext SHA. It does not change application records or invoke retention. It does create private plaintext temporary dump/tar files before encryption and new local/R2 encrypted artifacts. Its current storage helper parses the whole configured storage `.env` into memory internally; this review read no `.env` values or credentials and made no change to that existing behavior.

Normal completion and handled exceptions clean temporary trees. Abrupt termination can leave plaintext partials, incomplete receipts and separately running helper children. Whole-job reruns generate a new random generation. A failed/pending receipt does not prove an upload was absent. After an SSH interruption, inspect the same invocation window, lock/process state, exact generation manifest and ciphertext metadata; do not rerun blindly, alter receipts or delete uncertain artifacts. If local evidence cannot prove completed readback, hold the backup seal until a separately scoped readback of the same key is resolved.

Files contain source, nonsecret configuration projections, anonymous process metadata and backup generation receipts only. There were no database connections, backup runs, decryption, storage/provider calls, credential reads, configuration changes, new environments or cleanup operations. All inspection locks were released at SSH exit. No action was denied or left uncertain.
