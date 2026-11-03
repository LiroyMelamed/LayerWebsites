#!/usr/bin/python3
"""Review-only finite NORMAL-success QA return. Never guesses or rolls back a failure."""
import argparse,datetime,fcntl,hashlib,http.client,importlib.util,json,os,signal,stat,subprocess,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
INSTALL='8d897c207d6bd30fdee108a52e0eb3b89f025f03'
FRONTEND_SOURCE=INSTALL
QUALIFIED_FRONTEND_ORIGIN='efe1ee371ad96bc76963ac1848076055cb83066b'
PUBLICATION_SHA='c74e0a25e357bbb2ebcfdf4cdd2109be3c4c0b1c474794c4a40a3aa4cc1001ca'
DEFAULT_OPS=Path('/tmp/layer-billing-qa-source-20261103-8d897c20-cycle5/transition-cycle4')
PINS={'qa_pm2_effective_return_v2.py':'1ec316fc52a1ab570fce242da017060449d12a64230a2c04ba78e3a902120325',
'pm2_qa_effective_return_rpc.cjs':'609ac7a123c605d00b010be7a414ce6016af7be12c350b6e50ca7aa63de17622',
'pm2_transition_pins.json':'c6bebc3ee75b49d48231ff5a9af2303c5875f6789888965d416159fed415166d',
'qa_return_drain_snapshot.py':'0948aeb31f0df49fd6d4afaec0e1a6c5b430f587cd7719a4813e7116bd6d0683'}
PINS.update({'qa_forward_guard.py': '8db37699415d9f0247c96df15a9dee2630579024258232fd0613c09b9010f493', 'qa_owned_child.py': '2ebac6c18c6b165a3be7c200553c244d5ce3729127cd3bb1854fa4f1da334aab'})
CLEAN={'PATH':'/usr/bin:/bin','HOME':'/root','GIT_OPTIONAL_LOCKS':'0'}

def check(x,message):
 if not x:raise RuntimeError(message)
def sha(path):
 with open(path,'rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc)
def filecheck(path,expected=None,private=True):
 check(path.is_absolute()and path.resolve(strict=True)==path,'noncanonical input path')
 s=path.lstat();check(stat.S_ISREG(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022,'unsafe input owner/type/mode')
 if private:check(not s.st_mode&0o077,'private evidence mode required')
 if expected:check(sha(path)==expected,'input SHA mismatch')
def write(path,data):
 temp=path.with_name('.'+path.name+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(data,f,indent=2,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,path);fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
def bind(path):filecheck(path);return{'path':str(path),'sha256':sha(path)}
def load_module(path):
 name='qualified_normal_'+Path(path).stem;spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module


def wait_for_process_quiet(pid,ticks,*,budget=20,clock=time.monotonic,pause=time.sleep,observe=None):
 """Only observe a named child until startup sockets drain; never close sockets."""
 if not 0<budget<=20:raise RuntimeError('INVALID_READONLY_QUIET_BUDGET')
 def live():
  proc=Path('/proc')/str(pid)
  if int(proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19])!=ticks:
   raise RuntimeError('QUIET_PROCESS_IDENTITY_CHANGED')
  if os.readlink(proc/'cwd')!='/root/Melamedia/backend' or os.readlink(proc/'exe')!='/usr/bin/node':
   raise RuntimeError('QUIET_PROCESS_OWNER_CHANGED')
  result=subprocess.run(['/usr/bin/ss','-ntpH'],capture_output=True,text=True,timeout=2)
  if result.returncode:raise RuntimeError('QUIET_SOCKET_OBSERVATION_FAILED')
  import re,ipaddress
  rows=[line for line in result.stdout.splitlines() if re.search(r'\bpid='+str(pid)+r'\b',line)]
  for row in rows:
   cells=row.split();host,port=cells[4].rsplit(':',1);address=ipaddress.ip_address(host.strip('[]'))
   if isinstance(address,ipaddress.IPv6Address)and address.ipv4_mapped:address=address.ipv4_mapped
   if not address.is_loopback or port!='5432' or cells[3].rsplit(':',1)[1]=='3003':return False
  return len(rows)<=1
 sample=observe or live;end=clock()+budget;count=0
 while clock()<end:
  count+=1
  if sample():
   if clock()>=end:break
   return {'status':'PASS_READONLY_SOCKET_QUIET','samples':count,'pid':pid,'startTicks':ticks}
  pause(min(.15,max(0,end-clock())))
 raise RuntimeError('READONLY_STARTUP_QUIET_TIMEOUT')

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--approved-normal-return',action='store_true')
 p.add_argument('--origin-sha256',required=True)
 p.add_argument('--ops',type=Path,default=DEFAULT_OPS)
 p.add_argument('--forward-receipt',type=Path,required=True);p.add_argument('--forward-sha',required=True)
 p.add_argument('--frontend-marker',type=Path,required=True)
 p.add_argument('--attempt',default='normal-return-4');p.add_argument('--reserve-seconds',type=int,default=300)
 a=p.parse_args();runroot=None
 state={'status':'PRECHECK','atUtc':now().isoformat(),'automaticFailureRollback':False,'automaticRetry':False,
        'intentionalPaymentOrProviderTestAuthorized':False,'frontendActivationClaimed':False,'normalBehaviorRestored':False}
 try:
  check(a.approved_normal_return and sys.platform=='linux'and os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'approved Linux root python3 -I -S required')
  os.umask(0o077);signal.signal(signal.SIGHUP,signal.SIG_IGN)
  ops=a.ops.resolve(strict=True);check(ops==a.ops and ops==DEFAULT_OPS,'exact staged run2 operator root required')
  check(a.attempt and len(a.attempt)<=48 and all(c.isalnum()or c in '-_'for c in a.attempt),'invalid attempt')
  check(a.reserve_seconds==300,'normal return budget is fixed at300seconds')
  for name,wanted in PINS.items():filecheck(ops/name,wanted,private=False)
  filecheck(a.forward_receipt,a.forward_sha)
  forward=json.loads(a.forward_receipt.read_text())
  check(forward['status']=='PASS_QA_CANDIDATE_BACKEND_PAUSED_DRAIN_SOURCE_STARTUP_HTTP_AND_UNCHANGED_FINANCIAL_MARKERS'
        and forward['normalBehaviorRestored']is False and forward['finalNamedPidStartFlagsCasRechecked']is True,
        'not an actual accepted paused forward outcome')
  module=load_module(ops/'qa_pm2_effective_return_v2.py')
  check(forward['effectivePausedEnvironment']==module.PAUSE,'forward receipt not exact eight-false/GIT8d')
  process=forward['newProcess'];pid=process['pid'];ticks=process['startTicks']
  check(pid>1 and pid!=2983764 and process['cwd']=='/root/Melamedia/backend'and process['exe']=='/usr/bin/node','invalid actual forward child')
  guard_module=load_module(ops/'qa_forward_guard.py')
  child_module=load_module(ops/'qa_owned_child.py')
  origin=guard_module.read_origin(a.origin_sha256)
  check(forward['originBinding']=={'path':str(ops/'cycle4-origin.json'),'sha256':a.origin_sha256}
        and forward['pauseDeadlineUtc']==origin['pauseDeadlineUtc'],'normal return original origin mismatch')
  reference=ops/'forward-run-4/post-paused-snapshot.json';filecheck(reference)
  reference_doc=json.loads(reference.read_text())
  check(reference_doc.get('qaSocketsPid')==pid and reference_doc.get('qaSocketsStartTicks')==ticks,'forward snapshot process binding mismatch')
  reference_rows=module.financial_snapshot(bind(reference),maximum_age_seconds=600)['rows']
  normal_guard=guard_module.ForwardGuard(a.origin_sha256,reference_rows)
  owned_origin={'sha256':a.origin_sha256,
    'deadline_utc':datetime.datetime.fromisoformat(origin['pauseDeadlineUtc']).timestamp(),
    'deadline_monotonic':origin['monotonicDeadlineNs']/1e9,'deadline_monotonic_ns':origin['monotonicDeadlineNs']}
  deadline=datetime.datetime.fromisoformat(forward['pauseDeadlineUtc'])
  started=datetime.datetime.fromisoformat(forward['atUtc'])
  check(0<(deadline-started).total_seconds()<=601,'forward window is not original bounded600seconds')
  def remaining():
   value=normal_guard.remaining();check(0<value<=600,'original QA window expired');return value
  check(remaining()>=a.reserve_seconds,'insufficient remaining original window; no action')
  filecheck(ops/'restore-proof.json');filecheck(ops/'rollback-proof.json');filecheck(ops/'runtime-proof.json')
  marker=a.frontend_marker
  check(marker.is_absolute()and marker.parent.resolve(strict=True)==marker.parent and ops in marker.parents,'frontend marker must be in owned staged operator tree')
  runroot=ops/a.attempt;runroot.mkdir(mode=0o700)
  (runroot/'owned-children').mkdir(mode=0o700)
  state.update(status='WAITING_OPTIONAL_FRONTEND_COMPLETION',forwardReceiptSha256=a.forward_sha,
               actualPausedProcess=process,pauseDeadlineUtc=deadline.isoformat(),reservedReturnSeconds=a.reserve_seconds)
  write(runroot/'progress.json',state)
  wait_until=time.monotonic()  # no optional frontend wait in this backend-only attempt
  marker_seen=False
  while time.monotonic()<wait_until and remaining()>525:
   if marker.exists():
    filecheck(marker);m=json.loads(marker.read_text())
    check(m.get('scope')=='QA_FRONTEND_ACTIVATION_20261102'and m.get('backendSource')==INSTALL
          and m.get('frontendSource')==FRONTEND_SOURCE and m.get('publicationArchiveSha256')==PUBLICATION_SHA,
          'frontend marker identity mismatch; never infer success')
    check(m.get('status')=='PASS_PUBLISHED_STATIC_CAS_AND_HTTPS_READBACK','frontend marker not a completed accepted publication')
    stamp=datetime.datetime.fromisoformat(m['completedAtUtc'])
    check(datetime.datetime.fromisoformat(forward['finishedAtUtc'])<=stamp<=now(),'stale/future frontend marker')
    check(m['backendPassReceiptSha256']==a.forward_sha and m['actualBackendDeadlineUtc']==origin['pauseDeadlineUtc'],'frontend marker backend/origin mismatch')
    expires=datetime.datetime.fromisoformat(m['frontendAcceptanceExpiresAtUtc'])
    check(expires.tzinfo is not None and stamp<=expires<=min(datetime.datetime.fromisoformat(forward['finishedAtUtc'])+datetime.timedelta(seconds=150),deadline-datetime.timedelta(seconds=530)),'frontend marker expiry exceeds protected normal-return boundary')
    state['frontendCompletionMarker']=bind(marker);marker_seen=True;break
   time.sleep(min(1,max(.05,remaining()-525)))
  state['frontendCompletionObserved']=marker_seen
  check(remaining()>=520,'bounded recovery reserve missing before fresh pre-return snapshot; no STOP')
  def run(label,args,cap=35):
   timeout=min(cap,remaining()-5);check(timeout>0,'no command budget remains')
   state.update(status='NORMAL_RETURN_RUNNING',phase=label);write(runroot/'progress.json',state)
   controls={'stop-paused':'normal-stop-paused','resume-effective':'normal-restart-original'}
   frame=dict(owned_origin,unknown_dispatch_ids=(controls[label],)if label in controls else ())
   if label in controls:
    write(runroot/(label+'-dispatch-intent.json'),{'scope':'QA_CYCLE4_NORMAL_DISPATCH_INTENT',
      'originSha256':a.origin_sha256,'dispatchId':controls[label],'atUtc':now().isoformat(),
      'commandSha256':hashlib.sha256(json.dumps(args,separators=(',',':')).encode()).hexdigest()})
   proc=child_module.run_owned(args,max(.1,timeout-10),runroot/'owned-children',label,frame)
   if label in controls:
    write(runroot/(label+'-dispatch-outcome.json'),{'scope':'QA_CYCLE4_NORMAL_DISPATCH_OUTCOME',
      'originSha256':a.origin_sha256,'dispatchId':controls[label],'actualChildExit':proc.returncode,
      'stdoutSha256':hashlib.sha256(proc.stdout).hexdigest(),'reapedProof':proc.reaped_proof,'atUtc':now().isoformat()})
   err=runroot/(label+'-stderr.private.log');fd=os.open(err,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb')as f:f.write(proc.stderr);f.flush();os.fsync(f.fileno())
   try:data=json.loads(proc.stdout)
   except ValueError:raise RuntimeError('unstructured child result; inspect exact state before any retry')from None
   path=runroot/(label+'.json');write(path,data)
   check(proc.returncode==0,'child HOLD/unknown outcome; no automatic retry or rollback')
   return path,data
  def snapshot(label,observed_pid,observed_start):
   args=['/usr/bin/python3','-I','-S',str(ops/'qa_return_drain_snapshot.py'),'--state','paused','--observed-pid',str(observed_pid),'--observed-start',str(observed_start)]
   return run(label,args,30)
  def admission(action,pre,post=None,stop_receipt=None):
   data={'scope':'QA_PM2_EFFECTIVE_RETURN_20261102','action':action,'pm2Id':5,'atUtc':now().isoformat(),
     'boundedWindowSeconds':remaining(),'attempt':a.attempt+'-'+('stop'if action=='stop-paused'else'resume'),
     'authenticatedRestoreVerified':True,'rollbackCapsulesOnHostVerified':True,'freshFinancialSnapshotAccepted':True,
     'localTerminalIntentDispositionAccepted':True,'boundedStableDaemonMonitoringAccepted':True,'waivedCustomerExcluded':True,
     'noUnknownDispatchedOperations':True,'legacyIntegrationRollbackMustRemainStopped':True,
     'originalEffectiveBehaviorReturnAuthorized':True,'intentionalPaymentOrProviderTestAuthorized':False,
     'preStopSnapshot':bind(pre),'evidence':[bind(ops/'restore-proof.json'),bind(ops/'rollback-proof.json'),bind(a.forward_receipt),bind(pre)]}
   if action=='stop-paused':data.update(currentPid=pid,currentStartTicks=ticks,preStopNoBusinessWorkObserved=True)
   else:
    data.update(oldProducersDrained=True,cleanStopVerified=True,candidateSourceVerified=True,callbackRecoveryAcceptedForWindow=True,
                postStopSnapshot=bind(post));data['evidence']+=[bind(post),bind(stop_receipt)]
   path=runroot/(action+'-admission.json');write(path,data);return path
  def transition(action,admitted):
   return run(action,['/usr/bin/python3','-I','-S',str(ops/'qa_pm2_effective_return_v2.py'),action,'--approved-execution',
    '--admission',str(admitted),'--admission-sha',sha(admitted),'--rpc-source',str(ops/'pm2_qa_effective_return_rpc.cjs'),
    '--rpc-source-sha',PINS['pm2_qa_effective_return_rpc.cjs'],'--rpc-pins',str(ops/'pm2_transition_pins.json'),
    '--rpc-pins-sha',PINS['pm2_transition_pins.json']],90 if action=='resume-effective'else 35)
  write(runroot/'pre-sql-budget-admission.json',normal_guard.admit(135,('INSTALL_STOPPED',)))
  pre,pre_data=snapshot('pre-return-stop-snapshot',pid,ticks)
  module.financial_snapshot(bind(pre))
  check(pre_data['qaSocketsPid']==pid and pre_data['qaSocketsStartTicks']==ticks,'fresh snapshot is not actual forward PID/start')
  stop_admission=admission('stop-paused',pre)
  write(runroot/'stop-budget-admission.json',normal_guard.admit(100,('INSTALL_STOPPED',)))
  stop_path,stopped=transition('stop-paused',stop_admission)
  check(stopped['status']=='CLEAN_STOP_MARKERS_AND_NAMED_ENTRY_PASS_POST_FINANCIAL_SNAPSHOT_REQUIRED','STOP not accepted')
  write(runroot/'post-stop-sql-budget-admission.json',normal_guard.admit(30,('INSTALL_STOPPED',)))
  post,post_data=snapshot('post-return-stop-snapshot',pid,ticks)
  comparison=module.unchanged_financial_snapshots(bind(pre),bind(post));write(runroot/'drain-comparison.json',comparison)
  write(runroot/'resume-budget-admission.json',normal_guard.admit(100,('INSTALL_STOPPED','INSTALL_NORMAL_ONLINE')))
  resume_path,resumed=transition('resume-effective',admission('resume-effective',pre,post,stop_path))
  check(resumed['status']=='ORIGINAL_EFFECTIVE_BEHAVIOR_RESTORED_POST_GUARDS_HEALTH_AND_MARKER_RECHECK_REQUIRED','return not accepted')
  state['normalBehaviorRestored']=True;state['effectiveReturnedEnvironment']=resumed['effectiveReturnedEnvironment'];state['restoredProcess']=resumed['newProcess']
  write(runroot/'final-sql-budget-admission.json',normal_guard.admit(30,('INSTALL_NORMAL_ONLINE',)))
  write(runroot/'post-return-quiet.json',wait_for_process_quiet(resumed['newProcess']['pid'],resumed['newProcess']['startTicks']))
  final,final_data=snapshot('post-effective-return-snapshot',resumed['newProcess']['pid'],resumed['newProcess']['startTicks'])
  check(module.financial_snapshot(bind(final))['rows']==module.financial_snapshot(bind(pre),maximum_age_seconds=600)['rows'],'financial/worker rows changed after normal return; inspect without guessing')
  connection=http.client.HTTPConnection('127.0.0.1',3003,timeout=min(5,remaining()))
  try:
   connection.request('GET','/health',headers={'Connection':'close'});response=connection.getresponse();body=response.read(4097)
   check(response.status==200 and len(body)<=4096 and json.loads(body)=={'ok':True},'literal pure health failed')
  finally:connection.close()
  final_locks=[]
  try:
   for i,name in enumerate(['melamedia-release-maintenance','melamedia-legal-melamedia-release']):
    fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);final_locks.append(fd)
    info=os.fstat(fd);check(stat.S_ISREG(info.st_mode)and info.st_uid==0,'unsafe final existing lock')
    fcntl.flock(fd,(fcntl.LOCK_SH if i==0 else fcntl.LOCK_EX)|fcntl.LOCK_NB)
   check(remaining()>0,'original deadline expired before final return CAS')
   module.identity(INSTALL)
   final_owner=module.rpc(ops/'pm2_qa_effective_return_rpc.cjs',PINS['pm2_qa_effective_return_rpc.cjs'],
                          ops/'pm2_transition_pins.json',PINS['pm2_transition_pins.json'],'inspect')['metadata']
   actual=resumed['newProcess']
   check(final_owner['pm_id']==5 and final_owner['name']=='melamedia-api'and final_owner['processStatus']=='online'
         and final_owner['pid']==actual['pid']and final_owner['pm_cwd']=='/root/Melamedia/backend'
         and final_owner['pm_exec_path']=='/root/Melamedia/backend/server.js'
         and final_owner['flags']==module.RETURN_ENV,'final actual named PM2 PID/flags CAS failed')
   module.identity(INSTALL)
   check(module.meta(actual['pid'])==actual and module.selected_flags(actual['pid'])==module.RETURN_ENV
         and remaining()>0,'final returned child/source/config/dependency/start/window CAS failed')
   state['finalNamedPidStartFlagsSourceConfigDependenciesCasRecheckedAfterSqlAndHealth']=True
  finally:
   for fd in reversed(final_locks):os.close(fd)
  state.update(status='PASS_NORMAL_QA_BEHAVIOR_RETURN_ON_NEW_SOURCE_NO_PAYMENT_TEST',finishedAtUtc=now().isoformat(),
    normalReturnReceipt=bind(resume_path),actualBeforeAfterFinancialRowsUnchanged=True,billingGateRestoredEnabled=True,
    storedNineKeyPresenceRestored=True,exactEightBehaviorValuesRestored=True,versionKeyUpdatedToCurrentSource=True,pureHealthStatus=200,frontendActivationClaimed=marker_seen,
    frontendStillPending=not marker_seen,remainingOriginalWindowSeconds=remaining())
 except BaseException as error:
  state.update(status='HOLD_INSPECT_ACTUAL_STATE_NO_AUTOMATIC_RETRY_OR_FAILURE_ROLLBACK',errorType=type(error).__name__,
               reason=str(error),finishedAtUtc=now().isoformat())
 finally:
  if runroot is not None:
   try:write(runroot/'final-result.json',state);write(runroot/'progress.json',state)
   except BaseException:state['receiptWriteFailed']=True
 print(json.dumps(state,sort_keys=True));return 0 if state['status'].startswith('PASS_NORMAL_')else 1
if __name__=='__main__':raise SystemExit(main())
