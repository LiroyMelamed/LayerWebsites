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
cp /tmp/lw-nginx-spa-gzip.snippet /etc/nginx/snippets/lw-spa-perf.conf

ensure_include() {
  local site="$1"
  [ -f "$site" ] || return 0
  if grep -q "$MARK" "$site" || grep -q 'gzip on' "$site"; then
    echo "skip (gzip present): $(basename "$site")"
    return 0
  fi
  cp "$site" "${site}.bak-perf-$(date +%Y%m%d%H%M)"
  awk -v inc="    include /etc/nginx/snippets/lw-spa-perf.conf; # lw-perf-spa" '
    /^[[:space:]]*server[[:space:]]*\{/ && !inserted {
      print
      print inc
      inserted=1
      next
    }
    { print }
  ' "$site" > "${site}.tmp" && mv "${site}.tmp" "$site"
  echo "patched: $(basename "$site")"
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
install -d /etc/nginx/snippets
declare -A PORTS=(
  [api.calls.melamedlaw.co.il]=3000
  [api-morlevy.mela-media.co.il]=3001
  [api-ashrafessa.mela-media.co.il]=3002
  [api-melamedia.mela-media.co.il]=3003
  [api-idm.mela-media.co.il]=3004
)

for site in /etc/nginx/sites-enabled/*; do
  [ -f "$site" ] || continue
  port=""
  for host in "${!PORTS[@]}"; do
    if grep -q "$host" "$site" 2>/dev/null; then port="${PORTS[$host]}"; break; fi
  done
  [[ -n "$port" ]] || continue
  snip="/etc/nginx/snippets/lw-api-perf-${port}.conf"
  if [[ ! -f "$snip" ]]; then
    sed 's/__PORT__/'"$port"'/g' /tmp/lw-nginx-api.snippet | grep -v '^#' > "$snip"
  fi
  if grep -q "lw-api-perf-${port}.conf" "$site" 2>/dev/null; then
    echo "skip api: $(basename "$site")"
    continue
  fi
  cp "$site" "${site}.bak-perf-$(date +%Y%m%d%H%M)"
  awk -v inc="    include /etc/nginx/snippets/lw-api-perf-${port}.conf; # lw-perf-api" '
    /^[[:space:]]*server[[:space:]]*\{/ && !inserted {
      print
      print inc
      inserted=1
      next
    }
    { print }
  ' "$site" > "${site}.tmp" && mv "${site}.tmp" "$site"
  echo "patched api: $(basename "$site") port=$port"
done

rm -f /etc/nginx/sites-enabled/*.bak-perf-*
nginx -t
systemctl reload nginx
echo "Backend nginx OK"
REMOTE

echo "Done apply-nginx-perf-all-tenants"
