#!/usr/bin/env bash
# Pull branch and restart PM2 API on 37.60.230.148.
# Usage: ./scripts/deploy-tenant-backend.sh morlevy|ashrafessa
set -euo pipefail

TENANT="${1:-}"
API_HOST="${API_HOST:-root@37.60.230.148}"
API_PASS="${API_PASS:-Aa0507299064}"

case "$TENANT" in
  morlevy)  DIR=/root/MorLevi;      BRANCH=MorLevi;    PM2=morlevy-api;      DB=morlevy ;;
  ashrafessa) DIR=/root/AshrafEssa; BRANCH=AshrafEssa; PM2=ashrafessa-api; DB=ashrafessa ;;
  *)
    echo "Usage: $0 morlevy|ashrafessa" >&2
    exit 1
    ;;
esac

export SSHPASS="$API_PASS"
sshpass -e ssh "$API_HOST" bash -s <<EOF
set -e
cd $DIR
git fetch origin $BRANCH
git checkout $BRANCH
git pull origin $BRANCH
for f in backend/migrations/2026-05-25_*.sql; do
  [ -f "\$f" ] && sudo -u postgres psql -d $DB -v ON_ERROR_STOP=1 -f "\$f" || true
done
pm2 restart $PM2
echo "Backend $TENANT restarted"
EOF
