#!/usr/bin/env bash
set -euo pipefail

# Runs SQL migrations in ./backend/migrations/ in lexicographic order.
# Tracks applied migrations in public.schema_migrations.
#
# Connection:
# - Preferred: set DATABASE_URL (e.g. postgres://user:pass@host:5432/dbname)
# - Otherwise: relies on standard libpq env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENV_FILE="${SCRIPT_DIR}/../.env"

load_dotenv_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  # Parse a simple .env file safely (no eval). Supports lines:
  #   KEY=value
  #   KEY="value"
  # Ignores empty lines and comments.
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip CRLF if present
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]] && line="${line#export }"
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      # Trim surrounding whitespace
      value="${value##[[:space:]]}"
      value="${value%%[[:space:]]}"
      # Strip surrounding quotes
      if [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "$key=$value"
    fi
  done < "$file"
}

derive_database_url() {
  # If DATABASE_URL already provided, do nothing.
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi

  # Prefer deriving DATABASE_URL from DB_* vars (matches backend/config/db.js)
  local db_user="${DB_USER:-}"
  local db_password="${DB_PASSWORD:-}"
  local db_host="${DB_HOST:-localhost}"
  local db_port="${DB_PORT:-5432}"
  local db_name="${DB_NAME:-}"

  if [[ -z "$db_user" || -z "$db_name" ]]; then
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    # Use python for URL-encoding to avoid breaking on special chars in passwords.
    DATABASE_URL="$(
      python3 - <<'PY'
import os
from urllib.parse import quote

user = os.environ.get('DB_USER', '')
password = os.environ.get('DB_PASSWORD', '')
host = os.environ.get('DB_HOST', 'localhost')
port = os.environ.get('DB_PORT', '5432')
name = os.environ.get('DB_NAME', '')

u = quote(user, safe='')
p = quote(password, safe='')
n = quote(name, safe='')
print(f"postgres://{u}:{p}@{host}:{port}/{n}")
PY
    )"
    export DATABASE_URL
    return 0
  fi

  # Fallback (no encoding): works if credentials don't contain reserved URL chars.
  export DATABASE_URL="postgres://${db_user}:${db_password}@${db_host}:${db_port}/${db_name}"
}

load_dotenv_file "$ENV_FILE"
derive_database_url

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

apply_one() {
  local file="$1"
  local base
  base="$(basename "${file}")"

  already=$(
    "${PSQL[@]}" -tA -c "select 1 from public.schema_migrations where filename = '$base' limit 1;" || true
  )
  if [[ "${already}" == "1" ]]; then
    echo "[migrations] Already applied: ${base}"
    return 0
  fi

  echo "[migrations] Applying: ${base}"
  "${PSQL[@]}" -f "${file}"
  "${PSQL[@]}" -c "insert into public.schema_migrations(filename) values ('$base');"
  echo "[migrations] Applied: ${base}"
}

# Important: production might not have any signing tables yet.
# Force-apply the base signing schema migration first (if present), regardless of filename sort order.
BASE_SIGNING_FILE="${SCRIPT_DIR}/2025-12-30_00_create_signing_base_schema.sql"
if [[ -f "${BASE_SIGNING_FILE}" ]]; then
  apply_one "${BASE_SIGNING_FILE}"
fi

for file in "${SCRIPT_DIR}"/*.sql; do
  base="$(basename "${file}")"

  # If we applied base signing already, skip it in the regular loop.
  if [[ "${base}" == "2025-12-30_00_create_signing_base_schema.sql" ]]; then
    continue
  fi

  # Skip verification script (run it explicitly after migrations)
  if [[ "${base}" == "migration-verify.sql" ]]; then
    continue
  fi

  # Basic filter: only our dated migration files should be applied
  if [[ ! "${base}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}_.+\.sql$ ]]; then
    echo "[migrations] Skipping non-migration file: ${base}"
    continue
  fi

  apply_one "${file}"
done

echo "[migrations] Done."