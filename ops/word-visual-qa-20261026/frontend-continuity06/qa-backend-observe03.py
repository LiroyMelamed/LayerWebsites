#!/usr/bin/env python3
"""Pinned read-only augmentation of observer02; default plan never contacts QA."""
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
PROTECTED = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
LEDGERS = [PROTECTED / 'outputs/signing-implementation-20261007/TEST-LEDGER.md',
           PROTECTED / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
HOST = 'root@37.60.230.148'
TARGET = {'host': HOST, 'root': '/root/Melamedia', 'database': 'melamedia',
          'pm2Id': 5, 'pm2Name': 'melamedia-api', 'branchState': 'DETACHED'}
KIND = 'READ_ONLY_QA_BASELINE_OBSERVATION_AUGMENTED'
RESULT = 'OBSERVED_STABLE_ACTUAL_CODE_FIX_BASELINE'
OBSERVER = OUT / 'qa-backend-observe02.py'
OBSERVER_SHA = 'adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
RELEASE = OUT / 'qa-backend-release02.py'
RELEASE_SHA = 'bf4369a26ec6284419bbc848ed4d3b9fb37a200e28d2638256322657e2f93dc3'
BASELINE_VERIFICATION = {'path': str(OUT / 'qa-backend-code-fix-verify-20261027T032524569993Z-617af7cc.json'),
                         'sha256': '9f9bc215f56f0e573cecea9352bb43991d30c31e1527c97bab245790ce86a0fa'}
BASELINE_CANDIDATE = 'fb0d6c22640f8b01911a9c6491ec856c4f5ab71a'
BASELINE_DRIVER_SHA = '4b13519dde9fe2c675224f0c0083b1399b2357b14e4d795ef9a375da6dbcfabc'
PREDICATES = frozenset(('sourceAndDetachedStateVerified', 'protectedSource103Verified', 'exactMigrationRecorded',
    'unrelatedHistoryPreserved', 'schemaQualifiedDedicatedOnly', 'environmentAndDependenciesPreserved',
    'uppercaseAppEffectiveEnvPreserved', 'nonQaProcessesPreserved', 'singleObservedForkWatchFalsePreserved',
    'healthJsonOk', 'memoryHeadroomVerified', 'privateCheckpointVerified'))
RESULT_CODES = {RESULT: 0, 'BUSY_NO_OBSERVATION': 75, 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH': 2, 'OBSERVATION_FAILED': 1}


def sha(raw): return hashlib.sha256(raw).hexdigest()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
def require(ok, code):
    if not ok: raise RuntimeError(code)


def pinned_bytes(path, expected, maximum=8 * 1024 * 1024):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and 0 < info.st_size <= maximum, 'UNSAFE_PINNED_INPUT')
    raw = path.read_bytes(); require(sha(raw) == expected, 'PINNED_INPUT_CHANGED')
    return raw


def literal(raw, name):
    tree = ast.parse(raw)
    return next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))


def baseline():
    proof = json.loads(pinned_bytes(Path(BASELINE_VERIFICATION['path']), BASELINE_VERIFICATION['sha256']))
    remote = proof.get('remote', {})
    require(proof.get('kind') == 'QA_ONLY_BACKEND_CODE_FIX' and proof.get('phase') == 'verify'
        and proof.get('result') == remote.get('result') == 'QA_BACKEND_CODE_FIX_VERIFY_DEDICATED_ONLY'
        and remote.get('kind') == 'QA_ONLY_BACKEND_CODE_FIX' and remote.get('phase') == 'verify'
        and proof.get('driverSha256') == BASELINE_DRIVER_SHA and proof.get('sshAttempted') is True
        and type(proof.get('transportExitCode')) is int and proof['transportExitCode'] == 0
        and proof.get('candidateCommit') == remote.get('candidateCommit') == BASELINE_CANDIDATE
        and proof.get('target') == remote.get('target') == TARGET
        and proof.get('contractSha256') == remote.get('contractSha256')
        and all(remote.get('predicates', {}).get(key) is True for key in PREDICATES), 'ACTUAL_CODE_FIX_BASELINE_REQUIRED')
    state = remote.get('state', {}); own = state.get('pm2', {}).get('own', {})
    require(state.get('source', {}).get('head') == BASELINE_CANDIDATE
        and state['source'].get('branch') == 'DETACHED' and state['source'].get('trackedClean') is True
        and len(state['source'].get('backendFiles', {})) == 807
        and own.get('pid') == 1642213 and own.get('restarts') == 10 and own.get('startTicks') == '74101544'
        and re.fullmatch('[a-f0-9]{64}', state.get('unrelatedHistorySha256', ''))
        and re.fullmatch('[a-f0-9]{64}', state.get('appEffectiveUppercaseEnv', {}).get('sha256', ''))
        and type(state['appEffectiveUppercaseEnv'].get('keys')) is int, 'COMPLETE_CODE_FIX_BASELINE_REQUIRED')
    endpoints = remote.get('health', {})
    require(all(endpoints.get(key, {}).get('status') == 200 and endpoints[key].get('jsonOk') is True
                and re.fullmatch('[a-f0-9]{64}', endpoints[key].get('bodySha256', '')) for key in ('local', 'public'))
            and endpoints['local']['bodySha256'] == endpoints['public']['bodySha256'], 'BASELINE_HEALTH_REQUIRED')
    return state, endpoints['local']['bodySha256']


REMOTE_AUGMENT = r'''
BASELINE_STATE=json.loads(base64.b64decode('__BASELINE_STATE__'))
BASELINE_HEALTH_SHA='__BASELINE_HEALTH_SHA__'
TARGET=json.loads(base64.b64decode('__TARGET__'))
def augmented_snapshot():
    value=snapshot()
    value['appEffectiveUppercaseEnv']=effective_env_hash(value['pm2']['own']['pid'])
    value['unrelatedHistorySha256']=history()
    return value
def main():
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    okay,_=acquire('/run/lock/melamedia-release-maintenance.lock',True)
    if not okay:return {'result':'BUSY_NO_OBSERVATION','busyLock':'maintenance','observed':False,'noRuntimeMutation':True},75
    okay,created=acquire('/run/lock/melamedia-legal-melamedia-release.lock',False,True)
    if not okay:return {'result':'BUSY_NO_OBSERVATION','busyLock':'qa','observed':False,'noRuntimeMutation':True},75
    before=augmented_snapshot(); endpoints=augmented_health(); after=augmented_snapshot(); resource=resources(after['pm2']['processes'])
    stable=before==after
    matched=stable and before==BASELINE_STATE
    recognized=all(flag['recognized'] and not flag['enabled'] for flag in before['modes']['effective'].values())
    health_ok=all(endpoints.get(key,{}).get('status')==200 and endpoints[key].get('jsonOk') is True
        and endpoints[key].get('bodySha256')==BASELINE_HEALTH_SHA for key in ('local','public'))
    qualified=matched and recognized and health_ok and resource['meetsConservativeAvailableMemoryGate']
    own=after['pm2']['own']
    return {'result':'OBSERVED_STABLE_ACTUAL_CODE_FIX_BASELINE' if qualified else 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH',
        'observed':True,'before':before,'after':after,'stateStable':stable,'actualCodeFixBaselineMatched':matched,
        'noRuntimeMutation':True,'target':TARGET,'effectiveModesRecognized':recognized,
        'qaProcessOnline':own['status']=='online',
        'qaSingleFork':own['execMode']=='fork_mode' and own['instances'] in (None,1)
            and sum(item['name']=='melamedia-api' for item in after['pm2']['processes'])==1,
        'qaWatchExactlyFalse':own['watchExactlyFalse'],'resources':resource,'health':endpoints,
        'coordinationLockCreated':created,'elapsedSeconds':round(time.monotonic()-START,3),
        'limits':['Exact safe metadata equality to the actual05 verification; no new twelve-predicate, application, shared-RLS or recovery claim.',
        'No app/source/env/schema/provider mutation; coordination-lock metadata only.']},0 if qualified else 2
'''


def build_payload():
    old = literal(pinned_bytes(OBSERVER, OBSERVER_SHA), 'REMOTE')
    release = literal(pinned_bytes(RELEASE, RELEASE_SHA), 'REMOTE_RELEASE')
    helpers = {node.name: node for node in ast.parse(release).body if isinstance(node, ast.FunctionDef)}
    selected = '\n\n'.join(ast.get_source_segment(release, helpers[name]) for name in ('effective_env_hash', 'peer', 'history'))
    original_health = next(node for node in ast.parse(old).body if isinstance(node, ast.FunctionDef) and node.name == 'health')
    health = ast.get_source_segment(old, original_health).replace('def health():', 'def augmented_health():', 1)
    source = "result[name]={'status':response.status,'bytes':len(data),'bodySha256':digest(data)}"
    require(health.count(source) == 1, 'HEALTH_HELPER_BOUNDARY_CHANGED')
    health = health.replace(source, "parsed=json.loads(data.decode('utf-8')); require(isinstance(parsed,dict) and parsed.get('ok') is True,'HEALTH_JSON_NOT_OK')\n                result[name]={'status':response.status,'bytes':len(data),'bodySha256':digest(data),'jsonOk':True}")
    state, health_sha = baseline()
    tail = REMOTE_AUGMENT.replace('__BASELINE_STATE__', base64.b64encode(canonical(state)).decode())
    tail = tail.replace('__BASELINE_HEALTH_SHA__', health_sha).replace('__TARGET__', base64.b64encode(canonical(TARGET)).decode())
    # Every original observer helper, including snapshot(), remains byte exact.
    # Only selected read-only helpers and the new augmentation/main are appended.
    prefix = old[:old.index('def main():')].replace('__HEALTH__', 'True')
    footer = old[old.index('def alarm('):]
    payload = (prefix + '\n' + selected + '\n' + health + '\n' + tail + '\n' + footer).encode()
    require(len(payload) <= 2 * 1024 * 1024, 'OBSERVER_PAYLOAD_BOUND')
    return payload


def private_write(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream: stream.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observe', action='store_true')
    parser.add_argument('--health', action='store_true', help='Required with --observe; fixed local/public QA health only.')
    args = parser.parse_args()
    if not args.observe:
        print(json.dumps({'result':'PLAN_ONLY_NOT_EXECUTED','kind':KIND,'target':TARGET,'baselineVerification':BASELINE_VERIFICATION,
            'observer02Sha256':OBSERVER_SHA,'release02Sha256':RELEASE_SHA,
            'execute':'python3 qa-backend-observe03.py --observe --health',
            'noRuntimeMutation':True,'limits':'Read-only hash/metadata augmentation; no twelve-predicate or feature approval.'}))
        return 0
    at = datetime.datetime.now(datetime.timezone.utc)
    name = 'qa-backend-observe03-' + at.strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid.uuid4().hex[:8]
    private = OUT / 'private-qa-backend-observe03'
    stdout_path, stderr_path = private / (name + '.stdout'), private / (name + '.stderr')
    command = ['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes',
        '-o','StrictHostKeyChecking=yes','-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes',
        '-o','ConnectTimeout=8','-o','ConnectionAttempts=1','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',HOST,
        'timeout --signal=TERM --kill-after=2s 46s python3 -']
    receipt = {'at':at.isoformat(),'kind':KIND,'target':TARGET,'host':HOST,'baselineVerification':BASELINE_VERIFICATION,
        'driverSha256':sha(Path(__file__).read_bytes()),'observer02Sha256':OBSERVER_SHA,'release02Sha256':RELEASE_SHA,
        'argv':command,'healthRequested':args.health,'sshAttempted':False,'result':'SETUP_FAILED_NOT_EXECUTED',
        'limits':['No runtime/source/env/SQL/PM2/provider writes. Raw transport private0600; no app rows or raw env/jlist output.',
                  'No new test/deployment/application/twelve-predicate/shared-RLS/rollback result.']}
    code = 1
    try:
        receipt['ledgersReadBefore'] = {str(path):sha(path.read_bytes()) for path in LEDGERS}
        require(args.health, 'EXPLICIT_FIXED_HEALTH_REQUIRED')
        payload = build_payload(); receipt['remotePayloadSha256'] = sha(payload)
        private.mkdir(mode=0o700, exist_ok=True)
        info = private.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700,
                'UNSAFE_LOCAL_PRIVATE_EVIDENCE_DIRECTORY')
        private_write(stdout_path,b''); private_write(stderr_path,b'')
        with stdout_path.open('ab') as stdout, stderr_path.open('ab') as stderr:
            receipt['sshAttempted'] = True
            try: code = subprocess.run(command,input=payload,stdout=stdout,stderr=stderr,timeout=55).returncode
            except subprocess.TimeoutExpired: code = 124
            except OSError as error: code=125; stderr.write(('LOCAL_TRANSPORT_ERROR:'+type(error).__name__).encode())
        raw = stdout_path.read_bytes(); receipt['transportExitCode'] = code
        require(len(raw)<=5*1024*1024, 'REMOTE_OUTPUT_BOUND')
        value = json.loads(raw)
        require(isinstance(value,dict) and value.get('result') in RESULT_CODES and code==RESULT_CODES[value['result']], 'REMOTE_RESULT_OR_EXIT_CHANGED')
        if value['result']==RESULT:
            expected, expected_health = baseline()
            require(value.get('before')==value.get('after')==expected and value.get('stateStable') is True
                and value.get('actualCodeFixBaselineMatched') is True and value.get('noRuntimeMutation') is True
                and value.get('target')==TARGET and value.get('resources',{}).get('meetsConservativeAvailableMemoryGate') is True
                and all(value.get('health',{}).get(key,{}).get('status')==200
                        and value['health'][key].get('jsonOk') is True and value['health'][key].get('bodySha256')==expected_health
                        for key in ('local','public')), 'AUGMENTED_BASELINE_READBACK_CHANGED')
        receipt['observation']=value; receipt['result']=value['result']
        for label,path in [('privateStdout',stdout_path),('privateStderr',stderr_path)]:
            info=path.lstat()
            require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode)==0o600,'EVIDENCE_MODE_INVALID')
            receipt[label]={'path':str(path),'sha256':sha(path.read_bytes()),'bytes':info.st_size,'mode':'0600'}
    except Exception as error:
        receipt['result']='SETUP_FAILED_NOT_EXECUTED' if not receipt['sshAttempted'] else 'LOCAL_POSTVALIDATION_FAILED'
        receipt['localErrorType']=type(error).__name__
    receipt_path=OUT/(name+'.json'); private_write(receipt_path,(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode())
    receipt_sha=sha(receipt_path.read_bytes())
    line=('\n- '+at.isoformat()+' QA augmented READ-ONLY observer03 baseline commit '+BASELINE_CANDIDATE
        +', result '+receipt['result']+', transportExit '+str(receipt.get('transportExitCode','not-executed'))
        +'. Evidence '+str(receipt_path)+' SHA256 '+receipt_sha+'. Driver/helper/baseline/safe metadata bound; no application/runtime mutation or new feature/twelve-predicate/shared-RLS claim.\n')
    failures=[]
    for path in LEDGERS:
        try:
            descriptor=os.open(path,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
            with os.fdopen(descriptor,'wb') as stream:stream.write(line.encode())
        except OSError: failures.append(str(path))
    print(json.dumps({'receipt':str(receipt_path),'sha256':receipt_sha,'result':receipt['result'],
        'head':receipt.get('observation',{}).get('after',{}).get('source',{}).get('head'),
        'stateStable':receipt.get('observation',{}).get('stateStable'),'ledgerAppendFailures':failures}))
    return 0 if receipt['result']==RESULT and not failures else 1


if __name__ == '__main__': raise SystemExit(main())
