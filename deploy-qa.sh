#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /root/Melamedia
OLD=750bc1dc0ae3118ce7cea843893921fb08409faf
RELEASE=4f13ceebcef3eeb46f608350e60a60ad94ed10f9
BACKUP=/root/qa-release-backups/melamedia-preservation-20261006-v11b
test "$(git rev-parse HEAD)" = "$OLD"
test "$(git branch --show-current)" = Melamedia
git diff --quiet HEAD -- backend
test ! -e "$BACKUP"
mkdir -p "$BACKUP"
cp backend/.env "$BACKUP/backend.env"
git archive "$OLD" backend | gzip > "$BACKUP/backend-before.tar.gz"
node - <<'JS' > "$BACKUP/processes-before.json"
const cp=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const qa=rows.find(x=>x.name==='melamedia-api');assert.ok(qa&&qa.pm2_env.status==='online');
const runtime=Object.fromEntries(fs.readFileSync('/proc/'+qa.pid+'/environ','utf8').split('\0').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const configured=require('/root/Melamedia/backend/node_modules/dotenv').parse(fs.readFileSync('/root/Melamedia/backend/.env'));
const env={...configured,...runtime};assert.equal(fs.realpathSync('/proc/'+qa.pid+'/cwd'),'/root/Melamedia/backend');
assert.equal(env.QA_OUTBOUND_MODE,'noop');assert.equal(env.DB_NAME,'melamedia');assert.equal(env.PORT,'3003');
console.log(JSON.stringify(rows.map(x=>({name:x.name,pid:x.pid,status:x.pm2_env.status}))));
JS
git fetch origin Melamedia
test "$(git rev-parse origin/Melamedia)" = "$RELEASE"
git merge-base --is-ancestor "$OLD" "$RELEASE"
git diff --quiet "$OLD" "$RELEASE" -- backend/package-lock.json backend/migrations
mapfile -t CHANGED < <(git diff --name-only "$OLD" "$RELEASE" -- backend)
rollback() {
 trap - ERR
 git restore --source="$OLD" --staged --worktree -- "${CHANGED[@]}"
 pm2 restart melamedia-api > "$BACKUP/rollback-pm2.log" 2>&1
 echo 'QA rollback restored prior backend source; branch working tree records rollback.'
 exit 1
}
trap rollback ERR
git merge --ff-only "$RELEASE"
node --check backend/controllers/caseController.js
node --check backend/lib/payments/takbullCredentials.js
cmp backend/.env "$BACKUP/backend.env"
source scripts/lib/pm2-rolling-restart.sh
ROLLING_RESTART_DELAY_SEC=0 rolling_pm2_restart melamedia-api 3003
node - <<'JS'
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const before=JSON.parse(fs.readFileSync('/root/qa-release-backups/melamedia-preservation-20261006-v11b/processes-before.json'));
const after=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
for(const p of before.filter(x=>x.name!=='melamedia-api')){const n=after.find(x=>x.name===p.name);assert.ok(n);assert.equal(n.pid,p.pid);assert.equal(n.pm2_env.status,p.status);}
assert.equal(after.find(x=>x.name==='melamedia-api').pm2_env.status,'online');
console.log('PASS: Only QA process restarted. Other tenants unchanged.');
JS
curl -fsS http://127.0.0.1:3003/health
git rev-parse HEAD
