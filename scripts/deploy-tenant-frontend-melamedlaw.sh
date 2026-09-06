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

PRESERVE_DIR="$(mktemp -d)"
trap 'rm -rf "$PRESERVE_DIR"' EXIT

echo "# Preserving remote hashed JS bundles (cached index.html may still reference them)..."
export LFTP_PASSWORD="$MELAMED_LAW_FTP_PASSWORD"
lftp -u "$MELAMED_LAW_FTP_USERNAME,$MELAMED_LAW_FTP_PASSWORD" "$MELAMED_LAW_FTP_SERVER" <<EOF || true
set ssl:verify-certificate no
set ftp:passive-mode true
cd $MELAMED_LAW_FTP_REMOTE_PATH/static/js
mget -O "$PRESERVE_DIR" main.*.js
cd $MELAMED_LAW_FTP_REMOTE_PATH/static/css
mget -O "$PRESERVE_DIR" main.*.css
bye
EOF

npm run build:melamedlaw

CURRENT_MAIN="$(basename build/static/js/main.*.js)"
for preserved in "$PRESERVE_DIR"/main.*.js; do
  [[ -f "$preserved" ]] || continue
  base="$(basename "$preserved")"
  if [[ "$base" != "$CURRENT_MAIN" && ! -f "build/static/js/$base" ]]; then
    cp "$preserved" "build/static/js/$base"
    echo "# Kept previous bundle: $base"
  fi
done

for preserved in "$ROOT/scripts/preserved-bundles"/main.*.js; do
  [[ -f "$preserved" ]] || continue
  base="$(basename "$preserved")"
  if [[ "$base" != "$CURRENT_MAIN" && ! -f "build/static/js/$base" ]]; then
    cp "$preserved" "build/static/js/$base"
    echo "# Kept preserved bundle: $base"
  fi
done

CURRENT_CSS="$(basename build/static/css/main.*.css)"
for preserved in "$PRESERVE_DIR"/main.*.css "$ROOT/scripts/preserved-bundles"/main.*.css; do
  [[ -f "$preserved" ]] || continue
  base="$(basename "$preserved")"
  if [[ "$base" != "$CURRENT_CSS" && ! -f "build/static/css/$base" ]]; then
    cp "$preserved" "build/static/css/$base"
    echo "# Kept preserved stylesheet: $base"
  fi
done

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
