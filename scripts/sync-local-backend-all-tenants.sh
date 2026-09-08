#!/usr/bin/env bash
# Copy local backend source to ALL tenant API dirs on 37.60.230.148, apply
# migrations, and restart PM2. Keeps every tenant on the same backend code
# when deploying from local uncommitted fixes (Melamedia branch tip).
#
# Usage: ./scripts/sync-local-backend-all-tenants.sh [--dry-run]
#
# Does NOT touch backend/.env or node_modules on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
API_HOST="${API_HOST:-root@37.60.230.148}"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

TENANT_DIRS=(LayerWebsites MorLevi AshrafEssa Melamedia Idm)
TENANT_DBS=(melamedlaw morlevy ashrafessa melamedia idm)
PM2_NAMES=(melamed-backend morlevy-api ashrafessa-api melamedia-api idm-api)

BACKEND_PATHS=(
  backend/controllers
  backend/lib
  backend/services
  backend/routes
  backend/middlewares
  backend/migrations
)

for p in "${BACKEND_PATHS[@]}"; do
  if [[ ! -d "$ROOT/$p" ]]; then
    echo "Missing local path: $p" >&2
    exit 1
  fi
done

TARBALL="/tmp/lw-backend-sync-$$.tgz"
trap 'rm -f "$TARBALL"' EXIT

echo "# Sync local backend → all tenants ($(date -Iseconds))"

if $DRY_RUN; then
  echo "[dry-run] tar backend/{controllers,lib,services,routes,middlewares,migrations}"
  echo "[dry-run] scp → $API_HOST:/tmp/lw-backend-sync.tgz"
  for dir in "${TENANT_DIRS[@]}"; do
    echo "[dry-run] extract → /root/$dir"
  done
  for db in "${TENANT_DBS[@]}"; do
    echo "[dry-run] migrate db $db"
  done
  echo "[dry-run] pm2 restart ${PM2_NAMES[*]}"
  exit 0
fi

tar czf "$TARBALL" -C "$ROOT/backend" \
  controllers lib services routes middlewares migrations

scp -i "$SSH_KEY" -o BatchMode=yes "$TARBALL" "$API_HOST:/tmp/lw-backend-sync.tgz"

ssh -i "$SSH_KEY" -o BatchMode=yes "$API_HOST" bash -s <<'REMOTE'
set -euo pipefail
TENANT_DIRS=(LayerWebsites MorLevi AshrafEssa Melamedia Idm)
TENANT_DBS=(melamedlaw morlevy ashrafessa melamedia idm)
PM2_NAMES=(melamed-backend morlevy-api ashrafessa-api melamedia-api idm-api)

for dir in "${TENANT_DIRS[@]}"; do
  echo ">>> overlay /root/$dir/backend"
  tar xzf /tmp/lw-backend-sync.tgz -C "/root/$dir/backend"
  chmod +x "/root/$dir/backend/migrations/migration-run.sh" "/root/$dir/backend/migrations/migration-backfill-applied.sh" 2>/dev/null || true
done

for i in "${!TENANT_DIRS[@]}"; do
  dir="${TENANT_DIRS[$i]}"
  echo ">>> migrations on ${TENANT_DBS[$i]} via /root/$dir"
  DBNAME=$(grep '^DB_NAME=' "/root/$dir/backend/.env" | head -1 | cut -d= -f2- | sed 's/^["'\''"]//;s/["'\''"]$//')
  (cd "/root/$dir/backend" && MIGRATION_PGDATABASE="$DBNAME" bash migrations/migration-backfill-applied.sh && MIGRATION_PGDATABASE="$DBNAME" bash migrations/migration-run.sh)
done

for pm2 in "${PM2_NAMES[@]}"; do
  echo ">>> pm2 restart $pm2"
  pm2 restart "$pm2"
  sleep 2
done

rm -f /tmp/lw-backend-sync.tgz
echo "Backend sync complete"
REMOTE

echo "# Done: $(date -Iseconds)"
