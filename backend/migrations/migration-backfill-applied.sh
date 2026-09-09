#!/usr/bin/env bash
# Bootstrap schema_migrations on mature DBs that pre-date tracking.
# Only runs when schema_migrations is empty AND notification_channel_config exists.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

load_dotenv_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]] && line="${line#export }"
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      value="${value##[[:space:]]}"
      value="${value%%[[:space:]]}"
      if [[ "$value" =~ ^\"(.*)\"$ ]]; then value="${BASH_REMATCH[1]}"; fi
      export "$key=$value"
    fi
  done < "$file"
}

derive_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then return 0; fi
  local db_user="${DB_USER:-}"
  local db_password="${DB_PASSWORD:-}"
  local db_host="${DB_HOST:-localhost}"
  local db_port="${DB_PORT:-5432}"
  local db_name="${DB_NAME:-}"
  [[ -n "$db_user" && -n "$db_name" ]] || return 0
  if command -v python3 >/dev/null 2>&1; then
    DATABASE_URL="$(python3 - <<'PY'
import os
from urllib.parse import quote
user = os.environ.get('DB_USER', '')
password = os.environ.get('DB_PASSWORD', '')
host = os.environ.get('DB_HOST', 'localhost')
port = os.environ.get('DB_PORT', '5432')
name = os.environ.get('DB_NAME', '')
print(f"postgres://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(name, safe='')}")
PY
)"
    export DATABASE_URL
  fi
}

load_dotenv_file "$ENV_FILE"
if [[ -z "${MIGRATION_PGDATABASE:-}" ]]; then
  derive_database_url
fi

PSQL=(psql -v ON_ERROR_STOP=1)
if [[ -n "${MIGRATION_PGDATABASE:-}" ]]; then
  if [[ "$(id -u)" -eq 0 ]] && command -v sudo >/dev/null 2>&1; then
    PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$MIGRATION_PGDATABASE")
  else
    PSQL+=(-d "$MIGRATION_PGDATABASE")
  fi
elif [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL+=("${DATABASE_URL}")
elif [[ -n "${DB_NAME:-}" ]]; then
  PSQL+=(-d "$DB_NAME")
fi

"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

count=$("${PSQL[@]}" -tA -c "SELECT COUNT(*)::int FROM public.schema_migrations;")
if [[ "${count}" != "0" ]]; then
  echo "[migration-backfill] schema_migrations already has ${count} rows — skip"
  exit 0
fi

mature=$("${PSQL[@]}" -tA -c "
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_channel_config'
  ) THEN 1 ELSE 0 END;
")

if [[ "${mature}" != "1" ]]; then
  echo "[migration-backfill] Fresh DB — skip backfill"
  exit 0
fi

shopt -s nullglob
values=""
for file in "${SCRIPT_DIR}"/*.sql; do
  base="$(basename "${file}")"
  [[ "${base}" == "migration-verify.sql" ]] && continue
  [[ "${base}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}_.+\.sql$ ]] || continue
  esc="${base//\'/''}"
  if [[ -n "$values" ]]; then values+=","; fi
  values+="('${esc}')"
done

if [[ -z "$values" ]]; then
  echo "[migration-backfill] No migration files found"
  exit 0
fi

echo "[migration-backfill] Marking existing migrations as applied (mature DB bootstrap)"
"${PSQL[@]}" -c "INSERT INTO public.schema_migrations (filename) VALUES ${values} ON CONFLICT (filename) DO NOTHING;"
echo "[migration-backfill] Done."
