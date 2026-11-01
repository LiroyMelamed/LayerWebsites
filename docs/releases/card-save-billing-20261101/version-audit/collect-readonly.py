"""Read-only Git, process and static-version metadata. Never creates lock files."""
import concurrent.futures
import datetime
import hashlib
import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).parent
ROOT = OUT.parents[3]
COMMON = r'''
import datetime,fcntl,hashlib,json,os,subprocess
from pathlib import Path
fds=[]
def lock(name):
    fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW)
    try:fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB)
    except Exception:os.close(fd);raise
    fds.append(fd)
try:lock('melamedia-release-maintenance')
except (FileNotFoundError,BlockingIOError):
    print(json.dumps({'status':'DEFERRED_MAINTENANCE_LOCK'}));raise SystemExit(0)
'''
BACKEND = COMMON + r'''
paths=[('melamedlaw','/root/LayerWebsites','melamed-backend'),('morlevy','/root/MorLevi','morlevy-api'),('ashrafessa','/root/AshrafEssa','ashrafessa-api'),('melamedia','/root/Melamedia','melamedia-api')]
payment=['backend/controllers/billingController.js','backend/lib/billing/firmBillingService.js','backend/lib/billing/selfServiceRenewal.js','backend/lib/billing/selfServiceUpgrade.js','backend/lib/payments/takbullClient.js','frontend/src/api/billingApi.js','frontend/src/components/billing/TakbullCheckoutDialog.js','frontend/src/screens/billingScreen/PlanUsageScreen.js','frontend/src/screens/billingScreen/PlansPricingScreen.js']
def git(path,*args):
    p=subprocess.run(['git','-C',path,*args],capture_output=True,text=True,timeout=15,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    return {'exit':p.returncode,'output':p.stdout.strip(),'errorBytes':len(p.stderr)}
procs=[]
daemon=subprocess.run(['pgrep','-f','PM2.*God Daemon'],capture_output=True,text=True)
if daemon.returncode==0:
    p=subprocess.run(['pm2','jlist'],capture_output=True,text=True,timeout=20)
    try:procs=json.loads(p.stdout)
    except ValueError:pass
rows=[]
for tenant,path,name in paths:
    row={'tenant':tenant,'path':path}
    try:lock('melamedia-legal-'+tenant+'-release')
    except (FileNotFoundError,BlockingIOError):row['status']='DEFERRED_TENANT_LOCK';rows.append(row);continue
    row['status']='READ_ONLY_LOCKED_METADATA'
    for key,args in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('trackedChanges',['status','--porcelain','--untracked-files=no']),('stagedDiff',['diff','--cached','--stat']),('recentCommits',['log','-8','--format=%H%x09%cI%x09%s'])]:row[key]=git(path,*args)
    row['paymentSha256']={}
    for relative in payment:
        p=Path(path)/relative
        row['paymentSha256'][relative]=hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
    row['pm2']=[{'name':p.get('name'),'pid':p.get('pid'),'status':p.get('pm2_env',{}).get('status'),'cwd':p.get('pm2_env',{}).get('pm_cwd'),'script':p.get('pm2_env',{}).get('pm_exec_path'),'startedAtMs':p.get('pm2_env',{}).get('pm_uptime'),'gitShaEnv':p.get('pm2_env',{}).get('GIT_SHA')} for p in procs if p.get('name')==name]
    rows.append(row)
print(json.dumps({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows}))
'''
FRONTEND = COMMON + r'''
rows=[]
for tenant in ['morlevy','ashrafessa','melamedia']:
    row={'tenant':tenant,'root':'/var/www/'+tenant}
    try:lock('melamedia-legal-'+tenant+'-release')
    except (FileNotFoundError,BlockingIOError):row['status']='DEFERRED_TENANT_LOCK';rows.append(row);continue
    row['status']='READ_ONLY_LOCKED_STATIC_METADATA'
    for name in ['asset-manifest.json','index.html']:
        p=Path(row['root'])/name
        if not p.is_file():continue
        raw=p.read_bytes();meta={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'mtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat()}
        if name.endswith('.json'):
            m=json.loads(raw);meta.update(main=m.get('files',{}).get('main.js'),css=m.get('files',{}).get('main.css'))
            row['assetDigests']={}
            for key in ['main.js','main.css']:
                relative=m.get('files',{}).get(key)
                if not isinstance(relative,str):continue
                asset=(Path(row['root'])/relative.lstrip('/')).resolve()
                try:asset.relative_to(Path(row['root']).resolve())
                except ValueError:continue
                if not asset.is_file():continue
                digest=hashlib.sha256()
                with asset.open('rb') as stream:
                    for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
                row['assetDigests'][key]={'path':relative,'sha256':digest.hexdigest(),'bytes':asset.stat().st_size}
        row[name]=meta
    rows.append(row)
print(json.dumps({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows}))
'''

def remote(host, code):
    proc = subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@'+host,'python3 -'], input=code, text=True, capture_output=True, timeout=100)
    try:data=json.loads(proc.stdout)
    except ValueError:data={'status':'UNSTRUCTURED_RESPONSE','stdoutBytes':len(proc.stdout),'stderrBytes':len(proc.stderr)}
    return {'exit':proc.returncode,**data}

def public_manifest(tenant,url):
    try:
        with urllib.request.urlopen(url,timeout=15) as response:
            raw=response.read(2000000);data=json.loads(raw)
            return {'tenant':tenant,'url':url,'httpStatus':response.status,'sha256':hashlib.sha256(raw).hexdigest(),'main':data.get('files',{}).get('main.js'),'css':data.get('files',{}).get('main.css')}
    except urllib.error.HTTPError as error:return {'tenant':tenant,'url':url,'httpStatus':error.code,'status':'PUBLIC_MANIFEST_UNAVAILABLE'}
    except Exception as error:return {'tenant':tenant,'url':url,'status':'PUBLIC_MANIFEST_UNAVAILABLE','errorType':type(error).__name__}

result={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Git/process/static metadata only; no env, credentials, application data, runtime test, deployment, restart, new lock file or customer mutation. Idm excluded as retired.'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    jobs={executor.submit(remote,'37.60.230.148',BACKEND):'backend',executor.submit(remote,'84.46.253.85',FRONTEND):'frontend',executor.submit(public_manifest,'melamedlaw','https://client.melamedlaw.co.il/asset-manifest.json'):'publicMelamedLaw',executor.submit(public_manifest,'morlevy','https://morlevy.mela-media.co.il/asset-manifest.json'):'publicMorLevi'}
    for job in concurrent.futures.as_completed(jobs):
        try:result[jobs[job]]=job.result()
        except Exception as error:result[jobs[job]]={'status':'FAILED_METADATA_OBSERVATION','errorType':type(error).__name__}
refs=['refs/heads/'+x for x in ['main','Melamedia','AshrafEssa','MelamedLaw','MorLevi','codex/card-save-collect-due-20261101']]
git=subprocess.run(['git','-C',str(ROOT),'ls-remote','origin',*refs],capture_output=True,text=True,timeout=30)
result['github']={'exit':git.returncode,'refs':[{'sha':line.split()[0],'ref':line.split()[1]} for line in git.stdout.splitlines() if len(line.split())==2],'errorBytes':len(git.stderr)}
result['completedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
path=OUT/'live-versions-readonly.json'
path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'evidence':str(path),'result':result},ensure_ascii=False,indent=2))
