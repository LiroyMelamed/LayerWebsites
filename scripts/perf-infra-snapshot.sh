#!/usr/bin/env bash
# Read-only infrastructure snapshot for both production VPSes.
# Usage: ./scripts/perf-infra-snapshot.sh [--label before]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
BACKEND_HOST="${BACKEND_HOST:-root@37.60.230.148}"
FRONTEND_HOST="${FRONTEND_HOST:-root@84.46.253.85}"
LABEL="snapshot"
TS_DATE="$(date -u +%Y-%m-%d)"
TS_STAMP="$(date -u +%H%M%S)"

for arg in "$@"; do
  case "$arg" in
    --label) shift; LABEL="${1:-snapshot}"; shift || true ;;
    --label=*) LABEL="${arg#*=}" ;;
  esac
done

OUT_DIR="$ROOT/scripts/perf-results/$TS_DATE"
OUT_FILE="$OUT_DIR/infra-${LABEL}-${TS_STAMP}.txt"
mkdir -p "$OUT_DIR"

{
  echo "=== Infra snapshot label=$LABEL $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo

  echo "========== BACKEND $BACKEND_HOST =========="
  ssh -i "$SSH_KEY" -o ConnectTimeout=15 -o BatchMode=yes "$BACKEND_HOST" bash -s <<'REMOTE'
set -e
echo "--- uptime / memory / disk ---"
uptime
free -h
df -h / /var /tmp 2>/dev/null || df -h
echo
echo "--- PM2 ---"
pm2 status
echo
for p in melamed-backend morlevy-api ashrafessa-api melamedia-api idm-api; do
  echo "--- pm2 describe $p (restarts/memory) ---"
  pm2 describe "$p" 2>/dev/null | egrep 'status|restarts|memory|uptime|node.js version' || true
done
echo
echo "--- nginx gzip/proxy (api sample) ---"
grep -hE 'gzip|brotli|proxy_read_timeout|client_max_body_size|keepalive|expires|Cache-Control' \
  /etc/nginx/sites-enabled/* 2>/dev/null | head -40 || echo "(no matches)"
echo
echo "--- DB pool settings (grep only) ---"
for dir in LayerWebsites MorLevi AshrafEssa Melamedia Idm; do
  echo -n "$dir: "
  grep -E '^DB_POOL_MAX=|^SERVER_KEEPALIVE_TIMEOUT_MS=' "/root/$dir/backend/.env" 2>/dev/null | tr '\n' ' ' || echo "n/a"
  echo
done
echo
echo "--- pg_stat_statements ---"
sudo -u postgres psql -d melamedia -tAc "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements')" 2>/dev/null || echo "unknown"
REMOTE

  echo
  echo "========== FRONTEND $FRONTEND_HOST =========="
  ssh -i "$SSH_KEY" -o ConnectTimeout=15 -o BatchMode=yes "$FRONTEND_HOST" bash -s <<'REMOTE'
set -e
echo "--- uptime / memory / disk ---"
uptime
free -h
df -h /var/www 2>/dev/null || df -h
echo
echo "--- nginx static cache (sample morlevy) ---"
grep -hE 'gzip|brotli|expires|Cache-Control|location /static' \
  /etc/nginx/sites-enabled/morlevy* 2>/dev/null | head -30 || \
  grep -hE 'gzip|expires|/static' /etc/nginx/sites-enabled/* 2>/dev/null | head -30
echo
echo "--- deployed bundle sizes ---"
for t in morlevy ashrafessa melamedia idm; do
  js=$(ls /var/www/$t/static/js/main.*.js 2>/dev/null | head -1)
  css=$(ls /var/www/$t/static/css/main.*.css 2>/dev/null | head -1)
  echo "$t js=$(basename "$js" 2>/dev/null) $(stat -c%s "$js" 2>/dev/null || echo 0)B css=$(basename "$css" 2>/dev/null) $(stat -c%s "$css" 2>/dev/null || echo 0)B"
done
REMOTE

} | tee "$OUT_FILE"

echo "Wrote $OUT_FILE"
