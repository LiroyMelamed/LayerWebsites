import os,json,hashlib,subprocess,fcntl,stat,shutil,datetime
from pathlib import Path
expected={'scope-command.stderr': '12a1cec182f2820bc0d6dbc68c1a195657769481274c09227eb7bd359834278d', 'scope-progress.json': 'af4317ce4758b2435d94c356ee18c9c72f429560fd4427aa3fade4c3ab82c8e5', 'scope-command.stdout': 'abb6a8ed5263030201ad353c77aa26c58983b81a392cccc255a1ffeadf02e384', 'scope-result.json': 'ccdf5a6728316363501a601f08f1d9fb07ee35a465435a3b024af544cb4783b0', 'STAGED-PIN.json': '292202963b30181bc779b59ddc45e3b02e3e8018966c8a943c4974df0fa59bfd', 'stage-receipt.json': '916943909e0c1e9b7a74261366d36e21ccaf80b691454182d2e22842b289d688', 'scope-execution-request.json': 'e49f019bd402e995b3e23034f10618d0b09f4873ec894fbf655236080a909bb0', 'runs/progress.json': '9c67f9e01e405b17d6ea3612f6efe678edf21f5fc7d1e96ccd378f60a1bb66f9', 'runs/receipt.json': '50cc987af274c13c80bc2b5d7b0eec1de1537ec3d2ce9c9580a118ea5b9fb60e', 'runs/cardSetupDebtCollection.test/stderr.log': '6a0ab2c6a499c5e398a8392c34c9f554658521f6ec650d910919c7f67ded09f2', 'runs/cardSetupDebtCollection.test/stdout.tap': 'b8c3cfa8a41dad9d92cb429f4e35336341c956d1f898eb6accd8b546002bb9e1', 'runs/cardSetupDebtCollection.test/launcher.log': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'runs/cardSetupDebtCollection.test/receipt.json': '72154e423dc8a66690bdb6a9ad48d1df21c5807b00d21445d05fcb5ba4c1470d'}
T=Path('/tmp/layer-billing-sql-sequences-20261102-6a3bd299');U='layer-billing-sql-qa-20261102-6a3bd299.scope';fds=[];r={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cleanupPerformed':False,'serviceChanges':0,'dbConnections':0,'providerCalls':0}
def check(x,s):
 if not x:raise RuntimeError(s)
def state():
 def proc(pid,ticks):
  p=Path('/proc')/str(pid);s=(p/'stat').read_text();v=int(s[s.rfind(')')+2:].split()[19]);check(v==ticks,'PROCESS_DRIFT');return{'pid':pid,'startTicks':v}
 h=subprocess.run(['git','-C','/root/Melamedia','rev-parse','HEAD'],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin','GIT_OPTIONAL_LOCKS':'0'},timeout=10);s=subprocess.run(['git','-C','/root/Melamedia','status','--porcelain','--untracked-files=no'],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin','GIT_OPTIONAL_LOCKS':'0'},timeout=10)
 check(h.returncode==s.returncode==0 and not s.stdout and h.stdout.strip()=='545779e4b99e111959f4684167dfdf46da1f3186','SOURCE_DRIFT')
 env=hashlib.sha256(Path('/root/Melamedia/backend/.env').read_bytes()).hexdigest();check(env=='9fc4bc04f6faa9e88347d3f94aa926750f616a54d2c9754fd86bc1bf94945281','ENV_DRIFT')
 return{'qa':proc(2729957,124260326),'daemon':proc(948103,48642921),'head':h.stdout.strip(),'envSha256':env,'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
try:
 for n in ['melamedia-release-maintenance','melamedia-legal-melamedia-release']:
  f=os.open('/run/lock/'+n+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(f)
 r['before']=state();check(T.resolve(strict=True)==T and not T.is_symlink()and T.stat().st_uid==0,'UNSAFE_TARGET')
 p=subprocess.run(['systemctl','show',U,'--property=LoadState,ActiveState,ControlGroup'],capture_output=True,text=True,timeout=10);s=dict(x.split('=',1)for x in p.stdout.splitlines()if'='in x);r['scope']=s;check(s.get('LoadState')=='not-found'and s.get('ActiveState')=='inactive'and not s.get('ControlGroup'),'SCOPE_NOT_COLLECTED')
 check(not Path('/sys/fs/cgroup/system.slice/'+U).exists(),'CGROUP_STILL_EXISTS')
 pin=json.loads((T/'STAGED-PIN.json').read_text());check(pin['archiveSha256']=='10908a08142a108e63247797fd1f334e63892dc87b1d5747aa5770ff4911f7e9','STAGE_PIN_MISMATCH')
 rec=json.loads((T/'runs/receipt.json').read_text());check(rec['status']=='FAIL'and rec['serviceIdentityStable'],'UNEXPECTED_TEST_RESULT')
 one=json.loads((T/'runs/cardSetupDebtCollection.test/receipt.json').read_text());check(one['status']=='FAIL'and one['exitCode']==1,'CHILD_RESULT_UNCERTAIN');check(not Path('/proc/'+str(one['pid'])).exists(),'CHILD_PID_STILL_PRESENT')
 for rel,h in expected.items():
  p=T/rel;check(p.is_file()and not p.is_symlink()and hashlib.sha256(p.read_bytes()).hexdigest()==h,'EVIDENCE_CHANGED_OR_NOT_COPIED')
 r['preservedEvidenceFilesVerified']=len(expected)
 for parent,dirs,files in os.walk(T,followlinks=False):
  for n in dirs+files:
   p=Path(parent)/n;v=p.lstat();check(v.st_uid==0 and not stat.S_ISLNK(v.st_mode)and v.st_dev==T.stat().st_dev and(stat.S_ISREG(v.st_mode)or stat.S_ISDIR(v.st_mode)),'UNEXPECTED_TREE_OBJECT')
   if stat.S_ISREG(v.st_mode):check(v.st_nlink==1,'UNEXPECTED_HARDLINK')
 shutil.rmtree(T);r['cleanupPerformed']=True;check(not os.path.lexists(T),'TARGET_NOT_REMOVED');r['after']=state();check(r['before']==r['after'],'POST_CLEANUP_IDENTITY_DRIFT');r['serviceIdentityStable']=True;r['status']='CLEANED_APPROVED_COMPLETED_TEST_TREE_ONLY'
except BaseException as e:r.update(status='HOLD_INSPECT_NO_BLIND_RETRY',reason=str(e),errorType=type(e).__name__)
r['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();print(json.dumps(r))
