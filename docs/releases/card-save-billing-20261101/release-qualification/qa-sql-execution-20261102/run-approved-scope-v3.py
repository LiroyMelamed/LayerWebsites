from pathlib import Path
import json,subprocess,hashlib,datetime
B=Path('/tmp/layer-billing-sql-qa-proposal-20261102')
REMOTE=r'''import os,json,fcntl,subprocess,time,signal,hashlib,datetime,stat
from pathlib import Path
T=Path('/tmp/layer-billing-sql-sequences-20261102-6a3bd299');U='layer-billing-sql-qa-20261102-6a3bd299.scope';M='d24165b8df2a825d715d1e38690d16f08c626484c7268cccaaf9bd3bc08c5399';ENV={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','SYSTEMD_COLORS':'0'}
fds=[];stop=False;child=None;owns_request=False;r={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scopeAttempted':False,'serviceChanges':0,'hostDatabaseConnections':0,'providerCalls':0,'cleanupPerformed':False}
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def check(x,s):
 if not x:raise RuntimeError(s)
def atomic(name,data):
 p=T/('.'+name+'.'+str(os.getpid())+'.tmp');f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(f,'w')as o:json.dump(data,o,indent=2);o.write('\n');o.flush();os.fsync(o.fileno())
 os.replace(p,T/name);f=os.open(T,os.O_RDONLY|os.O_DIRECTORY);os.fsync(f);os.close(f)
def sig(n,_):
 global stop
 stop=True
for n in [signal.SIGHUP,signal.SIGTERM,signal.SIGINT]:signal.signal(n,sig)
try:
 os.umask(0o077)
 for n in ['melamedia-release-maintenance','melamedia-legal-melamedia-release']:
  f=os.open('/run/lock/'+n+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(f)
 check(T.is_dir()and not T.is_symlink(),'STAGING_TREE_MISSING_OR_UNSAFE')
 stage=json.loads((T/'stage-receipt.json').read_text());check(stage['status']=='STAGED_VERIFIED_NOT_EXECUTED'and stage['serviceIdentityStable'],'STAGING_RECEIPT_NOT_PASSED')
 check(hashlib.sha256((T/'payload/FILE-MANIFEST.json').read_bytes()).hexdigest()==M,'MANIFEST_DRIFT')
 check(not os.path.lexists(T/'runs')and not os.path.lexists(T/'scope-execution-request.json'),'PRIOR_SCOPE_REQUEST_INSPECT_BEFORE_RETRY')
 p=subprocess.run(['/usr/bin/systemctl','show',U,'--property=LoadState,ControlGroup'],capture_output=True,text=True,env=ENV,timeout=10)
 props=dict(v.split('=',1)for v in p.stdout.splitlines()if'='in v);check(props.get('LoadState')=='not-found'and not props.get('ControlGroup'),'SCOPE_COLLISION_INSPECT_BEFORE_RETRY')
 request={'atUtc':utc(),'unit':U,'manifestSha256':M,'phase':'REQUESTED_NOT_YET_RETURNED'}
 fd=os.open(T/'scope-execution-request.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as o:json.dump(request,o);o.flush();os.fsync(o.fileno())
 owns_request=True
 cmd=['/usr/bin/systemd-run','--scope','--collect','--expand-environment=no','--unit='+U,'--property=MemoryMax=2G','--property=MemorySwapMax=0','--property=TasksMax=32','--property=CPUQuota=50%','--property=RuntimeMaxSec=600','--property=OOMPolicy=kill','/usr/bin/python3','-I','-S',str(T/'payload/qa_sql_controller.py'),'--approved-execution','--bundle',str(T/'payload'),'--run-root',str(T/'runs'),'--unit',U[:-6],'--manifest-sha',M]
 r.update(scopeAttempted=True,command=cmd,status='SCOPE_REQUESTED');atomic('scope-progress.json',r)
 with open(T/'scope-command.stdout','xb')as out,open(T/'scope-command.stderr','xb')as err:
  child=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=out,stderr=err,env=ENV,close_fds=True,start_new_session=True)
  r['systemdRunPid']=child.pid;atomic('scope-progress.json',r);deadline=time.monotonic()+620
  while child.poll()is None:
   if stop or time.monotonic()>deadline:
    r['interruptedOrOuterDeadline']=True
    subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=SIGTERM',U],capture_output=True,env=ENV,timeout=10)
    try:child.wait(timeout=5)
    except subprocess.TimeoutExpired:
     subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=SIGKILL',U],capture_output=True,env=ENV,timeout=10);child.kill();child.wait(timeout=5)
    break
   time.sleep(.25)
  out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
 r['commandExit']=child.returncode
 final=T/'runs/receipt.json'
 if final.is_file():r['controller']=json.loads(final.read_text())
 r['status']='PASS'if child.returncode==0 and r.get('controller',{}).get('status')=='PASS'and not stop else'FAIL_OR_INCOMPLETE_NO_RETRY_WITHOUT_INSPECTION'
except BaseException as e:r.update(status='BLOCKED_OR_INCOMPLETE',reason=str(e),errorType=type(e).__name__)
finally:
 if child is not None and child.poll()is None:
  try:subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=SIGKILL',U],capture_output=True,env=ENV,timeout=10);child.kill();child.wait(timeout=5)
  except BaseException:r['terminationNeedsInspection']=True
 r['finishedAtUtc']=utc()
 try:
  if owns_request:atomic('scope-result.json',r)
 except BaseException:r['receiptWriteFailed']=True
 for f in reversed(fds):os.close(f)
artifacts={}
for name in ['stage-receipt.json','STAGED-PIN.json','scope-execution-request.json','scope-command.stdout','scope-command.stderr','scope-progress.json','scope-result.json','runs/receipt.json','runs/progress.json','runs/cardSetupDebtCollection.test/receipt.json','runs/cardSetupDebtCollection.test/stdout.tap','runs/cardSetupDebtCollection.test/stderr.log','runs/cardSetupDebtCollection.test/launcher.log','runs/selfServiceCardSetupCollection.test/receipt.json','runs/selfServiceCardSetupCollection.test/stdout.tap','runs/selfServiceCardSetupCollection.test/stderr.log','runs/selfServiceCardSetupCollection.test/launcher.log']:
 p=T/name
 if p.is_file()and not p.is_symlink():
  raw=p.read_bytes()
  if len(raw)<=2*1024**2:artifacts[name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'text':raw.decode('utf-8',errors='replace')}
  else:artifacts[name]={'bytes':len(raw),'notExportedTooLarge':True}
r['artifacts']=artifacts;print(json.dumps(r))
'''
(B/'executed-scope-source-v3.py').write_text(REMOTE)
r={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'remoteSourceSha256':hashlib.sha256(REMOTE.encode()).hexdigest()}
try:
 p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectTimeout=10','root@37.60.230.148','/usr/bin/python3 -I -S -'],input=REMOTE,capture_output=True,text=True,timeout=680)
 r.update(sshExit=p.returncode,stderrBytes=len(p.stderr))
 try:r['remote']=json.loads(p.stdout)
 except ValueError:r.update(status='UNSTRUCTURED_RESPONSE_INSPECT_SCOPE_BEFORE_RETRY',stdoutBytes=len(p.stdout))
except subprocess.TimeoutExpired:r['status']='UNCERTAIN_SSH_TIMEOUT_INSPECT_SCOPE_BEFORE_RETRY'
r['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
if'remote'in r:
 evidence=B/'execution-evidence-v3';evidence.mkdir(exist_ok=True)
 for name,item in r['remote'].pop('artifacts',{}).items():
  if'text'in item:
   data=item['text'].encode();assert hashlib.sha256(data).hexdigest()==item['sha256'];target=evidence/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 r['evidenceDirectory']=str(evidence)
(B/'approved-scope-result-v3.json').write_text(json.dumps(r,indent=2)+'\n')
remote=r.get('remote',{});print(json.dumps({'status':remote.get('status',r.get('status')),'commandExit':remote.get('commandExit'),'sshExit':r.get('sshExit'),'controller':remote.get('controller'),'reason':remote.get('reason'),'evidenceDirectory':r.get('evidenceDirectory')}))
