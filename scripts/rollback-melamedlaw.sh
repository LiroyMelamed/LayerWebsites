#!/usr/bin/env bash
# Roll back MelamedLaw backend + frontend to a known good git ref (default: pre-dashboard UI tag).
# Usage:
#   ./scripts/rollback-melamedlaw.sh
#   ./scripts/rollback-melamedlaw.sh melamedlaw-rollback-20260906
#   ./scripts/rollback-melamedlaw.sh d329d12
set -euo pipefail

ROLLBACK_REF="${1:-melamedlaw-rollback-20260906}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
API_HOST="${API_HOST:-root@37.60.230.148}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "# Rolling back MelamedLaw to: ${ROLLBACK_REF}"

cd "$ROOT"
git fetch origin MelamedLaw "$ROLLBACK_REF" 2>/dev/null || git fetch origin "$ROLLBACK_REF"
TARGET_SHA="$(git rev-parse "$ROLLBACK_REF")"
echo "# Target commit: ${TARGET_SHA}"

echo "# 1/3 Backend rollback on VPS..."
ssh -i "$SSH_KEY" -o BatchMode=yes "$API_HOST" bash -s <<EOF
set -e
cd /root/LayerWebsites
git fetch origin MelamedLaw
git checkout MelamedLaw
git reset --hard ${TARGET_SHA}
pm2 restart melamed-backend
echo "Backend rolled back to \$(git log -1 --oneline)"
EOF

echo "# 2/3 Reset local branch to rollback ref..."
git checkout MelamedLaw
git reset --hard "$TARGET_SHA"

echo "# 3/3 Rebuild + FTP frontend from rollback ref..."
"$ROOT/scripts/deploy-tenant-frontend-melamedlaw.sh"

echo "# Done. MelamedLaw rolled back to ${ROLLBACK_REF} (${TARGET_SHA})"
echo "# Verify: https://client.melamedlaw.co.il"
