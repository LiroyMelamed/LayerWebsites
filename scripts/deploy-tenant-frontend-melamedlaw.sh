#!/usr/bin/env bash
# Build MelamedLaw frontend and upload via FTP to client.melamedlaw.co.il
# Usage: ./scripts/deploy-tenant-frontend-melamedlaw.sh
# Credentials: frontend/.env.ftp.local (not committed)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FTP_ENV="$ROOT/frontend/.env.ftp.local"

if [[ ! -f "$FTP_ENV" ]]; then
  echo "Missing $FTP_ENV" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$FTP_ENV"

: "${MELAMED_LAW_FTP_SERVER:?}"
: "${MELAMED_LAW_FTP_USERNAME:?}"
: "${MELAMED_LAW_FTP_PASSWORD:?}"
: "${MELAMED_LAW_FTP_REMOTE_PATH:?}"

cd "$ROOT/frontend"

TENANT_LOGO="public/tenants/melamedlaw/firm-logo.png"
if [[ ! -f "$TENANT_LOGO" ]]; then
  echo "Missing $TENANT_LOGO" >&2
  exit 1
fi

cp "$TENANT_LOGO" public/firm-logo.png
npm run build:melamedlaw

DEPLOY_API="$(grep -o 'https://api[^"]*' build/static/js/main.*.js | sort -u || true)"
echo "# Built API: $DEPLOY_API"
if ! grep -q 'api.calls.melamedlaw.co.il' build/static/js/main.*.js; then
  echo "ERROR: build does not target api.calls.melamedlaw.co.il" >&2
  exit 1
fi

LOGO512_HASH="$(md5 -q build/logo512.png)"
ML512_HASH="$(md5 -q public/tenants/melamedlaw/logo512.png)"
if [[ "$LOGO512_HASH" != "$ML512_HASH" ]]; then
  echo "ERROR: logo512.png hash mismatch (got $LOGO512_HASH, expected $ML512_HASH)" >&2
  exit 1
fi

export LFTP_PASSWORD="$MELAMED_LAW_FTP_PASSWORD"
lftp -u "$MELAMED_LAW_FTP_USERNAME,$MELAMED_LAW_FTP_PASSWORD" "$MELAMED_LAW_FTP_SERVER" <<EOF
set ssl:verify-certificate no
set ftp:passive-mode true
cd $MELAMED_LAW_FTP_REMOTE_PATH
mirror -R --delete --verbose build/ .
put public/tenants/melamedlaw/firm-logo.png -o firm-logo.png
bye
EOF

echo "# Deployed logo512: $LOGO512_HASH"
echo "# Done: https://client.melamedlaw.co.il"
