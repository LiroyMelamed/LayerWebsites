# DB migrations (Postgres)

This repo stores SQL migrations in `backend/migrations/`.

## Goals
- Apply schema changes in a predictable order.
- Record what ran (so re-running is safe).
- Verify required production schema for signing + notifications + WhatsApp link.

## Before you run
- Take a backup (recommended):
  - `pg_dump --format=custom --file /var/backups/melamedlaw_$(date +%F_%H%M).dump "$PGDATABASE"`
- Make sure you can connect to Postgres via `psql`.

## Run migrations (recommended)
On the Ubuntu server:

```bash
cd /var/www/melamedlaw/backend

# Option A (recommended): use DATABASE_URL
export DATABASE_URL="postgres://USER:PASSWORD@127.0.0.1:5432/DBNAME"

bash migrations/migration-run.sh

# Verify expected schema
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-verify.sql
```

Notes:
- `migrations/migration-run.sh` creates `public.schema_migrations` (if missing) and then runs all `YYYY-MM-DD_NN_*.sql` files in lexicographic order.
- `migrations/migration-verify.sql` raises an error if required columns are missing.

## Rollback guidance
These migrations are intentionally conservative and mostly additive (columns/indexes/constraints).

If you must roll back:
- Prefer restoring the pre-migration backup.
- Otherwise, roll back manually per migration file (drop the indexes/constraints/columns you added).

## Current migration list
- `2025-12-23_01_add_signeruserid_to_signaturespots.sql`
- `2025-12-23_02_make_signingfiles_caseid_optional.sql`
- `2025-12-30_03_signing_schema_hardening.sql`
- `2025-12-30_04_notifications_schema_indexes.sql`
- `2025-12-30_05_cases_add_whatsappgrouplink.sql`
