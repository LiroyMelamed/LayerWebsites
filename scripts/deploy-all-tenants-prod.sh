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
#   - Never run `pm2 restart all` — each tenant uses rolling restart + /health wait
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/deploy-ssh-retry.sh
source "$ROOT/scripts/lib/deploy-ssh-retry.sh"

DRY_RUN=false
BACKEND=true
FRONTEND=true
# Freeze reviewed tenant SHAs before invoking any remote operation.
# Format: {"melamedlaw":"<40hex>","morlevy":"<40hex>",...}
CANDIDATE_PLAN="${SIGNING_RELEASE_PLAN:-}"

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
  if [[ ! -f "$CANDIDATE_PLAN" ]]; then
    echo "Set SIGNING_RELEASE_PLAN to the reviewed tenant-to-commit JSON before deployment." >&2
    exit 1
  fi
  for tenant in melamedlaw morlevy ashrafessa melamedia idm; do
    candidate=$(node -e 'const p=require(require("path").resolve(process.argv[1])); const s=p[process.argv[2]]; if(!/^[a-f0-9]{40}$/.test(s||""))process.exit(1); process.stdout.write(s)' "$CANDIDATE_PLAN" "$tenant")
    node "$ROOT/scripts/check-signing-release.cjs" "$candidate"
  done
  echo ""
  echo "== Backends (37.60.230.148) =="
  # MelamedLaw first — production client data; billing .env already tuned on server.
  run ./scripts/deploy-tenant-backend.sh melamedlaw "$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p[process.argv[2]])' "$CANDIDATE_PLAN" melamedlaw)"
  run ./scripts/deploy-tenant-backend.sh morlevy "$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p[process.argv[2]])' "$CANDIDATE_PLAN" morlevy)"
  run ./scripts/deploy-tenant-backend.sh ashrafessa "$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p[process.argv[2]])' "$CANDIDATE_PLAN" ashrafessa)"
  run ./scripts/deploy-tenant-backend.sh melamedia "$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p[process.argv[2]])' "$CANDIDATE_PLAN" melamedia)"
  run ./scripts/deploy-tenant-backend.sh idm "$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p[process.argv[2]])' "$CANDIDATE_PLAN" idm)"
  echo ""
  echo "# Each backend retains its exact tenant commit; no local source overlay."
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
    if ! $DRY_RUN; then pause_between_frontend_deploys; fi
  fi
  run ./scripts/deploy-tenant-frontend.sh morlevy
  if ! $DRY_RUN; then pause_between_frontend_deploys; fi
  run ./scripts/deploy-tenant-frontend.sh ashrafessa
  if ! $DRY_RUN; then pause_between_frontend_deploys; fi
  run ./scripts/deploy-tenant-frontend.sh melamedia
  if ! $DRY_RUN; then pause_between_frontend_deploys; fi
  run ./scripts/deploy-tenant-frontend.sh idm
fi

echo ""
echo "# Done: $(date -Iseconds)"

if $DRY_RUN; then exit 0; fi
# shellcheck source=../../scripts/deploy-notify.sh
source "$ROOT/../scripts/deploy-notify.sh"
DEPLOY_ROOT="$ROOT" notify_central_deploy layerwebsites "all-tenants backend=${BACKEND} frontend=${FRONTEND}"
