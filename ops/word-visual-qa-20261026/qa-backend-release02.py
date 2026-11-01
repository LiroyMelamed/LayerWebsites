#!/usr/bin/env python3
"""Review-only preparation: fixed QA checkpoint/apply/verify, default plan.

No execution occurs without --execute and a sealed, hash-bound contract. A failed
mutating phase is never retried automatically. Recovery is forward repair which
retains Word provenance/privacy guards and additive schema; never DB restore.
"""
import argparse
import ast
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import uuid

OUT = Path(__file__).resolve().parent
OBSERVER = OUT / 'qa-backend-observe02.py'
OBSERVER_SHA = 'adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
PROTECTED = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
LEDGERS = [PROTECTED / 'outputs/signing-implementation-20261007/TEST-LEDGER.md',
           PROTECTED / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
BASE = '1161fd687db381833552db78a70723573792ab97'
TARGET = {'host': 'root@37.60.230.148', 'root': '/root/Melamedia', 'database': 'melamedia',
          'pm2Id': 5, 'pm2Name': 'melamedia-api', 'branchState': 'DETACHED'}
MIGRATION = '2026-10-26_01_signing_word_authoring_renders.sql'


def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
def require(ok, code):
    if not ok: raise ValueError(code)
def hexsha(value, size=64): return isinstance(value, str) and re.fullmatch('[0-9a-f]{' + str(size) + '}', value) is not None


MANDATORY_KINDS = {'backend_tests', 'frontend_tests', 'frontend_build', 'source_qualification', 'independent_review'}


def validate_evidence(evidence, source, operator_sha):
    require(MANDATORY_KINDS <= evidence.keys(), 'REQUIRED_REVIEW_TEST_BUILD_BINDINGS')
    require(all(isinstance(evidence[key], dict) for key in ['frontend_build', 'source_qualification', 'independent_review']), 'EVIDENCE_ENVELOPE_TYPE')
    build = evidence['frontend_build']
    require(build.get('result') == 'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED'
            and build.get('candidateCommit') == source['candidateCommit'] and build.get('headAtFinish') == source['candidateCommit']
            and build.get('tenant') == 'melamedia' and type(build.get('exitCode')) is int and build['exitCode'] == 0,
            'BUILD_RESULT_OR_CANDIDATE')
    require(all(build.get(key) is True for key in ['sourceStable', 'dependencyStable', 'publicAssetsRestoredAfterBuild',
                'localPublicEnvironmentScratchRestored']) and build.get('sourceDrift') == [] and build.get('scratchRestoreDrift') == [],
            'BUILD_STABILITY_OR_SCRATCH')
    require(build.get('apiOrigin') == 'https://api-melamedia.mela-media.co.il/api'
            and build.get('node') == 'v24.19.0' and build.get('nodeAfter') == 'v24.19.0', 'BUILD_QA_ORIGIN_OR_RUNTIME')
    require(hexsha(build.get('installedManifestSha256')) and build['installedManifestSha256'] == build.get('installedManifestSha256After'),
            'BUILD_DEPENDENCY_BINDING')
    front = build.get('sourceHashesBefore')
    require(isinstance(front, dict) and 1 <= len(front) <= 10000 and front == build.get('sourceHashesAfter')
            and all(isinstance(path, str) and hexsha(digest) for path, digest in front.items()), 'BUILD_SOURCE_MAP')
    qualification = evidence['source_qualification']
    require(set(qualification) == {'result', 'candidateCommit', 'mainCommit', 'candidateBackendHashes', 'frontendSourceHashes',
                'sourceClean', 'backendEvidenceValid', 'frontendEvidenceValid', 'mainFirst'}, 'SOURCE_QUALIFICATION_KEYS')
    require(qualification['result'] == 'PASS_QA_SOURCE_AND_EVIDENCE_BINDING'
            and qualification['candidateCommit'] == source['candidateCommit'] and qualification['mainCommit'] == source['mainAncestor']
            and qualification['candidateBackendHashes'] == source['candidateBackendHashes'] and qualification['frontendSourceHashes'] == front,
            'SOURCE_QUALIFICATION_BINDING')
    require(all(qualification[key] is True for key in ['sourceClean', 'backendEvidenceValid', 'frontendEvidenceValid', 'mainFirst']),
            'SOURCE_QUALIFICATION_FAILED')
    review = evidence['independent_review']
    require(set(review) == {'decision', 'scope', 'operatorSha256', 'observerSha256'} and review['decision'] == 'APPROVE'
            and review['scope'] == 'QA_ONLY_BACKEND_RELEASE' and review['operatorSha256'] == operator_sha
            and review['observerSha256'] == OBSERVER_SHA, 'INDEPENDENT_REVIEW_BINDING')


def load_contract(path):
    raw = path.read_bytes(); require(len(raw) <= 4*1024*1024, 'CONTRACT_BOUND')
    c = json.loads(raw)
    require(set(c) == {'schema', 'target', 'source', 'migration', 'baselineReceipt', 'baselineState', 'seal'}, 'CONTRACT_KEYS')
    require(c['schema'] == 1 and c['target'] == TARGET, 'FIXED_QA_TARGET_REQUIRED')
    source = c['source']
    require(set(source) == {'baseCommit', 'candidateCommit', 'mainAncestor', 'candidateBackendHashes', 'guardScriptSha256', 'manifestSha256'}, 'SOURCE_KEYS')
    require(source['baseCommit'] == BASE and hexsha(source['candidateCommit'], 40) and hexsha(source['mainAncestor'], 40)
            and source['candidateCommit'] != BASE, 'SOURCE_COMMITS')
    require(hexsha(source['guardScriptSha256']) and hexsha(source['manifestSha256']), 'SOURCE_GUARD_HASHES')
    hashes = source['candidateBackendHashes']
    require(isinstance(hashes, dict) and 1 <= len(hashes) <= 10000, 'BACKEND_MAP_BOUND')
    for name, digest in hashes.items():
        require(isinstance(name, str) and name.startswith('backend/') and not any(v in name for v in ('\0', '\r', '\n', '\\'))
                and all(v not in ('', '.', '..', '.git', 'node_modules') for v in name.split('/')) and hexsha(digest), 'BACKEND_MAP_ENTRY')
        require(not any(v.startswith('.env') and v not in ('.env.example', '.env.production.example') for v in name.split('/')), 'ACTUAL_ENV_NOT_SOURCE')
    require(c['migration'] == {'filename': MIGRATION, 'sha256': hashes.get('backend/migrations/' + MIGRATION)}, 'MIGRATION_BINDING')
    require(hexsha(c['migration']['sha256']), 'MIGRATION_HASH')
    b = c['baselineState']
    require(b['source']['head'] == BASE and b['source']['branch'] == 'DETACHED' and b['source']['trackedClean'], 'BASELINE_SOURCE')
    require(b['pm2']['own']['pmId'] == 5 and b['pm2']['own']['name'] == 'melamedia-api', 'BASELINE_PM2')
    require(b['pm2']['own']['execMode'] == 'fork_mode' and b['pm2']['own']['instances'] in (None, 1)
            and b['pm2']['own']['watchExactlyFalse'], 'BASELINE_FORK_WATCH')
    require(all(not flag['enabled'] and flag['recognized'] for flag in b['modes']['effective'].values()), 'DEDICATED_MODE_ONLY')
    require(all(value is not None for value in b['dependencies']['files'].values()), 'MISSING_CRITICAL_PHYSICAL_DEPENDENCY')
    for name in ('backend/package.json', 'backend/package-lock.json'):
        require(hashes.get(name) == b['source']['backendFiles'].get(name), 'NO_DEPENDENCY_MANIFEST_CHANGE')
    baseline = c['baselineReceipt']; require(set(baseline) == {'path', 'sha256'} and hexsha(baseline['sha256']), 'BASELINE_RECEIPT')
    baseline_raw = Path(baseline['path']).read_bytes(); require(sha(baseline_raw) == baseline['sha256'], 'BASELINE_RECEIPT_HASH')
    prior = json.loads(baseline_raw)['observation']
    require(prior['stateStable'] and prior['after'] == b, 'BASELINE_RECEIPT_STATE')
    seal = c['seal']
    require(set(seal) == {'status', 'operatorSha256', 'observerSha256', 'candidateCommit', 'evidenceBindings'}, 'SEAL_KEYS')
    require(seal['status'] == 'SEALED' and seal['operatorSha256'] == sha(Path(__file__).read_bytes())
            and seal['observerSha256'] == OBSERVER_SHA and seal['candidateCommit'] == source['candidateCommit'], 'SEALED_OPERATOR_REQUIRED')
    evidence = {}
    require(isinstance(seal['evidenceBindings'], list) and 5 <= len(seal['evidenceBindings']) <= 30, 'EVIDENCE_BOUND')
    for binding in seal['evidenceBindings']:
        require(set(binding) == {'kind', 'path', 'sha256'} and hexsha(binding['sha256']), 'EVIDENCE_ENTRY')
        kind = binding['kind']
        require(isinstance(kind, str) and re.fullmatch('[a-z][a-z0-9_]{1,63}', kind) and kind not in evidence, 'DUPLICATE_OR_INVALID_EVIDENCE_KIND')
        proof = Path(binding['path']).read_bytes()
        require(sha(proof) == binding['sha256'], 'EVIDENCE_HASH')
        # Test unions may remain text/raw receipts; their validity is explicitly
        # bound by the source qualification envelope. The three authority gates
        # below are parsed, never accepted from filenames or kind labels alone.
        evidence[kind] = json.loads(proof) if kind in ('frontend_build', 'source_qualification', 'independent_review') else None
    validate_evidence(evidence, source, seal['operatorSha256'])
    return c, raw


REMOTE_RELEASE = r'''
CONTRACT_BYTES=base64.b64decode('__CONTRACT_BASE64__')
require(digest(CONTRACT_BYTES)=='__CONTRACT_SHA__','CONTRACT_TRANSPORT_HASH')
C=json.loads(CONTRACT_BYTES); CONTRACT_SHA=digest(CONTRACT_BYTES); PHASE='__PHASE__'
TIME_BUDGET=__TIME_BUDGET__
STAGE=Path('/root/word-visual-qa-20261026-'+CONTRACT_SHA[:20])
ACTION_STARTED=False
RESULT=None
def private_file(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
    with os.fdopen(fd,'wb') as stream: stream.write(data);stream.flush();os.fsync(stream.fileno())
def read_json(path):
    info=path.lstat(); require(stat.S_IMODE(info.st_mode)==0o600 and info.st_uid==0,'UNSAFE_STAGE_METADATA')
    value=json.loads(plain_file(path,8*1024*1024))
    require(value['contractSha256']==CONTRACT_SHA,'STAGE_CONTRACT_MISMATCH')
    return value
def stage_ready(create=False):
    require(Path('/root').resolve(strict=True)==Path('/root'),'UNSAFE_STAGE_PARENT')
    if create: STAGE.mkdir(mode=0o700)
    info=STAGE.lstat()
    require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o700,'UNSAFE_STAGE')
def phase_paths():
    label=PHASE if PHASE!='verify' else 'verify-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+os.urandom(6).hex()
    return STAGE/(label+'.intent.json'),STAGE/(label+'.result.json')
def effective_env_hash(pid):
    _,initial_bytes=proc(pid)
    initial={}
    for entry in initial_bytes.split(b'\0'):
        key,sep,value=entry.partition(b'=')
        if sep and re.fullmatch(b'[A-Z][A-Z0-9_]*',key):
            require(key.decode() not in initial,'DUPLICATE_UPPERCASE_INITIAL_ENV')
            initial[key.decode()]=value.decode('utf-8')
    node=Path('/proc',str(pid),'exe').resolve(strict=True)
    parser=r"""const fs=require('node:fs'),crypto=require('node:crypto');const x=JSON.parse(fs.readFileSync(0,'utf8'));
const d=require('/root/Melamedia/backend/node_modules/dotenv/lib/main.js').parse(Buffer.from(x.dotenv,'base64'));
const e={...d,...x.initial};const sorted=Object.fromEntries(Object.keys(e).filter(k=>/^[A-Z][A-Z0-9_]*$/.test(k)).sort().map(k=>[k,e[k]]));
console.log(JSON.stringify({sha256:crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex'),keys:Object.keys(sorted).length}));"""
    value=json.loads(bounded([str(node),'-e',parser],canonical({'dotenv':base64.b64encode(plain_file(ROOT/'backend/.env',2*1024*1024)).decode(),'initial':initial}),seconds=3))
    require(re.fullmatch('[a-f0-9]{64}',value['sha256']) and isinstance(value['keys'],int),'ENV_HASH_RESULT')
    return value
def peer(sql,seconds=8):
    psql=shutil.which('psql');runuser=shutil.which('runuser');require(bool(psql and runuser),'PEER_TOOLS_MISSING')
    return bounded([runuser,'-u','postgres','--',psql,'-X','-w','-h','/var/run/postgresql','-p','5432','-d','melamedia','-tA','-v','ON_ERROR_STOP=1'],
        sql.encode(),seconds=seconds,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','PGCONNECT_TIMEOUT':'3','PGOPTIONS':'-c statement_timeout=15000'})
def history():
    raw=peer("BEGIN READ ONLY; SET LOCAL TIME ZONE 'UTC'; SELECT encode(sha256(convert_to(COALESCE(string_agg(filename||'|'||applied_at::text,E'\\n' ORDER BY filename),''),'UTF8')),'hex') FROM schema_migrations WHERE filename<>'2026-10-26_01_signing_word_authoring_renders.sql'; COMMIT;")
    values=[line for line in raw.decode().splitlines() if re.fullmatch('[a-f0-9]{64}',line)]
    require(len(values)==1,'HISTORY_HASH_RESULT');return values[0]
def dedicated(state):
    require(all(not f['enabled'] and f['recognized'] for f in state['modes']['effective'].values()),'DEDICATED_MODE_DRIFT')
    require(state['modes']['databaseNameMatches'] and state['modes']['databaseHostLocal'] and state['modes']['databasePortDefault'],'DATABASE_TARGET_DRIFT')
    own=state['pm2']['own'];require(own['name']=='melamedia-api' and own['pmId']==5 and own['execMode']=='fork_mode'
        and own['instances'] in (None,1) and own['watchExactlyFalse'] and own['status']=='online','QA_PROCESS_SHAPE_DRIFT')
    require(sum(p['name']=='melamedia-api' for p in state['pm2']['processes'])==1,'MULTIPLE_QA_PROCESSES')
def resource_gate(state):
    value=resources(state['pm2']['processes']);require(value['meetsConservativeAvailableMemoryGate'],'INSUFFICIENT_MEMORY_HEADROOM');return value
def observe():
    value=snapshot();dedicated(value)
    value['appEffectiveUppercaseEnv']=effective_env_hash(value['pm2']['own']['pid'])
    value['unrelatedHistorySha256']=history()
    return value
def baseline_cas(state,baseline):
    require({k:state[k] for k in C['baselineState']}==C['baselineState'],'SEALED_BASELINE_CAS_CHANGED')
    if baseline is not None: require(state==baseline,'CHECKPOINT_BASELINE_CAS_CHANGED')
    require(state['source']['head']==C['source']['baseCommit'] and state['source']['branch']=='DETACHED' and state['source']['trackedClean'],'BASE_SOURCE_CAS')
def no_new_schema(state):
    require(not any(t['name']=='signing_word_authoring_renders' for t in state['schema']['tables']) and not state['schema']['migrationHistoryRows'],'NEW_SCHEMA_OR_HISTORY_ALREADY_PRESENT')
def checkpoint_artifact(name):
    path=STAGE/name; info=path.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600 and info.st_size>0,'INVALID_CHECKPOINT_ARTIFACT')
    require(info.st_size<=2*1024*1024*1024,'CHECKPOINT_ARTIFACT_SIZE_BOUND')
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC);hasher=hashlib.sha256()
    try:
        before=os.fstat(descriptor)
        require((before.st_dev,before.st_ino)==(info.st_dev,info.st_ino),'CHECKPOINT_ARTIFACT_REPLACED')
        while True:
            block=os.read(descriptor,1024*1024)
            if not block:break
            hasher.update(block)
        after=os.fstat(descriptor)
        require((before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns),'CHECKPOINT_ARTIFACT_CHANGED')
    finally:os.close(descriptor)
    return {'name':name,'bytes':info.st_size,'sha256':hasher.hexdigest()}
def run_file(command,path,seconds):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as output:
        result=subprocess.run(command,stdout=output,stderr=subprocess.PIPE,timeout=min(seconds,max(1,TIME_BUDGET-(time.monotonic()-START)-3)),
            env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','PGCONNECT_TIMEOUT':'3'})
    require(result.returncode==0,'CHECKPOINT_COMMAND_FAILED')
def do_checkpoint():
    before=observe();baseline_cas(before,None);no_new_schema(before);memory=resource_gate(before)
    stage_ready(True);intent,result=phase_paths()
    private_file(intent,canonical({'contractSha256':CONTRACT_SHA,'phase':PHASE,'state':'INTENT','at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    private_file(STAGE/'contract.json',CONTRACT_BYTES)
    private_file(STAGE/'.mela-retention-pin',('Active QA Word visual release checkpoint '+CONTRACT_SHA+'; preserve source/environment/database evidence and forward-repair guards until explicitly superseded; review only, no expiry.\n').encode())
    size_lines=peer("BEGIN READ ONLY; SELECT pg_database_size('melamedia'); COMMIT;").decode().splitlines()
    sizes=[int(v) for v in size_lines if v.isdigit()];require(len(sizes)==1,'DB_SIZE_METADATA')
    require(shutil.disk_usage(STAGE).free>=sizes[0]*2+1024*1024*1024,'INSUFFICIENT_CHECKPOINT_DISK')
    run_file(['git','--no-optional-locks','-C',str(ROOT),'archive','--format=tar',C['source']['baseCommit']],STAGE/'source.tar',60)
    private_file(STAGE/'backend.env.preimage',plain_file(ROOT/'backend/.env',2*1024*1024))
    private_file(STAGE/'launch.safe-preimage.json',canonical({'contractSha256':CONTRACT_SHA,'pm2':before['pm2']['own'],'appEffectiveUppercaseEnv':before['appEffectiveUppercaseEnv']}))
    run_file([shutil.which('runuser'),'-u','postgres','--',shutil.which('pg_dump'),'-h','/var/run/postgresql','-p','5432','-d','melamedia','--format=custom'],STAGE/'melamedia.dump',100)
    listing=bounded([shutil.which('pg_restore'),'--list',str(STAGE/'melamedia.dump')],seconds=15)
    require(b'TABLE' in listing and len(listing)>100,'DB_CHECKPOINT_LIST_INVALID')
    private_file(STAGE/'pg_restore-list.private',listing)
    after=observe();require(before==after,'CHECKPOINT_STATE_DRIFT')
    artifacts=[checkpoint_artifact(n) for n in ['source.tar','backend.env.preimage','launch.safe-preimage.json','melamedia.dump','pg_restore-list.private']]
    require(next(a['sha256'] for a in artifacts if a['name']=='backend.env.preimage')==before['ownEnvSha256'],'ENV_PREIMAGE_HASH')
    import tarfile
    with tarfile.open(STAGE/'source.tar','r:') as archive:
        members=archive.getmembers();require(bool(members) and all(not m.name.startswith('/') and '..' not in m.name.split('/') for m in members),'SOURCE_ARCHIVE_READBACK')
    value={'contractSha256':CONTRACT_SHA,'phase':PHASE,'target':C['target'],'checkpointedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'result':'CHECKPOINT_VERIFIED_NO_ACTIVATION','baseline':after,'resources':memory,'artifacts':artifacts,
        'scope':'Private source/env/DB checkpoint and pg_restore list validation only; no restore drill or offsite backup claim.'}
    private_file(result,canonical(value));return value
def checkpoint():
    stage_ready();value=read_json(STAGE/'checkpoint.result.json')
    require(value['result']=='CHECKPOINT_VERIFIED_NO_ACTIVATION','CHECKPOINT_NOT_READY')
    require([entry['name'] for entry in value['artifacts']]==['source.tar','backend.env.preimage','launch.safe-preimage.json','melamedia.dump','pg_restore-list.private'],'CHECKPOINT_ARTIFACT_NAMES')
    for entry in value['artifacts']: require(checkpoint_artifact(entry['name'])==entry,'CHECKPOINT_ARTIFACT_DRIFT')
    raw=plain_file(STAGE/'contract.json',4*1024*1024)
    require(digest(raw)==CONTRACT_SHA and json.loads(raw)==C,'STAGE_CONTRACT_BYTES')
    return value
def candidate_objects():
    source=C['source'];candidate=source['candidateCommit']
    bounded(['git','--no-optional-locks','-C',str(ROOT),'fetch','--no-tags','origin','refs/heads/Melamedia'],seconds=50,
        env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    require(git('rev-parse','FETCH_HEAD').decode().strip()==candidate,'ORIGIN_MELAMEDIA_HEAD_CHANGED')
    git('merge-base','--is-ancestor',source['baseCommit'],candidate)
    git('merge-base','--is-ancestor',source['mainAncestor'],candidate)
    entries=git('ls-tree','-rz','--full-tree',candidate,'--','backend').split(b'\0')
    hashes={}
    for entry in entries:
        if not entry:continue
        meta,name=entry.split(b'\t',1);mode,kind,object_id=meta.decode().split()
        require(mode in ('100644','100755') and kind=='blob','CANDIDATE_SOURCE_TYPE')
        hashes[name.decode('utf-8')]=digest(git('cat-file','blob',object_id))
    require(hashes==source['candidateBackendHashes'],'CANDIDATE_BACKEND_MAP_CHANGED')
    guard=git('show',candidate+':scripts/check-signing-release.cjs');manifest=git('show',candidate+':docs/signing-v2/release-baseline.json')
    require(digest(guard)==source['guardScriptSha256'] and digest(manifest)==source['manifestSha256'],'CANDIDATE_PROTECTED_GUARD_BINDING')
    private_file(STAGE/'candidate-check-signing-release.cjs',guard);private_file(STAGE/'candidate-release-baseline.json',manifest)
    sql=git('show',candidate+':backend/migrations/'+MIGRATION)
    require(digest(sql)==C['migration']['sha256'] and sql.startswith(b'BEGIN;\n') and sql.endswith(b'COMMIT;\n'),'MIGRATION_RAW_BYTES')
    private_file(STAGE/MIGRATION,sql)
    node=Path('/proc',str(C['baselineState']['pm2']['own']['pid']),'exe').resolve(strict=True)
    runner="const fs=require('node:fs');const x=require(process.argv[1]);const r=x.checkSigningRelease({root:'/root/Melamedia',ref:process.argv[3],manifest:JSON.parse(fs.readFileSync(process.argv[2],'utf8')),checkWorktree:false});console.log(JSON.stringify(r));"
    checked=json.loads(bounded([str(node),'-e',runner,str(STAGE/'candidate-check-signing-release.cjs'),str(STAGE/'candidate-release-baseline.json'),candidate],seconds=45))
    require(checked['commit']==candidate and checked['files']==103,'CANDIDATE_PROTECTED_CHECK')
    return sql
def apply_schema(sql,prior):
    # Only the exact outer BEGIN/COMMIT are removed. Inner SQL stays byte-exact.
    inner=sql[len(b'BEGIN;\n'):-len(b'COMMIT;\n')].decode('utf-8')
    expected=prior['unrelatedHistorySha256'];require(re.fullmatch('[a-f0-9]{64}',expected),'HISTORY_HASH')
    wrapped="BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL TIME ZONE 'UTC'; LOCK TABLE schema_migrations IN EXCLUSIVE MODE;\n"
    wrapped+="DO $qa_guard$ BEGIN IF to_regclass('public.signing_word_authoring_renders') IS NOT NULL OR EXISTS(SELECT 1 FROM schema_migrations WHERE filename='"+MIGRATION+"') THEN RAISE EXCEPTION 'QA_SCHEMA_PREEXISTS'; END IF; IF (SELECT encode(sha256(convert_to(COALESCE(string_agg(filename||'|'||applied_at::text,E'\\n' ORDER BY filename),''),'UTF8')),'hex') FROM schema_migrations WHERE filename<>'"+MIGRATION+"') <> '"+expected+"' THEN RAISE EXCEPTION 'QA_HISTORY_CHANGED'; END IF; END $qa_guard$;\n"
    wrapped+=inner+"\nINSERT INTO schema_migrations(filename) VALUES ('"+MIGRATION+"'); COMMIT;\n"
    private_file(STAGE/'migration-atomic.private.sql',wrapped.encode())
    peer(wrapped,seconds=45)
def own_controls(own):
    return {key:own[key] for key in ['name','pmId','cwdSha256','execSha256','controlsSha256','cwd','execPath','execMode','instances','watchPresent','watchEnabled','watchExactlyFalse','autorestart']}
def nonqa(state):return [entry for entry in state['pm2']['processes'] if entry['name']!='melamedia-api']
def after_schema(before,after):
    require(after['unrelatedHistorySha256']==before['unrelatedHistorySha256'],'UNRELATED_HISTORY_CHANGED')
    old={t['name']:t for t in before['schema']['tables']};new={t['name']:t for t in after['schema']['tables']}
    require(all(new.get(name)==table for name,table in old.items()),'EXISTING_WORD_SCHEMA_CHANGED')
    table=new.get('signing_word_authoring_renders');require(table is not None and not table['rls'] and not table['force'] and not table['policies'],'DEDICATED_NEW_TABLE_SHAPE')
    names={column['name'] for column in table['columns']}
    require(names=={'id','owner_context_id','source_id','source_version','created_by','source_sha256','inputs_hash','pdf_sha256','pdf_object_key','pdf_bytes','page_count','map_sha256','map_object_key','map_bytes','model_version','created_at'}
        and len(table['triggers'])==1 and 'signing_word_record_immutable' in table['triggers'][0]
        and len(table['indexes'])>=2,'NEW_TABLE_STRUCTURE')
    require(after['schema']['migrationHistoryColumns']==before['schema']['migrationHistoryColumns']
        and len(after['schema']['migrationHistoryRows'])==1 and after['schema']['migrationHistoryRows'][0]['filename']==MIGRATION,'MIGRATION_HISTORY_RECORD')
def target_source(state):
    require(state['source']['head']==C['source']['candidateCommit'] and state['source']['branch']=='DETACHED'
        and state['source']['trackedClean'] and state['source']['backendFiles']==C['source']['candidateBackendHashes'],'ACTIVATED_SOURCE_CHANGED')
def invariant_controls(before,after):
    require(after['ownEnvSha256']==before['ownEnvSha256'] and after['dependencies']==before['dependencies']
        and after['appEffectiveUppercaseEnv']==before['appEffectiveUppercaseEnv'],'ENV_OR_DEPENDENCY_CHANGED')
    require(nonqa(after)==nonqa(before),'NON_QA_PROCESS_CHANGED')
    require(own_controls(after['pm2']['own'])==own_controls(before['pm2']['own']),'QA_PROCESS_CONTROLS_CHANGED')
def ready_health():
    import urllib.request,urllib.error
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect());end=time.monotonic()+25;last={}
    while time.monotonic()<end:
        last={}
        for name,url in [('local','http://127.0.0.1:3003/health'),('public','https://api-melamedia.mela-media.co.il/health')]:
            try:
                with opener.open(url,timeout=min(3,max(.1,end-time.monotonic()))) as response:
                    body=response.read(65537);require(len(body)<=65536,'HEALTH_BODY_BOUND')
                    data=json.loads(body);last[name]={'status':response.status,'jsonOk':isinstance(data,dict) and data.get('ok') is True,'bodySha256':digest(body)}
            except Exception as error:last[name]={'errorType':type(error).__name__}
        if all(last.get(name,{}).get('status')==200 and last[name].get('jsonOk') for name in ('local','public')):return last
        time.sleep(.5)
    raise RuntimeError('QA_HEALTH_NOT_READY')
def check_worktree_guard(state):
    require(digest(plain_file(ROOT/'scripts/check-signing-release.cjs'))==C['source']['guardScriptSha256']
        and digest(plain_file(ROOT/'docs/signing-v2/release-baseline.json'))==C['source']['manifestSha256'],'WORKTREE_GUARD_BYTES')
    node=Path('/proc',str(state['pm2']['own']['pid']),'exe').resolve(strict=True)
    checked=json.loads(bounded([str(node),str(ROOT/'scripts/check-signing-release.cjs'),'HEAD'],seconds=45))
    require(checked['commit']==C['source']['candidateCommit'] and checked['files']==103,'WORKTREE_PROTECTED_CHECK')
def do_apply():
    global ACTION_STARTED
    saved=checkpoint();before=observe();baseline_cas(before,saved['baseline']);no_new_schema(before);memory=resource_gate(before)
    intent,result=phase_paths();private_file(intent,canonical({'contractSha256':CONTRACT_SHA,'phase':PHASE,'state':'INTENT'}));ACTION_STARTED=True
    sql=candidate_objects()
    current=observe();baseline_cas(current,saved['baseline'])
    # Watch=false is qualified before ff-only source activation; no branch switch.
    bounded(['git','--no-optional-locks','-c','core.hooksPath=/dev/null','-C',str(ROOT),'merge','--ff-only','--no-edit',C['source']['candidateCommit']],seconds=25,
        env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
    source=source_state();require(source['head']==C['source']['candidateCommit'] and source['branch']=='DETACHED'
        and source['trackedClean'] and source['backendFiles']==C['source']['candidateBackendHashes'],'FF_SOURCE_READBACK')
    check_worktree_guard(current)
    apply_schema(sql,before)
    intermediate=observe();target_source(intermediate);after_schema(before,intermediate);invariant_controls(before,intermediate)
    pm2=shutil.which('pm2');require(bool(pm2),'PM2_NOT_AVAILABLE')
    bounded([pm2,'restart','5'],seconds=25)
    endpoints=ready_health();after=observe();time.sleep(1);stable=observe()
    require(after==stable,'QA_POST_RESTART_UNSTABLE');target_source(after);after_schema(before,after);invariant_controls(before,after)
    require(after['pm2']['own']['restarts']==before['pm2']['own']['restarts']+1
        and after['pm2']['own']['pid']!=before['pm2']['own']['pid'],'QA_RESTART_READBACK')
    check_worktree_guard(after);fresh=resource_gate(after)
    value={'contractSha256':CONTRACT_SHA,'phase':PHASE,'target':C['target'],'appliedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'result':'QA_BACKEND_APPLIED_VERIFIED_DEDICATED_ONLY','candidateCommit':C['source']['candidateCommit'],
        'state':after,'health':endpoints,'resources':fresh,'preApplyResources':memory,
        'scope':'QA backend only; dedicated mode, no shared-RLS qualification, provider activation, frontend publication or actual feature QA.',
        'recovery':'No automatic rollback/DB restore. Forward repair must retain new Word provenance/privacy/context guards and additive schema/history.'}
    private_file(result,canonical(value));return value
def do_verify():
    saved=checkpoint();applied=read_json(STAGE/'apply.result.json')
    require(applied['result']=='QA_BACKEND_APPLIED_VERIFIED_DEDICATED_ONLY','APPLY_NOT_VERIFIED')
    intent,result=phase_paths();private_file(intent,canonical({'contractSha256':CONTRACT_SHA,'phase':PHASE,'state':'READ_ONLY_VERIFY_INTENT'}))
    first=observe();target_source(first);after_schema(saved['baseline'],first);invariant_controls(saved['baseline'],first)
    require(first==applied['state'],'APPLIED_STATE_DRIFT');endpoints=ready_health();second=observe()
    require(first==second,'VERIFY_STATE_DRIFT');check_worktree_guard(second);memory=resource_gate(second)
    value={'contractSha256':CONTRACT_SHA,'phase':PHASE,'target':C['target'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'result':'QA_BACKEND_VERIFY_DEDICATED_ONLY','candidateCommit':C['source']['candidateCommit'],
        'state':second,'health':endpoints,'resources':memory,
        'predicates':{'sourceAndDetachedStateVerified':True,'protectedSource103Verified':True,'exactMigrationRecorded':True,
            'unrelatedHistoryPreserved':True,'schemaQualifiedDedicatedOnly':True,'environmentAndDependenciesPreserved':True,
            'uppercaseAppEffectiveEnvPreserved':True,'nonQaProcessesPreserved':True,'singleObservedForkWatchFalsePreserved':True,
            'healthJsonOk':True,'memoryHeadroomVerified':True,'privateCheckpointVerified':True},
        'scope':'Read-only backend verification; no frontend/feature/browser/shared-RLS/recovery drill claim.'}
    private_file(result,canonical(value));return value
def release_main():
    require(C['target']=={'host':'root@37.60.230.148','root':'/root/Melamedia','database':'melamedia','pm2Id':5,'pm2Name':'melamedia-api','branchState':'DETACHED'},'REMOTE_FIXED_TARGET')
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    okay,_=acquire('/run/lock/melamedia-release-maintenance.lock',True)
    if not okay:return {'result':'BUSY_NO_ACTION','phase':PHASE,'contractSha256':CONTRACT_SHA},75
    okay,_=acquire('/run/lock/melamedia-legal-melamedia-release.lock',False,True)
    if not okay:return {'result':'BUSY_NO_ACTION','phase':PHASE,'contractSha256':CONTRACT_SHA},75
    if PHASE=='checkpoint':return do_checkpoint(),0
    if PHASE=='apply':return do_apply(),0
    return do_verify(),0
def release_alarm(_signum,_frame):raise RuntimeError('RELEASE_TIME_BUDGET')
signal.signal(signal.SIGALRM,release_alarm);signal.alarm(TIME_BUDGET+2)
try:value,code=release_main()
except Exception as error:
    known=str(error) if isinstance(error,RuntimeError) else None
    value={'result':'FAILED_FORWARD_REPAIR_REQUIRED' if ACTION_STARTED else 'FAILED_NO_APPLICATION_MUTATION_CLAIM',
        'contractSha256':CONTRACT_SHA,'phase':PHASE,'errorCode':known if known and re.fullmatch('[A-Z0-9_]{1,100}',known) else type(error).__name__,
        'subprocessFailure':LAST_SUBPROCESS_FAILURE,'partialPhasePossible':True,
        'recovery':'Do not rerun a mutating phase blindly. Preserve intent/preimages; inspect actual source/schema/process state and prepare guarded forward repair. No automatic old-source rollback or DB restore.'}
    code=1
    if STAGE.is_dir() and not STAGE.is_symlink():
        try:private_file(STAGE/(PHASE+'.failure-'+os.urandom(6).hex()+'.json'),canonical(value))
        except Exception:pass
finally:
    signal.alarm(0)
    for fd in reversed(LOCKS):os.close(fd)
sys.stdout.write(json.dumps(value,sort_keys=True)+'\n');sys.exit(code)
'''


def helpers():
    raw = OBSERVER.read_bytes(); require(sha(raw) == OBSERVER_SHA, 'OBSERVER_PIN_CHANGED')
    module = ast.parse(raw)
    value = next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == 'REMOTE' for t in node.targets))
    value = value[:value.index('def main():')].replace('__HEALTH__', 'False')
    require(value.count('left = 41 - (time.monotonic()-START)') == 1, 'HELPER_BUDGET_BOUNDARY')
    return value.replace('left = 41 - (time.monotonic()-START)', 'left = TIME_BUDGET - (time.monotonic()-START)')


def private_write(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream: stream.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contract', required=True, type=Path)
    parser.add_argument('--phase', choices=['checkpoint', 'apply', 'verify'], default='checkpoint')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    at = datetime.datetime.now(datetime.timezone.utc)
    name = 'qa-backend-release-' + args.phase + '-' + at.strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid.uuid4().hex[:8]
    receipt = {'at': at.isoformat(), 'phase': args.phase, 'kind': 'QA_ONLY_BACKEND_RELEASE', 'target': TARGET,'sshAttempted': False,
        'driverSha256': sha(Path(__file__).read_bytes()), 'result': 'LOCAL_CONTRACT_REJECTED_BEFORE_SSH'}
    code = 1
    try:
        c, raw = load_contract(args.contract); shared = helpers()
        receipt.update({'contractSha256': sha(raw), 'candidateCommit': c['source']['candidateCommit'], 'localHeadBinding': c['source']['mainAncestor']})
        if not args.execute:
            print(json.dumps({'result': 'PLAN_ONLY_NOT_EXECUTED', 'phase': args.phase, 'contractSha256': sha(raw),
                'candidateCommit': c['source']['candidateCommit'], 'stage': '/root/word-visual-qa-20261026-' + sha(raw)[:20],
                'recovery': 'Forward repair retaining Word privacy/provenance/context; no automatic source rollback or DB restore.'}))
            return 0
        receipt['ledgersReadBefore'] = {str(path): sha(path.read_bytes()) for path in LEDGERS}
        budget = 300 if args.phase in ('checkpoint', 'apply') else 100
        tail = REMOTE_RELEASE.replace('__CONTRACT_BASE64__', base64.b64encode(raw).decode()).replace('__CONTRACT_SHA__', sha(raw))
        tail = tail.replace('__PHASE__', args.phase).replace('__TIME_BUDGET__', str(budget))
        payload = (shared + '\n' + tail).encode(); receipt['remotePayloadSha256'] = sha(payload)
        private = OUT / 'private-qa-backend-release02'; private.mkdir(mode=0o700, exist_ok=True)
        info = private.lstat(); require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
            and stat.S_IMODE(info.st_mode) == 0o700, 'UNSAFE_LOCAL_PRIVATE_DIRECTORY')
        stdout_path, stderr_path = private / (name + '.stdout'), private / (name + '.stderr')
        private_write(stdout_path, b''); private_write(stderr_path, b'')
        command = ['ssh', '-T', '-i', str(Path.home() / '.ssh/id_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no', '-o', 'ClearAllForwardings=yes',
            '-o', 'ConnectTimeout=8', '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
            TARGET['host'], 'timeout --signal=TERM --kill-after=3s ' + str(budget+5) + 's python3 -']
        receipt['argv'] = command; receipt['sshAttempted'] = True
        with stdout_path.open('ab') as stdout, stderr_path.open('ab') as stderr:
            try:code = subprocess.run(command, input=payload, stdout=stdout, stderr=stderr, timeout=budget+18).returncode
            except subprocess.TimeoutExpired:code=124
            except OSError as error:code=125;stderr.write(('LOCAL_TRANSPORT_ERROR:'+type(error).__name__).encode())
        receipt['transportExitCode'] = code
        output = stdout_path.read_bytes(); require(len(output)<=8*1024*1024,'REMOTE_OUTPUT_BOUND')
        value=json.loads(output);require(isinstance(value,dict) and value.get('contractSha256')==sha(raw) and value.get('phase')==args.phase,'REMOTE_RECEIPT_BINDING')
        expected={'CHECKPOINT_VERIFIED_NO_ACTIVATION':0,'QA_BACKEND_APPLIED_VERIFIED_DEDICATED_ONLY':0,'QA_BACKEND_VERIFY_DEDICATED_ONLY':0,
            'BUSY_NO_ACTION':75,'FAILED_FORWARD_REPAIR_REQUIRED':1,'FAILED_NO_APPLICATION_MUTATION_CLAIM':1}
        require(value.get('result') in expected and code==expected[value['result']],'REMOTE_EXIT_RESULT')
        receipt['result']=value['result'];receipt['remote']=value
        for label,path in [('privateStdout',stdout_path),('privateStderr',stderr_path)]:
            state=path.lstat();require(stat.S_ISREG(state.st_mode) and not stat.S_ISLNK(state.st_mode)
                and stat.S_IMODE(state.st_mode)==0o600,'RAW_EVIDENCE_MODE')
            receipt[label]={'path':str(path),'sha256':sha(path.read_bytes()),'bytes':state.st_size,'mode':'0600'}
    except Exception as error:
        receipt['result']='LOCAL_OR_TRANSPORT_FAILED_PARTIAL_PHASE_POSSIBLE' if receipt['sshAttempted'] else 'LOCAL_CONTRACT_REJECTED_BEFORE_SSH'
        receipt['errorType']=type(error).__name__
        if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)):receipt['errorCode']=str(error)
    path=OUT/(name+'.json');private_write(path,(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode());digest=sha(path.read_bytes())
    line='\n- '+at.isoformat()+' QA-only backend '+args.phase+' operator, candidate '+receipt.get('candidateCommit','unbound')+', result '+receipt['result']+'. Evidence '+str(path)+' SHA256 '+digest+'. Driver/contract/payload and actual safe state bound; no production/provider/outbound action, shared-RLS or browser/full-feature claim. No automatic rollback/DB restore.\n'
    failures=[]
    for ledger in LEDGERS:
        try:
            fd=os.open(ledger,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
            with os.fdopen(fd,'wb') as stream:stream.write(line.encode())
        except OSError:failures.append(str(ledger))
    print(json.dumps({'receipt':str(path),'sha256':digest,'result':receipt['result'],'phase':args.phase,
        'candidateCommit':receipt.get('candidateCommit'),'ledgerAppendFailures':failures}))
    return 0 if receipt['result'] in ('CHECKPOINT_VERIFIED_NO_ACTIVATION','QA_BACKEND_APPLIED_VERIFIED_DEDICATED_ONLY','QA_BACKEND_VERIFY_DEDICATED_ONLY') and not failures else 1


if __name__=='__main__':raise SystemExit(main())
