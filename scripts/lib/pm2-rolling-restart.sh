#!/usr/bin/env bash
# Rolling PM2 restart helpers — source from remote deploy scripts.
# Restarts one API at a time, waits for /health, then pauses before the next tenant.
#
# Usage (on backend server):
#   source /path/to/pm2-rolling-restart.sh
#   rolling_pm2_restart melamed-backend 3000
set -euo pipefail

ROLLING_RESTART_DELAY_SEC="${ROLLING_RESTART_DELAY_SEC:-5}"
ROLLING_HEALTH_TIMEOUT_SEC="${ROLLING_HEALTH_TIMEOUT_SEC:-45}"

wait_for_api_health() {
  local port="$1"
  local name="$2"
  local url="http://127.0.0.1:${port}/health"
  local i

  for ((i = 1; i <= ROLLING_HEALTH_TIMEOUT_SEC; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo ">>> ${name} healthy on :${port} (${i}s)"
      return 0
    fi
    sleep 1
  done

  echo "ERROR: ${name} not healthy on ${url} after ${ROLLING_HEALTH_TIMEOUT_SEC}s" >&2
  return 1
}

rolling_pm2_restart() {
  local pm2_name="$1"
  local port="$2"

  echo ">>> pm2 restart ${pm2_name} (rolling, ${ROLLING_RESTART_DELAY_SEC}s gap after healthy)"
  pm2 restart "$pm2_name"
  wait_for_api_health "$port" "$pm2_name"
  sleep "$ROLLING_RESTART_DELAY_SEC"
}
