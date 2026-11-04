> **Latest owner constraint: no new environment anywhere.** Existing QA only after isolation, synthetic data and inability to charge are proven. Final documented-target discovery found no reusable quarantine in its bounded scope; [exact findings](EXISTING-RESTORE-TARGETS.md). No creation/start is pending or authorized.

# Owner constraint and exact schema-only approval proposal

The owner requires the existing QA environment. **All new Mac PostgreSQL databases, clusters, roles, fixtures and extension-installation plans are cancelled, not pending. None were performed.** Existing QA may be used only after isolation, synthetic-only records and inability to charge are proven. No customer-backup restore or destructive fixture action is authorized by this instruction.

The prior export attempted only the existing QA database `melamedia` through `melamedia_app`. Catalog reads succeeded; schema-only `pg_dump` was denied and emitted zero DDL. There was no grant, alternative-role retry or privilege escalation. That failure remains unchanged.

A later source-only inspection, under existing SSH/shared maintenance+QA locks, verified installed producer SHA `085b3d946f475d1ad8ebd78f60aed389d6fea661963e34389b8991d339b2d160`, line185. It constructs `runuser -u postgres -- pg_dump -Fc --dbname <configured project database>`. Thus **OS identity postgres** is verified from source. The command omits an explicit DB `-U`/host; effective DB role/default environment was not queried. This source lookup made no DB connection or export and read no environment values.

The precise future read-access proposal is approval to use the **existing backup execution identity**, bound explicitly to existing OS postgres, existing database role postgres, the known local Unix socket/5432 and QA database melamedia, for `pg_dump --schema-only --no-owner --no-privileges` streamed to protected non-Git metadata storage. This is a separately approved higher-privilege metadata export, not an automatic fallback, a new role/grant, a new Mac database, a restore or a schema application. The coordinator must verify/bind that existing identity and exact scope before execution. Do not infer approval from the routine backup script's existence.

Current catalog facts remain PostgreSQL16.15, vector0.6.0, pgcrypto1.3 and116public tables. No DDL input was captured and there is no valid filtered-DDL hash. Backup archive/header/hash evidence remains valid; restore and complete inactive rollback certification remain unclosed without reviving the cancelled Mac plans.

[Source-only identity evidence](backup-dump-identity.json) · [pending action state](pending-actions.json) · [read-only backup evidence](evidence.json)
