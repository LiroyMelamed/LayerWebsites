#!/usr/bin/env python3
"""One root-reviewed phase only. Default is a local plan; never a batch rollout."""
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
import re
import shlex
import subprocess
from pathlib import Path

ROOT = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OPS = ROOT / 'outputs/word-stage-candidate-20261026/ops'
PRIVATE = Path('/Users/liroymelamed/.codex/private/legal-word-stage-release-20261026')
LEDGERS = [ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md', ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md']
TENANTS = {'melamedlaw', 'morlevy', 'ashrafessa'}
PHASES = ['checkpoint', 'schema_config', 'activate', 'verify', 'rollback']
HASH = lambda b: hashlib.sha256(b).hexdigest()


def require(ok, code):
    if not ok:
        raise ValueError(code)


def read_json(path, limit=2 * 1024 * 1024):
    raw = Path(path).read_bytes()
    require(0 < len(raw) <= limit, 'JSON_PAYLOAD_BOUND')
    return raw, json.loads(raw)


def sensitive_key(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if re.fullmatch(r'password|token|secret|dotenvBase64|pm2Root|nested|effective|rootLaunch|fullRows', key, re.I):
                return True
            if sensitive_key(item):
                return True
    elif isinstance(value, list):
        return any(sensitive_key(x) for x in value)
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contract', required=True)
    parser.add_argument('--contract-sha', required=True)
    parser.add_argument('--phase', choices=PHASES, required=True)
    parser.add_argument('--recovery')
    parser.add_argument('--recovery-sha')
    parser.add_argument('--execute-reviewed', action='store_true')
    args = parser.parse_args()
    raw, contract = read_json(args.contract)
    require(HASH(raw) == args.contract_sha, 'CONTRACT_BYTES_CHANGED')
    scripts = {name: (OPS / name).read_bytes() for name in ['backend-release02.cjs', 'converter-inventory01.py', 'run-backend-release02.py']}
    script_hashes = {name: HASH(code) for name, code in scripts.items()}
    if not args.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_REVIEW_PLAN_ONLY_NO_SSH', 'phase': args.phase, 'tenant': contract.get('tenant'),
                          'contractStatus': contract.get('status'), 'contractSha256': HASH(raw), 'actualScriptHashes': script_hashes,
                          'requiredPhaseOrder': PHASES, 'rootMustSealCriticalQaAndCurrentCasBeforeExecution': True,
                          'remoteExecutionPerformed': False, 'conditionalRecoveryBindingRequired': args.phase == 'rollback'}))
        return
    require(contract.get('tenant') in TENANTS and contract.get('status') == 'SEALED_AFTER_CRITICAL_QA', 'DRAFT_OR_WRONG_TARGET')
    require(contract.get('scriptHashes') == script_hashes, 'REVIEWED_EXECUTOR_BYTES_CHANGED')
    qa = contract.get('qaProof') or {}
    qa_raw, qa_document = read_json(qa.get('localPath', ''))
    require(HASH(qa_raw) == qa.get('sha256') and qa_document.get('criticalGatesPassed') is True
            and qa_document.get('converterPassed') is True and qa_document.get('resourceAdmissionPassed') is True
            and qa_document.get('customerCap1Verified') is True and qa_document.get('qaCap2Accounted') is True,
            'ACTUAL_CURRENT_CRITICAL_QA_PROOF_REQUIRED')
    require(qa_document.get('sourceBinding') == qa.get('sourceBinding') and bool(qa.get('sourceBinding')), 'QA_SOURCE_BINDING_CHANGED')
    recovery, recovery_hash = None, None
    if args.phase == 'rollback':
        require(args.recovery and args.recovery_sha, 'FRESH_ROOT_RECOVERY_BINDING_REQUIRED')
        recovery_raw, recovery = read_json(args.recovery)
        recovery_hash = HASH(recovery_raw)
        require(recovery_hash == args.recovery_sha and recovery.get('originalContractSha256') == args.contract_sha
                and recovery.get('tenant') == contract['tenant'] and recovery.get('approvedConditionalForwardRollback') is True,
                'RECOVERY_BINDING_CHANGED')
    else:
        require(not args.recovery and not args.recovery_sha, 'RECOVERY_ONLY_FOR_ROLLBACK')
    for ledger in LEDGERS:
        ledger.read_text()
    contract['phase'] = args.phase
    encoded = base64.b64encode(json.dumps(contract, separators=(',', ':')).encode()).decode()
    converter = base64.b64encode(scripts['converter-inventory01.py']).decode()
    recovery_encoded = base64.b64encode(json.dumps(recovery, separators=(',', ':')).encode()).decode()
    prefix = ("const REVIEWED_CONTRACT=JSON.parse(Buffer.from('" + encoded + "','base64'));\n"
              "const REVIEWED_CONTRACT_SHA='" + args.contract_sha + "';\n"
              "const REVIEWED_CONVERTER_INVENTORY=Buffer.from('" + converter + "','base64').toString('utf8');\n"
              "const REVIEWED_RECOVERY=JSON.parse(Buffer.from('" + recovery_encoded + "','base64'));\n"
              "const REVIEWED_RECOVERY_SHA=" + json.dumps(recovery_hash) + ";\n").encode()
    payload = prefix + scripts['backend-release02.cjs']
    require(len(payload) <= 4 * 1024 * 1024, 'REMOTE_SOURCE_PAYLOAD_BOUND')
    os.umask(0o077)
    PRIVATE.mkdir(parents=True, exist_ok=True)
    os.chmod(PRIVATE, 0o700)
    at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    name = contract['tenant'] + '-' + args.phase + '-' + stamp
    argv = ['flock', '--shared', '--nonblock', '/run/lock/melamedia-release-maintenance.lock',
            'flock', '--exclusive', '--nonblock', '/run/lock/melamedia-legal-' + contract['tenant'] + '-release.lock',
            'timeout', '--signal=TERM', '--kill-after=5s', '900s', 'node']
    command = ['ssh', '-T', '-i', str(Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes',
               '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
               'root@37.60.230.148', ' '.join(shlex.quote(x) for x in argv)]
    stdout_path, stderr_path = PRIVATE / (name + '.stdout'), PRIVATE / (name + '.stderr')
    with stdout_path.open('xb') as stdout, stderr_path.open('xb') as stderr:
        os.chmod(stdout_path, 0o600); os.chmod(stderr_path, 0o600)
        try:
            code = subprocess.run(command, input=payload, stdout=stdout, stderr=stderr, timeout=930).returncode
        except subprocess.TimeoutExpired:
            code = 124
        except OSError as exc:
            stderr.write(('LOCAL_TRANSPORT_ERROR:' + type(exc).__name__).encode())
            code = 125
    raw_output = stdout_path.read_bytes()
    try:
        require(len(raw_output) <= 262144, 'REMOTE_RECEIPT_BOUND')
        observed = json.loads(raw_output)
        require(isinstance(observed, dict) and isinstance(observed.get('result'), str) and not sensitive_key(observed), 'UNSAFE_REMOTE_RECEIPT')
    except Exception:
        observed = {'result': 'RELEASE_PHASE_RECEIPT_UNAVAILABLE', 'detailsPrivate': True, 'noBlindRetry': True}
        if code == 0:
            code = 126
    receipt = {'schemaVersion': 1, 'at': at, 'tenant': contract['tenant'], 'phase': args.phase, 'exitCode': code,
               'candidateCommit': contract.get('candidateCommit'), 'sourceCommit': observed.get('sourceCommit'),
               'contractSha256': args.contract_sha, 'recoveryApprovalSha256': recovery_hash, 'scriptHashes': script_hashes,
               'qaProofSha256': qa['sha256'], 'stdoutSha256': HASH(raw_output), 'stderrBytes': stderr_path.stat().st_size,
               'stderrSha256': HASH(stderr_path.read_bytes()), 'private0600TransportLogs': True, 'observation': observed,
               'noAutomaticRetryOrRollback': True, 'actualFrontendOrProviderApprovalNotClaimed': True}
    dest = OPS / (name + '.json')
    with dest.open('x') as handle:
        handle.write(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    entry = ('\n- ' + at + ' ROOT-reviewed one Word/stage/WhatsApp OFF backend phase ' + contract['tenant'] + '/' + args.phase
             + ' candidate' + str(contract.get('candidateCommit')) + ' observedsource' + str(observed.get('sourceCommit'))
             + ' exit' + str(code) + ' result' + observed['result'] + '; evidence ' + str(dest.relative_to(ROOT))
             + ' SHA256 ' + HASH(dest.read_bytes()) + ' contractSHA256 ' + args.contract_sha
             + '. SHmaintenance+ownEXmutex/nonblock; exactnamedbranch/SQL/config/PM2/provider/other-state CAS and private0600 recovery.'
             + ' Only reviewed phase authorized; no dependency install/provideractivation/wholeDBrestore/automaticretry. Failures and partial journals retained; relevant source/config/schema/runtime drift invalidates proof.\n')
    for ledger in LEDGERS:
        with ledger.open('a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            handle.write(entry); handle.flush()
            fcntl.flock(handle, fcntl.LOCK_UN)
    print(json.dumps({'result': observed['result'], 'exitCode': code, 'receipt': str(dest), 'receiptSha256': HASH(dest.read_bytes())}))
    raise SystemExit(code)


if __name__ == '__main__':
    main()
