import datetime,fcntl,hashlib,http.client,json,os,subprocess,time
from pathlib import Path
s=Path('/root/billing-release-20261103-melamedlaw-v2');c=json.loads((s/'config.json').read_bytes());locks=[]
for n,kind in [('melamedia-release-maintenance',fcntl.LOCK_SH),(c['tenantLock'],fcntl.LOCK_EX)]:
 fd=os.open('/run/lock/'+n+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,kind|fcntl.LOCK_NB);locks.append(fd)
assert Path('/etc/machine-id').read_text().strip()==c['machineId']
assert subprocess.check_output(['git','-C',c['root'],'rev-parse','HEAD'],text=True).strip()==c['baseline']
assert not subprocess.check_output(['git','-C',c['root'],'status','--porcelain','--untracked-files=no'],text=True).strip()
for n,h in c['protectedFiles'].items():assert hashlib.sha256((Path(c['root'])/'backend'/n).read_bytes()).hexdigest()==h
assert not Path('/proc/'+str(c['pid'])).exists()
code=(s/'pm2.cjs').read_bytes();assert hashlib.sha256(code).hexdigest()==c['rpcSha256']
def rpc(action):
 args=['/usr/bin/node','--experimental-permission','--no-addons','--allow-fs-read=/usr/lib/node_modules/pm2','--allow-fs-read=/root/.pm2','--allow-fs-read=/proc','-e',code.decode(),'/usr/lib/node_modules/pm2',action,json.dumps({'GIT_SHA':c['baseline']})]
 r=subprocess.run(args,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','HOME':'/root'});assert r.returncode==0
 d=json.loads(r.stdout);assert d['status']=='READONLY_NAMED_METADATA_PASS';return d['metadata']
before=rpc('inspect');assert before['pid']==0 and before['processStatus']=='stopped'and before['flags']==c['baseFlags']
p=s/'execution'/'baseline-recovery.json';assert not p.exists()
after=rpc('restart-current');assert after['processStatus']=='online'and after['pid']>1 and after['flags']==dict(c['baseFlags'],GIT_SHA=c['baseline'])
end=time.monotonic()+30
while True:
 try:
  h=http.client.HTTPConnection('127.0.0.1',c['port'],timeout=3);h.request('GET','/health',headers={'Connection':'close'});r=h.getresponse();assert r.status==200 and json.loads(r.read(4097))=={'ok':True};h.close();break
 except (OSError,AssertionError):
  if time.monotonic()>end:raise
  time.sleep(.3)
proc=Path('/proc')/str(after['pid']);ticks=int(proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19])
pre=json.loads((s/'execution/pre-stop.json').read_bytes())['targets']['MelamedLaw'];post=json.loads((s/'execution/post-stop.json').read_bytes())['targets']['MelamedLaw']
delta={k:{'pre':v,'post':post['aggregates'].get(k)}for k,v in pre['aggregates'].items()if v!=post['aggregates'].get(k)}
result={'status':'PASS_BASELINE_RECOVERED_SOURCE_UNCHANGED','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':c['baseline'],'pid':after['pid'],'startTicks':ticks,'healthStatus':200,'originalBehaviorFlagsPreserved':True,'accurateVersionMarkerAdded':True,'snapshotDelta':delta}
with p.open('x')as f:json.dump(result,f)
print(json.dumps(result))
