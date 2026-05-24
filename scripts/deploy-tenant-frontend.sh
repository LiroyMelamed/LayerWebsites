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
npm run "build:$TENANT"

DEPLOY_API="$(grep -o 'https://api-[^"]*' build/static/js/main.*.js | sort -u)"
echo "# Built API: $DEPLOY_API"

export SSHPASS="$FRONTEND_PASS"
sshpass -e rsync -az --delete build/ "${FRONTEND_HOST}:/var/www/${TENANT}/"

if [[ "$TENANT" == "ashrafessa" ]]; then
  sshpass -e scp public/firm-logo.png "${FRONTEND_HOST}:/var/www/ashrafessa/firm-logo.png"
fi

REMOTE_API="$(sshpass -e ssh "${FRONTEND_HOST}" "grep -o 'https://api-[^\"]*' /var/www/${TENANT}/static/js/main.*.js | sort -u")"
echo "# Deployed API: $REMOTE_API"
echo "# Done: https://${TENANT}.mela-media.co.il"
