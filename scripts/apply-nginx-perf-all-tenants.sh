#!/usr/bin/env bash
# Apply performance nginx snippets to tenant vhosts (idempotent, safe).
# Uses /etc/nginx/snippets/lw-spa-perf.conf and lw-api-perf-<port>.conf includes.
# Usage: ./scripts/apply-nginx-perf-all-tenants.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
BACKEND_HOST="${BACKEND_HOST:-root@37.60.230.148}"
FRONTEND_HOST="${FRONTEND_HOST:-root@84.46.253.85}"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
  esac
done

SPA_SNIP="$ROOT/deploy/nginx-spa-tenant.conf.snippet"
API_SNIP="$ROOT/deploy/nginx-api-tenant.conf.snippet"

run() {
  if $DRY_RUN; then echo "[dry-run] $*"; else "$@"; fi
}

run scp -i "$SSH_KEY" -o BatchMode=yes "$ROOT/deploy/nginx-spa-gzip.conf.snippet" "$FRONTEND_HOST:/tmp/lw-nginx-spa-gzip.snippet"
run scp -i "$SSH_KEY" -o BatchMode=yes "$API_SNIP" "$BACKEND_HOST:/tmp/lw-nginx-api.snippet"

run ssh -i "$SSH_KEY" -o BatchMode=yes "$FRONTEND_HOST" bash -s <<'REMOTE'
set -euo pipefail
MARK="lw-spa-perf.conf"
install -d /etc/nginx/snippets

if ! dpkg -s libnginx-mod-http-brotli-filter >/dev/null 2>&1; then
  echo "Installing nginx brotli modules…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static brotli
fi

if ! command -v brotli >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq brotli
fi

echo "Pre-compressing tenant main.js bundles (.br)…"
for js in /var/www/*/static/js/main.*.js; do
  [ -f "$js" ] || continue
  brotli -f -q 6 "$js"
done

cp /tmp/lw-nginx-spa-gzip.snippet /etc/nginx/snippets/lw-spa-perf.conf

strip_inline_compression() {
  local site="$1"
  sed -i '/^[[:space:]]*gzip[[:space:]]/d;/^[[:space:]]*gzip_/d;/^[[:space:]]*brotli[[:space:]]/d;/^[[:space:]]*brotli_/d' "$site"
}

ensure_static_brotli() {
  local site="$1"
  if grep -q 'brotli_static on' "$site"; then
    return 0
  fi
  sed -i '/location ~\* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {/a\
        brotli_static on;' "$site"
}

ensure_include() {
  local site="$1"
  [ -f "$site" ] || return 0
  install -d /etc/nginx/backups
  cp "$site" "/etc/nginx/backups/$(basename "$site").bak-perf-$(date +%Y%m%d%H%M)"
  strip_inline_compression "$site"
  if grep -q "$MARK" "$site"; then
    echo "refresh snippet include: $(basename "$site")"
  else
  sed -i '/include.*lw-spa-perf.conf/d' "$site"
  awk -v inc="    include /etc/nginx/snippets/lw-spa-perf.conf; # lw-perf-spa" '
    /^[[:space:]]*listen[[:space:]]+443/ && !inserted {
      print
      print inc
      inserted=1
      next
    }
    { print }
  ' "$site" > "${site}.tmp" && mv "${site}.tmp" "$site"
  ensure_static_brotli "$site"
  echo "patched: $(basename "$site")"
  fi
}

for name in morlevy ashrafessa melamedia idm lawyer.mela-media.co.il; do
  ensure_include "/etc/nginx/sites-enabled/$name"
done

# Remove accidental backup symlinks from sites-enabled
rm -f /etc/nginx/sites-enabled/*.bak-perf-*

nginx -t
systemctl reload nginx
echo "Frontend nginx OK"
REMOTE

run ssh -i "$SSH_KEY" -o BatchMode=yes "$BACKEND_HOST" bash -s <<'REMOTE'
set -euo pipefail
install -d /etc/nginx/snippets /etc/nginx/backups
API_SNIP="/etc/nginx/snippets/lw-api-perf-common.conf"
grep -v '^#' /tmp/lw-nginx-api.snippet > "$API_SNIP"

strip_api_dupes() {
  sed -i '/^[[:space:]]*gzip[[:space:]]/d;/^[[:space:]]*gzip_/d;/^[[:space:]]*include.*lw-api-perf/d' "$1"
}

for site in /etc/nginx/sites-enabled/*-api /etc/nginx/sites-enabled/melamedlaw.co.il; do
  [ -f "$site" ] || continue
  grep -qE 'api-|melamedlaw' "$site" 2>/dev/null || continue
  cp "$site" "/etc/nginx/backups/$(basename "$site").bak-perf-$(date +%Y%m%d%H%M)"
  strip_api_dupes "$site"
  if grep -q 'lw-api-perf-common.conf' "$site"; then
    echo "refresh api include: $(basename "$site")"
    continue
  fi
  awk -v inc="    include /etc/nginx/snippets/lw-api-perf-common.conf; # lw-perf-api" '
    /^[[:space:]]*listen[[:space:]]+443/ && !inserted {
      print
      print inc
      inserted=1
      next
    }
    { print }
  ' "$site" > "${site}.tmp" && mv "${site}.tmp" "$site"
  echo "patched api: $(basename "$site")"
done

rm -f /etc/nginx/sites-enabled/*.bak-perf-*
nginx -t
systemctl reload nginx
echo "Backend nginx OK"
REMOTE

echo "Done apply-nginx-perf-all-tenants"
