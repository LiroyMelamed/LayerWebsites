#!/usr/bin/env bash
# sync-prod-to-morlevy-neon.sh — Sync MorLevi Neon DB from MorLevy production VPS
# Usage: bash scripts/sync-prod-to-morlevy-neon.sh
# Credentials: set NEON_DATABASE_URL or NEON_PASS (see .env.neon.example)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_neon-sync-common.sh"

PROD_HOST="root@37.60.230.148"
PROD_DB="morlevy"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
PSQL="$(brew --prefix libpq)/bin/psql"
DUMP_REMOTE="/tmp/morlevy_prod.sql"
DUMP_LOCAL="$SCRIPT_DIR/../morlevy_prod.sql"
DUMP_CLEAN="$SCRIPT_DIR/../morlevy_clean.sql"

echo ""
echo "=== [1/7] Dumping MorLevy production DB (read-only) ==="
ssh "${SSH_OPTS[@]}" "$PROD_HOST" \
  "sudo -u postgres pg_dump -d $PROD_DB --format=plain --no-owner --no-privileges --encoding=UTF8 > $DUMP_REMOTE 2>/dev/null; echo ROWS:; wc -l $DUMP_REMOTE"

echo ""
echo "=== [2/7] Downloading dump ==="
scp "${SSH_OPTS[@]}" "${PROD_HOST}:${DUMP_REMOTE}" "$DUMP_LOCAL"
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
"$PSQL" "$NEON_CONNSTR" -c "
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO neondb_owner;
" 2>&1 || true
TABLE_COUNT=$("$PSQL" "$NEON_CONNSTR" -A -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "Tables remaining: $TABLE_COUNT"

echo ""
echo "=== [5/7] Enabling pgvector on Neon ==="
"$PSQL" "$NEON_CONNSTR" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 || true
echo "pgvector extension ready"

echo ""
echo "=== [6/7] Restoring production data to Neon ==="
export PGCLIENTENCODING=UTF8
"$PSQL" "$NEON_CONNSTR" -f "$DUMP_CLEAN" 2>&1 | grep "^COPY" || true

echo ""
echo "=== [7/7] Verifying ==="
"$PSQL" "$NEON_DIRECT_URL" -A -t -c "
  SET search_path TO public;
  SELECT 'users=' || count(*) FROM users;
  SELECT 'cases=' || count(*) FROM cases;
  SELECT 'tables=' || count(*) FROM pg_tables WHERE schemaname='public';
"

# Cleanup temp files
rm -f "$DUMP_LOCAL" "$DUMP_CLEAN"

echo ""
echo "=== Done! MorLevi Neon DB synced from MorLevy production ==="
