#!/usr/bin/env bash
# SSH/rsync retry helpers — source from local deploy scripts.
#
# Usage:
#   source scripts/lib/deploy-ssh-retry.sh
#   rsync_with_retry -az --delete -e "$RSYNC_SSH" build/ host:/var/www/tenant/
#   scp_with_retry -i "$SSH_KEY" file host:/path
set -euo pipefail

DEPLOY_SSH_MAX_ATTEMPTS="${DEPLOY_SSH_MAX_ATTEMPTS:-4}"
DEPLOY_SSH_RETRY_DELAY_SEC="${DEPLOY_SSH_RETRY_DELAY_SEC:-12}"

_retry_command() {
  local label="$1"
  shift
  local attempt delay="$DEPLOY_SSH_RETRY_DELAY_SEC"

  for ((attempt = 1; attempt <= DEPLOY_SSH_MAX_ATTEMPTS; attempt++)); do
    if "$@"; then
      return 0
    fi
    if (( attempt >= DEPLOY_SSH_MAX_ATTEMPTS )); then
      echo "ERROR: ${label} failed after ${DEPLOY_SSH_MAX_ATTEMPTS} attempts" >&2
      return 1
    fi
    echo "WARN: ${label} failed (attempt ${attempt}/${DEPLOY_SSH_MAX_ATTEMPTS}), retrying in ${delay}s..." >&2
    sleep "$delay"
    if (( delay < 60 )); then
      delay=$((delay * 2))
    fi
  done
}

rsync_with_retry() {
  _retry_command "rsync" rsync "$@"
}

scp_with_retry() {
  _retry_command "scp" scp "$@"
}

pause_between_frontend_deploys() {
  local sec="${FRONTEND_DEPLOY_PAUSE_SEC:-12}"
  echo "# Pause ${sec}s before next frontend deploy (avoid fail2ban / connection refused)"
  sleep "$sec"
}
