#!/usr/bin/env python3
"""Default local plan; sealed QA-only code fix with one explicit PM2 id5 restart.

Reuses pinned read-only02/03/04 evidence helpers. No migration, SQL write,
environment/dependency installation, restore, provider or frontend action.
"""
import argparse, ast, base64, copy, datetime, hashlib, json, os, re, stat, subprocess, types, uuid
from pathlib import Path
OUT=Path(__file__).resolve().parent
ADVANCE=OUT/'qa-source-advance04.py'
ADVANCE_SHA='8f53890e49b8481e0621d45e5b587810621c21eb5b47db38cb416f386fb0addc'
RECOVERY_SHA='f794387a462ab0ec573624d57f05130413ff92af288914a96fab256e50b4364d'
ORIGINAL_SHA='bf4369a26ec6284419bbc848ed4d3b9fb37a200e28d2638256322657e2f93dc3'
OBSERVER_SHA='adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
BASE='a1353eb410f797ebd49df851adccc80563ee0f1b'
ORIGINAL_BASE='9afc07adde83eae7ead026315dc9291851892cdf'
TARGET={'host':'root@37.60.230.148','root':'/root/Melamedia','database':'melamedia','pm2Id':5,'pm2Name':'melamedia-api','branchState':'DETACHED'}
KIND='QA_ONLY_BACKEND_CODE_FIX'
RESULT='QA_BACKEND_CODE_FIX_VERIFY_DEDICATED_ONLY'
FIXED_CHANGES={'backend/services/signingV2/authoring.js':'b0a4b9517cc60d48032e5d1bff69c4607e4f46691a32cd086273c868beebf2ee',
 'backend/tests/signingV2.wordOriginBoundary.test.js':'155f144184a16d49bbea0634ba14a4f91162a896251b281f5c7efe65d5ec485d'}
PREDICATES={'sourceAndDetachedStateVerified','protectedSource103Verified','exactMigrationRecorded','unrelatedHistoryPreserved',
 'schemaQualifiedDedicatedOnly','environmentAndDependenciesPreserved','uppercaseAppEffectiveEnvPreserved','nonQaProcessesPreserved',
 'singleObservedForkWatchFalsePreserved','healthJsonOk','memoryHeadroomVerified','privateCheckpointVerified'}
FLAGS=('sourceChanged','backendCodeChanged','runtimeRestarted','noMigrationOrEnvironmentOrDependencyChange')
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

def utc(value):
 at=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 require(at.tzinfo is not None and at.utcoffset()==datetime.timedelta(0),'UTC_TIMESTAMP_REQUIRED');return at

def localgit(repo,*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL)

def load_helpers():
 require(sha(ADVANCE.read_bytes())==ADVANCE_SHA,'PINNED_ADVANCE_CODE_DRIFT')
 m=types.ModuleType('pinned_code_fix_advance_helpers');m.__file__=str(ADVANCE)
 exec(compile(ADVANCE.read_bytes(),str(ADVANCE),'exec'),m.__dict__)
 recovery=m.load_recovery();return m,recovery,recovery.original_module()
def review_value(operator_sha):
 return {'decision':'APPROVE','scope':KIND,'operatorSha256':operator_sha,'sourceAdvanceOperatorSha256':ADVANCE_SHA,
  'recoveryOperatorSha256':RECOVERY_SHA,'originalOperatorSha256':ORIGINAL_SHA,'observerSha256':OBSERVER_SHA}

def validate_new_evidence(evidence,source,operator_sha):
 require({'backend_tests','frontend_tests','frontend_build','source_qualification','independent_review'}<=set(evidence),'CODE_FIX_EVIDENCE_REQUIRED')
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
 require(evidence['independent_review']==review_value(operator_sha),'CODE_FIX_REVIEW_REQUIRED')
 repo=Path(source['repository']);require(repo.is_dir() and not repo.is_symlink(),'SOURCE_REPOSITORY_REQUIRED')
 require(localgit(repo,'rev-parse','HEAD').decode().strip()==source['candidateCommit']
  and not localgit(repo,'status','--porcelain','--untracked-files=no'),'LOCAL_FROZEN_QA_REQUIRED')
 require(localgit(repo,'rev-parse','refs/remotes/origin/main').decode().strip()==source['mainAncestor']
  and localgit(repo,'rev-parse','refs/remotes/origin/Melamedia').decode().strip()==source['candidateCommit'],'VERIFIED_REMOTE_REFS_REQUIRED')
 for ancestor in [BASE,source['mainAncestor']]:
  require(subprocess.run(['git','merge-base','--is-ancestor',ancestor,source['candidateCommit']],cwd=repo,
   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,'NEW_QA_ANCESTRY_REQUIRED')
 expected=set(p for p in localgit(repo,'ls-tree','-r','-z','--name-only',source['candidateCommit'],'frontend','scripts/prepare-public-env.cjs').decode('utf-8').split('\0') if p)
 require(set(front)==expected,'FULL_NEW_FRONTEND_SOURCE_SCOPE_REQUIRED')
 for path,h in front.items():require(sha(localgit(repo,'show',source['candidateCommit']+':'+path))==h,'NEW_BUILD_GIT_OBJECT_MISMATCH')
 backend=source['candidateBackendHashes']
 require(set(p for p in localgit(repo,'ls-tree','-r','-z','--name-only',source['candidateCommit'],'backend').decode('utf-8').split('\0') if p)==set(backend),'FULL807_GIT_BACKEND_SCOPE_REQUIRED')
 for path,h in backend.items():require(sha(localgit(repo,'show',source['candidateCommit']+':'+path))==h,'CANDIDATE_BACKEND_GIT_OBJECT_MISMATCH')
 return build

def prior_advance(n,recovery):
 proof=json.loads(bound(n['previousSourceAdvanceVerification']));remote=proof['remote']
 require(proof.get('kind')=='QA_ONLY_BACKEND_SOURCE_ADVANCE' and proof.get('phase')=='verify'
  and proof.get('result')=='QA_BACKEND_SOURCE_ADVANCE_VERIFY_DEDICATED_ONLY' and proof.get('driverSha256')==ADVANCE_SHA
  and proof.get('target')==TARGET and proof.get('candidateCommit')==BASE and proof.get('sshAttempted') is True
  and type(proof.get('transportExitCode')) is int and proof['transportExitCode']==0,'ACTUAL_ADVANCE04_REQUIRED')
 require(remote.get('contractSha256')==proof['contractSha256'] and remote.get('phase')=='verify'
  and remote.get('result')==proof['result'] and remote.get('target')==TARGET and remote.get('candidateCommit')==BASE
  and all(remote.get('predicates',{}).get(k) is True for k in PREDICATES)
  and all(proof.get(k) is True and remote.get(k) is True for k in ['backendBytesIdentical','noMigrationOrRestart']), 'ADVANCE04_REMOTE_BINDING')
 a=proof['sourceAdvance'];require(a==remote['sourceAdvance'] and set(a)=={'fromCommit','toCommit','mainAncestor','backendMapSha256',
  'backendFileCount','previousRecoveryVerification','currentObservation','observedPid','observedRestarts','gitFastForwardOnly'}
  and a['fromCommit']==ORIGINAL_BASE and a['toCommit']==BASE and a['backendFileCount']==807
  and a['gitFastForwardOnly'] is True,'ADVANCE04_PROVENANCE')
 p=proof['interruptedApply'];require(p==remote['interruptedApply'] and len(p)==14
  and p['originalOperatorSha256']==ORIGINAL_SHA and p['originalContractSha256']==recovery.ORIGINAL_CONTRACT_SHA
  and p['candidateCommit']==ORIGINAL_BASE and p['failurePhase']=='apply' and p['failureResult']=='FAILED_FORWARD_REPAIR_REQUIRED'
  and p['failureErrorCode']=='QA_HEALTH_NOT_READY' and p['applyResultAbsent'] is True and p['checkpointVerified'] is True
  and p['failedApplyReceipt']['sha256']==recovery.FAILED_RECEIPT_SHA,'ORIGINAL_INTERRUPTED_APPLY_PROVENANCE')
 failure=json.loads(bound(p['failedApplyReceipt']));require(sha(canonical(failure['remote']))==p['applyFailureRecordSha256'],'ORIGINAL_FAILURE_RECORD_HASH')
 previous=json.loads(bound(a['previousRecoveryVerification']));pr=previous['remote']
 require(previous.get('kind')==recovery.KIND and previous.get('phase')=='verify' and previous.get('result')==recovery.RESULT
  and previous.get('driverSha256')==RECOVERY_SHA and previous.get('candidateCommit')==ORIGINAL_BASE and previous.get('target')==TARGET
  and previous.get('sshAttempted') is True and type(previous.get('transportExitCode')) is int and previous['transportExitCode']==0
  and previous.get('recoveryNoRuntimeMutation') is True and pr.get('recoveryNoRuntimeMutation') is True
  and pr.get('phase')=='verify' and pr.get('result')==recovery.RESULT and pr.get('target')==TARGET
  and pr.get('candidateCommit')==ORIGINAL_BASE and pr.get('contractSha256')==previous.get('contractSha256')
  and previous.get('interruptedApply')==p==pr.get('interruptedApply') and pr.get('originalApplyResultCreated') is False
  and all(pr.get('predicates',{}).get(k) is True for k in PREDICATES),'HISTORICAL_RECOVERY03_REQUIRED')
 expected=remote['state'];old=pr['state'];changed=copy.deepcopy(old);changed['source']['head']=BASE
 require(expected==changed and a['backendMapSha256']==sha(canonical(expected['source']['backendFiles']))
  and a['observedPid']==expected['pm2']['own']['pid']==p['observedPid']
  and a['observedRestarts']==expected['pm2']['own']['restarts']==p['observedRestarts'],'PRIOR_SOURCE_ONLY_STATE_PROOF')
 require(utc(pr['verifiedAt'])<=utc(remote['verifiedAt']),'PRIOR_PROOF_CHRONOLOGY')
 return proof,remote,p,failure

def load_contract(path):
 raw=path.read_bytes();require(len(raw)<=4*1024*1024,'CODE_FIX_CONTRACT_BOUND');n=json.loads(raw)
 require(set(n)=={'schema','target','source','originalContract','previousSourceAdvanceVerification','currentObservation','mainThenQaPublication','seal'},'CODE_FIX_CONTRACT_KEYS')
 require(n['schema']==1 and n['target']==TARGET,'FIXED_QA_TARGET_REQUIRED');s=n['source']
 require(set(s)=={'baseCommit','candidateCommit','mainAncestor','candidateBackendHashes','guardScriptSha256','manifestSha256','repository'}
  and s['baseCommit']==BASE and hexsha(s['candidateCommit'],40) and s['candidateCommit']!=BASE and hexsha(s['mainAncestor'],40)
  and hexsha(s['guardScriptSha256']) and hexsha(s['manifestSha256']),'CODE_FIX_SOURCE_KEYS')
 advance,recovery,base=load_helpers();oldraw=bound(n['originalContract'])
 require(sha(oldraw)==recovery.ORIGINAL_CONTRACT_SHA,'EXACT_ORIGINAL_CONTRACT_REQUIRED')
 old,_=base.load_contract(Path(n['originalContract']['path']))
 proof,remote,provenance,failure=prior_advance(n,recovery);expected=remote['state'];oldmap=expected['source']['backendFiles'];newmap=s['candidateBackendHashes']
 require(len(oldmap)==807 and oldmap==old['source']['candidateBackendHashes'] and isinstance(newmap,dict)
  and set(newmap)==set(oldmap) and all(hexsha(h) for h in newmap.values()),'EXACT807_BACKEND_SCOPE_REQUIRED')
 changes={p:{'before':oldmap[p],'after':newmap[p]} for p in oldmap if oldmap[p]!=newmap[p]}
 require(set(changes)==set(FIXED_CHANGES) and all(changes[p]['after']==h for p,h in FIXED_CHANGES.items()),'ONLY_REVIEWED_TWO_BACKEND_FILES_MAY_CHANGE')
 require(s['guardScriptSha256']==old['source']['guardScriptSha256'],'PROTECTED_GUARD_CODE_MUST_BE_IDENTICAL')
 observation=json.loads(bound(n['currentObservation']));o=observation['observation'];at=utc(observation['at'])
 require(observation.get('kind')=='READ_ONLY_QA_BASELINE_OBSERVATION' and observation.get('driverSha256')==OBSERVER_SHA
  and observation.get('host')==TARGET['host'] and observation.get('sshAttempted') is True and observation.get('healthRequested') is True
  and type(observation.get('transportExitCode')) is int and observation['transportExitCode'] in (0,2),'CURRENT_PINNED_OBSERVER_REQUIRED')
 require(0<=(datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()<=1800 and utc(remote['verifiedAt'])<=at,'FRESH_OBSERVATION_AFTER_ADVANCE_REQUIRED')
 require(o.get('stateStable') is True and o.get('before')==o.get('after')
  and {k:expected[k] for k in o['after']}==o['after'],'CURRENT_STATE_MUST_MATCH_ADVANCE04')
 require(all(o['health'][k]['status']==200 and o['health'][k]['bodySha256']==remote['health']['local']['bodySha256'] for k in ['local','public'])
  and o['resources']['meetsConservativeAvailableMemoryGate'] is True,'CURRENT_HEALTH_HEADROOM_REQUIRED')
 publication=json.loads(bound(n['mainThenQaPublication']))
 require(publication.get('result')=='PUSHED_MAIN_THEN_QA' and publication.get('mainCommit')==s['mainAncestor']
  and publication.get('qaCommit')==s['candidateCommit'] and publication.get('qaBranch')=='Melamedia'
  and utc(publication['mainPushedAt'])<=utc(publication['qaPushedAt']),'MAIN_FIRST_QA_PUBLICATION_REQUIRED')
 seal=n['seal'];operator_sha=sha(Path(__file__).read_bytes())
 require(set(seal)=={'status','operatorSha256','sourceAdvanceOperatorSha256','recoveryOperatorSha256','originalOperatorSha256','observerSha256','evidenceBindings','rootReview'}
  and seal['status']=='SEALED' and seal['operatorSha256']==operator_sha and seal['sourceAdvanceOperatorSha256']==ADVANCE_SHA
  and seal['recoveryOperatorSha256']==RECOVERY_SHA and seal['originalOperatorSha256']==ORIGINAL_SHA and seal['observerSha256']==OBSERVER_SHA,'SEALED_CODE_FIX_CODE_REQUIRED')
 evidence={};require(isinstance(seal['evidenceBindings'],list) and 5<=len(seal['evidenceBindings'])<=30,'CODE_FIX_EVIDENCE_BOUND')
 for b in seal['evidenceBindings']:
  require(set(b)=={'kind','path','sha256'} and b['kind'] not in evidence and re.fullmatch('[a-z][a-z0-9_]{1,63}',b['kind']),'EVIDENCE_KIND_REQUIRED')
  value=bound({'path':b['path'],'sha256':b['sha256']});evidence[b['kind']]=json.loads(value) if b['kind'] in ['frontend_build','source_qualification','independent_review'] else None
 validate_new_evidence(evidence,s,operator_sha)
 require(json.loads(bound(seal['rootReview']))==review_value(operator_sha),'ROOT_CODE_FIX_REVIEW_REQUIRED')
 codefix={'fromCommit':BASE,'toCommit':s['candidateCommit'],'mainAncestor':s['mainAncestor'],'backendFileCount':807,
  'baselineBackendMapSha256':sha(canonical(oldmap)),'candidateBackendMapSha256':sha(canonical(newmap)),
  'changedBackendFiles':changes,'previousSourceAdvanceVerification':n['previousSourceAdvanceVerification'],
  'currentObservation':n['currentObservation'],'gitFastForwardOnly':True,'pm2RestartOnlyId':5}
 req={'expectedState':expected,'expectedCheckpointSha256':provenance['checkpointResultSha256'],'expectedFailure':failure['remote'],
  'expectedIntent':{'contractSha256':recovery.ORIGINAL_CONTRACT_SHA,'phase':'apply','state':'INTENT'},'provenance':provenance,
  'expectedHealthSha256':remote['health']['local']['bodySha256'],'codeFix':codefix,
  'priorAdvanceContractSha256':proof['contractSha256'],'priorAdvanceRemoteSha256':sha(canonical(remote)),
  'oldManifestSha256':old['source']['manifestSha256']}
 return n,raw,oldraw,base,recovery,req

REMOTE=r'''
def own_without_runtime(own):
    return {k:v for k,v in own.items() if k not in ('pid','restarts','startTicks','startMs','environSha256')}
def assert_code_state(state,head,restarted=False):
    baseline=REQ['expectedState'];expected_source=dict(baseline['source'],head=head)
    if head==N['source']['candidateCommit']:
        expected_source['backendFiles']=N['source']['candidateBackendHashes']
        expected_source['backendTreeSha256']=digest(canonical(N['source']['candidateBackendHashes']))
    require(state['source']==expected_source and state['source']['branch']=='DETACHED' and state['source']['trackedClean'],'CODE_FIX_SOURCE_DRIFT')
    require({k:v for k,v in state.items() if k not in ('source','pm2')}=={k:v for k,v in baseline.items() if k not in ('source','pm2')},'SCHEMA_ENV_DEPENDENCY_OR_HISTORY_DRIFT')
    require(nonqa(state)==nonqa(baseline),'NON_QA_PROCESS_CHANGED')
    own=state['pm2']['own'];old=baseline['pm2']['own']
    require(own_without_runtime(own)==own_without_runtime(old),'QA_LAUNCH_CONTROLS_CHANGED')
    require([p for p in state['pm2']['processes'] if p['name']=='melamedia-api']==[own],'QA_PM2_PROCESS_MIRROR')
    if not restarted:require(own==old,'PRE_RESTART_PID_OR_START_DRIFT')
    else:
        require(type(own['pid']) is int and own['pid']>0 and own['pid']!=old['pid']
            and own['restarts']==old['restarts']+1 and own['unstableRestarts']==0
            and re.fullmatch('[0-9]+',own['startTicks']) and int(own['startTicks'])>int(old['startTicks'])
            and own['startMs']>old['startMs'],'EXACT_SINGLE_QA_RESTART_REQUIRED')
def prior_advance_facts():
    saved=interrupted_facts();prefix='source-advance04-'+REQ['priorAdvanceContractSha256'][:24]
    for suffix in ('.intent.json','.result.json'):
        p=STAGE/(prefix+suffix);checkpoint_artifact(p.name)
    value=json.loads(plain_file(STAGE/(prefix+'.result.json'),8*1024*1024))
    require(digest(canonical(value))==REQ['priorAdvanceRemoteSha256'],'PRIOR_ADVANCE_RESULT_DRIFT')
    intent=json.loads(plain_file(STAGE/(prefix+'.intent.json')))
    require(intent=={'contractSha256':REQ['priorAdvanceContractSha256'],'phase':'verify','state':'SOURCE_ONLY_FF_INTENT',
        'sourceAdvance':value['sourceAdvance'],'originalApplyFailureRetained':True},'PRIOR_ADVANCE_INTENT_DRIFT')
    return saved
def code_artifact(name):
    p=CODE_STAGE/name;info=p.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_uid==0
        and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600,'PRIVATE_CODE_ARTIFACT_REQUIRED')
    data=plain_file(p,12*1024*1024);require(len(data)>0,'EMPTY_CODE_ARTIFACT')
    return {'name':name,'bytes':len(data),'sha256':digest(data)}
def check_code_checkpoint(checkpoint):
    info=CODE_STAGE.lstat();require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
        and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o700,'PRIVATE_CODE_STAGE_REQUIRED')
    require(checkpoint['stage']==str(CODE_STAGE) and [x['name'] for x in checkpoint['artifacts']]==
        ['contract.json','code-baseline.json','backend-source.tar','.mela-retention-pin'],'CODE_CHECKPOINT_SCOPE')
    require([code_artifact(x['name']) for x in checkpoint['artifacts']]==checkpoint['artifacts'],'CODE_CHECKPOINT_DRIFT')
    require(digest(plain_file(CODE_STAGE/'contract.json',4*1024*1024))==CODE_SHA,'CODE_CONTRACT_DRIFT')
    saved=json.loads(plain_file(CODE_STAGE/'code-baseline.json',4*1024*1024))
    require(saved=={'contractSha256':CODE_SHA,'head':N['source']['baseCommit'],'state':REQ['expectedState'],
        'backendFiles':REQ['expectedState']['source']['backendFiles'],'codeFix':REQ['codeFix']},'CODE_BASELINE_DRIFT')
    git('cat-file','-e',N['source']['baseCommit']+'^{commit}')
def create_code_checkpoint(before):
    global JOURNAL_STARTED
    require(Path('/root').resolve(strict=True)==Path('/root'),'UNSAFE_CODE_STAGE_PARENT')
    CODE_STAGE.mkdir(mode=0o700);JOURNAL_STARTED=True
    private_file(CODE_STAGE/'operation.intent.json',canonical({'contractSha256':CODE_SHA,'phase':'verify',
        'state':'CODE_FIX_FF_THEN_SINGLE_RESTART_INTENT','codeFix':REQ['codeFix'],'originalApplyFailureRetained':True}))
    private_file(CODE_STAGE/'contract.json',CODE_BYTES)
    private_file(CODE_STAGE/'code-baseline.json',canonical({'contractSha256':CODE_SHA,'head':N['source']['baseCommit'],
        'state':before,'backendFiles':before['source']['backendFiles'],'codeFix':REQ['codeFix']}))
    archive=git('archive','--format=tar',N['source']['baseCommit'],'backend','scripts/check-signing-release.cjs','docs/signing-v2/release-baseline.json')
    import io,tarfile
    hashes={}
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:') as source:
        for member in source.getmembers():
            name=member.name.rstrip('/')
            require(name and not name.startswith('/') and all(p not in ('','.','..') for p in name.split('/')),'CODE_ARCHIVE_PATH')
            if member.isdir():continue
            require(member.isfile() and not member.issym() and not member.islnk() and member.size<=12*1024*1024,'CODE_ARCHIVE_TYPE')
            data=source.extractfile(member).read(12*1024*1024+1);require(len(data)==member.size,'CODE_ARCHIVE_SIZE')
            require(name not in hashes,'CODE_ARCHIVE_DUPLICATE');hashes[name]=digest(data)
    expected=dict(before['source']['backendFiles']);expected['scripts/check-signing-release.cjs']=digest(plain_file(ROOT/'scripts/check-signing-release.cjs'))
    expected['docs/signing-v2/release-baseline.json']=digest(plain_file(ROOT/'docs/signing-v2/release-baseline.json'))
    require(hashes==expected,'CODE_ARCHIVE_FULL_BACKEND_READBACK')
    private_file(CODE_STAGE/'backend-source.tar',archive)
    private_file(CODE_STAGE/'.mela-retention-pin',('Active QA-only code-fix checkpoint '+CODE_SHA+'; preserve old reachable Git/code/archive and journals; no automatic source/DB restore.\n').encode())
    checkpoint={'stage':str(CODE_STAGE),'artifacts':[code_artifact(p) for p in ['contract.json','code-baseline.json','backend-source.tar','.mela-retention-pin']]}
    check_code_checkpoint(checkpoint);return checkpoint
def code_guard(state,head,manifest_hash):
    require(digest(plain_file(ROOT/'scripts/check-signing-release.cjs'))==N['source']['guardScriptSha256']
        and digest(plain_file(ROOT/'docs/signing-v2/release-baseline.json'))==manifest_hash,'CODE_GUARD_FILE_DRIFT')
    node=Path('/proc',str(state['pm2']['own']['pid']),'exe').resolve(strict=True)
    checked=json.loads(bounded([str(node),str(ROOT/'scripts/check-signing-release.cjs'),'HEAD'],seconds=45))
    require(checked['commit']==head and checked['files']==103,'CODE103_GUARD_FAILED')
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
        require(mode in ('100644','100755') and kind=='blob','CANDIDATE_SOURCE_TYPE');hashes[name.decode('utf-8')]=digest(git('cat-file','blob',oid))
    require(len(hashes)==807 and hashes==source['candidateBackendHashes'],'CANDIDATE_BACKEND807_DRIFT')
    guard=git('show',candidate+':scripts/check-signing-release.cjs');manifest=git('show',candidate+':docs/signing-v2/release-baseline.json')
    require(digest(guard)==source['guardScriptSha256'] and digest(manifest)==source['manifestSha256'],'CANDIDATE_GUARD_HASH_DRIFT')
    gp=CODE_STAGE/'candidate-guard.cjs';mp=CODE_STAGE/'candidate-baseline.json';private_file(gp,guard);private_file(mp,manifest)
    node=Path('/proc',str(REQ['expectedState']['pm2']['own']['pid']),'exe').resolve(strict=True)
    runner="const fs=require('node:fs');const x=require(process.argv[1]);const r=x.checkSigningRelease({root:'/root/Melamedia',ref:process.argv[3],manifest:JSON.parse(fs.readFileSync(process.argv[2],'utf8')),checkWorktree:false});console.log(JSON.stringify(r));"
    checked=json.loads(bounded([str(node),'-e',runner,str(gp),str(mp),candidate],seconds=45))
    require(checked['commit']==candidate and checked['files']==103,'CANDIDATE103_GUARD_FAILED')
def ready_code_health():
    import urllib.request,urllib.error
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect());end=time.monotonic()+25
    while time.monotonic()<end:
        result={}
        for name,url in [('local','http://127.0.0.1:3003/health'),('public','https://api-melamedia.mela-media.co.il/health')]:
            left=end-time.monotonic()
            if left<=0:break
            try:
                request=urllib.request.Request(url,headers={'User-Agent':'Mela-QA-readonly-observe/1'})
                with opener.open(request,timeout=min(3,left)) as response:
                    body=response.read(65537);require(len(body)<=65536,'HEALTH_BODY_BOUND');value=json.loads(body)
                    require(response.status==200 and isinstance(value,dict) and value.get('ok') is True
                        and digest(body)==REQ['expectedHealthSha256'],'CODE_FIX_HEALTH_BODY')
                    result[name]={'status':200,'jsonOk':True,'bodySha256':digest(body)}
            except Exception:pass
        if set(result)=={'local','public'}:return result
        time.sleep(min(.5,max(0,end-time.monotonic())))
    raise RuntimeError('QA_CODE_FIX_HEALTH_NOT_READY')
def code_main():
    global SOURCE_ACTION_STARTED,RESTART_ACTION_STARTED
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    for path,shared in [('/run/lock/melamedia-release-maintenance.lock',True),('/run/lock/melamedia-legal-melamedia-release.lock',False)]:
        okay,_=acquire(path,shared)
        if not okay:return {'result':'BUSY_NO_ACTION','phase':'verify','contractSha256':CODE_SHA},75
    prior_advance_facts();before=observe();assert_code_state(before,N['source']['baseCommit'])
    code_guard(before,N['source']['baseCommit'],REQ['oldManifestSha256']);resource_gate(before);honest_health()
    checkpoint=create_code_checkpoint(before);candidate_preflight()
    immediate=observe();assert_code_state(immediate,N['source']['baseCommit']);require(immediate==before,'CODE_FIX_PRE_FF_CAS_DRIFT')
    check_code_checkpoint(checkpoint);prior_advance_facts()
    SOURCE_ACTION_STARTED=True
    bounded(['git','--no-optional-locks','-c','core.hooksPath=/dev/null','-C',str(ROOT),'merge','--ff-only','--no-edit',N['source']['candidateCommit']],seconds=25,
        env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    intermediate=observe();assert_code_state(intermediate,N['source']['candidateCommit']);code_guard(intermediate,N['source']['candidateCommit'],N['source']['manifestSha256'])
    check_code_checkpoint(checkpoint);prior_advance_facts()
    restart={'contractSha256':CODE_SHA,'phase':'verify','state':'SINGLE_QA_RESTART_INTENT','pm2Id':5,
        'oldPid':before['pm2']['own']['pid'],'oldRestarts':before['pm2']['own']['restarts'],'candidateCommit':N['source']['candidateCommit'],'codeFix':REQ['codeFix']}
    private_file(CODE_STAGE/'restart.intent.json',canonical(restart));restart_artifact=code_artifact('restart.intent.json')
    fresh=observe();assert_code_state(fresh,N['source']['candidateCommit']);require(fresh==intermediate,'CODE_FIX_PRE_RESTART_CAS_DRIFT')
    pm2=shutil.which('pm2');require(bool(pm2),'PM2_NOT_AVAILABLE');RESTART_ACTION_STARTED=True
    bounded([pm2,'restart','5'],seconds=25)
    ready_code_health();after=observe();assert_code_state(after,N['source']['candidateCommit'],True)
    time.sleep(5);stable=observe();assert_code_state(stable,N['source']['candidateCommit'],True);require(after==stable,'CODE_FIX_POST_RESTART_UNSTABLE')
    code_guard(stable,N['source']['candidateCommit'],N['source']['manifestSha256']);memory=resource_gate(stable);health=honest_health()
    final=observe();assert_code_state(final,N['source']['candidateCommit'],True);require(stable==final,'CODE_FIX_POST_HEALTH_DRIFT')
    prior_advance_facts();check_code_checkpoint(checkpoint);require(code_artifact('restart.intent.json')==restart_artifact,'RESTART_INTENT_DRIFT')
    old=before['pm2']['own'];new=final['pm2']['own']
    transition={'oldPid':old['pid'],'oldRestarts':old['restarts'],'oldStartTicks':old['startTicks'],
        'newPid':new['pid'],'newRestarts':new['restarts'],'newStartTicks':new['startTicks'],'restartCountDelta':1}
    value={'kind':'QA_ONLY_BACKEND_CODE_FIX','contractSha256':CODE_SHA,'phase':'verify','result':'QA_BACKEND_CODE_FIX_VERIFY_DEDICATED_ONLY','target':C['target'],
        'candidateCommit':N['source']['candidateCommit'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'state':final,'health':health,'resources':memory,'sourceChanged':True,'backendCodeChanged':True,'runtimeRestarted':True,
        'noMigrationOrEnvironmentOrDependencyChange':True,'codeFix':REQ['codeFix'],'runtimeTransition':transition,
        'codeCheckpoint':checkpoint,'restartIntent':restart_artifact,'interruptedApply':REQ['provenance'],'originalApplyResultCreated':False,
        'predicates':{key:True for key in PREDICATE_NAMES},
        'scope':'QA-only code FF and one id5 restart verified. Schema/history/env/dependencies/provider controls/nonQA preserved. No frontend/browser/shared-RLS or DB-restore qualification.'}
    private_file(CODE_STAGE/'verify.result.json',canonical(value));return value,0
def code_alarm(_signum,_frame):raise RuntimeError('CODE_FIX_TIME_BUDGET')
signal.signal(signal.SIGALRM,code_alarm);signal.alarm(TIME_BUDGET+2)
try:value,code=code_main()
except Exception as error:
    value={'result':'QA_CODE_FIX_FAILED_FORWARD_INSPECTION_REQUIRED','phase':'verify','contractSha256':CODE_SHA,
        'sourceChangeMayHaveOccurred':SOURCE_ACTION_STARTED,'restartMayHaveOccurred':RESTART_ACTION_STARTED,
        'originalApplyFailureRetained':True,'noMigrationOrEnvironmentOrDependencyWriteAttempted':True,
        'errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)) else type(error).__name__};code=1
    if JOURNAL_STARTED:
        try:private_file(CODE_STAGE/'failure.result.json',canonical(value))
        except Exception:pass
finally:
    signal.alarm(0)
    for fd in reversed(LOCKS):os.close(fd)
sys.stdout.write(json.dumps(value,sort_keys=True)+'\n');sys.exit(code)
'''

def payload(n,raw,oldraw,base,recovery,req):
    functions={x.name:x for x in ast.parse(recovery.REMOTE).body if isinstance(x,ast.FunctionDef)}
    adopted='\n\n'.join(ast.get_source_segment(recovery.REMOTE,functions[k]) for k in ['interrupted_facts','honest_health'])
    header='\nTIME_BUDGET=300\nC=json.loads(base64.b64decode('+repr(base64.b64encode(oldraw).decode())+'))\n'
    header+='CONTRACT_SHA='+repr(recovery.ORIGINAL_CONTRACT_SHA)+'\nSTAGE=Path("/root/word-visual-qa-20261026-"+CONTRACT_SHA[:20])\n'
    header+='CODE_BYTES=base64.b64decode('+repr(base64.b64encode(raw).decode())+')\nCODE_SHA='+repr(sha(raw))+'\nN=json.loads(CODE_BYTES)\n'
    header+='REQ=json.loads(base64.b64decode('+repr(base64.b64encode(canonical(req)).decode())+'))\n'
    header+='CODE_STAGE=Path("/root/word-code-fix-qa-20261027-"+CODE_SHA[:20])\nPREDICATE_NAMES='+repr(sorted(PREDICATES))+'\n'
    header+='SOURCE_ACTION_STARTED=False\nRESTART_ACTION_STARTED=False\nJOURNAL_STARTED=False\n'
    return (base.helpers()+header+recovery.selected_helpers(base)+'\n'+adopted+'\n'+REMOTE).encode()

def private_write(p,raw):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(raw)
def validate_success(value,n,req,contract_sha):
    require(value.get('kind')==KIND and value.get('phase')=='verify' and value.get('result')==RESULT and value.get('contractSha256')==contract_sha
        and value.get('candidateCommit')==n['source']['candidateCommit'] and value.get('target')==TARGET
        and all(value.get(k) is True for k in FLAGS) and value.get('codeFix')==req['codeFix']
        and value.get('interruptedApply')==req['provenance'] and value.get('originalApplyResultCreated') is False
        and all(value.get('predicates',{}).get(k) is True for k in PREDICATES),'CODE_FIX_SUCCESS_BINDING')
    old=req['expectedState']['pm2']['own'];new=value['state']['pm2']['own'];rt=value.get('runtimeTransition')
    require(rt=={'oldPid':old['pid'],'oldRestarts':old['restarts'],'oldStartTicks':old['startTicks'],
        'newPid':new['pid'],'newRestarts':new['restarts'],'newStartTicks':new['startTicks'],'restartCountDelta':1}
        and type(new['pid']) is int and new['pid']>0 and new['pid']!=old['pid'] and new['restarts']==old['restarts']+1
        and int(new['startTicks'])>int(old['startTicks']),'ACTUAL_RESTART_TRANSITION_REQUIRED')
    stage='/root/word-code-fix-qa-20261027-'+contract_sha[:20];cp=value.get('codeCheckpoint',{})
    require(set(cp)=={'stage','artifacts'} and cp['stage']==stage
        and [a['name'] for a in cp['artifacts']]==['contract.json','code-baseline.json','backend-source.tar','.mela-retention-pin'],'CODE_CHECKPOINT_BINDING')
    for a in cp['artifacts']+[value.get('restartIntent',{})]:
        require(set(a)=={'name','bytes','sha256'} and type(a['bytes']) is int and 0<a['bytes']<=12*1024*1024 and hexsha(a['sha256']),'CODE_ARTIFACT_DESCRIPTOR')
    require(cp['artifacts'][0]['sha256']==contract_sha and value['restartIntent']['name']=='restart.intent.json','CODE_CONTRACT_RESTART_BINDING')
    require(utc(value['verifiedAt'])>=utc(json.loads(bound(n['currentObservation']))['at']),'VERIFY_CHRONOLOGY')
def execute(n,raw,oldraw,base,recovery,req):
    reads={str(p):sha(p.read_bytes()) for p in LEDGERS};at=datetime.datetime.now(datetime.timezone.utc)
    name='qa-backend-code-fix-verify-'+at.strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
    receipt={'at':at.isoformat(),'kind':KIND,'phase':'verify','target':TARGET,'candidateCommit':n['source']['candidateCommit'],
        'contractSha256':sha(raw),'driverSha256':sha(Path(__file__).read_bytes()),'sshAttempted':False,'ledgersReadBefore':reads};code=1
    try:
        require(receipt['driverSha256']==n['seal']['operatorSha256'],'CODE_FIX_OPERATOR_CHANGED')
        codebytes=payload(n,raw,oldraw,base,recovery,req);receipt['remotePayloadSha256']=sha(codebytes)
        private=OUT/'private-qa-backend-code-fix05';private.mkdir(mode=0o700,exist_ok=True);info=private.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700,'PRIVATE_LOG_DIRECTORY')
        stdout,stderr=private/(name+'.stdout'),private/(name+'.stderr');private_write(stdout,b'');private_write(stderr,b'')
        argv=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
            '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
            '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',TARGET['host'],'timeout --signal=TERM --kill-after=3s 305s python3 -']
        receipt['argv']=argv;receipt['sshAttempted']=True
        with stdout.open('ab') as out,stderr.open('ab') as err:
            try:code=subprocess.run(argv,input=codebytes,stdout=out,stderr=err,timeout=318).returncode
            except subprocess.TimeoutExpired:code=124
            except OSError:code=125
        receipt['transportExitCode']=code;output=stdout.read_bytes();require(len(output)<=8*1024*1024,'REMOTE_OUTPUT_BOUND');value=json.loads(output)
        require(value.get('phase')=='verify' and value.get('contractSha256')==sha(raw),'REMOTE_CONTRACT_BINDING')
        require((value.get('result'),code) in [(RESULT,0),('BUSY_NO_ACTION',75),('QA_CODE_FIX_FAILED_FORWARD_INSPECTION_REQUIRED',1)],'REMOTE_EXIT_RESULT')
        if code==0:
            validate_success(value,n,req,sha(raw))
            receipt.update({k:value[k] for k in [*FLAGS,'codeFix','runtimeTransition','codeCheckpoint','restartIntent','interruptedApply','originalApplyResultCreated']})
        receipt['remote']=value;receipt['result']=value['result']
        receipt['privateStdout']={'path':str(stdout),'sha256':sha(output),'mode':'0600'}
        receipt['privateStderr']={'path':str(stderr),'sha256':sha(stderr.read_bytes()),'mode':'0600'}
    except Exception as error:
        receipt['result']='LOCAL_OR_TRANSPORT_CODE_FIX_FAILED';receipt['errorType']=type(error).__name__
        if isinstance(error,ValueError):receipt['errorCode']=str(error)
    dest=OUT/(name+'.json');private_write(dest,json.dumps(receipt,sort_keys=True,indent=2).encode()+b'\n')
    line='\n- '+at.isoformat()+' QA-only code-fix/single restart operator '+receipt['result']+' candidate '+n['source']['candidateCommit']+'. Evidence '+str(dest)+' SHA256 '+sha(dest.read_bytes())+'. Source/backend/runtime change explicit; no migration/env/dependency/provider/nonQA/frontend change or browser/shared-RLS qualification. Original interrupted apply retained; no automatic retry/source rollback/DB restore.\n'
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
        require(not args.execute,'SEALED_CODE_FIX_CONTRACT_REQUIRED');print(json.dumps({'result':'LOCAL_CODE_FIX_PLAN_ONLY_NO_NETWORK',
            'kind':KIND,'target':TARGET,'baseCommit':BASE,'sourceChange':'Reviewed two-file backend delta and one explicit pm2 restart5 only after seal'}));return 0
    n,raw,oldraw,base,recovery,req=load_contract(args.contract)
    if args.contract_sha is not None:require(args.contract_sha==sha(raw),'CODE_FIX_CONTRACT_SHA_CHANGED')
    if not args.execute:
        print(json.dumps({'result':'LOCAL_VALIDATED_CODE_FIX_PLAN_ONLY_NO_NETWORK','candidateCommit':n['source']['candidateCommit'],
            'contractSha256':sha(raw),'singleQaRestartPlanned':True}));return 0
    require(args.contract_sha==sha(raw),'EXPLICIT_CODE_FIX_CONTRACT_SHA_REQUIRED');return execute(n,raw,oldraw,base,recovery,req)
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'result':'LOCAL_CODE_FIX_PACKET_REJECTED_NO_SSH','errorCode':str(error) if isinstance(error,ValueError) else type(error).__name__}));raise SystemExit(1)
