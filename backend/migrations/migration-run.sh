#!/usr/bin/env bash
set -euo pipefail

# Runs SQL migrations in ./backend/migrations/ in lexicographic order.
# Tracks applied migrations in public.schema_migrations.
#
# Connection:
# - Preferred: set DATABASE_URL (e.g. postgres://user:pass@host:5432/dbname)
# - Otherwise: relies on standard libpq env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PSQL=(psql -v ON_ERROR_STOP=1)
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL+=("${DATABASE_URL}")
fi

echo "[migrations] Using migrations directory: ${SCRIPT_DIR}"

"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob

for file in "${SCRIPT_DIR}"/*.sql; do
  base="$(basename "${file}")"

  # Skip verification script (run it explicitly after migrations)
  if [[ "${base}" == "migration-verify.sql" ]]; then
    continue
  fi

  # Basic filter: only our dated migration files should be applied
  if [[ ! "${base}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}_.+\.sql$ ]]; then
    echo "[migrations] Skipping non-migration file: ${base}"
    continue
  fi

  already=$(
    "${PSQL[@]}" -tA -c "select 1 from public.schema_migrations where filename = '$base' limit 1;" || true
  )

  if [[ "${already}" == "1" ]]; then
    echo "[migrations] Already applied: ${base}"
    continue
  fi

  echo "[migrations] Applying: ${base}"
  "${PSQL[@]}" -f "${file}"
  "${PSQL[@]}" -c "insert into public.schema_migrations(filename) values ('$base');"
  echo "[migrations] Applied: ${base}"
done

echo "[migrations] Done."