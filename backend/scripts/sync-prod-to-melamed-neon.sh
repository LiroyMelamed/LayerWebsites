#!/usr/bin/env bash
# sync-prod-to-melamed-neon.sh — Sync MelamedLaw Neon DB from MelamedLaw production VPS
# Usage: bash scripts/sync-prod-to-melamed-neon.sh
set -euo pipefail

PROD_HOST="root@37.60.230.148"
PROD_DB="melamedlaw"
NEON_HOST="ep-super-mode-alv2q4jv-pooler.c-3.eu-central-1.aws.neon.tech"
NEON_HOST_DIRECT="ep-super-mode-alv2q4jv.c-3.eu-central-1.aws.neon.tech"
NEON_DB="neondb"
NEON_USER="neondb_owner"
NEON_PASS="npg_te3Jw0sqBSHg"
PSQL="$(brew --prefix libpq)/bin/psql"
DUMP_REMOTE="/tmp/melamedlaw_prod.sql"
DUMP_LOCAL="$(dirname "$0")/../melamedlaw_prod.sql"
DUMP_CLEAN="$(dirname "$0")/../melamedlaw_clean.sql"

NEON_CONNSTR="postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}:5432/${NEON_DB}?sslmode=require"

echo ""
echo "=== [1/7] Dumping MelamedLaw production DB (read-only) ==="
sshpass -p 'Aa0507299064' ssh "$PROD_HOST" \
  "sudo -u postgres pg_dump -d $PROD_DB --format=plain --no-owner --no-privileges --encoding=UTF8 > $DUMP_REMOTE 2>/dev/null; echo ROWS:; wc -l $DUMP_REMOTE"

echo ""
echo "=== [2/7] Downloading dump ==="
sshpass -p 'Aa0507299064' scp "${PROD_HOST}:${DUMP_REMOTE}" "$DUMP_LOCAL"
echo "Downloaded: $(du -h "$DUMP_LOCAL" | cut -f1)"

echo ""
echo "=== [3/7] Cleaning dump for Neon compatibility ==="
sed \
  -e '/^\\restrict/d' \
  -e '/^\\unrestrict/d' \
  -e 's/^\s*CREATE EXTENSION.*vector.*/-- stripped: CREATE EXTENSION vector (enable via Neon dashboard)/' \
  "$DUMP_LOCAL" > "$DUMP_CLEAN"
echo "Processed $(wc -l < "$DUMP_CLEAN") lines"

echo ""
echo "=== [4/7] Dropping all Neon tables ==="
PGPASSWORD="$NEON_PASS" "$PSQL" "$NEON_CONNSTR" -c "
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO neondb_owner;
" 2>&1 || true
TABLE_COUNT=$(PGPASSWORD="$NEON_PASS" "$PSQL" "$NEON_CONNSTR" -A -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "Tables remaining: $TABLE_COUNT"

echo ""
echo "=== [5/7] Enabling pgvector on Neon ==="
PGPASSWORD="$NEON_PASS" "$PSQL" "$NEON_CONNSTR" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 || true
echo "pgvector extension ready"

echo ""
echo "=== [6/7] Restoring production data to Neon ==="
export PGCLIENTENCODING=UTF8
PGPASSWORD="$NEON_PASS" "$PSQL" "$NEON_CONNSTR" -f "$DUMP_CLEAN" 2>&1 | grep "^COPY" || true

echo ""
echo "=== [7/7] Verifying ==="
NEON_DIRECT="postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST_DIRECT}:5432/${NEON_DB}?sslmode=require"
PGPASSWORD="$NEON_PASS" "$PSQL" "$NEON_DIRECT" -A -t -c "
  SET search_path TO public;
  SELECT 'users=' || count(*) FROM users;
  SELECT 'cases=' || count(*) FROM cases;
  SELECT 'tables=' || count(*) FROM pg_tables WHERE schemaname='public';
"

# Cleanup temp files
rm -f "$DUMP_LOCAL" "$DUMP_CLEAN"
sshpass -p 'Aa0507299064' ssh "$PROD_HOST" "rm -f $DUMP_REMOTE"

echo ""
echo "=== Done! MelamedLaw Neon DB synced from MelamedLaw production ==="
