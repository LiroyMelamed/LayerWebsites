"""Approved bounded QA-only forward sequence; no retries or financial activation."""
import argparse,stat
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time,http.client
from pathlib import Path
sys.dont_write_bytecode=True
P=Path('/tmp/layer-billing-qa-source-20261103-8d897c20-cycle5/transition-cycle4')
R=P/'forward-run-4'
INSTALL='8d897c207d6bd30fdee108a52e0eb3b89f025f03'
EXPECTED={'qa_pm2_transition.py':'aa5461d91b11d90b1379b18bf5f84f7e7bc6b6cd50f0fd5cc99a3e5f40cd6c28','qa_stopped_source_adaptor_journal_v4.py':'4f5e2fbd672b4894ac6bcc059b3535f07b0b02852d7d2d29cbd5241e4d57e8da','pm2_qa_transition_rpc.cjs':'9239af8d2c160d01fa9c9304eb27ad44a0a59800ba1f454f3812658131bf69e7','pm2_transition_pins.json':'c6bebc3ee75b49d48231ff5a9af2303c5875f6789888965d416159fed415166d','qa_drain_snapshot.py':'ef35edbec40b2ed2e0f02bc1e5e305fc113f453c1ba8c3fc570274361765c5d8'}
EXPECTED.update({'qa_return_drain_snapshot.py':'0948aeb31f0df49fd6d4afaec0e1a6c5b430f587cd7719a4813e7116bd6d0683'})
EXPECTED.update({'restore-proof.json': '795ea912346f82bcdbd331f0b5afbcc49ad6f739d82a7b9fbdb822ef10028d3d', 'rollback-proof.json': '4aab4e6cf9d6b177b13687ef03ce5e8fde5638ede08e621c4a484186804d6e9f', 'runtime-proof.json': 'a33a4048bd1139fb39e302985f9b6f3e2970af8a25987021efdb5803b0e81817'})
EXPECTED.update({'qa_evidence_contract.py': 'e351a5253a88bafb5bfddc4f988a607a0a18de4c3a6a9db52f3ff540eca7a7d6', 'qa_fresh_admission.py': 'ccd9dd402b4a1467ac3dcb385a66f517ff865101544d388091de5fdf02fa7225', 'qa_collect_fresh_preflight.py': '06cc96b2c7011520c1389251aee993d8c8b16e7be5bedc954cdd349c80ab706f', 'qa_fresh_host_collector.py': '4c81e43405d749b32953a41af64aebd51541838853296ba05227531fedffec50', 'qa_fresh_quick_health_projection.py': '2185ee8ad71bba90dc9131b740e5f635d8b23d9d57fa401b4476c563b3e784e4', 'runtime-closure-reference.json': '84fd43bd65c9997284f9e86fd8fb44f1d835487c5a773b55c499b2661eb6f6f7', 'runtime-process-reference.json': '3a261a0b6fd089c71501f157fe4ac2489725c9030165aec3a4aeecbb722eedb2'})
EXPECTED.update({'qa_git_journal.py': '0185cea45053e39134c4be1b72e3da2e1b3e28d803e569cf1c4b7ee20b6ffbad', 'qa_failure_core_v3.py': '156e72026040889f9ce88471baf75ae7a329e6a03e7a9d09e2b19ef82ce53711', 'qa_owned_child.py': '2ebac6c18c6b165a3be7c200553c244d5ce3729127cd3bb1854fa4f1da334aab', 'qa_forward_guard.py': '8db37699415d9f0247c96df15a9dee2630579024258232fd0613c09b9010f493', 'qa-untracked-preimage.json': 'f06e842f69bd4938a71733fc8078fa50eb83b0527a21c72b71dc7684a77a4adc'})

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

def H(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc)
def W(p,obj):
 b=(json.dumps(obj,indent=2,sort_keys=True)+'\n').encode();tmp=p.with_name('.'+p.name+'.tmp')
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb')as f:f.write(b);f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
def run(name,args,timeout):
 origin=dict(owned_origin)
 control_ids={'stop':'forward-stop','restart-paused':'forward-restart-paused','source-apply':'forward-source'}
 origin['unknown_dispatch_ids']=(control_ids[name],) if name in control_ids else ()
 if name in control_ids:
  W(R/(name+'-dispatch-intent.json'),{'scope':'QA_CYCLE4_FORWARD_DISPATCH_INTENT','originSha256':fresh_args.origin_sha256,'dispatchId':control_ids[name],'commandSha256':hashlib.sha256(json.dumps(args,separators=(',',':')).encode()).hexdigest(),'atUtc':now().isoformat()})
 # The declared phase cap INCLUDES the child's at-most10second cleanup.
 q=child_module.run_owned(args,max(.1,timeout-10),R/'owned-children',name,origin)
 if name in control_ids:
  W(R/(name+'-dispatch-outcome.json'),{'scope':'QA_CYCLE4_FORWARD_DISPATCH_OUTCOME','originSha256':fresh_args.origin_sha256,'dispatchId':control_ids[name],'actualChildExit':q.returncode,'stdoutSha256':hashlib.sha256(q.stdout).hexdigest(),'reapedProof':q.reaped_proof,'atUtc':now().isoformat()})
 log=R/(name+'-stderr.private.log');fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(q.stderr);f.flush();os.fsync(f.fileno())
 try:x=json.loads(q.stdout)
 except ValueError:raise RuntimeError('PRIVATE_OR_UNSTRUCTURED_COMMAND_FAILED_'+name)from None
 W(R/(name+'.json'),x)
 if q.returncode:raise RuntimeError('PHASE_HOLD_'+name)
 return x
def snapshot(name,phase):return run(name,['/usr/bin/python3','-I','-S',str(P/'qa_drain_snapshot.py'),'--state',phase],35)
def binding(p):return{'path':str(p),'sha256':H(p)}
def evidence(*extra):return[binding(P/n)for n in ['restore-proof.json','rollback-proof.json','runtime-proof.json']]+[binding(p)for p in extra]
def remaining():
 n=forward_guard.remaining() if forward_guard is not None else int(min((deadline-now()).total_seconds(),(origin_info['monotonicDeadlineNs']-time.monotonic_ns())/1e9));assert 0<n<=600,'BOUNDED_WINDOW_EXPIRED';return n
def transition(action,a,name):
 a.update(scope='QA_PM2_BILLING_TRANSITION_20261102',action=action,pm2Id=5,atUtc=now().isoformat(),boundedWindowSeconds=remaining(),attempt='forward-4',authenticatedRestoreVerified=True,rollbackCapsulesOnHostVerified=True,freshFinancialSnapshotAccepted=True,localTerminalIntentDispositionAccepted=True,boundedStableDaemonMonitoringAccepted=True,waivedCustomerExcluded=True,noUnknownDispatchedOperations=True,financialActivationAuthorized=False,legacyIntegrationRollbackMustRemainStopped=True,externalProviderNonpayabilityNotClaimed=True)
 path=R/(name+'-admission.json');W(path,a)
 return run(name,['/usr/bin/python3','-I','-S',str(P/'qa_pm2_transition.py'),action,'--approved-execution','--admission',str(path),'--admission-sha',H(path),'--rpc-source',str(P/'pm2_qa_transition_rpc.cjs'),'--rpc-source-sha',EXPECTED['pm2_qa_transition_rpc.cjs'],'--rpc-pins',str(P/'pm2_transition_pins.json'),'--rpc-pins-sha',EXPECTED['pm2_transition_pins.json']],100)

def bounded_precheck_wait(take_sample, validate_sample, query_pins, *, record=None,
                          clock=time.monotonic, pause=time.sleep,
                          budget_seconds=20.0, maximum_samples=10):
 """Read-only sampling, with injected callbacks for offline verification.

 take_sample(number, remaining_seconds) -> (actual_file_binding, actual_document).
 validate_sample is the UNMODIFIED frozen financial_snapshot validator. A sample
 is accepted only when that validator succeeds; no count or document is edited.
 """
 def need(condition, code):
  if not condition:raise RuntimeError(code)
 need(0<budget_seconds<=20 and 1<=maximum_samples<=10,'PRECHECK_BUDGET_INVALID')
 started=clock();expires=started+budget_seconds;notes=[];reference_rows=None;consecutive=0
 def report(status):
  if record is not None:
   record({'status':status,'budgetSeconds':budget_seconds,'maximumSamples':maximum_samples,
           'requiredConsecutiveValid':3,'elapsedSeconds':round(clock()-started,6),
           'consecutiveValid':consecutive,'samples':list(notes)})
 def nontransient_rows(doc):
  # The original validator checks sockets/active sessions BEFORE business work.
  # Inspect all its later guards too, so an allowed transient cannot mask work.
  need(doc.get('status')=='PASS_READONLY_QA_DRAIN_SNAPSHOT'
       and doc.get('dataWrites')==0 and doc.get('providerCalls')==0
       and doc.get('rawCustomerOrProviderReferencesExported') is False,
       'PRECHECK_SNAPSHOT_CONTRACT_CHANGED')
  need(doc['state']=='running' and doc['sourceHead']=='545779e4b99e111959f4684167dfdf46da1f3186'
       and doc['oldPidPresent'] is True and doc['qaPort3003Listeners']==1
       and doc['snapshotIsolation']=='REPEATABLE READ READ ONLY, ROLLBACK'
       and doc['sourceRole']=='melamedia_app' and doc['sourceDatabase']=='melamedia'
       and doc['absentRelations']==['centralOutbox'],'PRECHECK_IDENTITY_OR_SCHEMA_CHANGED')
  need(all(doc['querySha256'].get(key)==wanted and key in doc['aggregates']
           for key,wanted in query_pins.items()),'PRECHECK_QUERY_INVENTORY_CHANGED')
  rows={key:doc['aggregates'][key] for key in query_pins if key!='roleSessions'}
  sessions=doc['aggregates']['roleSessions']
  need(len(sessions)==1,'PRECHECK_ROLE_SESSION_SHAPE_CHANGED')
  need(all(type(sessions[0][key])is int and sessions[0][key]>=0
           for key in ['sessions','activeTransactions','activeQueries']),
       'PRECHECK_ROLE_SESSION_COUNTS_INVALID')
  sockets=doc['qaSockets']
  need(all(sockets[key]==0 for key in ['httpPortConnections','nonloopbackConnections','otherLoopbackConnections']),
       'PRECHECK_BUSINESS_OR_NONLOCAL_SOCKET_REMAINS')
  need(type(sockets['loopbackDbConnections'])is int and sockets['loopbackDbConnections']>=0,
       'PRECHECK_DB_SOCKET_COUNT_INVALID')
  need(sum(row['count']for row in rows['paymentIntents'])==2 and
       all(row['status']=='succeeded'and row['pendingWithoutProviderReference']==0
           for row in rows['paymentIntents']),'PRECHECK_PAYMENT_WORK_REMAINS')
  need(len(rows['billingCandidates'])==1 and
       all(rows['billingCandidates'][0][key]==0 for key in
           ['billingEnabled','autoRenewEnabled','activeDueCandidates','pastDueRetryCandidates']),
       'PRECHECK_BILLING_WORK_REMAINS')
  need(len(rows['activeMethodCounts'])==1 and rows['activeMethodCounts'][0]['active']==0
       and rows['signupStates']==[] and rows['welcomeStates']==[],
       'PRECHECK_CARD_SIGNUP_OR_WELCOME_WORK_REMAINS')
  for group,fields in {'signingJobs':['liveLeases','staleRunning','duePendingOrRetry'],
                       'signingErrorEmails':['liveLeases'],
                       'integrationClaims':['dispatchClaims','courtDue'],
                       'whatsappJobs':['due','recipientSendingRows'],
                       'signingOtp':['unexpiredPending']}.items():
   need(all(row[key]==0 for row in rows[group]for key in fields),
        'PRECHECK_WORKER_CLAIM_REMAINS')
  need(sum(row['rows']for row in rows['signingDeliveries']if row['state']=='pending')==38,
       'PRECHECK_PRESERVED_DELIVERIES_CHANGED')
  need(rows['intentMarkers'][0]['rows']==2 and rows['paymentEventMarkers'][0]['rows']==4,
       'PRECHECK_FINANCIAL_MARKER_COUNTS_CHANGED')
  return rows
 for number in range(1,maximum_samples+1):
  left=expires-clock()
  if left<=0:report('HOLD_PRECHECK_DEADLINE');raise RuntimeError('PRECHECK_DEADLINE_EXHAUSTED')
  note={'sample':number,'strictValid':False};notes.append(note)
  try:
   bound,doc=take_sample(number,left);note['binding']=dict(bound)
   failure=None;validated=None
   try:validated=validate_sample(bound)
   except RuntimeError as error:
    if str(error)not in ['observed QA business/nonlocal socket remains',
                        'active target-role transaction/query remains']:raise
    failure=str(error)
   rows=nontransient_rows(doc)
   row_bytes=json.dumps(rows,sort_keys=True,separators=(',',':'))
   if reference_rows is None:reference_rows=row_bytes
   need(reference_rows==row_bytes,'PRECHECK_BUSINESS_ROWS_CHANGED')
   sockets=doc['qaSockets'];sessions=doc['aggregates']['roleSessions'][0]
   if failure=='observed QA business/nonlocal socket remains':
    need(sockets['loopbackDbConnections']>1,'PRECHECK_UNCLASSIFIED_SOCKET_FAILURE')
   elif failure=='active target-role transaction/query remains':
    need(sockets['loopbackDbConnections']<=1 and
         (sessions['activeTransactions']>0 or sessions['activeQueries']>0),
         'PRECHECK_UNCLASSIFIED_SESSION_FAILURE')
   else:
    need(validated['rows']==rows,'PRECHECK_VALIDATOR_ROW_MISMATCH')
   need(clock()<expires,'PRECHECK_DEADLINE_EXHAUSTED')
   if failure is not None:
    consecutive=0;note.update(transientFailure=failure,consecutiveValid=0)
   else:
    consecutive+=1;note.update(strictValid=True,consecutiveValid=consecutive)
   report('PASS_THREE_STRICT_SAMPLES'if consecutive==3 else'WAIT_READONLY_PRECHECK')
   if consecutive==3:
    need(clock()<expires,'PRECHECK_DEADLINE_EXHAUSTED')
    return {'binding':bound,'document':doc,'rows':rows,'samples':list(notes)}
  except BaseException as error:
   note['holdErrorType']=type(error).__name__;report('HOLD_PRECHECK_SAMPLE');raise
  if number<maximum_samples:
   left=expires-clock()
   if left>0:pause(min(.5,left))
 report('HOLD_PRECHECK_SAMPLE_LIMIT')
 raise RuntimeError('PRECHECK_SAMPLE_LIMIT_EXHAUSTED')

fresh_parser=argparse.ArgumentParser(description='QA cycle4; explicit execution and fresh bound observations required')
fresh_parser.add_argument('--approved-cycle4-execution',action='store_true')
fresh_parser.add_argument('--origin-sha256',required=True)
for key in ['fresh-host-sha256','fresh-quick-sha256','fresh-collection-sha256']:fresh_parser.add_argument('--'+key,required=True)
fresh_args=fresh_parser.parse_args()
assert fresh_args.approved_cycle4_execution and sys.platform=='linux'and os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'ADMITTED_LINUX_ROOT_REQUIRED'
assert all(re.fullmatch('[0-9a-f]{64}',getattr(fresh_args,key))for key in ['fresh_host_sha256','fresh_quick_sha256','fresh_collection_sha256'])
os.umask(0o077)
for n,h in EXPECTED.items():assert H(P/n)==h
restore=json.loads((P/'restore-proof.json').read_text())
rollback=json.loads((P/'rollback-proof.json').read_text())
runtime=json.loads((P/'runtime-proof.json').read_text())
evidence_spec=importlib.util.spec_from_file_location('pinned_cycle4_historical_evidence',str(P/'qa_evidence_contract.py'))
evidence_module=importlib.util.module_from_spec(evidence_spec);evidence_spec.loader.exec_module(evidence_module)
evidence_validation=evidence_module.validate_evidence_contract(restore,rollback,runtime)

def read_private_fixed(name,expected_sha=None,maximum=2*1024*1024):
 p=P/name;s=p.lstat()
 assert p.resolve(strict=True)==p and stat.S_ISREG(s.st_mode) and s.st_uid==0 and not s.st_mode&0o077 and s.st_nlink==1 and s.st_size<=maximum,'FRESH_FIXED_FILE_METADATA_HOLD'
 raw=p.read_bytes()
 if expected_sha is not None:assert hashlib.sha256(raw).hexdigest()==expected_sha,'FRESH_FIXED_FILE_SHA_HOLD'
 return raw

def current_fresh_admission():
 full_bytes=read_private_fixed('fresh-host-binding-summary.json',fresh_args.fresh_host_sha256)
 quick_bytes=read_private_fixed('fresh-quick-health-projection.json',fresh_args.fresh_quick_sha256)
 collection_bytes=read_private_fixed('fresh-preflight-collection.json',fresh_args.fresh_collection_sha256)
 full=json.loads(full_bytes);quick=json.loads(quick_bytes);collection=json.loads(collection_bytes)
 assert collection['status']=='COLLECTED_FRESH_OBSERVATIONS_VALIDATION_AND_FINAL_CAS_STILL_REQUIRED'
 assert collection['collectorDispatchAttempts']==collection['completedCollectorExecutions']==2
 assert collection['localExecutionNotSsh']is True and collection['freshSchemaContainsNoSshSuccessClaim']is True
 assert collection['intentionalProviderCalls']==collection['databaseCalls']==collection['processActions']==0
 expected_names={'fresh-host-raw.private.json','fresh-quick-raw.private.json'}
 raw_records={Path(row['path']).name:row for row in collection['privateRaw']}
 assert set(raw_records)==expected_names and len(collection['privateRaw'])==2
 for name in ['full','quick']:
  row=collection[name];wanted='fresh-host-binding-summary.json'if name=='full'else'fresh-quick-health-projection.json'
  assert row['path']==str(P/wanted) and row['sha256']==(fresh_args.fresh_host_sha256 if name=='full'else fresh_args.fresh_quick_sha256)
 for row in collection['childMetadata']:assert row['localExit']==0 and row['localChildOnly']is True and row['sshExecuted']is False
 assert len(collection['childMetadata'])==2
 raw=[]
 for name in ['fresh-host-raw.private.json','fresh-quick-raw.private.json']:
  row=raw_records[name];assert row['path']==str(P/name)
  value=read_private_fixed(name,row['sha256'],64*1024*1024);assert len(value)==row['bytes'];raw.append(value)
 spec=importlib.util.spec_from_file_location('pinned_cycle4_fresh_gate',str(P/'qa_fresh_admission.py'))
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 result=module.validate_fresh_admission(full,quick,json.loads((P/'runtime-closure-reference.json').read_text()),json.loads((P/'runtime-process-reference.json').read_text()),now=now(),full_raw_bytes=raw[0],quick_raw_bytes=raw[1])
 result['actualCollectionReceiptSha256']=fresh_args.fresh_collection_sha256
 result['fixedPrivateRawFilesVerified']=True
 return result

def load_pinned_helper(name):
 p=P/name;read_private_fixed(name,EXPECTED[name])
 module_name='cycle4_'+name.replace('.','_')
 spec=importlib.util.spec_from_file_location(module_name,p)
 module=importlib.util.module_from_spec(spec);sys.modules[module_name]=module
 spec.loader.exec_module(module);return module

assert re.fullmatch('[0-9a-f]{64}',fresh_args.origin_sha256),'ORIGINAL_ORIGIN_SHA_REQUIRED'
guard_module=load_pinned_helper('qa_forward_guard.py')
child_module=load_pinned_helper('qa_owned_child.py')
origin_info=guard_module.read_origin(fresh_args.origin_sha256)
owned_origin={'sha256':fresh_args.origin_sha256,
 'deadline_utc':datetime.datetime.fromisoformat(origin_info['pauseDeadlineUtc']).timestamp(),
 'deadline_monotonic':origin_info['monotonicDeadlineNs']/1e9,
 'deadline_monotonic_ns':origin_info['monotonicDeadlineNs']}
forward_guard=None
fresh_validation=current_fresh_admission()
RESERVE_FILE_PINS = {'integration-2378c2803ead8babcf0712dea8ab5f9e96c3b0e7.backend-source.manifest.json': {'bytes': 181738, 'sha256': '2f35943a78cafa483e0405088ac5bd54ee2f52878ed25256e824d41634b10325'}, 'integration-2378c2803ead8babcf0712dea8ab5f9e96c3b0e7.backend-source.tar.gz': {'bytes': 2444973, 'sha256': '7c2a6dcfb57458b6baebc7e1edfb5685a6f702a42f2d21feaa08c2b1b6c58cea'}, 'pinned6fab-19b283433cf8774e2bdd697568e8065a2bcaa1ba.backend-source.manifest.json': {'bytes': 182391, 'sha256': 'ec62eb3938c1cc1c26caa52439974bba65ade37aa6529686a73ecd60c0d456e9'}, 'pinned6fab-19b283433cf8774e2bdd697568e8065a2bcaa1ba.backend-source.tar.gz': {'bytes': 2462039, 'sha256': 'ea683652ef5907a814e9dda5814900a75b70a27b3952a09f95d05c04c7f63e23'}, 'pinned9dd-7c3131f2b87bcbf69d2e0fb2650aa6d6ab7aef51.backend-source.manifest.json': {'bytes': 182168, 'sha256': '8e41bfcfa93df3cd526c76db0c1d4da306ffc6af8d6d7435ec936f9c30f58c09'}, 'pinned9dd-7c3131f2b87bcbf69d2e0fb2650aa6d6ab7aef51.backend-source.tar.gz': {'bytes': 2460480, 'sha256': '3fa314c9995ccb496808a0b4d9ea21568508cd4eeb87e8337f9152206592a8e7'}, 'fresh-binding-comparison.json': {'bytes': 19869, 'sha256': '9e386018e0256f2104814cf73186d724240c379caf2ffddb97a031f5f86f681f'}, 'qa-host-runtime-reference.json': {'bytes': 3086, 'sha256': '3d59e1b99e691c92288e01aea14bcfd827f98a5ed14e09b92907a08a6a6a5e7c'}, 'transport-manifest.json': {'bytes': 3771, 'sha256': '5a399cc3ca0c637e4e1383016e3a3bc284fb8fa3a5fe6443543baaac1423a612'}}
reserve_root=Path('/tmp/layer-billing-qa-rollback-reserves-20261102-074df752')
assert reserve_root.is_dir()and not reserve_root.is_symlink()
for name,pin in RESERVE_FILE_PINS.items():
    f=reserve_root/name
    assert f.is_file()and not f.is_symlink()and f.stat().st_size==pin['bytes']and H(f)==pin['sha256']
for row in rollback['reserves']:
    archives=list(reserve_root.glob('*'+row['sourceCommit']+'.backend-source.tar.gz'))
    assert len(archives)==1 and not archives[0].is_symlink()
    manifest=archives[0].with_name(archives[0].name.replace('.tar.gz','.manifest.json'))
    assert manifest.is_file()and not manifest.is_symlink()
    content=json.loads(manifest.read_text());assert content['sourceCommit']==row['sourceCommit']and content['runtimeGitBlobMapDigest']==row['runtimeDigest']
R.mkdir(mode=0o700)
(R/'owned-children').mkdir(mode=0o700)
state={'status':'RUNNING','phase':'PRECHECK','atUtc':now().isoformat(),'sourceTarget':INSTALL,'financialActivation':False,'automaticRetry':False,'automaticRollback':False,'productionChanges':0,'waivedCustomerChanges':0}
state['originBinding']={'path':str(P/'cycle4-origin.json'),'sha256':fresh_args.origin_sha256}
W(R/'progress.json',state)
W(R/'historical-evidence-contract.json',evidence_validation)
W(R/'initial-fresh-admission.json',fresh_validation)
spec=importlib.util.spec_from_file_location('reviewed_transition',str(P/'qa_pm2_transition.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
deadline=datetime.datetime.fromisoformat(origin_info['pauseDeadlineUtc'])
try:
 def take_precheck_sample(number,timeout):
  label='pre-stop-sample-%02d'%number
  try:doc=run(label,['/usr/bin/python3','-I','-S',str(P/'qa_drain_snapshot.py'),'--state','running'],timeout)
  except BaseException as error:
   if not (R/(label+'.json')).exists():
    W(R/(label+'.json'),{'status':'HOLD_READONLY_SAMPLE_CAPTURE','sample':number,
                        'errorType':type(error).__name__})
   raise
  return binding(R/(label+'.json')),doc
 accepted=bounded_precheck_wait(take_precheck_sample,mod.financial_snapshot,mod.DRAIN_QUERY_PINS,
                               record=lambda report:W(R/'precheck-wait.json',report))
 before=accepted['document'];W(R/'pre-stop-snapshot.json',before)
 pre=binding(R/'pre-stop-snapshot.json');pre_valid=mod.financial_snapshot(pre)
 forward_guard=guard_module.ForwardGuard(fresh_args.origin_sha256,pre_valid['rows'])
 fresh_validation=current_fresh_admission();W(R/'pre-stop-fresh-admission.json',fresh_validation)
 state.update(phase='ABOUT_TO_STOP',pauseDeadlineUtc=deadline.isoformat());W(R/'progress.json',state)
 W(R/'stop-budget-admission.json',forward_guard.admit(100,('BASE_ONLINE','BASE_STOPPED')))
 stopped=transition('stop',{'preStopNoBusinessWorkObserved':True,'preStopSnapshot':pre,'evidence':evidence(R/'pre-stop-snapshot.json')},'stop')
 assert stopped['status']=='CLEAN_STOP_MARKERS_AND_NAMED_ENTRY_PASS_POST_FINANCIAL_SNAPSHOT_REQUIRED'
 state['phase']='OLD_PROCESS_CLEANLY_STOPPED';W(R/'progress.json',state)
 post=snapshot('post-stop-snapshot','stopped');post_binding=binding(R/'post-stop-snapshot.json')
 compared=mod.unchanged_financial_snapshots(pre,post_binding);W(R/'drain-comparison.json',compared)
 state['phase']='OLD_PROCESS_DRAIN_PROVEN';W(R/'progress.json',state)
 a={'scope':'QA_STOPPED_BILLING_SOURCE_20261102','target':'melamedia-api','pm2Id':5,'cwd':'/root/Melamedia/backend','script':'/root/Melamedia/backend/server.js','sourceBefore':'545779e4b99e111959f4684167dfdf46da1f3186','sourceAfter':INSTALL,'boot':'79d5ef26-007c-4ee2-bfba-15db6bd5b1aa','daemonPid':948103,'daemonStartTicks':48642921,'atUtc':now().isoformat(),'boundedWindowSeconds':remaining(),'authenticatedRestoreVerified':True,'threeInactiveRollbackVersionsVerified':True,'rollbackCapsulesOnHostVerified':True,'legacyIntegrationRollbackMustRemainStopped':True,'postStopFinancialMarkersUnchanged':True,'oldProducersDrained':True,'namedQaStopClean':True,'samePm2EntryRetainedStopped':True,'noUnknownDispatchedOperations':True,'callbackRecoveryAcceptedForWindow':True,'issuedPageDispositionAcceptedForWindow':True,'existingLocksAndStableDaemonMonitored':True,'effectivePausedEnvironment':mod.PAUSE,'financialActivationAuthorized':False,'preStopSnapshot':pre,'postStopSnapshot':post_binding,'externalProviderNonpayabilityNotClaimed':True,'evidence':evidence(R/'pre-stop-snapshot.json',R/'post-stop-snapshot.json',R/'stop.json',R/'drain-comparison.json')}
 a.update(originBinding={'path':str(P/'cycle4-origin.json'),'sha256':fresh_args.origin_sha256},originalDeadlineUtc=origin_info['pauseDeadlineUtc'])
 ap=R/'source-admission.json';W(ap,a)
 W(R/'source-budget-admission.json',forward_guard.admit(110,('BASE_STOPPED','INSTALL_STOPPED','MIXED_STOPPED')))
 installed=run('source-apply',['/usr/bin/python3','-I','-S',str(P/'qa_stopped_source_adaptor_journal_v4.py'),'apply-stopped','--approved-execution','--admission',str(ap),'--admission-sha',H(ap)],110)
 assert installed['status']=='SOURCE_INSTALLED_QA_REMAINS_STOPPED_NOT_ACTIVATED'
 state['phase']='CANDIDATE_SOURCE_INSTALLED_STOPPED';W(R/'progress.json',state)
 W(R/'start-budget-admission.json',forward_guard.admit(100,('INSTALL_STOPPED','INSTALL_PAUSED')))
 restarted=transition('restart-paused',{'oldProducersDrained':True,'cleanStopVerified':True,'candidateSourceVerified':True,'callbackRecoveryAcceptedForWindow':True,'preStopSnapshot':pre,'postStopSnapshot':post_binding,'evidence':evidence(R/'pre-stop-snapshot.json',R/'post-stop-snapshot.json',R/'stop.json',R/'source-apply.json')},'restart-paused')
 assert restarted['status']=='PAUSED_CANDIDATE_STARTED_POST_GUARDS_HEALTH_AND_503_SMOKE_STILL_REQUIRED'
 state['phase']='CANDIDATE_STARTED_EFFECTIVELY_PAUSED';W(R/'progress.json',state)
 W(R/'http-budget-admission.json',forward_guard.admit(20,('INSTALL_PAUSED',)))
 probes=[]
 for method,path,expected in [('GET','/health',200),('GET','/api/webhooks/payments/takbull',503),('POST','/api/webhooks/payments/takbull',503),('GET','/api/public/signup/config',200)]:
  conn=http.client.HTTPConnection('127.0.0.1',3003,timeout=5)
  conn.request(method,path,body='{}'if method=='POST'else None,headers={'Host':'api-melamedia.mela-media.co.il','Origin':'https://melamedia.mela-media.co.il','Content-Type':'application/json','Connection':'close'})
  response=conn.getresponse();body=response.read(16385);assert len(body)<=16384
  value=json.loads(body);assert response.status==expected
  if expected==503:assert value.get('error')=='BILLING_OPERATIONS_PAUSED'and response.getheader('Retry-After')=='60'
  if path=='/health':assert value.get('ok')is True
  if path.endswith('/config'):assert value.get('available')is False
  probes.append({'method':method,'path':path,'status':response.status,'bodySha256':hashlib.sha256(body).hexdigest(),'pausedError':value.get('error'),'retryAfter':response.getheader('Retry-After')});conn.close()
 W(R/'http-smoke.json',{'status':'PASS','probes':probes,'requestsWithCustomerOrProviderReferences':0,'providerRequests':0})
 W(R/'paused-snapshot-budget-admission.json',forward_guard.admit(35,('INSTALL_PAUSED',)))
 W(R/'post-paused-quiet.json',wait_for_process_quiet(restarted['newProcess']['pid'],restarted['newProcess']['startTicks']))
 paused=run('post-paused-snapshot',['/usr/bin/python3','-I','-S',str(P/'qa_return_drain_snapshot.py'),'--state','paused','--observed-pid',str(restarted['newProcess']['pid']),'--observed-start',str(restarted['newProcess']['startTicks'])],30)
 assert paused['qaSocketsPid']==restarted['newProcess']['pid'] and paused['qaSocketsStartTicks']==restarted['newProcess']['startTicks'],'PAUSED_SNAPSHOT_PROCESS_MISMATCH'
 v=mod.financial_snapshot(binding(R/'post-paused-snapshot.json'));assert v['rows']==mod.financial_snapshot(pre,maximum_age_seconds=600)['rows']
 W(R/'final-cas-budget-admission.json',forward_guard.admit(20,('INSTALL_PAUSED',)))
 final_locks=[]
 try:
  for lock_name,lock_mode in [('melamedia-release-maintenance',fcntl.LOCK_SH),('melamedia-legal-melamedia-release',fcntl.LOCK_EX)]:
   fd=os.open('/run/lock/'+lock_name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,lock_mode|fcntl.LOCK_NB);final_locks.append(fd)
  mod.identity(INSTALL)
  latest=mod.rpc(P/'pm2_qa_transition_rpc.cjs',EXPECTED['pm2_qa_transition_rpc.cjs'],P/'pm2_transition_pins.json',EXPECTED['pm2_transition_pins.json'],'inspect')['metadata']
  assert latest['pm_id']==5 and latest['name']=='melamedia-api'and latest['processStatus']=='online'
  assert latest['pid']==restarted['newProcess']['pid']and latest['flags']==mod.PAUSE
  assert mod.meta(latest['pid'])==restarted['newProcess']and mod.selected_flags(latest['pid'])==mod.PAUSE
  clean=subprocess.run(['/usr/bin/git','-c','core.fsmonitor=false','-C','/root/Melamedia','status','--porcelain','--untracked-files=no'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','GIT_OPTIONAL_LOCKS':'0'})
  assert clean.returncode==0 and clean.stdout.strip()==''
  assert os.readlink('/root/Melamedia/backend/node_modules')=='/root/qa-new-features-20261023-5ce621ee/staging/source02/backend/node_modules'
  assert H(Path('/root/Melamedia/backend/package-lock.json'))=='d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651'
  assert H(Path('/root/Melamedia/backend/node_modules/.package-lock.json'))=='bf476467ea9c57c366d6a610852233c85505ae450a25b95919165c44bf7b249f'
  final_identity={'status':'PASS_FINAL_NAMED_PID_START_FLAGS_SOURCE_CONFIG_DEPENDENCY_CAS','atUtc':now().isoformat(),'metadata':latest,'process':mod.meta(latest['pid']),'effectiveFlags':mod.selected_flags(latest['pid']),'trackedTreeClean':True}
  W(R/'final-identity-cas.json',final_identity)
  state.update(status='PASS_QA_CANDIDATE_BACKEND_PAUSED_DRAIN_SOURCE_STARTUP_HTTP_AND_UNCHANGED_FINANCIAL_MARKERS',phase='BACKEND_ACCEPTED_PAUSED',finishedAtUtc=now().isoformat(),newProcess=final_identity['process'],effectivePausedEnvironment=final_identity['effectiveFlags'],actualPrePostStopRowsUnchanged=True,actualAfterStartupRowsUnchanged=True,finalNamedPidStartFlagsCasRechecked=True,httpSmokeProbes=len(probes),externalProviderDispositionNotClaimed=True,frontendActivated=False,normalBehaviorRestored=False,remainingWindowSeconds=remaining())
 finally:
  for fd in reversed(final_locks):os.close(fd)
except BaseException as e:
 state.update(status='HOLD_INSPECT_ACTUAL_STATE_BEFORE_ANY_RETRY',failureType=type(e).__name__,failureCode=str(e)if re.fullmatch('[A-Z0-9_]+',str(e))else'PRIVATE_PHASE_FAILURE',finishedAtUtc=now().isoformat())
finally:
 W(R/'final-result.json',state);W(R/'progress.json',state)
print(json.dumps(state));sys.exit(0 if state['status'].startswith('PASS_')else 1)
