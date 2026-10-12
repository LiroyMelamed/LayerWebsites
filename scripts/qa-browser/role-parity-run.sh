#!/usr/bin/env bash
# QA-only role parity orchestrator. Restores DB state on exit.
set -euo pipefail
cd "$(dirname "$0")"
OUT="results-role-parity/$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$OUT"
STATE="$OUT/db-snapshot.json"

ssh_qa() {
  ssh -o BatchMode=yes root@37.60.230.148 "$@"
}

save_db() {
  ssh_qa "cd /root/Melamedia/backend && node -e \"const pool=require('./config/db'); pool.query('SELECT userid,role,firm_staff_role_id FROM users WHERE userid = ANY(\\\$1)', [[1372,1377]]).then(r=>{console.log(JSON.stringify(r.rows));process.exit(0);});\"" \
    | rg -o '\[[\s\S]*\]' > "$STATE"
}

restore_db() {
  [[ -f "$STATE" ]] || return 0
  node <<NODE
const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('$STATE','utf8'));
const {execSync}=require('child_process');
for (const row of rows) {
  const sql="UPDATE users SET role='${'${row.role}'}', firm_staff_role_id="+(row.firm_staff_role_id? "'"+row.firm_staff_role_id+"'":"null")+" WHERE userid="+row.userid;
}
NODE
  # restore via ssh per row
  while read -r row; do
    uid=$(echo "$row" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.userid)})")
    role=$(echo "$row" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.role)})")
    fsrid=$(echo "$row" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.firm_staff_role_id||'NULL')})")
    if [[ "$fsrid" == "NULL" ]]; then
      ssh_qa "cd /root/Melamedia/backend && node -e \"require('./config/db').query('UPDATE users SET role=\\\$2, firm_staff_role_id=NULL WHERE userid=\\\$1',['$uid','$role']).then(()=>process.exit(0));\""
    else
      ssh_qa "cd /root/Melamedia/backend && node -e \"require('./config/db').query('UPDATE users SET role=\\\$2, firm_staff_role_id=\\\$3 WHERE userid=\\\$1',['$uid','$role','$fsrid']).then(()=>process.exit(0));\""
    fi
  done < <(node -e "JSON.parse(require('fs').readFileSync('$STATE')).forEach(r=>console.log(JSON.stringify(r)))")
}

trap restore_db EXIT

save_db
echo "Saved $STATE"

# Demo OTP for lawyer QA login
ssh_qa "cd /root/Melamedia/backend && node -e \"
const fs=require('fs');
const p='/root/Melamedia/backend/.env';
let t=fs.readFileSync(p,'utf8');
if(!t.includes('0504111111')){
  t=t.replace(/DEMO_OTP_PHONES=(.*)/,(m,v)=> 'DEMO_OTP_PHONES='+(v.trim()? v.trim()+',0504111111':'0504111111'));
  fs.writeFileSync(p,t);
  console.log('added');
} else console.log('exists');
\"" || true
ssh_qa "pm2 restart melamedia-api --update-env" >/dev/null 2>&1 || true
sleep 4

# Elevate QA Staff B → Admin for parity (only non-PA Admin on tenant)
ssh_qa "cd /root/Melamedia/backend && node -e \"require('./config/db').query('UPDATE users SET role=\\\$1 WHERE userid=1377',['Admin']).then(()=>process.exit(0));\""

node role-parity-qa.mjs --no-db-setup --out "$OUT" "$@"
echo "Done $OUT"
