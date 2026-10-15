#!/usr/bin/env bash
# EXPLAIN ANALYZE for manager-home and calendar list queries (Melamedia QA DB).
# Usage on backend server: MIGRATION_PGDATABASE=melamedia bash backend/scripts/explain-perf-queries.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$SCRIPT_DIR/explain-perf-queries.sql"

if [[ -n "${MIGRATION_PGDATABASE:-}" ]] && [[ "$(id -u)" -eq 0 ]] && command -v sudo >/dev/null; then
  PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$MIGRATION_PGDATABASE")
else
  PSQL=(psql -v ON_ERROR_STOP=1)
  if [[ -n "${MIGRATION_PGDATABASE:-}" ]]; then PSQL+=(-d "$MIGRATION_PGDATABASE"); fi
fi

echo "[explain-perf] database=${MIGRATION_PGDATABASE:-default}"
TMP="/tmp/explain-perf-queries-$$.sql"
cp "$SQL" "$TMP"
chmod 644 "$TMP"
"${PSQL[@]}" -f "$TMP"
rm -f "$TMP"
