"""Read-only source/process/static metadata and pure unauthenticated health GETs.

Never creates remote locks, loads application modules, queries customer DBs,
calls billing/provider routes, runs jobs, or changes remote code/configuration.
"""
import concurrent.futures
import datetime
import hashlib
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).parent
COMMON = r'''
import datetime,fcntl,hashlib,json,os,re,subprocess
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
targets=[('melamedlaw','/root/LayerWebsites','melamed-backend'),('morlevy','/root/MorLevi','morlevy-api'),('ashrafessa','/root/AshrafEssa','ashrafessa-api'),('melamedia','/root/Melamedia','melamedia-api')]
files=['backend/controllers/billingController.js','backend/lib/billing/firmBillingService.js','backend/lib/billing/selfServiceRenewal.js','backend/lib/billing/selfServiceUpgrade.js','backend/lib/payments/takbullClient.js','frontend/src/api/billingApi.js','frontend/src/components/billing/TakbullCheckoutDialog.js','frontend/src/screens/billingScreen/PlanUsageScreen.js','frontend/src/screens/billingScreen/PlansPricingScreen.js']
def git(root,*args):
 p=subprocess.run(['git','-C',root,*args],capture_output=True,text=True,timeout=15,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
 return {'exit':p.returncode,'output':p.stdout.strip(),'errorBytes':len(p.stderr)}
procs=[]
if subprocess.run(['pgrep','-f','PM2.*God Daemon'],capture_output=True).returncode==0:
 p=subprocess.run(['pm2','jlist'],capture_output=True,text=True,timeout=20)
 try:procs=json.loads(p.stdout)
 except ValueError:pass
rows=[]
for tenant,root,name in targets:
 row={'tenant':tenant,'sourceDirectory':root}
 try:lock('melamedia-legal-'+tenant+'-release')
 except (FileNotFoundError,BlockingIOError):
  row['status']='DEFERRED_TENANT_LOCK';rows.append(row);continue
 row['status']='READ_ONLY_LOCKED_SOURCE_METADATA'
 for key,args in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('trackedChanges',['status','--porcelain','--untracked-files=no']),('stagedChanges',['diff','--cached','--name-only'])]:row[key]=git(root,*args)
 row['sourceSha256']={relative:hashlib.sha256((Path(root)/relative).read_bytes()).hexdigest() if (Path(root)/relative).is_file() else None for relative in files}
 manifest=Path(root)/'docs/signing-v2/release-baseline.json'
 if manifest.is_file():
  raw=manifest.read_bytes();m=json.loads(raw);failed=[];count=0
  for relative,expected in m.get('files',{}).items():
   p=(Path(root)/relative).resolve()
   try:p.relative_to(Path(root).resolve())
   except ValueError:failed.append({'file':relative,'reason':'OUTSIDE_SOURCE_ROOT'});continue
   actual=hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
   count+=1
   if actual!=expected:failed.append({'file':relative,'reason':'HASH_MISMATCH','actualSha256':actual,'expectedSha256':expected})
  ancestor=m.get('requiredAncestor')
  ancestorCheck=git(root,'merge-base','--is-ancestor',ancestor,'HEAD') if isinstance(ancestor,str) and re.fullmatch('[0-9a-f]{40}',ancestor) else {'exit':None}
  row['protectedSource']={'manifestSha256':hashlib.sha256(raw).hexdigest(),'expectedEntries':len(m.get('files',{})),'checkedEntries':count,'mismatches':failed,'requiredAncestor':ancestor,'requiredAncestorPresent':ancestorCheck['exit']==0,'scope':'checkout source only, not loaded backend or static frontend binding'}
 row['processes']=[{'name':p.get('name'),'status':p.get('pm2_env',{}).get('status'),'cwd':p.get('pm2_env',{}).get('pm_cwd'),'script':p.get('pm2_env',{}).get('pm_exec_path'),'startedAtMs':p.get('pm2_env',{}).get('pm_uptime'),'gitShaEnv':p.get('pm2_env',{}).get('GIT_SHA')} for p in procs if p.get('name')==name]
 rows.append(row)
print(json.dumps({'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows}))
'''
FRONTEND = COMMON + r'''
rows=[]
for tenant in ['morlevy','ashrafessa','melamedia']:
 row={'tenant':tenant,'staticRoot':'/var/www/'+tenant}
 try:lock('melamedia-legal-'+tenant+'-release')
 except (FileNotFoundError,BlockingIOError):
  row['status']='DEFERRED_TENANT_LOCK';rows.append(row);continue
 row['status']='READ_ONLY_LOCKED_STATIC_METADATA';root=Path(row['staticRoot'])
 for name in ['asset-manifest.json','index.html']:
  p=root/name
  if not p.is_file():continue
  raw=p.read_bytes();entry={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'mtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat()}
  if name=='asset-manifest.json':
   m=json.loads(raw);entry.update(main=m.get('files',{}).get('main.js'),css=m.get('files',{}).get('main.css'));row['assets']={}
   for key in ['main.js','main.css']:
    relative=m.get('files',{}).get(key)
    if not isinstance(relative,str):continue
    asset=(root/relative.lstrip('/')).resolve()
    try:asset.relative_to(root.resolve())
    except ValueError:continue
    if not asset.is_file():continue
    digest=hashlib.sha256()
    with asset.open('rb') as stream:
     for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    row['assets'][key]={'path':relative,'sha256':digest.hexdigest(),'bytes':asset.stat().st_size}
  row[name]=entry
 rows.append(row)
print(json.dumps({'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows}))
'''


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect())


def remote(host, code):
    p = subprocess.run(['ssh', '-i', str(Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'root@' + host, 'python3 -'], input=code, capture_output=True, text=True, timeout=110)
    try:
        data = json.loads(p.stdout)
    except ValueError:
        data = {'status': 'UNSTRUCTURED_RESPONSE', 'stdoutBytes': len(p.stdout), 'stderrBytes': len(p.stderr)}
    return {'exit': p.returncode, **data}


def fetch(url, limit):
    request = urllib.request.Request(url, headers={'Accept': 'application/json, text/plain, */*', 'User-Agent': 'ReadOnlyLegalReleaseAudit/1.0'})
    with OPENER.open(request, timeout=25) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('READ_BOUND_EXCEEDED')
        return response.status, data


def public(tenant, front, health):
    result = {'tenant': tenant, 'frontendOrigin': front, 'healthUrl': health, 'capturedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        status, raw = fetch(health, 1024)
        body = json.loads(raw)
        result['health'] = {'httpStatus': status, 'ok': body.get('ok') is True, 'scope': 'unauthenticated /health only; no tenant headers/cookies; no DB/provider probe'}
    except urllib.error.HTTPError as error:
        result['health'] = {'httpStatus': error.code, 'status': 'NOT_OK_NO_REDIRECT_OR_BYPASS'}
    except Exception as error:
        result['health'] = {'status': 'UNAVAILABLE', 'errorType': type(error).__name__}
    try:
        status, raw = fetch(front + '/asset-manifest.json', 2000000)
        manifest = json.loads(raw)
        result['manifest'] = {'httpStatus': status, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'main': manifest.get('files', {}).get('main.js'), 'css': manifest.get('files', {}).get('main.css')}
        result['assets'] = {}
        for key in ['main.js', 'main.css']:
            relative = manifest.get('files', {}).get(key)
            if not isinstance(relative, str):
                continue
            url = urllib.parse.urljoin(front + '/', relative)
            expected = urllib.parse.urlsplit(front)
            actual = urllib.parse.urlsplit(url)
            if actual.scheme != 'https' or actual.netloc != expected.netloc or not actual.path.startswith('/static/') or actual.query:
                result['assets'][key] = {'status': 'UNEXPECTED_ASSET_LOCATION_NOT_FOLLOWED'}
                continue
            asset_status, data = fetch(url, 20000000)
            result['assets'][key] = {'path': actual.path, 'httpStatus': asset_status, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    except urllib.error.HTTPError as error:
        result['manifest'] = {'httpStatus': error.code, 'status': 'PUBLIC_MANIFEST_UNAVAILABLE'}
    except Exception as error:
        result['manifest'] = {'status': 'PUBLIC_MANIFEST_UNAVAILABLE', 'errorType': type(error).__name__}
    result['completedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return result


def main():
    result = {'startedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Existing lock-protected source/process/static metadata and pure unauthenticated health/static GETs. No customer DB, billing endpoint, provider, scheduler, application-module execution, source/ref/configuration change, restart, access or new lock. Idm excluded.'}
    targets = [
        ('MelamedLaw', 'https://client.melamedlaw.co.il', 'https://api.calls.melamedlaw.co.il/health'),
        ('MorLevi', 'https://morlevy.mela-media.co.il', 'https://api-morlevy.mela-media.co.il/health'),
        ('AshrafEssa', 'https://ashrafessa.mela-media.co.il', 'https://api-ashrafessa.mela-media.co.il/health'),
        ('Melamedia', 'https://melamedia.mela-media.co.il', 'https://api-melamedia.mela-media.co.il/health'),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(remote, '37.60.230.148', BACKEND): 'backend', pool.submit(remote, '84.46.253.85', FRONTEND): 'staticServer'}
        for tenant, front, health in targets:
            jobs[pool.submit(public, tenant, front, health)] = 'public' + tenant
        for job in concurrent.futures.as_completed(jobs):
            try:
                result[jobs[job]] = job.result()
            except Exception as error:
                result[jobs[job]] = {'status': 'FAILED_READ_ONLY_OBSERVATION', 'errorType': type(error).__name__}
    result['completedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    destination = OUT / 'live-baselines.json'
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'evidence': str(destination), 'started': result['startedAtUtc'], 'completed': result['completedAtUtc'], 'backendRows': len(result.get('backend', {}).get('rows', [])), 'staticRows': len(result.get('staticServer', {}).get('rows', [])), 'public': {k: {'health': v.get('health'), 'manifest': v.get('manifest')} for k, v in result.items() if k.startswith('public')}}, indent=2))


if __name__ == '__main__':
    main()
