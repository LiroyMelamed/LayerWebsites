#!/usr/bin/env bash
# Deploy frontend build to 84.46.253.85 for morlevy or ashrafessa.
# Usage: ./scripts/deploy-tenant-frontend.sh morlevy|ashrafessa
set -euo pipefail

TENANT="${1:-}"
FRONTEND_HOST="${FRONTEND_HOST:-root@84.46.253.85}"
FRONTEND_PASS="${FRONTEND_PASS:-Aa0507299064}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$TENANT" != "morlevy" && "$TENANT" != "ashrafessa" ]]; then
  echo "Usage: $0 morlevy|ashrafessa" >&2
  exit 1
fi

cd "$ROOT/frontend"

# Tenant logos live in separate paths so builds never overwrite each other.
TENANT_LOGO="public/tenants/${TENANT}/firm-logo.png"
if [[ ! -f "$TENANT_LOGO" ]]; then
  echo "Missing $TENANT_LOGO — add the tenant logo before deploying." >&2
  exit 1
fi
cp "$TENANT_LOGO" public/firm-logo.png

npm run "build:$TENANT"

DEPLOY_API="$(grep -o 'https://api-[^"]*' build/static/js/main.*.js | sort -u)"
echo "# Built API: $DEPLOY_API"

export SSHPASS="$FRONTEND_PASS"
sshpass -e rsync -az --delete build/ "${FRONTEND_HOST}:/var/www/${TENANT}/"

# Always re-apply tenant logo after rsync (build may embed a stale public/firm-logo.png).
sshpass -e scp "$TENANT_LOGO" "${FRONTEND_HOST}:/var/www/${TENANT}/firm-logo.png"
echo "# Deployed logo: $(file -b "$TENANT_LOGO")"

REMOTE_API="$(sshpass -e ssh "${FRONTEND_HOST}" "grep -o 'https://api-[^\"]*' /var/www/${TENANT}/static/js/main.*.js | sort -u")"
echo "# Deployed API: $REMOTE_API"
echo "# Done: https://${TENANT}.mela-media.co.il"
