#!/usr/bin/env bash
# Pull branch and restart PM2 API on 37.60.230.148.
# Usage: ./scripts/deploy-tenant-backend.sh melamedlaw|morlevy|ashrafessa|melamedia|idm
# Prefers SSH key (SSH_KEY, default ~/.ssh/id_ed25519). Do not add new sshpass usage.
set -euo pipefail

TENANT="${1:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
API_HOST="${API_HOST:-root@37.60.230.148}"

case "$TENANT" in
  melamedlaw) DIR=/root/LayerWebsites; BRANCH=MelamedLaw; PM2=melamed-backend; DB=melamedlaw ;;
  morlevy)  DIR=/root/MorLevi;      BRANCH=MorLevi;    PM2=morlevy-api;      DB=morlevy ;;
  ashrafessa) DIR=/root/AshrafEssa; BRANCH=AshrafEssa; PM2=ashrafessa-api; DB=ashrafessa ;;
  melamedia) DIR=/root/Melamedia; BRANCH=Melamedia; PM2=melamedia-api; DB=melamedia ;;
  idm) DIR=/root/Idm; BRANCH=Idm; PM2=idm-api; DB=idm ;;
  *)
    echo "Usage: $0 melamedlaw|morlevy|ashrafessa|melamedia|idm" >&2
    exit 1
    ;;
esac

ssh -i "$SSH_KEY" -o BatchMode=yes "$API_HOST" bash -s <<EOF
set -e
cd $DIR
git fetch origin $BRANCH
git checkout $BRANCH
git pull origin $BRANCH
# Apply any pending migrations (idempotent / ignore already-applied where scripts allow)
if [ -d backend/migrations ]; then
  for f in backend/migrations/*.sql; do
    [ -f "\$f" ] || continue
    sudo -u postgres psql -d $DB -v ON_ERROR_STOP=1 -f "\$f" >/dev/null 2>&1 || true
  done
fi
pm2 restart $PM2
echo "Backend $TENANT restarted"
EOF
