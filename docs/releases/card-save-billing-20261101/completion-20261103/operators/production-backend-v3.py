"""One named production source update. No migrations, billing tests, or data writes.

Run inspect/stage first. Execution requires an immutable per-target config SHA.
Preserves all existing process settings, adding only the accurate GIT_SHA marker.
"""
import argparse,datetime,fcntl,hashlib,http.client,io,ipaddress,json,os,re,stat,subprocess,sys,tarfile,time
from pathlib import Path
H=lambda b:hashlib.sha256(b).hexdigest()
UTC=datetime.timezone.utc
def now():return datetime.datetime.now(UTC)
def need(x,why):
 if not x:raise RuntimeError(why)
def save(p,data):
 raw=(json.dumps(data,sort_keys=True,indent=2)+'\n').encode()
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
def wait_stopped_snapshot(pre, snapshot, rows, idle, clock, sleep):
 end=clock()+12
 attempt=0
 while True:
  post=snapshot('post-stop' if attempt==0 else 'post-stop-drain-'+str(attempt))
  need(rows(pre)==rows(post),'STOP_FINANCIAL_OR_WORKER_ROWS_CHANGED')
  idle(post)
  if post['aggregates']['roleSessions'][0]['sessions']==0:return post
  need(clock()<end,'STOP_DB_SESSIONS_DID_NOT_DRAIN')
  attempt+=1;sleep(.3)

def main():
 a=argparse.ArgumentParser();a.add_argument('--config',required=True);a.add_argument('--config-sha',required=True);a.add_argument('--execute',action='store_true');args=a.parse_args()
 path=Path(args.config);raw=path.read_bytes();need(H(raw)==args.config_sha,'CONFIG_PIN')
 c=json.loads(raw);stage=path.parent;root=Path(c['root']);backend=root/'backend';evidence=stage/('execution'if args.execute else'inspection');evidence.mkdir(mode=0o700)
 result={'target':c['target'],'startedAtUtc':now().isoformat(),'status':'PRECHECK','databaseWrites':0,'intentionalProviderCalls':0,'migrations':0,'processActions':[],'sourceChanged':False,'originalFlagsPreserved':False}
 clean={'PATH':'/usr/bin:/bin','HOME':'/root','GIT_OPTIONAL_LOCKS':'0','GIT_TERMINAL_PROMPT':'0'}
 locks=[]
 def run(argv,timeout=30,input=None):
  options={'input':input}if input is not None else {'stdin':subprocess.DEVNULL}
  q=subprocess.run(argv,**options,capture_output=True,env=clean,timeout=timeout)
  need(q.returncode==0,'COMMAND_FAILED_'+Path(argv[0]).name);return q.stdout
 def git(*args):return run(['/usr/bin/git','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',str(root),*args],90).decode().strip()
 def meta(pid):
  p=Path('/proc')/str(pid)
  return {'pid':pid,'startTicks':int(p.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]),'cwd':os.readlink(p/'cwd'),'exe':os.readlink(p/'exe'),'expectedServerPathPresent':str(backend/'server.js').encode()in p.joinpath('cmdline').read_bytes()}
 def identity(head):
  need(Path('/etc/machine-id').read_text().strip()==c['machineId']and Path('/proc/sys/kernel/random/boot_id').read_text().strip()==c['bootId'],'HOST_BOOT_CHANGED')
  need(Path('/root/.pm2/pm2.pid').read_text().strip()==str(c['daemonPid'])and meta(c['daemonPid'])['startTicks']==c['daemonTicks'],'PM2_DAEMON_CHANGED')
  need(git('rev-parse','HEAD')==head and not git('status','--porcelain','--untracked-files=no'),'TRACKED_SOURCE_CHANGED')
  for name,pin in c['protectedFiles'].items():need(H((backend/name).read_bytes())==pin,'PROTECTED_FILE_CHANGED_'+name)
  need(H(Path('/usr/bin/node').read_bytes())==c['nodeSha256'],'NODE_CHANGED')
  need((backend/'node_modules').resolve(strict=True)==Path(c['dependencyRoot']),'DEPENDENCY_ROOT_CHANGED')
 def rpc(action,head):
  b=(stage/'pm2.cjs').read_bytes();need(H(b)==c['rpcSha256'],'RPC_PIN')
  for name,pin in c['pm2Pins'].items():need(H((Path('/usr/lib/node_modules/pm2')/name).read_bytes())==pin,'PM2_PACKAGE_PIN')
  argv=['/usr/bin/node','--experimental-permission','--no-addons','--allow-fs-read=/usr/lib/node_modules/pm2','--allow-fs-read=/root/.pm2','--allow-fs-read=/proc','-e',b.decode(),'/usr/lib/node_modules/pm2',action,json.dumps({'GIT_SHA':head})]
  data=json.loads(run(argv,20));need(data.get('status')=='READONLY_NAMED_METADATA_PASS','PM2_OUTCOME_NOT_ACCEPTED')
  return data
 def snapshot(label):
  # Separate pinned read-only child uses the same configured application DB identity.
  b=(stage/'snapshot.py').read_bytes();need(H(b)==c['snapshotSha256'],'SNAPSHOT_PIN')
  q=subprocess.run(['/usr/bin/python3','-I','-S',str(stage/'snapshot.py')],capture_output=True,timeout=30,env=clean,stdin=subprocess.DEVNULL)
  need(q.returncode==0,'READONLY_SNAPSHOT_FAILED');d=json.loads(q.stdout);save(evidence/(label+'.json'),d)
  need(d['dataWrites']==d['providerCalls']==d['processActions']==0,'SNAPSHOT_SIDE_EFFECT_CONTRACT')
  t=d['targets'][c['target']];need(t['unavailableRelations']==c['unavailableRelations'],'GRANT_OR_SCHEMA_DRIFT')
  return t
 def rows(s):return {k:v for k,v in s['aggregates'].items()if k!='roleSessions'}
 def idle(s):
  x=s['aggregates'];need(x['roleSessions'][0]['activeQueries']==x['roleSessions'][0]['activeTransactions']==0,'ACTIVE_DB_WORK')
  need(all(v['status']in ['succeeded','failed','cancelled']for v in x['paymentIntents']),'UNRESOLVED_PAYMENT_INTENT')
  need(all(v['activeDueCandidates']==v['pastDueRetryCandidates']==0 for v in x['billingCandidates']),'DUE_BILLING_WORK')
  for group,fields in {'signingJobs':['liveLeases','staleRunning','duePendingOrRetry'],'signingErrorEmails':['liveLeases'],'integrationClaims':['dispatchClaims','courtDue'],'whatsappJobs':['due','recipientSendingRows'],'signingOtp':['unexpiredPending']}.items():
   if group in x:need(all(row[k]==0 for row in x[group]for k in fields),'LIVE_WORK_'+group)
 def process_quiet(pid,ticks,seconds=20):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   need(meta(pid)['startTicks']==ticks,'PROCESS_REPLACED')
   q=run(['/usr/bin/ss','-ntpH'],3).decode();lines=[l for l in q.splitlines()if re.search(r'\bpid='+str(pid)+r'\b',l)]
   good=True
   for line in lines:
    parts=line.split();host,port=parts[4].rsplit(':',1);ip=ipaddress.ip_address(host.strip('[]'));ip=ip.ipv4_mapped if isinstance(ip,ipaddress.IPv6Address)and ip.ipv4_mapped else ip
    if not ip.is_loopback or port!='5432' or parts[3].rsplit(':',1)[1]==str(c['port']):good=False
   if good:return
   time.sleep(.2)
  raise RuntimeError('LIVE_NON_DB_SOCKET')
 def health():
  x=http.client.HTTPConnection('127.0.0.1',c['port'],timeout=4)
  try:x.request('GET','/health',headers={'Connection':'close'});r=x.getresponse();need(r.status==200 and json.loads(r.read(4097))=={'ok':True},'HEALTH_FAILED')
  finally:x.close()
 try:
  need(os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'ISOLATED_ROOT_REQUIRED');os.umask(0o077)
  for name,kind in [('melamedia-release-maintenance',fcntl.LOCK_SH),(c['tenantLock'],fcntl.LOCK_EX)]:
   fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,kind|fcntl.LOCK_NB);locks.append(fd)
  identity(c['baseline']);need(meta(c['pid'])==c['process'],'BASE_PROCESS_BINDING')
  before=rpc('inspect',c['baseline'])['metadata'];save(evidence/'pm2-before.json',before)
  need(before['processStatus']=='online'and before['pid']==c['pid']and before['flags']==c['baseFlags'],'ORIGINAL_PM2_FLAGS_CHANGED')
  backup=Path('/var/lib/melamedia-backup-watch/latest-health.json').read_bytes();backup_report=json.loads(backup)
  need(backup_report.get('healthy')is True and 0<=(now()-datetime.datetime.fromisoformat(backup_report['utc'])).total_seconds()<7200,'CURRENT_BACKUP_HEALTH_REQUIRED')
  backup_rows=[r for r in backup_report['checks']if r.get('project')==c['backupProject']]
  need(len(backup_rows)==1 and backup_rows[0].get('offsite')=='verified_readback'and backup_rows[0].get('age_hours',1000)<26,'TARGET_BACKUP_REPORT_REQUIRED')
  save(evidence/'backup-report-binding.json',{'reportSha256':H(backup),'reportedAtUtc':backup_report['utc'],'target':backup_rows[0],'independentRestoreReused':'QA authenticated logical restore proof from 2026-11-02; not a new production restore'})
  need(H((stage/'candidate.bundle').read_bytes())==c['bundleSha256'],'BUNDLE_PIN')
  git('bundle','verify',str(stage/'candidate.bundle'))
  if not args.execute:
   observed=snapshot('inspection-financial');idle(observed)
   result.update(status='PASS_PRIVATE_PACKAGE_AND_LIVE_BASELINE_INSPECTION_ONLY');save(evidence/'result.json',result);print(json.dumps(result));return
  # Private candidate ref/object import only; no worktree mutation at this point.
  private_ref='refs/billing-release/20261103/'+c['target'].lower()+'-v3'
  need(not git('for-each-ref','--format=%(refname)',private_ref),'PRIVATE_RELEASE_REF_ALREADY_EXISTS')
  git('fetch','--no-tags','--no-write-fetch-head',str(stage/'candidate.bundle'),c['bundleRef']+':'+private_ref)
  need(git('rev-parse',private_ref)==c['candidate'],'IMPORTED_CANDIDATE_MISMATCH')
  git('merge-base','--is-ancestor',c['baseline'],c['candidate'])
  changed=set(git('diff','--name-only',c['baseline'],c['candidate']).splitlines())
  untracked=set(git('ls-files','--others','--exclude-standard').splitlines())
  need(not any(u==p or p.startswith(u+'/')or u.startswith(p+'/')for u in untracked for p in changed),'UNTRACKED_COLLISION')
  save(evidence/'untracked-before.json',{'pathsSha256':H(json.dumps(sorted(untracked)).encode()),'count':len(untracked)})
  # Three complete Git source recovery archives; private config/dependencies stay in place.
  reserves=[]
  for i,commit in enumerate(c['reserveCommits']):
   raw=run(['/usr/bin/git','-C',str(root),'archive','--format=tar.gz',commit+':backend'],45)
   with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz')as archive:
    members=archive.getmembers();need(len(members)>100,'INCOMPLETE_RECOVERY_ARCHIVE')
    for member in members:
     need(not member.name.startswith('/')and '..'not in Path(member.name).parts and not member.issym()and not member.islnk(),'RECOVERY_ARCHIVE_PATH')
     if member.isfile():need(len(archive.extractfile(member).read())==member.size,'RECOVERY_ARCHIVE_READBACK')
   p=evidence/('backend-reserve-'+str(i)+'.tar.gz')
   with p.open('xb')as f:f.write(raw)
   need(H(p.read_bytes())==H(raw),'RECOVERY_ARCHIVE_FILE_READBACK')
   reserves.append({'sourceCommit':commit,'backendTree':git('rev-parse',commit+':backend'),'sha256':H(raw),'bytes':len(raw),'path':str(p),'fullArchiveReadback':True})
  need(len({r['backendTree']for r in reserves})==3,'THREE_DISTINCT_BACKEND_RESERVES_REQUIRED')
  save(evidence/'source-reserves.json',reserves)
  health();process_quiet(c['pid'],c['process']['startTicks'])
  pre=snapshot('pre-stop');idle(pre);identity(c['baseline'])
  save(evidence/'stop-intent.json',{'pid':c['pid'],'atUtc':now().isoformat()})
  stopped=rpc('stop',c['baseline']);result['processActions'].append('stop');save(evidence/'stop-result.json',stopped)
  need(stopped['metadata']['processStatus']=='stopped'and stopped['metadata']['pid']==0 and stopped['metadata']['exit_code']==0 and not Path('/proc/'+str(c['pid'])).exists(),'STOP_NOT_CLEAN')
  post=wait_stopped_snapshot(pre,snapshot,rows,idle,time.monotonic,time.sleep)
  identity(c['baseline'])
  save(evidence/'source-intent.json',{'baseline':c['baseline'],'candidate':c['candidate'],'atUtc':now().isoformat()})
  git('merge','--ff-only','--no-edit',c['candidate']);result['sourceChanged']=True;identity(c['candidate'])
  save(evidence/'restart-intent.json',{'candidate':c['candidate'],'atUtc':now().isoformat()})
  restarted=rpc('restart-current',c['candidate']);result['processActions'].append('restart-current');save(evidence/'restart-result.json',restarted)
  newpid=restarted['metadata']['pid'];need(newpid>1 and newpid!=c['pid'],'NEW_PROCESS_REQUIRED')
  expected=dict(c['baseFlags'],GIT_SHA=c['candidate']);need(restarted['metadata']['flags']==expected,'RESTART_FLAGS_CHANGED')
  deadline=time.monotonic()+30
  while True:
   try:health();break
   except (OSError,RuntimeError):
    if time.monotonic()>=deadline:raise
    time.sleep(.5)
  actual=meta(newpid);need(actual['cwd']==str(backend)and actual['exe']=='/usr/bin/node','NEW_PROCESS_OWNER')
  process_quiet(newpid,actual['startTicks']);final=snapshot('post-start');idle(final)
  need(rows(final)==rows(pre),'FINANCIAL_WORKER_ROWS_CHANGED')
  identity(c['candidate']);last=rpc('inspect',c['candidate'])['metadata'];need(last['pid']==newpid and last['processStatus']=='online'and last['flags']==expected and meta(newpid)==actual,'FINAL_PROCESS_CAS')
  need(set(git('ls-files','--others','--exclude-standard').splitlines())==untracked,'UNTRACKED_PATHS_CHANGED')
  result.update(status='PASS_NAMED_PRODUCTION_BACKEND_SOURCE_AND_HEALTH',sourceHead=c['candidate'],process=actual,healthStatus=200,originalFlagsPreserved=True,onlyVersionMarkerAdded=True,financialAndWorkerRowsUnchanged=True)
 except BaseException as e:
  result.update(status='HOLD_INSPECT_EXACT_STATE_NO_BLIND_RETRY',errorType=type(e).__name__,reason=str(e)if re.fullmatch('[A-Z0-9_]+',str(e))else'PRIVATE_ERROR_WITHHELD')
 finally:
  result['finishedAtUtc']=now().isoformat()
  if not (evidence/'result.json').exists():save(evidence/'result.json',result)
  for fd in reversed(locks):os.close(fd)
 print(json.dumps(result));return 0 if result['status'].startswith('PASS_')else 1
if __name__=='__main__':raise SystemExit(main())
