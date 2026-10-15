#!/usr/bin/env bash
# QA gate step: merge main → Melamedia, deploy backend + frontend, smoke reminder.
#
# Usage:
#   ./scripts/deploy-melamedia-qa.sh
#   ./scripts/deploy-melamedia-qa.sh --dry-run
#   ./scripts/deploy-melamedia-qa.sh --skip-merge   # deploy only (branch already merged)
#
# Prerequisites:
#   - Product commits pushed to origin/main
#   - SSH key (~/.ssh/id_ed25519)
#   - Melamedia worktree (branch Melamedia) for frontend build
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
SKIP_MERGE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --skip-merge) SKIP_MERGE=true ;;
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

worktree_for_branch() {
  git worktree list --porcelain | awk '
    /^worktree / { wt=$2 }
    /^branch refs\/heads\/Melamedia$/ { print wt }
  '
}

MELAMEDIA_WT="$(worktree_for_branch)"
if [[ -z "$MELAMEDIA_WT" ]]; then
  echo "ERROR: no worktree for branch Melamedia" >&2
  exit 1
fi

echo "# Melamedia QA deploy — started $(date -Iseconds)"
echo "# main tip: $(git log -1 --oneline origin/main 2>/dev/null || git log -1 --oneline main)"

if ! $SKIP_MERGE; then
  run "$ROOT/scripts/propagate-main-to-tenants.sh" melamedia
fi

run "$ROOT/scripts/deploy-tenant-backend.sh" melamedia

# Frontend build uses Melamedia worktree (tenant branding + merged code).
run bash -c "cd \"$MELAMEDIA_WT\" && ./scripts/deploy-tenant-frontend.sh melamedia"

echo ""
echo "# QA smoke checklist (manual):"
echo "#   https://melamedia.mela-media.co.il"
echo "#   - OTP login, signing upload viewer, calendar smoke"
echo "# After QA pass: ./scripts/propagate-main-to-tenants.sh melamedlaw morlevy ashrafessa idm"
echo "#                 then deploy each client + prod tag on main"
echo "# Done: $(date -Iseconds)"
