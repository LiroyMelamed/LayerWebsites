#!/usr/bin/env python3
"""Default local plan; sealed QA Git fast-forward with identical backend bytes.

Source checkout changes are explicit. No migration, SQL write, dependency/env
change, PM2 restart, restore, frontend publication or provider action exists.
"""
import argparse, ast, base64, datetime, hashlib, json, os, re, stat, subprocess, types, uuid
from pathlib import Path
OUT=Path(__file__).resolve().parent
RECOVERY=OUT/'qa-backend-recovery03.py'
RECOVERY_SHA='f794387a462ab0ec573624d57f05130413ff92af288914a96fab256e50b4364d'
ORIGINAL_SHA='bf4369a26ec6284419bbc848ed4d3b9fb37a200e28d2638256322657e2f93dc3'
OBSERVER_SHA='adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
BASE='9afc07adde83eae7ead026315dc9291851892cdf'
TARGET={'host':'root@37.60.230.148','root':'/root/Melamedia','database':'melamedia','pm2Id':5,'pm2Name':'melamedia-api','branchState':'DETACHED'}
KIND='QA_ONLY_BACKEND_SOURCE_ADVANCE'
RESULT='QA_BACKEND_SOURCE_ADVANCE_VERIFY_DEDICATED_ONLY'
PREDICATES={'sourceAndDetachedStateVerified','protectedSource103Verified','exactMigrationRecorded','unrelatedHistoryPreserved',
 'schemaQualifiedDedicatedOnly','environmentAndDependenciesPreserved','uppercaseAppEffectiveEnvPreserved','nonQaProcessesPreserved',
 'singleObservedForkWatchFalsePreserved','healthJsonOk','memoryHeadroomVerified','privateCheckpointVerified'}
LEDGERS=[Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs')/n for n in
 ('signing-implementation-20261007/TEST-LEDGER.md','office-whatsapp-20261023/TEST-LEDGER.md')]
sha=lambda b:hashlib.sha256(b).hexdigest()
canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def require(ok,code):
 if not ok:raise ValueError(code)
def hexsha(v,n=64):return isinstance(v,str) and re.fullmatch('[a-f0-9]{'+str(n)+'}',v) is not None
def bound(b):
 require(isinstance(b,dict) and set(b)=={'path','sha256'} and hexsha(b['sha256']),'BOUND_EVIDENCE_REQUIRED')
 p=Path(b['path']);require(p.is_file() and not p.is_symlink(),'BOUND_EVIDENCE_FILE')
 raw=p.read_bytes();require(len(raw)<=4*1024*1024 and sha(raw)==b['sha256'],'BOUND_EVIDENCE_HASH');return raw
def load_recovery():
 require(sha(RECOVERY.read_bytes())==RECOVERY_SHA,'PINNED_RECOVERY_CODE_DRIFT')
 m=types.ModuleType('pinned_source_advance_recovery_helpers');m.__file__=str(RECOVERY)
 exec(compile(RECOVERY.read_bytes(),str(RECOVERY),'exec'),m.__dict__);return m
def utc(value):
 at=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 require(at.tzinfo is not None and at.utcoffset()==datetime.timedelta(0),'UTC_TIMESTAMP_REQUIRED');return at
def localgit(repo,*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL)

def validate_new_evidence(evidence,source,operator_sha):
 require({'backend_tests','frontend_tests','frontend_build','source_qualification','independent_review'}<=set(evidence),'SOURCE_ADVANCE_EVIDENCE_REQUIRED')
 build=evidence['frontend_build'];front=build.get('sourceHashesBefore')
 require(build.get('result')=='PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED'
  and build.get('candidateCommit')==source['candidateCommit'] and build.get('headAtFinish')==source['candidateCommit']
  and build.get('tenant')=='melamedia' and type(build.get('exitCode')) is int and build['exitCode']==0,'NEW_BUILD_CANDIDATE_REQUIRED')
 require(all(build.get(k) is True for k in ['sourceStable','dependencyStable','publicAssetsRestoredAfterBuild','localPublicEnvironmentScratchRestored'])
  and build.get('sourceDrift')==[] and build.get('scratchRestoreDrift')==[],'NEW_BUILD_STABILITY_REQUIRED')
 require(build.get('apiOrigin')=='https://api-melamedia.mela-media.co.il/api' and build.get('node')=='v24.19.0'
  and build.get('nodeAfter')=='v24.19.0' and hexsha(build.get('installedManifestSha256'))
  and build['installedManifestSha256']==build.get('installedManifestSha256After'),'NEW_BUILD_RUNTIME_DEPENDENCIES_REQUIRED')
 require(isinstance(front,dict) and 1<=len(front)<=10000 and front==build.get('sourceHashesAfter')
  and all(isinstance(p,str) and hexsha(h) for p,h in front.items()),'NEW_BUILD_SOURCE_MAP_REQUIRED')
 q=evidence['source_qualification']
 require(set(q)=={'result','candidateCommit','mainCommit','candidateBackendHashes','frontendSourceHashes','sourceClean','backendEvidenceValid','frontendEvidenceValid','mainFirst'}
  and q['result']=='PASS_QA_SOURCE_AND_EVIDENCE_BINDING' and q['candidateCommit']==source['candidateCommit']
  and q['mainCommit']==source['mainAncestor'] and q['candidateBackendHashes']==source['candidateBackendHashes']
  and q['frontendSourceHashes']==front and all(q[k] is True for k in ['sourceClean','backendEvidenceValid','frontendEvidenceValid','mainFirst']), 'NEW_SOURCE_QUALIFICATION_REQUIRED')
 review=evidence['independent_review']
 require(review=={'decision':'APPROVE','scope':KIND,'operatorSha256':operator_sha,'recoveryOperatorSha256':RECOVERY_SHA,
  'originalOperatorSha256':ORIGINAL_SHA,'observerSha256':OBSERVER_SHA},'SOURCE_ADVANCE_REVIEW_REQUIRED')
 repo=Path(source['repository']);require(repo.is_dir() and not repo.is_symlink(),'SOURCE_REPOSITORY_REQUIRED')
 require(localgit(repo,'rev-parse','HEAD').decode().strip()==source['candidateCommit']
  and not localgit(repo,'status','--porcelain','--untracked-files=no'),'LOCAL_FROZEN_QA_REQUIRED')
 require(localgit(repo,'rev-parse','refs/remotes/origin/main').decode().strip()==source['mainAncestor']
  and localgit(repo,'rev-parse','refs/remotes/origin/Melamedia').decode().strip()==source['candidateCommit'],'VERIFIED_REMOTE_REFS_REQUIRED')
 for ancestor in [BASE,source['mainAncestor']]:
  require(subprocess.run(['git','merge-base','--is-ancestor',ancestor,source['candidateCommit']],cwd=repo,
   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,'NEW_QA_ANCESTRY_REQUIRED')
 expected=set(localgit(repo,'ls-tree','-r','--name-only',source['candidateCommit'],'frontend','scripts/prepare-public-env.cjs').decode().splitlines())
 require(set(front)==expected,'FULL_NEW_FRONTEND_SOURCE_SCOPE_REQUIRED')
 for path,h in front.items():require(sha(localgit(repo,'show',source['candidateCommit']+':'+path))==h,'NEW_BUILD_GIT_OBJECT_MISMATCH')
 return build

def load_contract(path):
 raw=path.read_bytes();require(len(raw)<=4*1024*1024,'SOURCE_ADVANCE_CONTRACT_BOUND');n=json.loads(raw)
 require(set(n)=={'schema','target','source','originalContract','recoveryVerification','currentObservation','mainThenQaPublication','seal'},'SOURCE_ADVANCE_CONTRACT_KEYS')
 require(n['schema']==1 and n['target']==TARGET,'FIXED_QA_TARGET_REQUIRED');s=n['source']
 require(set(s)=={'baseCommit','candidateCommit','mainAncestor','candidateBackendHashes','guardScriptSha256','manifestSha256','repository'}
  and s['baseCommit']==BASE and hexsha(s['candidateCommit'],40) and s['candidateCommit']!=BASE and hexsha(s['mainAncestor'],40)
  and hexsha(s['guardScriptSha256']) and hexsha(s['manifestSha256']),'SOURCE_ADVANCE_SOURCE_KEYS')
 recovery=load_recovery();base=recovery.original_module();oldraw=bound(n['originalContract'])
 require(sha(oldraw)==recovery.ORIGINAL_CONTRACT_SHA,'EXACT_ORIGINAL_CONTRACT_REQUIRED')
 old,_=base.load_contract(Path(n['originalContract']['path']))
 require(len(s['candidateBackendHashes'])==807 and s['candidateBackendHashes']==old['source']['candidateBackendHashes'],'ALL807_BACKEND_BYTES_MUST_BE_IDENTICAL')
 require(s['guardScriptSha256']==old['source']['guardScriptSha256'],'PROTECTED_GUARD_CODE_MUST_BE_IDENTICAL')
 proof=json.loads(bound(n['recoveryVerification']));remote=proof['remote']
 require(proof.get('kind')==recovery.KIND and proof.get('phase')=='verify' and proof.get('result')==recovery.RESULT
  and proof.get('driverSha256')==RECOVERY_SHA and proof.get('target')==TARGET and proof.get('candidateCommit')==BASE
  and proof.get('sshAttempted') is True and type(proof.get('transportExitCode')) is int and proof['transportExitCode']==0
  and proof.get('recoveryNoRuntimeMutation') is True,'ACTUAL_RECOVERY03_VERIFY_REQUIRED')
 require(remote.get('contractSha256')==proof['contractSha256'] and remote.get('phase')=='verify' and remote.get('result')==recovery.RESULT
  and remote.get('target')==TARGET and remote.get('candidateCommit')==BASE and remote.get('recoveryNoRuntimeMutation') is True
  and remote.get('originalApplyResultCreated') is False and all(remote.get('predicates',{}).get(k) is True for k in PREDICATES),'RECOVERY03_REMOTE_BINDING')
 provenance=proof['interruptedApply'];require(provenance==remote['interruptedApply'] and provenance['originalOperatorSha256']==ORIGINAL_SHA
  and provenance['originalContractSha256']==recovery.ORIGINAL_CONTRACT_SHA and provenance['candidateCommit']==BASE
  and provenance['failurePhase']=='apply' and provenance['failureResult']=='FAILED_FORWARD_REPAIR_REQUIRED'
  and provenance['failureErrorCode']=='QA_HEALTH_NOT_READY' and provenance['applyResultAbsent'] is True
  and provenance['checkpointVerified'] is True and provenance['observedPid']==1610075 and provenance['observedRestarts']==9
  and provenance['failedApplyReceipt']['sha256']==recovery.FAILED_RECEIPT_SHA,'ORIGINAL_INTERRUPTED_APPLY_PROVENANCE')
 failure=json.loads(bound(provenance['failedApplyReceipt']));require(sha(canonical(failure['remote']))==provenance['applyFailureRecordSha256'],'ORIGINAL_FAILURE_RECORD_HASH')
 expected=remote['state'];require(expected['source']['head']==BASE and expected['source']['backendFiles']==s['candidateBackendHashes'],'RECOVERED_BASE_SOURCE')
 observation=json.loads(bound(n['currentObservation']));o=observation['observation'];at=utc(observation['at'])
 require(0<=(datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()<=1800,'FRESH_CURRENT_OBSERVATION_REQUIRED')
 require(utc(remote['verifiedAt'])<=at,'CURRENT_OBSERVATION_MUST_FOLLOW_RECOVERY')
 require(o.get('stateStable') is True and o.get('before')==o.get('after')
  and {k:expected[k] for k in o['after']}==o['after'],'CURRENT_STATE_MUST_MATCH_RECOVERY03')
 require(all(o['health'][k]['status']==200 and o['health'][k]['bodySha256']==remote['health']['local']['bodySha256'] for k in ['local','public'])
  and o['resources']['meetsConservativeAvailableMemoryGate'] is True,'CURRENT_HEALTH_HEADROOM_REQUIRED')
 publication=json.loads(bound(n['mainThenQaPublication']))
 require(publication.get('result')=='PUSHED_MAIN_THEN_QA' and publication.get('mainCommit')==s['mainAncestor']
  and publication.get('qaCommit')==s['candidateCommit'] and publication.get('qaBranch')=='Melamedia'
  and utc(publication['mainPushedAt'])<=utc(publication['qaPushedAt']),'MAIN_FIRST_QA_PUBLICATION_REQUIRED')
 seal=n['seal'];require(set(seal)=={'status','operatorSha256','recoveryOperatorSha256','originalOperatorSha256','observerSha256','evidenceBindings','rootReview'}
  and seal['status']=='SEALED' and seal['operatorSha256']==sha(Path(__file__).read_bytes()) and seal['recoveryOperatorSha256']==RECOVERY_SHA
  and seal['originalOperatorSha256']==ORIGINAL_SHA and seal['observerSha256']==OBSERVER_SHA,'SEALED_SOURCE_ADVANCE_CODE_REQUIRED')
 evidence={};require(isinstance(seal['evidenceBindings'],list) and 5<=len(seal['evidenceBindings'])<=30,'SOURCE_ADVANCE_EVIDENCE_BOUND')
 for b in seal['evidenceBindings']:
  require(set(b)=={'kind','path','sha256'} and b['kind'] not in evidence and re.fullmatch('[a-z][a-z0-9_]{1,63}',b['kind']),'EVIDENCE_KIND_REQUIRED')
  value=bound({'path':b['path'],'sha256':b['sha256']});evidence[b['kind']]=json.loads(value) if b['kind'] in ['frontend_build','source_qualification','independent_review'] else None
 validate_new_evidence(evidence,s,seal['operatorSha256'])
 root=json.loads(bound(seal['rootReview']));require(root=={'decision':'APPROVE','scope':KIND,'operatorSha256':seal['operatorSha256'],
  'recoveryOperatorSha256':RECOVERY_SHA,'originalOperatorSha256':ORIGINAL_SHA,'observerSha256':OBSERVER_SHA},'ROOT_SOURCE_ADVANCE_REVIEW_REQUIRED')
 advance={'fromCommit':BASE,'toCommit':s['candidateCommit'],'mainAncestor':s['mainAncestor'],'backendMapSha256':sha(canonical(s['candidateBackendHashes'])),
  'backendFileCount':807,'previousRecoveryVerification':n['recoveryVerification'],'currentObservation':n['currentObservation'],
  'observedPid':1610075,'observedRestarts':9,'gitFastForwardOnly':True}
 req={'expectedState':expected,'expectedCheckpointSha256':provenance['checkpointResultSha256'],'expectedFailure':failure['remote'],
  'expectedIntent':{'contractSha256':recovery.ORIGINAL_CONTRACT_SHA,'phase':'apply','state':'INTENT'},'provenance':provenance,
  'expectedHealthSha256':remote['health']['local']['bodySha256'],'sourceAdvance':advance}
 return n,raw,oldraw,base,recovery,req

REMOTE=r'''
def assert_source_state(state,head,saved):
    after_schema(saved['baseline'],state);invariant_controls(saved['baseline'],state)
    expected=dict(REQ['expectedState']);expected['source']=dict(expected['source'],head=head)
    require(state==expected,'SOURCE_ADVANCE_STATE_OR_PROCESS_DRIFT')
    require(state['source']['head']==head and state['source']['branch']=='DETACHED' and state['source']['trackedClean']
        and state['source']['backendFiles']==N['source']['candidateBackendHashes'],'EXACT_SOURCE_ONLY_STATE_REQUIRED')
    own=state['pm2']['own'];require(own['pid']==1610075 and own['restarts']==9 and own['unstableRestarts']==0,'NO_RESTART_PID_INVARIANT')
def candidate_preflight():
    source=N['source'];candidate=source['candidateCommit']
    bounded(['git','--no-optional-locks','-C',str(ROOT),'fetch','--no-tags','origin','refs/heads/Melamedia'],seconds=50,
        env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    require(git('rev-parse','FETCH_HEAD').decode().strip()==candidate,'ORIGIN_QA_CANDIDATE_CHANGED')
    for ancestor in [source['baseCommit'],source['mainAncestor']]:git('merge-base','--is-ancestor',ancestor,candidate)
    hashes={}
    for entry in git('ls-tree','-rz','--full-tree',candidate,'--','backend').split(b'\0'):
        if not entry:continue
        meta,name=entry.split(b'\t',1);mode,kind,oid=meta.decode().split()
        require(mode in ('100644','100755') and kind=='blob','CANDIDATE_SOURCE_TYPE')
        hashes[name.decode('utf-8')]=digest(git('cat-file','blob',oid))
    require(len(hashes)==807 and hashes==C['source']['candidateBackendHashes']==source['candidateBackendHashes'],'BACKEND807_BYTES_CHANGED')
    guard=git('show',candidate+':scripts/check-signing-release.cjs');manifest=git('show',candidate+':docs/signing-v2/release-baseline.json')
    require(digest(guard)==source['guardScriptSha256'] and digest(manifest)==source['manifestSha256'],'CANDIDATE_GUARD_HASH_DRIFT')
    gp=STAGE/(PREFIX+'.candidate-guard.cjs');mp=STAGE/(PREFIX+'.candidate-baseline.json')
    private_file(gp,guard);private_file(mp,manifest)
    node=Path('/proc/1610075/exe').resolve(strict=True)
    runner="const fs=require('node:fs');const x=require(process.argv[1]);const r=x.checkSigningRelease({root:'/root/Melamedia',ref:process.argv[3],manifest:JSON.parse(fs.readFileSync(process.argv[2],'utf8')),checkWorktree:false});console.log(JSON.stringify(r));"
    checked=json.loads(bounded([str(node),'-e',runner,str(gp),str(mp),candidate],seconds=45))
    require(checked['commit']==candidate and checked['files']==103,'CANDIDATE103_GUARD_FAILED')
def advanced_guard(state):
    source=N['source'];require(digest(plain_file(ROOT/'scripts/check-signing-release.cjs'))==source['guardScriptSha256']
        and digest(plain_file(ROOT/'docs/signing-v2/release-baseline.json'))==source['manifestSha256'],'ADVANCED_GUARD_BYTES')
    node=Path('/proc',str(state['pm2']['own']['pid']),'exe').resolve(strict=True)
    checked=json.loads(bounded([str(node),str(ROOT/'scripts/check-signing-release.cjs'),'HEAD'],seconds=45))
    require(checked['commit']==source['candidateCommit'] and checked['files']==103,'ADVANCED103_GUARD_FAILED')
def advance_main():
    global SOURCE_ACTION_STARTED,JOURNAL_STARTED
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    for path,shared in [('/run/lock/melamedia-release-maintenance.lock',True),('/run/lock/melamedia-legal-melamedia-release.lock',False)]:
        okay,_=acquire(path,shared)
        if not okay:return {'result':'BUSY_NO_ACTION','phase':'verify','contractSha256':ADVANCE_SHA},75
    saved=interrupted_facts();before=observe();assert_source_state(before,N['source']['baseCommit'],saved)
    check_worktree_guard(before);resource_gate(before);honest_health()
    private_file(STAGE/(PREFIX+'.intent.json'),canonical({'contractSha256':ADVANCE_SHA,'phase':'verify','state':'SOURCE_ONLY_FF_INTENT',
        'sourceAdvance':REQ['sourceAdvance'],'originalApplyFailureRetained':True}))
    JOURNAL_STARTED=True
    candidate_preflight();immediate=observe();assert_source_state(immediate,N['source']['baseCommit'],saved)
    require(immediate==before,'SOURCE_ADVANCE_PRE_FF_CAS_DRIFT')
    SOURCE_ACTION_STARTED=True
    bounded(['git','--no-optional-locks','-c','core.hooksPath=/dev/null','-C',str(ROOT),'merge','--ff-only','--no-edit',N['source']['candidateCommit']],seconds=25,
        env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    after=observe();assert_source_state(after,N['source']['candidateCommit'],saved);advanced_guard(after)
    time.sleep(1);stable=observe();assert_source_state(stable,N['source']['candidateCommit'],saved);require(after==stable,'ADVANCED_STATE_UNSTABLE')
    memory=resource_gate(stable);health=honest_health();final=observe();assert_source_state(final,N['source']['candidateCommit'],saved)
    require(stable==final,'ADVANCED_POST_HEALTH_DRIFT');interrupted_facts()
    value={'contractSha256':ADVANCE_SHA,'phase':'verify','result':'QA_BACKEND_SOURCE_ADVANCE_VERIFY_DEDICATED_ONLY','target':C['target'],
        'candidateCommit':N['source']['candidateCommit'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'state':final,'health':health,'resources':memory,'backendBytesIdentical':True,'noMigrationOrRestart':True,
        'sourceAdvance':REQ['sourceAdvance'],'interruptedApply':REQ['provenance'],'originalApplyResultCreated':False,
        'predicates':{'sourceAndDetachedStateVerified':True,'protectedSource103Verified':True,'exactMigrationRecorded':True,
            'unrelatedHistoryPreserved':True,'schemaQualifiedDedicatedOnly':True,'environmentAndDependenciesPreserved':True,
            'uppercaseAppEffectiveEnvPreserved':True,'nonQaProcessesPreserved':True,'singleObservedForkWatchFalsePreserved':True,
            'healthJsonOk':True,'memoryHeadroomVerified':True,'privateCheckpointVerified':True},
        'scope':'Verified Git-only source advance;807backendbytes/PID unchanged. No migration/restart/env/dependency/provider/frontend publication or browser qualification.'}
    private_file(STAGE/(PREFIX+'.result.json'),canonical(value));return value,0
def advance_alarm(_signum,_frame):raise RuntimeError('SOURCE_ADVANCE_TIME_BUDGET')
signal.signal(signal.SIGALRM,advance_alarm);signal.alarm(TIME_BUDGET+2)
try:value,code=advance_main()
except Exception as error:
    value={'result':'SOURCE_ADVANCE_FAILED_FORWARD_INSPECTION_REQUIRED','phase':'verify','contractSha256':ADVANCE_SHA,
        'sourceAdvanceMayHaveOccurred':SOURCE_ACTION_STARTED,'noMigrationOrRestart':True,'originalApplyFailureRetained':True,
        'errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)) else type(error).__name__};code=1
    if JOURNAL_STARTED:
        try:private_file(STAGE/(PREFIX+'.failure-result.json'),canonical(value))
        except Exception:pass
finally:
    signal.alarm(0)
    for fd in reversed(LOCKS):os.close(fd)
sys.stdout.write(json.dumps(value,sort_keys=True)+'\n');sys.exit(code)
'''

def payload(n,raw,oldraw,base,recovery,req):
    functions={x.name:x for x in ast.parse(recovery.REMOTE).body if isinstance(x,ast.FunctionDef)}
    adopted='\n\n'.join(ast.get_source_segment(recovery.REMOTE,functions[k]) for k in ['interrupted_facts','honest_health'])
    header='\nTIME_BUDGET=240\nC=json.loads(base64.b64decode('+repr(base64.b64encode(oldraw).decode())+'))\n'
    header+='CONTRACT_SHA='+repr(recovery.ORIGINAL_CONTRACT_SHA)+'\nSTAGE=Path("/root/word-visual-qa-20261026-"+CONTRACT_SHA[:20])\n'
    header+='N=json.loads(base64.b64decode('+repr(base64.b64encode(raw).decode())+'))\nREQ=json.loads(base64.b64decode('+repr(base64.b64encode(canonical(req)).decode())+'))\n'
    header+='ADVANCE_SHA='+repr(sha(raw))+'\nPREFIX="source-advance04-"+ADVANCE_SHA[:24]\nSOURCE_ACTION_STARTED=False\nJOURNAL_STARTED=False\n'
    return (base.helpers()+header+recovery.selected_helpers(base)+'\n'+adopted+'\n'+REMOTE).encode()
def private_write(p,raw):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(raw)
def execute(n,raw,oldraw,base,recovery,req):
    reads={str(p):sha(p.read_bytes()) for p in LEDGERS};at=datetime.datetime.now(datetime.timezone.utc)
    name='qa-source-advance-verify-'+at.strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
    receipt={'at':at.isoformat(),'kind':KIND,'phase':'verify','target':TARGET,'candidateCommit':n['source']['candidateCommit'],
        'contractSha256':sha(raw),'driverSha256':sha(Path(__file__).read_bytes()),'sshAttempted':False,'ledgersReadBefore':reads};code=1
    try:
        require(receipt['driverSha256']==n['seal']['operatorSha256'],'SOURCE_ADVANCE_CODE_CHANGED')
        codebytes=payload(n,raw,oldraw,base,recovery,req);receipt['remotePayloadSha256']=sha(codebytes)
        private=OUT/'private-qa-source-advance04';private.mkdir(mode=0o700,exist_ok=True);info=private.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700,'PRIVATE_LOG_DIRECTORY')
        stdout,stderr=private/(name+'.stdout'),private/(name+'.stderr');private_write(stdout,b'');private_write(stderr,b'')
        argv=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
            '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
            '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',TARGET['host'],'timeout --signal=TERM --kill-after=3s 245s python3 -']
        receipt['argv']=argv;receipt['sshAttempted']=True
        with stdout.open('ab') as out,stderr.open('ab') as err:
            try:code=subprocess.run(argv,input=codebytes,stdout=out,stderr=err,timeout=258).returncode
            except subprocess.TimeoutExpired:code=124
            except OSError:code=125
        receipt['transportExitCode']=code;output=stdout.read_bytes();require(len(output)<=8*1024*1024,'REMOTE_OUTPUT_BOUND');value=json.loads(output)
        require(value.get('phase')=='verify' and value.get('contractSha256')==sha(raw),'REMOTE_CONTRACT_BINDING')
        require((value.get('result'),code) in [(RESULT,0),('BUSY_NO_ACTION',75),('SOURCE_ADVANCE_FAILED_FORWARD_INSPECTION_REQUIRED',1)],'REMOTE_EXIT_RESULT')
        if code==0:
            require(value.get('candidateCommit')==n['source']['candidateCommit'] and value.get('target')==TARGET
                and value.get('backendBytesIdentical') is True and value.get('noMigrationOrRestart') is True
                and value.get('sourceAdvance')==req['sourceAdvance'] and value.get('interruptedApply')==req['provenance']
                and all(value.get('predicates',{}).get(k) is True for k in PREDICATES),'SOURCE_ADVANCE_SUCCESS_BINDING')
            receipt.update({k:value[k] for k in ['backendBytesIdentical','noMigrationOrRestart','sourceAdvance','interruptedApply']})
        receipt['remote']=value;receipt['result']=value['result']
        receipt['privateStdout']={'path':str(stdout),'sha256':sha(output),'mode':'0600'}
        receipt['privateStderr']={'path':str(stderr),'sha256':sha(stderr.read_bytes()),'mode':'0600'}
    except Exception as error:
        receipt['result']='LOCAL_OR_TRANSPORT_SOURCE_ADVANCE_FAILED';receipt['errorType']=type(error).__name__
        if isinstance(error,ValueError):receipt['errorCode']=str(error)
    dest=OUT/(name+'.json');private_write(dest,json.dumps(receipt,sort_keys=True,indent=2).encode()+b'\n')
    line='\n- '+at.isoformat()+' QA source-only forward advance '+receipt['result']+' candidate '+n['source']['candidateCommit']+'. Evidence '+str(dest)+' SHA256 '+sha(dest.read_bytes())+'. GitFF source change explicit;807backendbytes/PID invariants, no migration/env/dependency/PM2restart/provider/frontend/customer mutation. Original interrupted apply retained; no blind rerun after uncertain FF.\n'
    failures=[]
    for p in LEDGERS:
        try:
            fd=os.open(p,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
            with os.fdopen(fd,'wb') as stream:stream.write(line.encode())
        except OSError:failures.append(str(p))
    print(json.dumps({'result':receipt['result'],'receipt':str(dest),'sha256':sha(dest.read_bytes()),'ledgerAppendFailures':failures}))
    return 0 if code==0 and receipt['result']==RESULT and not failures else 1
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--contract',type=Path);parser.add_argument('--contract-sha')
    parser.add_argument('--phase',choices=['verify'],default='verify');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
    if args.contract is None:
        require(not args.execute,'SEALED_SOURCE_ADVANCE_CONTRACT_REQUIRED');print(json.dumps({'result':'LOCAL_SOURCE_ADVANCE_PLAN_ONLY_NO_NETWORK',
            'kind':KIND,'target':TARGET,'baseCommit':BASE,'sourceChange':'Explicit GitFF only after seal','noMigrationOrRestart':True}));return 0
    n,raw,oldraw,base,recovery,req=load_contract(args.contract)
    if args.contract_sha is not None:require(args.contract_sha==sha(raw),'SOURCE_ADVANCE_CONTRACT_SHA_CHANGED')
    if not args.execute:
        print(json.dumps({'result':'LOCAL_VALIDATED_SOURCE_ADVANCE_PLAN_ONLY_NO_NETWORK','candidateCommit':n['source']['candidateCommit'],
            'contractSha256':sha(raw),'noMigrationOrRestart':True}));return 0
    require(args.contract_sha==sha(raw),'EXPLICIT_SOURCE_ADVANCE_CONTRACT_SHA_REQUIRED');return execute(n,raw,oldraw,base,recovery,req)
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'result':'LOCAL_SOURCE_ADVANCE_PACKET_REJECTED_NO_SSH','errorCode':str(error) if isinstance(error,ValueError) else type(error).__name__}));raise SystemExit(1)
