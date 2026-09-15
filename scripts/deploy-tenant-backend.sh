#!/usr/bin/env bash
# Pull branch and restart PM2 API on 37.60.230.148.
# Usage: ./scripts/deploy-tenant-backend.sh melamedlaw|morlevy|ashrafessa|melamedia|idm|lawyer
# Prefers SSH key (SSH_KEY, default ~/.ssh/id_ed25519). Do not add new sshpass usage.
set -euo pipefail

TENANT="${1:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
API_HOST="${API_HOST:-root@37.60.230.148}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$TENANT" in
  melamedlaw) DIR=/root/LayerWebsites; BRANCH=MelamedLaw; PM2=melamed-backend; PORT=3000; DB=melamedlaw ;;
  morlevy)  DIR=/root/MorLevi;      BRANCH=MorLevi;    PM2=morlevy-api;      PORT=3001; DB=morlevy ;;
  ashrafessa) DIR=/root/AshrafEssa; BRANCH=AshrafEssa; PM2=ashrafessa-api; PORT=3002; DB=ashrafessa ;;
  melamedia) DIR=/root/Melamedia; BRANCH=Melamedia; PM2=melamedia-api; PORT=3003; DB=melamedia ;;
  idm) DIR=/root/Idm; BRANCH=Idm; PM2=idm-api; PORT=3004; DB=idm ;;
  lawyer) DIR=/root/LawyerPlatform; BRANCH=Melamedia; PM2=lawyer-api; PORT=3005; DB=lawyer ;;
  *)
    echo "Usage: $0 melamedlaw|morlevy|ashrafessa|melamedia|idm|lawyer" >&2
    exit 1
    ;;
esac

scp -i "$SSH_KEY" -o BatchMode=yes "$ROOT/scripts/lib/pm2-rolling-restart.sh" "$API_HOST:/tmp/pm2-rolling-restart.sh"

ssh -i "$SSH_KEY" -o BatchMode=yes "$API_HOST" bash -s <<EOF
set -e
# shellcheck source=/tmp/pm2-rolling-restart.sh
source /tmp/pm2-rolling-restart.sh
cd $DIR
git fetch origin $BRANCH
git checkout $BRANCH
git pull origin $BRANCH
chmod +x backend/migrations/migration-run.sh backend/migrations/migration-backfill-applied.sh 2>/dev/null || true
DBNAME=\$(grep '^DB_NAME=' backend/.env | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
cd backend
MIGRATION_PGDATABASE="\$DBNAME" bash migrations/migration-backfill-applied.sh
MIGRATION_PGDATABASE="\$DBNAME" bash migrations/migration-run.sh
rolling_pm2_restart $PM2 $PORT
pm2 save
rm -f /tmp/pm2-rolling-restart.sh
echo "Backend $TENANT restarted (rolling, pm2 state saved)"
EOF

# shellcheck source=../../scripts/deploy-notify.sh
source "$ROOT/../scripts/deploy-notify.sh"
DEPLOY_ROOT="$ROOT" notify_central_deploy layerwebsites "backend:${TENANT}"
