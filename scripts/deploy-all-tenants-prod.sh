#!/usr/bin/env bash
# Deploy backend + frontend to all production tenants.
#
# Usage:
#   ./scripts/deploy-all-tenants-prod.sh              # full deploy (all tenants)
#   ./scripts/deploy-all-tenants-prod.sh --backend    # API only
#   ./scripts/deploy-all-tenants-prod.sh --frontend   # SPA only
#   ./scripts/deploy-all-tenants-prod.sh --dry-run    # print steps, no SSH/FTP
#
# Prerequisites:
#   - SSH key: ~/.ssh/id_ed25519 (or SSH_KEY)
#   - MelamedLaw FTP: frontend/.env.ftp.local
#   - All tenant branches pushed to origin (MelamedLaw, MorLevi, AshrafEssa, Melamedia, Idm)
#   - Never run `pm2 restart all`
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
BACKEND=true
FRONTEND=true

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --backend) FRONTEND=false ;;
    --frontend) BACKEND=false ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    echo ">>> $*"
    "$@"
  fi
}

echo "# Deploy all tenants — backend=$BACKEND frontend=$FRONTEND dry_run=$DRY_RUN"
echo "# Started: $(date -Iseconds)"

if $BACKEND; then
  echo ""
  echo "== Backends (37.60.230.148) =="
  # MelamedLaw first — production client data; billing .env already tuned on server.
  run ./scripts/deploy-tenant-backend.sh melamedlaw
  run ./scripts/deploy-tenant-backend.sh morlevy
  run ./scripts/deploy-tenant-backend.sh ashrafessa
  run ./scripts/deploy-tenant-backend.sh melamedia
  run ./scripts/deploy-tenant-backend.sh idm
fi

if $FRONTEND; then
  echo ""
  echo "== Frontends =="
  if [[ ! -f "$ROOT/frontend/.env.ftp.local" ]]; then
    echo "WARN: missing frontend/.env.ftp.local — skip MelamedLaw FTP" >&2
    ML_SKIP=true
  else
    ML_SKIP=false
  fi

  if ! $ML_SKIP; then
    run ./scripts/deploy-tenant-frontend-melamedlaw.sh
  fi
  run ./scripts/deploy-tenant-frontend.sh morlevy
  run ./scripts/deploy-tenant-frontend.sh ashrafessa
  run ./scripts/deploy-tenant-frontend.sh melamedia
  run ./scripts/deploy-tenant-frontend.sh idm
fi

echo ""
echo "# Done: $(date -Iseconds)"
