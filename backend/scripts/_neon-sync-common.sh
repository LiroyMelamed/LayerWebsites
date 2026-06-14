#!/usr/bin/env bash
# Shared Neon connection config for prod→Neon sync scripts.
# Credentials MUST come from the environment — never hardcode or commit secrets.
#
# Option A (preferred): export NEON_DATABASE_URL='postgresql://user:pass@host/neondb?sslmode=require'
# Option B: export NEON_PASS='...' (plus optional NEON_HOST / NEON_USER / NEON_DB)

set -euo pipefail

NEON_HOST="${NEON_HOST:-ep-super-mode-alv2q4jv-pooler.c-3.eu-central-1.aws.neon.tech}"
NEON_HOST_DIRECT="${NEON_HOST_DIRECT:-ep-super-mode-alv2q4jv.c-3.eu-central-1.aws.neon.tech}"
NEON_DB="${NEON_DB:-neondb}"
NEON_USER="${NEON_USER:-neondb_owner}"

if [[ -f "$(dirname "$0")/.env.neon" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$(dirname "$0")/.env.neon"
  set +a
fi

if [[ -n "${NEON_DATABASE_URL:-}" ]]; then
  NEON_CONNSTR="$NEON_DATABASE_URL"
  NEON_DIRECT_URL="${NEON_DATABASE_URL//-pooler/}"
elif [[ -n "${NEON_PASS:-}" ]]; then
  NEON_CONNSTR="postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}:5432/${NEON_DB}?sslmode=require"
  NEON_DIRECT_URL="postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST_DIRECT}:5432/${NEON_DB}?sslmode=require"
else
  echo "ERROR: Set NEON_DATABASE_URL or NEON_PASS before running (see backend/scripts/.env.neon.example)." >&2
  exit 1
fi
