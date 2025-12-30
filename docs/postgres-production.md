# Postgres in production (Ubuntu, local DB)

Date: 2025-12-30

Short, practical hardening notes for running Postgres on the same Ubuntu server as the app.

---

## 1) Create dedicated DB + user (do NOT use `postgres`)

In psql as superuser:
```sql
-- database
CREATE DATABASE melamedlaw;

-- role/user
CREATE USER melamedlaw_app WITH PASSWORD '...';

-- privileges
GRANT CONNECT ON DATABASE melamedlaw TO melamedlaw_app;
\c melamedlaw
GRANT USAGE ON SCHEMA public TO melamedlaw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO melamedlaw_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO melamedlaw_app;

-- make future tables/sequences inherit privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO melamedlaw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO melamedlaw_app;
```

---

## 2) Listen + auth sanity (pg_hba.conf / listen_addresses)

Goal: accept local connections only (unless you explicitly need remote DB access).

Suggested:
- `listen_addresses = '127.0.0.1'` (or `'localhost'`)
- In `pg_hba.conf`, prefer `scram-sha-256`:
  - `local   all             melamedlaw_app                        scram-sha-256`
  - `host    melamedlaw      melamedlaw_app  127.0.0.1/32          scram-sha-256`

After editing:
```bash
sudo systemctl reload postgresql
```

---

## 3) SSL

If Postgres is local-only (same host), SSL usually isn’t necessary.

- App env: set `DB_SSL=false`.
- If you later move DB to another host/network, enable SSL and use stricter verification.

---

## 4) Connection pool limits

The backend uses `pg` Pool in [backend/config/db.js](backend/config/db.js) and supports tuning:
- `DB_POOL_MAX` (default: 20)
- `DB_POOL_IDLE_TIMEOUT_MS` (default: 30000)
- `DB_POOL_CONN_TIMEOUT_MS` (default: 5000)

Start with conservative numbers; tune based on:
- Postgres `max_connections`
- available RAM/CPU
- observed query latency

---

## 5) Backup strategy (pg_dump + retention)

Minimum viable backups:
- Nightly `pg_dump` to a directory outside the app code path
- Keep 7 days

Example script (run as root via cron, but store credentials safely):
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/postgres/melamedlaw
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/melamedlaw-$STAMP.dump"

pg_dump --format=custom --file "$FILE" melamedlaw

# retention: 7 days
find "$BACKUP_DIR" -type f -name 'melamedlaw-*.dump' -mtime +7 -delete
```

Note:
- Verify restores periodically (`pg_restore` into a scratch DB).
- Consider snapshots at the VM level if available.
