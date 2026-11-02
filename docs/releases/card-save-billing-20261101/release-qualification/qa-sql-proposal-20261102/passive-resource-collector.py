import os,fcntl,json,subprocess,datetime,gzip
from pathlib import Path
fds=[];out={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'remoteMutations':0,'scopeOrNamespaceCreated':False,'databaseConnections':0,'providerCalls':0}
try:
 for n in ['melamedia-release-maintenance','melamedia-legal-melamedia-release']:
  f=os.open('/run/lock/'+n+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(f)
 for p in [2729957,948103]:os.kill(p,0)
 h=subprocess.run(['git','-C','/root/Melamedia','rev-parse','HEAD'],capture_output=True,text=True,timeout=10)
 if h.returncode or h.stdout.strip()!='545779e4b99e111959f4684167dfdf46da1f3186':raise RuntimeError('QA_SOURCE_DRIFT')
 out['qaHead']=h.stdout.strip()
 out['systemdVersion']=subprocess.run(['systemctl','--version'],capture_output=True,text=True,timeout=10).stdout.splitlines()[0]
 out['selfCgroup']=Path('/proc/self/cgroup').read_text().splitlines()
 out['cgroupFiles']={}
 for f in ['cgroup.controllers','cgroup.subtree_control','memory.current','memory.max','memory.swap.max','system.slice/cgroup.controllers','system.slice/cgroup.subtree_control']:
  p=Path('/sys/fs/cgroup')/f;out['cgroupFiles'][f]=p.read_text().strip()if p.is_file()else None
 out['scopeDocumentProperties']={}
 for name,terms in [('systemd.scope.5.gz',['RuntimeMaxSec','CollectMode']),('systemd.resource-control.5.gz',['MemoryMax','MemorySwapMax','CPUQuota','TasksMax'])]:
  p=Path('/usr/share/man/man5')/name
  if p.is_file():
   s=gzip.decompress(p.read_bytes()).decode();out['scopeDocumentProperties'][name]={k:k in s for k in terms}
  else:out['scopeDocumentProperties'][name]={'available':False}
 out['status']='PASS_PASSIVE_RESOURCE_PREREQUISITES'
except Exception as e:out.update(status='BLOCKED',reason=str(e),type=type(e).__name__)
out['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();print(json.dumps(out))
