#!/usr/bin/env bash
# Merge origin/main into tenant branches (QA gate + client propagation).
#
# Usage:
#   ./scripts/propagate-main-to-tenants.sh                    # Melamedia QA only
#   ./scripts/propagate-main-to-tenants.sh melamedia          # QA only
#   ./scripts/propagate-main-to-tenants.sh melamedlaw morlevy # subset
#   ./scripts/propagate-main-to-tenants.sh --dry-run          # print steps
#   ./scripts/propagate-main-to-tenants.sh --no-push          # merge locally only
#
# Requires git worktrees per branch (see `git worktree list`) or checks out in a temp dir.
# Restores build-scratch paths before merge when frontend/public is dirty.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
PUSH=true
TENANTS=()

usage() {
  sed -n '2,12p' "$0"
}

branch_for_tenant() {
  case "$1" in
    melamedia) echo Melamedia ;;
    melamedlaw) echo MelamedLaw ;;
    morlevy) echo MorLevi ;;
    ashrafessa) echo AshrafEssa ;;
    idm) echo Idm ;;
    *) return 1 ;;
  esac
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-push) PUSH=false ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      TENANTS+=("$arg")
      ;;
  esac
done

if ((${#TENANTS[@]} == 0)); then
  TENANTS=(melamedia)
fi

for tenant in "${TENANTS[@]}"; do
  if ! branch_for_tenant "$tenant" >/dev/null; then
    echo "Unknown tenant: $tenant (expected melamedia|melamedlaw|morlevy|ashrafessa|idm)" >&2
    exit 1
  fi
done

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

git fetch origin main

MAIN_SHA="$(git rev-parse origin/main)"
MAIN_SUBJECT="$(git log -1 --pretty=format:%s origin/main)"
echo "# Propagate origin/main (${MAIN_SHA:0:7}) — ${MAIN_SUBJECT}"

worktree_for_branch() {
  local branch="$1"
  git worktree list --porcelain | awk -v b="$branch" '
    /^worktree / { wt=$2 }
    /^branch refs\/heads\// {
      sub(/^branch refs\/heads\//, "")
      if ($0 == b) print wt
    }
  '
}

ensure_clean_for_merge() {
  local wt="$1"
  local scratch_dirty other_dirty
  cd "$wt"

  scratch_dirty="$(git status --porcelain -- frontend/public frontend/src/assets/images/logos 2>/dev/null || true)"
  other_dirty="$(git status --porcelain -- . ':(exclude)frontend/.env' ':(exclude)backend/.env' ':(exclude)frontend/public' ':(exclude)frontend/src/assets/images/logos' || true)"

  if [[ -n "$scratch_dirty" ]]; then
    echo "# ${wt}: build scratch dirty — restoring baseline"
    if $DRY_RUN; then
      echo "[dry-run] would run frontend/scripts/restore-public-baseline.sh"
    else
      "$wt/frontend/scripts/restore-public-baseline.sh"
    fi
  fi

  if [[ -n "$other_dirty" ]]; then
    echo "ERROR: ${wt} has uncommitted changes (excluding .env and build scratch):" >&2
    echo "$other_dirty" >&2
    exit 1
  fi
}

merge_tenant() {
  local tenant="$1"
  local branch
  branch="$(branch_for_tenant "$tenant")"
  local wt
  wt="$(worktree_for_branch "$branch")"

  if [[ -z "$wt" ]]; then
    echo "ERROR: no worktree for branch ${branch}. Add one, e.g.:" >&2
    echo "  git worktree add ../LayerWebsites-${branch} ${branch}" >&2
    exit 1
  fi

  echo ""
  echo "== ${tenant} (${branch}) @ ${wt} =="
  ensure_clean_for_merge "$wt"
  cd "$wt"

  run git checkout "$branch"
  run git pull origin "$branch"

  if git merge-base --is-ancestor "$MAIN_SHA" HEAD; then
    echo "# ${branch} already contains origin/main (${MAIN_SHA:0:7})"
  else
    run git merge origin/main -m "Merge main: ${MAIN_SUBJECT}"
  fi

  if $PUSH; then
    run git push origin "$branch"
  fi
}

for tenant in "${TENANTS[@]}"; do
  merge_tenant "$tenant"
done

echo ""
echo "# Done: propagated origin/main to ${#TENANTS[@]} tenant branch(es)"
