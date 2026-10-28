import datetime, fcntl, hashlib, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
BASE='596aa5b7eb9b40f8cd5f6927132955ff6caf2175'
NEXT='87e8eaa58830ee9b42772c1619e01814143dc28e'
ROOT=Path('/root/AshrafEssa')
MIG='2026-10-26_01_signing_word_authoring_renders.sql'
os.umask(0o077)
def run(args,input=None):
 return subprocess.check_output(args,cwd=ROOT,input=input,stderr=subprocess.PIPE,timeout=90).decode().strip()
def git(*args): return run(['git',*args])
def sql(q):return run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-U','postgres','-p','5432','-d','ashrafessa','-v','ON_ERROR_STOP=1','-At','-c',q])
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
locks=[]
for name in ['melamedia-release-maintenance','melamedia-legal-ashrafessa-release']:
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(fd)
assert git('rev-parse','HEAD')==BASE
assert git('branch','--show-current')=='AshrafEssa'
assert not git('status','--porcelain','--untracked-files=no')
for name in ['core.hooksPath','core.fsmonitor']:
 p=subprocess.run(['git','config','--get',name],cwd=ROOT,capture_output=True,text=True);assert p.returncode==1 or p.stdout.strip()=='false'
hooks=ROOT/git('rev-parse','--git-path','hooks')
assert not any((hooks/n).exists() and os.access(hooks/n,os.X_OK) for n in ['post-merge','post-checkout','post-index-change'])
processes=json.loads(run(['pm2','jlist']));own=[p for p in processes if p['name']=='ashrafessa-api'];assert len(own)==1
p=own[0];e=p['pm2_env'];assert e['status']=='online' and e['pm_cwd']==str(ROOT/'backend') and e['pm_exec_path']==str(ROOT/'backend/server.js')
others=lambda ps:[{'id':x['pm_id'],'pid':x['pid'],'status':x['pm2_env']['status'],'restarts':x['pm2_env']['restart_time']} for x in ps if x['name']!='ashrafessa-api']
envhash=sha(ROOT/'backend/.env')
envcheck=json.loads(run(['node','-e',"const fs=require('fs');const d=require('./backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env'));const p=JSON.parse(require('child_process').execFileSync('pm2',['jlist'])).find(x=>x.name==='ashrafessa-api').pm2_env;const e={...d,...p.env,...p};console.log(JSON.stringify({db:e.DB_NAME,port:e.PORT,host:e.DB_HOST||'localhost',urlPresent:!!e.DATABASE_URL,multi:e.MULTI_TENANT_MODE,controls:Object.fromEntries(Object.entries(e).filter(([k])=>/^(CENTRAL_SYSTEM_MESSAGES_(CAPTURE|DISPATCH)_ENABLED|QA_OUTBOUND_MODE)$/.test(k)))}))"]))
assert envcheck['db']=='ashrafessa' and str(envcheck['port'])=='3002' and envcheck['host'] in ['127.0.0.1','localhost'] and not envcheck['urlPresent']
assert str(envcheck.get('multi','')).lower()!='true'
assert all(str(v).lower()!='true' and k!='QA_OUTBOUND_MODE' for k,v in envcheck['controls'].items())
assert sql("SELECT count(*) FROM signing_jobs WHERE state='running'")=='0'
assert sql("SELECT count(*) FROM schema_migrations WHERE filename='"+MIG+"'")=='0'
assert sql("SELECT to_regclass('public.signing_word_authoring_renders') IS NULL")=='t'
backup=json.loads(Path('/var/lib/melamedia-backup-watch/latest-health.json').read_text());assert backup['healthy'] and not backup.get('failures')
assert time.time()-datetime.datetime.fromisoformat(backup['utc'].replace('Z','+00:00')).timestamp()<7200
health=lambda:json.load(urllib.request.urlopen('http://127.0.0.1:3002/health',timeout=5))
assert health().get('ok') is True
receipt={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':BASE,'candidate':NEXT,'envHash':envhash,'ownPid':p['pid'],'others':others(processes),'backupUtc':backup['utc'],'result':'PREFLIGHT_PASS_NO_CHANGES'}
if MODE=='apply':
 git('fetch','origin','AshrafEssa');assert git('rev-parse','origin/AshrafEssa')==NEXT
 git('merge-base','--is-ancestor',BASE,NEXT)
 assert not git('diff','--name-only',BASE,NEXT,'--','backend/package.json','backend/package-lock.json')
 assert git('diff','--name-only',BASE,NEXT,'--','backend/migrations')=='backend/migrations/'+MIG
 check=Path('/var/lib/melamedia-releases/ashraf-update-20261028');check.mkdir(parents=True,exist_ok=False,mode=0o700)
 (check/'before.json').write_text(json.dumps(receipt));(check/'pm2.private.json').write_text(json.dumps(processes));(check/'env.private').write_bytes((ROOT/'backend/.env').read_bytes())
 with (check/'database-before.dump').open('wb') as f:subprocess.run(['runuser','-u','postgres','--','pg_dump','-h','/var/run/postgresql','-U','postgres','-p','5432','-Fc','ashrafessa'],stdout=f,stderr=subprocess.PIPE,check=True,timeout=90)
 run(['pg_restore','-l',str(check/'database-before.dump')])
 migration=subprocess.check_output(['git','show',NEXT+':backend/migrations/'+MIG],cwd=ROOT)
 (check/MIG).write_bytes(migration)
 run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-U','postgres','-p','5432','-d','ashrafessa','-v','ON_ERROR_STOP=1'],input=migration)
 sql("INSERT INTO schema_migrations(filename) VALUES ('"+MIG+"')")
 git('merge','--ff-only',NEXT)
 receipt['sourceGuard']=json.loads(run(['node','scripts/check-signing-release.cjs']))
 assert sha(ROOT/'backend/.env')==envhash
 assert others(json.loads(run(['pm2','jlist'])))==receipt['others']
 run(['pm2','restart',str(p['pm_id'])])
 start=time.monotonic();stable=None
 while time.monotonic()-start<45:
  try:
   current=json.loads(run(['pm2','jlist']));a=next(x for x in current if x['name']=='ashrafessa-api')
   age=time.time()*1000-a['pm2_env']['pm_uptime'];minimum=max(5000,e.get('min_uptime',5000))
   if a['pm2_env']['status']=='online' and age>=minimum and health().get('ok') is True:stable=a;break
  except Exception: pass
  time.sleep(1)
 assert stable and stable['pid']!=p['pid']
 assert others(current)==receipt['others'] and sha(ROOT/'backend/.env')==envhash
 assert git('rev-parse','HEAD')==NEXT and not git('status','--porcelain','--untracked-files=no')
 receipt.update(result='BACKEND_UPDATED_HEALTHY',newPid=stable['pid'],schemaApplied=MIG,health=health(),checkpoint=str(check),envPreserved=True,otherProcessesPreserved=True)
 (check/'after.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
