import os,json,hashlib,subprocess,fcntl,stat,shutil,datetime
from pathlib import Path
expected={'scope-command.stderr': 'fbe6aaae8ef3cfcdf3dae423454ea3d019c399e38d210e2837186247d1345119', 'scope-progress.json': 'c9b04b326ef3daafc2012a60f9f4a6ba8d6cb390dad0a20358424ff174a92e3f', 'scope-command.stdout': 'abb6a8ed5263030201ad353c77aa26c58983b81a392cccc255a1ffeadf02e384', 'scope-result.json': '13b46756931dcc0bc0192ca8d253e83309860fd882864b0c5a6e2c74ee017d71', 'STAGED-PIN.json': 'e75b073a6694e880e601ebc33e7ce37a9cbb44828a0d8685be75b8ded0ad13c9', 'stage-receipt.json': '838f12a19bf506be8e6cc7ca8da676c7ce5a530892ba8e55de5fc651104e7ff7', 'scope-execution-request.json': '31c1a46271768634448736694a68ddc48dbc6f9b10d40f2d5cf04c0fce0e20b7', 'runs/progress.json': '08771e1e9c2c143f01f9cf37130bfec316471f84dbc5a075ef125d85a26a9482', 'runs/receipt.json': '54fb70281f42f562ff00607c20f55b45e0a9d7d181345359732b310eeac16350', 'runs/cardSetupDebtCollection.test/stderr.log': '6a0ab2c6a499c5e398a8392c34c9f554658521f6ec650d910919c7f67ded09f2', 'runs/cardSetupDebtCollection.test/stdout.tap': '6708ea2a65e79f79f292c540022c8a9a54ce2a2e2da437de597d1868729e0682', 'runs/cardSetupDebtCollection.test/launcher.log': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'runs/cardSetupDebtCollection.test/receipt.json': 'c26c3db5baeb4f6394b47778e9ffc4cdbe2109ac4bd5474262af89d493a8dec8'}
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
 pin=json.loads((T/'STAGED-PIN.json').read_text());check(pin['archiveSha256']=='f86b6954bd2b4a1ced0a1b378ee7f4607add90ccc6e2c1e96df3a16514e9ca72','STAGE_PIN_MISMATCH')
 rec=json.loads((T/'runs/receipt.json').read_text());check(rec['status']=='FAIL'and rec['serviceIdentityStable'],'UNEXPECTED_TEST_RESULT')
 one=json.loads((T/'runs/cardSetupDebtCollection.test/receipt.json').read_text());check(one['status']=='FAIL'and one['exitCode']==-15,'CHILD_RESULT_UNCERTAIN');check(not Path('/proc/'+str(one['pid'])).exists(),'CHILD_PID_STILL_PRESENT')
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
