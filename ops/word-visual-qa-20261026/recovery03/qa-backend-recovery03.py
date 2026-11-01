#!/usr/bin/env python3
"""Default local plan. Explicit sealed recovery verification; no runtime mutation.

Adopts the observed state after the original apply failed its public health probe.
Never recreates apply.result, reapplies SQL, changes source/env or restarts PM2.
"""
import argparse, ast, base64, datetime, hashlib, json, os, types
from pathlib import Path
import re, stat, subprocess, uuid

OUT = Path(__file__).resolve().parent
ORIGINAL = OUT / 'qa-backend-release02.py'
ORIGINAL_SHA = 'bf4369a26ec6284419bbc848ed4d3b9fb37a200e28d2638256322657e2f93dc3'
ORIGINAL_CONTRACT_SHA = '1f3a95fdf920b45eadc452b0ad07aa098b83dad5228b134ae3e1816139504c70'
FAILED_RECEIPT_SHA = 'c89673b3c3f47019c85c8d2d493323aeaf37a0e7a1e77529fa21e672bc8dbb10'
CHECKPOINT_RECEIPT_SHA = '6c4d1f10d8be45d8089ac52ce964367308f9a0a91d000992e29a806e994170d9'
OBSERVER_SHA = 'adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
CANDIDATE = '9afc07adde83eae7ead026315dc9291851892cdf'
PID, RESTARTS = 1610075, 9
TARGET = {'host':'root@37.60.230.148','root':'/root/Melamedia','database':'melamedia',
          'pm2Id':5,'pm2Name':'melamedia-api','branchState':'DETACHED'}
RESULT = 'QA_BACKEND_RECOVERY_VERIFY_DEDICATED_ONLY'
KIND = 'QA_ONLY_BACKEND_RELEASE_RECOVERY'
USER_AGENT = 'Mela-QA-readonly-observe/1'
LEDGERS = [Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs') / p for p in
    ('signing-implementation-20261007/TEST-LEDGER.md','office-whatsapp-20261023/TEST-LEDGER.md')]
sha = lambda raw: hashlib.sha256(raw).hexdigest()
canonical = lambda value: json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def require(ok, code):
    if not ok: raise ValueError(code)
def bound(binding):
    require(isinstance(binding,dict) and set(binding)=={'path','sha256'} and re.fullmatch('[a-f0-9]{64}',binding['sha256']), 'EVIDENCE_BINDING')
    p=Path(binding['path']);require(p.is_file() and not p.is_symlink(),'EVIDENCE_FILE')
    raw=p.read_bytes();require(len(raw)<=4*1024*1024 and sha(raw)==binding['sha256'],'EVIDENCE_HASH_OR_BOUND');return raw
def original_module():
    require(sha(ORIGINAL.read_bytes())==ORIGINAL_SHA,'ORIGINAL_OPERATOR_DRIFT')
    module=types.ModuleType('pinned_original_recovery_helpers');module.__file__=str(ORIGINAL)
    exec(compile(ORIGINAL.read_bytes(),str(ORIGINAL),'exec'),module.__dict__);return module

def load_contract(path):
    raw=path.read_bytes();require(len(raw)<=4*1024*1024,'RECOVERY_CONTRACT_BOUND');r=json.loads(raw)
    require(set(r)=={'schema','target','candidateCommit','originalContract','checkpointReceipt','failedApplyReceipt','postFailureObservation','seal'},'RECOVERY_CONTRACT_KEYS')
    require(r['schema']==1 and r['target']==TARGET and r['candidateCommit']==CANDIDATE,'FIXED_RECOVERY_TARGET')
    base=original_module();oldraw=bound(r['originalContract']);require(sha(oldraw)==ORIGINAL_CONTRACT_SHA,'ORIGINAL_CONTRACT_REQUIRED')
    old,_=base.load_contract(Path(r['originalContract']['path']))
    require(old['source']['candidateCommit']==CANDIDATE and old['target']==TARGET,'ORIGINAL_CANDIDATE_TARGET')
    cp=json.loads(bound(r['checkpointReceipt']));failure=json.loads(bound(r['failedApplyReceipt']));ob=json.loads(bound(r['postFailureObservation']))
    require(r['checkpointReceipt']['sha256']==CHECKPOINT_RECEIPT_SHA and r['failedApplyReceipt']['sha256']==FAILED_RECEIPT_SHA,'EXACT_ORIGINAL_RECEIPTS_REQUIRED')
    for item,phase,result,code in [(cp,'checkpoint','CHECKPOINT_VERIFIED_NO_ACTIVATION',0),(failure,'apply','FAILED_FORWARD_REPAIR_REQUIRED',1)]:
        require(item.get('kind')=='QA_ONLY_BACKEND_RELEASE' and item.get('phase')==phase and item.get('result')==result
            and item.get('driverSha256')==ORIGINAL_SHA and item.get('contractSha256')==ORIGINAL_CONTRACT_SHA
            and item.get('candidateCommit')==CANDIDATE and item.get('target')==TARGET and item.get('sshAttempted') is True
            and type(item.get('transportExitCode')) is int and item['transportExitCode']==code,'ORIGINAL_RECEIPT_BINDING')
        require(item['remote'].get('phase')==phase and item['remote'].get('result')==result
            and item['remote'].get('contractSha256')==ORIGINAL_CONTRACT_SHA,'ORIGINAL_REMOTE_BINDING')
    require(failure['remote'].get('errorCode')=='QA_HEALTH_NOT_READY' and failure['remote'].get('partialPhasePossible') is True,'EXACT_INTERRUPTED_APPLY_FAILURE')
    observation=ob['observation'];state=observation['after'];own=state['pm2']['own']
    require(observation.get('stateStable') is True and observation.get('before')==state,'POST_FAILURE_OBSERVATION_UNSTABLE')
    require(state['source']['head']==CANDIDATE and state['source']['branch']=='DETACHED' and state['source']['trackedClean'] is True
        and state['source']['backendFiles']==old['source']['candidateBackendHashes'],'OBSERVED_CANDIDATE_SOURCE')
    require(own['pid']==PID and own['restarts']==RESTARTS and own['unstableRestarts']==0 and own['status']=='online'
        and own['pmId']==5 and own['name']=='melamedia-api' and own['execMode']=='fork_mode'
        and own['instances'] in (None,1) and own['watchExactlyFalse'] is True
        and sum(p['name']=='melamedia-api' for p in state['pm2']['processes'])==1,'EXACT_OBSERVED_RECOVERY_PROCESS')
    health=observation['health'];require(all(health[k]['status']==200 for k in ('local','public'))
        and health['local']['bodySha256']==health['public']['bodySha256'],'OBSERVED_HEALTH_REQUIRED')
    require(observation['resources']['meetsConservativeAvailableMemoryGate'] is True,'OBSERVED_HEADROOM_REQUIRED')
    at=datetime.datetime.fromisoformat(ob['at'].replace('Z','+00:00'))
    require(at.tzinfo is not None and at.utcoffset()==datetime.timedelta(0)
        and 0<=(datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()<=1800,'FRESH_POST_FAILURE_OBSERVATION_REQUIRED')
    seal=r['seal'];require(set(seal)=={'status','operatorSha256','originalOperatorSha256','observerSha256','reviews'}
        and seal['status']=='SEALED' and seal['operatorSha256']==sha(Path(__file__).read_bytes())
        and seal['originalOperatorSha256']==ORIGINAL_SHA and seal['observerSha256']==OBSERVER_SHA,'SEALED_RECOVERY_CODE_REQUIRED')
    require(set(seal['reviews'])=={'root','independent'},'TWO_RECOVERY_REVIEWS_REQUIRED')
    for proof in seal['reviews'].values():
        review=json.loads(bound(proof));require(review=={'decision':'APPROVE','scope':KIND,'operatorSha256':seal['operatorSha256'],
            'originalOperatorSha256':ORIGINAL_SHA,'observerSha256':OBSERVER_SHA},'RECOVERY_REVIEW_BINDING')
    intent={'contractSha256':ORIGINAL_CONTRACT_SHA,'phase':'apply','state':'INTENT'}
    provenance={'originalOperatorSha256':ORIGINAL_SHA,'originalContractSha256':ORIGINAL_CONTRACT_SHA,'candidateCommit':CANDIDATE,
        'failedApplyReceipt':r['failedApplyReceipt'],'failurePhase':'apply','failureResult':'FAILED_FORWARD_REPAIR_REQUIRED',
        'failureErrorCode':'QA_HEALTH_NOT_READY','applyResultAbsent':True,'checkpointVerified':True,'observedPid':PID,'observedRestarts':RESTARTS,
        'checkpointResultSha256':sha(canonical(cp['remote'])),'applyIntentSha256':sha(canonical(intent)),
        'applyFailureRecordSha256':sha(canonical(failure['remote']))}
    req={'expectedState':state,'expectedCheckpointSha256':provenance['checkpointResultSha256'],
        'expectedFailure':failure['remote'],'expectedIntent':intent,'provenance':provenance,
        'expectedHealthSha256':health['local']['bodySha256'],'historicalObservationResult':observation.get('result')}
    return r,raw,oldraw,base,req

# Exact function source segments from pinned02. No fetch/merge/migration/restart,
# restore, baseline mutation or old apply/verify entrypoint is transported.
HELPERS = ('private_file','read_json','stage_ready','checkpoint_artifact','effective_env_hash','peer','history','dedicated',
           'resource_gate','observe','checkpoint','own_controls','nonqa','after_schema','target_source','invariant_controls','check_worktree_guard')
def selected_helpers(base):
    tree=ast.parse(base.REMOTE_RELEASE);functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
    return '\n\n'.join(ast.get_source_segment(base.REMOTE_RELEASE,functions[name]) for name in HELPERS)

REMOTE = r'''
def interrupted_facts():
    require(not os.path.lexists(STAGE/'apply.result.json'),'ORIGINAL_APPLY_RESULT_MUST_REMAIN_ABSENT')
    saved=checkpoint();require(digest(canonical(saved))==REQ['expectedCheckpointSha256'],'ORIGINAL_CHECKPOINT_RECEIPT_DRIFT')
    require({k:saved['baseline'][k] for k in C['baselineState']}==C['baselineState'],'ORIGINAL_BASELINE_DRIFT')
    intent=read_json(STAGE/'apply.intent.json');require(intent==REQ['expectedIntent'],'ORIGINAL_APPLY_INTENT_DRIFT')
    failures=list(STAGE.glob('apply.failure-*.json'));require(len(failures)==1,'EXACT_ORIGINAL_FAILURE_RECORD_REQUIRED')
    require(re.fullmatch(r'apply\.failure-[a-f0-9]{12}\.json',failures[0].name),'UNSAFE_FAILURE_RECORD_NAME')
    failed=read_json(failures[0]);require(failed==REQ['expectedFailure'],'ORIGINAL_FAILURE_RECORD_DRIFT')
    require(digest(canonical(intent))==REQ['provenance']['applyIntentSha256']
        and digest(canonical(failed))==REQ['provenance']['applyFailureRecordSha256'],'INTERRUPTED_RECORD_HASH_BINDING')
    return saved
def assert_recovery_state(state,saved):
    target_source(state);after_schema(saved['baseline'],state);invariant_controls(saved['baseline'],state)
    require({k:state[k] for k in REQ['expectedState']}==REQ['expectedState'],'OBSERVED_RECOVERY_STATE_DRIFT')
    own=state['pm2']['own'];require(own['pid']==1610075 and own['restarts']==9 and own['unstableRestarts']==0,'RECOVERY_PID_OR_RESTART_DRIFT')
    require(own['pid']!=saved['baseline']['pm2']['own']['pid'] and own['restarts']==saved['baseline']['pm2']['own']['restarts']+1,'ACTUAL_RESTART_PROVENANCE')
def honest_health():
    import urllib.request,urllib.error
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect());result={}
    for name,url in [('local','http://127.0.0.1:3003/health'),('public','https://api-melamedia.mela-media.co.il/health')]:
        request=urllib.request.Request(url,headers={'User-Agent':'Mela-QA-readonly-observe/1'})
        with opener.open(request,timeout=3) as response:
            body=response.read(65537);require(len(body)<=65536,'HEALTH_BODY_BOUND');value=json.loads(body)
            require(response.status==200 and isinstance(value,dict) and value.get('ok') is True,'RECOVERY_HEALTH_NOT_READY')
            require(digest(body)==REQ['expectedHealthSha256'],'RECOVERY_HEALTH_BODY_CHANGED')
            result[name]={'status':response.status,'jsonOk':True,'bodySha256':digest(body)}
    return result
def recovery_main():
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    for path,shared in [('/run/lock/melamedia-release-maintenance.lock',True),('/run/lock/melamedia-legal-melamedia-release.lock',False)]:
        okay,_=acquire(path,shared)
        if not okay:return {'result':'BUSY_NO_ACTION','phase':'verify','contractSha256':RECOVERY_SHA},75
    saved=interrupted_facts();first=observe();assert_recovery_state(first,saved);initial_health=honest_health()
    stem='recovery03-'+RECOVERY_SHA[:16]+'-'+NONCE
    private_file(STAGE/(stem+'.intent.json'),canonical({'contractSha256':RECOVERY_SHA,'originalContractSha256':CONTRACT_SHA,
        'phase':'verify','kind':'QA_ONLY_BACKEND_RELEASE_RECOVERY','state':'READ_ONLY_INTERRUPTED_APPLY_VERIFY_INTENT'}))
    time.sleep(1);second=observe();assert_recovery_state(second,saved);require(first==second,'RECOVERY_STATE_UNSTABLE')
    check_worktree_guard(second);memory=resource_gate(second);endpoints=honest_health();third=observe()
    assert_recovery_state(third,saved);require(second==third,'RECOVERY_POST_HEALTH_STATE_DRIFT');interrupted_facts()
    value={'contractSha256':RECOVERY_SHA,'phase':'verify','target':C['target'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'result':'QA_BACKEND_RECOVERY_VERIFY_DEDICATED_ONLY','candidateCommit':C['source']['candidateCommit'],'state':third,
        'health':endpoints,'initialHealth':initial_health,'resources':memory,'recoveryNoRuntimeMutation':True,
        'interruptedApply':REQ['provenance'],'privateRecoveryJournalOnly':True,'originalApplyResultCreated':False,
        'historicalObservationResult':REQ['historicalObservationResult'],
        'predicates':{'sourceAndDetachedStateVerified':True,'protectedSource103Verified':True,'exactMigrationRecorded':True,
            'unrelatedHistoryPreserved':True,'schemaQualifiedDedicatedOnly':True,'environmentAndDependenciesPreserved':True,
            'uppercaseAppEffectiveEnvPreserved':True,'nonQaProcessesPreserved':True,'singleObservedForkWatchFalsePreserved':True,
            'healthJsonOk':True,'memoryHeadroomVerified':True,'privateCheckpointVerified':True},
        'scope':'Read-only adoption/verification of actual interrupted apply. Original failure retained; no apply-success fabrication, runtime mutation, shared-RLS, frontend, provider or browser approval.'}
    private_file(STAGE/(stem+'.result.json'),canonical(value));return value,0
def alarm(_signum,_frame):raise RuntimeError('RECOVERY_TIME_BUDGET')
signal.signal(signal.SIGALRM,alarm);signal.alarm(TIME_BUDGET+2)
try: value,code=recovery_main()
except Exception as error:
    value={'result':'FAILED_RECOVERY_VERIFY_NO_RUNTIME_MUTATION','phase':'verify','contractSha256':RECOVERY_SHA,
        'errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)) else type(error).__name__,
        'recoveryNoRuntimeMutation':True,'originalApplyFailureRetained':True};code=1
finally:
    signal.alarm(0)
    for fd in reversed(LOCKS):os.close(fd)
sys.stdout.write(json.dumps(value,sort_keys=True)+'\n');sys.exit(code)
'''

def payload(base,oldraw,req,recovery_sha,nonce):
    header='\nTIME_BUDGET=180\nC=json.loads(base64.b64decode('+repr(base64.b64encode(oldraw).decode())+'))\n'
    header+='CONTRACT_SHA='+repr(ORIGINAL_CONTRACT_SHA)+'\nPHASE="verify"\nSTAGE=Path("/root/word-visual-qa-20261026-"+CONTRACT_SHA[:20])\n'
    header+='RECOVERY_SHA='+repr(recovery_sha)+'\nNONCE='+repr(nonce)+'\nREQ=json.loads(base64.b64decode('+repr(base64.b64encode(canonical(req)).decode())+'))\n'
    return (base.helpers()+header+selected_helpers(base)+'\n'+REMOTE).encode()

def private_file_local(path,raw):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(raw)
def execute(r,raw,oldraw,base,req):
    reads={str(p):sha(p.read_bytes()) for p in LEDGERS};at=datetime.datetime.now(datetime.timezone.utc);nonce=uuid.uuid4().hex
    name='qa-backend-recovery-verify-'+at.strftime('%Y%m%dT%H%M%S%fZ')+'-'+nonce[:8]
    receipt={'at':at.isoformat(),'kind':KIND,'phase':'verify','target':TARGET,'candidateCommit':CANDIDATE,
        'contractSha256':sha(raw),'driverSha256':sha(Path(__file__).read_bytes()),'sshAttempted':False,
        'recoveryNoRuntimeMutation':True,'ledgersReadBefore':reads};code=1
    try:
        codebytes=payload(base,oldraw,req,sha(raw),nonce);receipt['remotePayloadSha256']=sha(codebytes)
        private=OUT/'private-qa-backend-recovery03';private.mkdir(mode=0o700,exist_ok=True);info=private.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700,'PRIVATE_DIRECTORY')
        stdout,stderr=private/(name+'.stdout'),private/(name+'.stderr');private_file_local(stdout,b'');private_file_local(stderr,b'')
        argv=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes',
            '-o','ConnectTimeout=8','-o','ConnectionAttempts=1','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',
            TARGET['host'],'timeout --signal=TERM --kill-after=3s 185s python3 -']
        receipt['argv']=argv;receipt['sshAttempted']=True
        with stdout.open('ab') as out,stderr.open('ab') as err:
            try:code=subprocess.run(argv,input=codebytes,stdout=out,stderr=err,timeout=198).returncode
            except subprocess.TimeoutExpired:code=124
            except OSError:code=125
        receipt['transportExitCode']=code;output=stdout.read_bytes();require(len(output)<=8*1024*1024,'REMOTE_OUTPUT_BOUND');remote=json.loads(output)
        require(remote.get('contractSha256')==sha(raw) and remote.get('phase')=='verify','REMOTE_RECEIPT_BINDING')
        require((remote.get('result'),code) in [(RESULT,0),('BUSY_NO_ACTION',75),('FAILED_RECOVERY_VERIFY_NO_RUNTIME_MUTATION',1)],'REMOTE_EXIT_RESULT')
        if code==0:
            require(remote.get('candidateCommit')==CANDIDATE and remote.get('target')==TARGET and remote.get('recoveryNoRuntimeMutation') is True
                and remote.get('interruptedApply')==req['provenance'] and remote.get('originalApplyResultCreated') is False,'RECOVERY_PROVENANCE_BINDING')
            receipt['interruptedApply']=remote['interruptedApply']
        receipt['remote']=remote;receipt['result']=remote['result']
        receipt['privateStdout']={'path':str(stdout),'sha256':sha(output),'mode':'0600'}
        receipt['privateStderr']={'path':str(stderr),'sha256':sha(stderr.read_bytes()),'mode':'0600'}
    except Exception as error:
        receipt['result']='LOCAL_OR_TRANSPORT_RECOVERY_VERIFY_FAILED';receipt['errorType']=type(error).__name__
        if isinstance(error,ValueError):receipt['errorCode']=str(error)
    destination=OUT/(name+'.json');private_file_local(destination,json.dumps(receipt,sort_keys=True,indent=2).encode()+b'\n')
    line='\n- '+at.isoformat()+' QA interrupted-apply recovery VERIFY ONLY result '+receipt['result']+' candidate '+CANDIDATE+'. Evidence '+str(destination)+' SHA256 '+sha(destination.read_bytes())+'. Original apply failure retained; no apply.result fabrication, source/schema/env/PM2/provider mutation or shared-RLS/browser/frontend/customer claim. Metadata-only unique recovery journal and private logs retained.\n'
    failures=[]
    for p in LEDGERS:
        try:
            fd=os.open(p,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
            with os.fdopen(fd,'wb') as stream:stream.write(line.encode())
        except OSError:failures.append(str(p))
    print(json.dumps({'result':receipt['result'],'receipt':str(destination),'sha256':sha(destination.read_bytes()),'ledgerAppendFailures':failures}))
    return 0 if code==0 and receipt['result']==RESULT and not failures else 1

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--contract',type=Path);parser.add_argument('--contract-sha');parser.add_argument('--phase',choices=['verify'],default='verify');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
    if args.contract is None:
        require(not args.execute,'SEALED_CONTRACT_REQUIRED');print(json.dumps({'result':'LOCAL_RECOVERY_PLAN_ONLY_NO_NETWORK','kind':KIND,'phase':'verify','candidateCommit':CANDIDATE,'target':TARGET,'runtimeMutation':False,'operatorSha256':sha(Path(__file__).read_bytes())}));return 0
    r,raw,oldraw,base,req=load_contract(args.contract)
    if args.contract_sha is not None:require(args.contract_sha==sha(raw),'RECOVERY_CONTRACT_BYTES_CHANGED')
    if not args.execute:
        print(json.dumps({'result':'LOCAL_VALIDATED_RECOVERY_PLAN_ONLY_NO_NETWORK','phase':'verify','candidateCommit':CANDIDATE,'contractSha256':sha(raw),'runtimeMutation':False}));return 0
    require(args.contract_sha==sha(raw),'EXPLICIT_RECOVERY_CONTRACT_SHA_REQUIRED');return execute(r,raw,oldraw,base,req)

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'result':'LOCAL_RECOVERY_PACKET_REJECTED_NO_SSH','errorCode':str(error) if isinstance(error,ValueError) else type(error).__name__}));raise SystemExit(1)
