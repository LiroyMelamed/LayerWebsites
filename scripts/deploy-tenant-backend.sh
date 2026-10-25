#!/usr/bin/env bash
# Pull branch and restart PM2 API on 37.60.230.148.
# Usage: ./scripts/deploy-tenant-backend.sh TENANT REVIEWED_COMMIT_SHA
# Prefers SSH key (SSH_KEY, default ~/.ssh/id_ed25519). Do not add new sshpass usage.
set -euo pipefail

TENANT="${1:-}"
tenant_guard_scripts_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/tenant-retirement.sh
source "$tenant_guard_scripts_dir/lib/tenant-retirement.sh"
require_active_tenant "$TENANT"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
API_HOST="${API_HOST:-root@37.60.230.148}"
CANDIDATE="${2:-}"
if [[ ! "$CANDIDATE" =~ ^[a-f0-9]{40}$ ]]; then
  echo "An exact reviewed candidate commit is required as the second argument." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$TENANT" in
  melamedlaw) DIR=/root/LayerWebsites; BRANCH=MelamedLaw; PM2=melamed-backend; PORT=3000; DB=melamedlaw ;;
  morlevy)  DIR=/root/MorLevi;      BRANCH=MorLevi;    PM2=morlevy-api;      PORT=3001; DB=morlevy ;;
  ashrafessa) DIR=/root/AshrafEssa; BRANCH=AshrafEssa; PM2=ashrafessa-api; PORT=3002; DB=ashrafessa ;;
  melamedia) DIR=/root/Melamedia; BRANCH=Melamedia; PM2=melamedia-api; PORT=3003; DB=melamedia ;;
  lawyer) DIR=/root/LawyerPlatform; BRANCH=Melamedia; PM2=lawyer-api; PORT=3005; DB=lawyer ;;
  *)
    echo "Usage: $0 melamedlaw|morlevy|ashrafessa|melamedia|lawyer" >&2
    exit 1
    ;;
esac

node "$ROOT/scripts/check-signing-release.cjs" "$CANDIDATE"
scp -i "$SSH_KEY" -o BatchMode=yes "$ROOT/scripts/lib/pm2-rolling-restart.sh" "$API_HOST:/tmp/pm2-rolling-restart.sh"

ssh -i "$SSH_KEY" -o BatchMode=yes "$API_HOST" bash -s <<EOF
set -e
# shellcheck source=/tmp/pm2-rolling-restart.sh
source /tmp/pm2-rolling-restart.sh
cd $DIR
git fetch origin $BRANCH
test -z "\$(git status --porcelain --untracked-files=no)" || { echo "Remote source is dirty" >&2; exit 1; }
test "\$(git rev-parse origin/$BRANCH)" = "$CANDIDATE" || { echo "Remote branch changed since review" >&2; exit 1; }
git merge-base --is-ancestor HEAD $CANDIDATE
git show $CANDIDATE:scripts/check-signing-release.cjs > /tmp/signing-check-\$\$.cjs
git show $CANDIDATE:docs/signing-v2/release-baseline.json > /tmp/signing-manifest-\$\$.json
trap 'rm -f /tmp/signing-check-\$\$.cjs /tmp/signing-manifest-\$\$.json' EXIT
node -e 'const check=require(process.argv[1]).checkSigningRelease; const fs=require("fs"); console.log(check({root:process.cwd(),ref:process.argv[3],checkWorktree:false,manifest:JSON.parse(fs.readFileSync(process.argv[2]))}));' /tmp/signing-check-\$\$.cjs /tmp/signing-manifest-\$\$.json $CANDIDATE
git checkout $BRANCH
git merge --ff-only $CANDIDATE
node scripts/check-signing-release.cjs
chmod +x backend/migrations/migration-run.sh backend/migrations/migration-backfill-applied.sh 2>/dev/null || true
cd backend
LOCK_HASH=\$(sha256sum package-lock.json | awk '{print \$1}')
STORED_HASH=""
if [[ -f .deploy-package-lock.sha ]]; then
  STORED_HASH=\$(cat .deploy-package-lock.sha)
fi
if [[ "\$LOCK_HASH" != "\$STORED_HASH" ]]; then
  echo ">>> package-lock.json changed — npm ci"
  npm ci --omit=dev
  echo "\$LOCK_HASH" > .deploy-package-lock.sha
else
  echo ">>> package-lock.json unchanged — skip npm ci"
fi
DBNAME=\$(grep '^DB_NAME=' .env | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
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
