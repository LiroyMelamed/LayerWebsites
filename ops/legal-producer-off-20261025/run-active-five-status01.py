#!/usr/bin/env python3
"""Read-only final active-five version/health inventory; root executes after rollout."""
import argparse
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
OUT = ROOT / 'outputs/legal-system-messages-20261025/resumed-20261025'
SCRIPT = OUT / 'active-five-status01.cjs'
PRIVATE = Path('/Users/liroymelamed/.codex/private/legal-system-messages-20261025/resumed-20261025')
LEDGERS = [ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md', ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md']
EXPECTED_SCRIPT_SHA = '3e24ed851e9ada5378d25e6a99da6fcec01fc835e1c9e1c567ba319c93d659d5'
EXPECTED = {
    'melamedlaw': ('/root/LayerWebsites', 'e3f62861135642cf6fe5278d1afbb7388a4c8180'),
    'morlevy': ('/root/MorLevi', 'cae9a0456fabd1ae144da2b81751c06b2308dc91'),
    'ashrafessa': ('/root/AshrafEssa', 'ea7df270d591aefa66acb81a73eac81f3aba9d6f'),
    'melamediaQA': ('/root/Melamedia', '1161fd687db381833552db78a70723573792ab97'),
    'lawyerShared': ('/root/LawyerPlatform', 'ce3cb6a9058a2a3ec2dc1495796079cde90f6f51'),
}
HASH = lambda b: hashlib.sha256(b).hexdigest()
HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
SAFE_TEXT = re.compile(r'^[A-Za-z0-9_./ :+()-]{0,160}$')
FIELDS = {
    'source': {'root', 'available', 'code', 'head', 'tree', 'namedBranch', 'detached', 'trackedClean', 'trackedChangedCount', 'matchesRoot19LastKnown', 'preparedProducerCandidate', 'preparedProducerCandidateInstalled'},
    'process': {'id', 'available', 'code', 'name', 'expectedName', 'nameMatches', 'pid', 'status', 'cwd', 'cwdMatches', 'script', 'scriptMatches', 'portNumber', 'documentedPortNumber', 'portMatchesDocumented', 'startedAt', 'uptimeMs', 'restartCount'},
    'health': {'at', 'port', 'host', 'status', 'json', 'okTrue', 'bytes', 'bodySha256', 'classification', 'elapsedMs'},
}


def sanitize_fields(value, group):
    if not isinstance(value, dict):
        raise ValueError('UNEXPECTED_FIELD_GROUP')
    out = {}
    for key in FIELDS[group]:
        if key not in value:
            continue
        item = value[key]
        if item is None or isinstance(item, bool) or isinstance(item, int) and abs(item) <= 10**16:
            out[key] = item
        elif isinstance(item, str) and SAFE_TEXT.fullmatch(item):
            if key in {'head', 'tree', 'preparedProducerCandidate'} and not HEX40.fullmatch(item):
                raise ValueError('UNEXPECTED_COMMIT_SHAPE')
            if key == 'bodySha256' and not HEX64.fullmatch(item):
                raise ValueError('UNEXPECTED_HASH_SHAPE')
            out[key] = item
        else:
            raise ValueError('UNEXPECTED_FIELD_SHAPE')
    return out


def sanitize(raw):
    value = json.loads(raw)
    if value.get('result') != 'READONLY_FIVE_ACTIVE_BACKEND_VERSION_AND_HEALTH_INVENTORY':
        return {'result': 'READONLY_STATUS_INVENTORY_UNAVAILABLE', 'detailsPrivate': True, 'noRetry': True}
    rows = value.get('observations')
    if not isinstance(rows, list) or [x.get('tenant') for x in rows] != list(EXPECTED):
        raise ValueError('UNEXPECTED_TARGET_SET')
    clean = []
    for row in rows:
        item = {'tenant': row['tenant']}
        for group in ['source', 'process', 'health']:
            item[group] = sanitize_fields(row[group], group)
        item['processAfter'] = sanitize_fields(row['processAfter'], 'process')
        if not isinstance(row.get('processStableDuringInventory'), bool):
            raise ValueError('UNEXPECTED_STABILITY_SHAPE')
        item['processStableDuringInventory'] = row['processStableDuringInventory']
        if item['source'].get('root') != EXPECTED[row['tenant']][0]:
            raise ValueError('UNEXPECTED_SOURCE_ROOT')
        clean.append(item)
    return {'result': value['result'], 'observations': clean, 'noEnvironmentFilesRead': value.get('noEnvironmentFilesRead') is True, 'noEnvironmentValuesExportedExceptWhitelistedPort': value.get('noEnvironmentValuesExportedExceptWhitelistedPort') is True, 'noSqlCustomerLogsProviderOrRuntimeMutation': value.get('noSqlCustomerLogsProviderOrRuntimeMutation') is True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-reviewed', action='store_true')
    args = parser.parse_args()
    code = SCRIPT.read_bytes()
    if HASH(code) != EXPECTED_SCRIPT_SHA:
        raise SystemExit('REVIEWED_SCRIPT_BYTES_CHANGED')
    remote = ['flock', '--shared', '--nonblock', '/run/lock/melamedia-release-maintenance.lock', 'timeout', '--signal=TERM', '--kill-after=5s', '210s', 'node']
    command = ['ssh', '-T', '-i', str(Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', 'root@37.60.230.148', ' '.join(shlex.quote(x) for x in remote)]
    if not args.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_READONLY_PLAN_ONLY_NO_SSH', 'scriptSha256': HASH(code), 'expectedSources': {k: v[1] for k, v in EXPECTED.items()}, 'argv': command}))
        return
    for ledger in LEDGERS:
        ledger.read_text()
    os.umask(0o077)
    PRIVATE.mkdir(parents=True, exist_ok=True)
    os.chmod(PRIVATE, 0o700)
    at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    name = 'active-five-status-' + stamp
    stdout_path, stderr_path = PRIVATE / (name + '.stdout'), PRIVATE / (name + '.stderr')
    with stdout_path.open('xb') as stdout, stderr_path.open('xb') as stderr:
        os.chmod(stdout_path, 0o600)
        os.chmod(stderr_path, 0o600)
        try:
            exit_code = subprocess.run(command, input=code, stdout=stdout, stderr=stderr, timeout=240).returncode
        except subprocess.TimeoutExpired:
            exit_code = 124
        except OSError as exc:
            stderr.write(('LOCAL_TRANSPORT_ERROR:' + type(exc).__name__).encode())
            exit_code = 125
    raw = stdout_path.read_bytes()
    try:
        observation = sanitize(raw)
    except Exception:
        observation = {'result': 'READONLY_STATUS_INVENTORY_UNAVAILABLE', 'detailsPrivate': True, 'noRetry': True}
    if exit_code == 0 and observation['result'] != 'READONLY_FIVE_ACTIVE_BACKEND_VERSION_AND_HEALTH_INVENTORY':
        exit_code = 126
    heads = {x['tenant']: x['source'].get('head') for x in observation.get('observations', [])}
    receipt = {
        'schemaVersion': 1, 'at': at, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': 'READONLY_ACTIVE_FIVE_BACKEND_VERSION_AND_HEALTH_ONLY', 'exitCode': exit_code,
        'scriptSha256': HASH(code), 'driverSha256': HASH(Path(__file__).read_bytes()),
        'expectedSources': {k: v[1] for k, v in EXPECTED.items()}, 'observedSourceCommits': heads,
        'stdoutSha256': HASH(raw), 'stderrBytes': stderr_path.stat().st_size, 'stderrSha256': HASH(stderr_path.read_bytes()),
        'private0600TransportLogs': True, 'observation': observation,
        'scopeDoesNotProveFeatureCorrectnessOrFrontendNativeVersions': True,
        'noMinimumUptimeAssertion': True, 'noCaptureDispatchOrProductionApprovalAssertion': True,
        'maintenanceCoordinationStateNotAssessed': True, 'noRemoteWritesOrLifecycleCommands': True,
        'noBlindRetry': True,
    }
    dest = OUT / (name + '.json')
    with dest.open('x') as handle:
        handle.write(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    evidence_hash = HASH(dest.read_bytes())
    entry = '\n- ' + at + ' ROOT reviewed read-only active-five backend version/health inventory exit' + str(exit_code) + '; result ' + observation['result'] + '; observed commits ' + json.dumps(heads, sort_keys=True) + '. Evidence ' + str(dest.relative_to(ROOT)) + ' SHA256 ' + evidence_hash + '; scriptSHA256 ' + HASH(code) + '. Exact observed source/PM2 metadata, process-stability snapshots and bounded loopback JSON-ok health only; source/runtime changes invalidate this point-in-time observation. No full-product/frontend/native/provider proof, shared min_uptime assertion, maintenance-hold clearance, capture/dispatch activation or production approval. No SQL/customer/log reads or runtime mutation; raw transport logs private0600; failures preserved, no automatic retry.\n'
    for ledger in LEDGERS:
        with ledger.open('a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            handle.write(entry)
            handle.flush()
            fcntl.flock(handle, fcntl.LOCK_UN)
    print(json.dumps({'result': observation['result'], 'exitCode': exit_code, 'receipt': str(dest), 'receiptSha256': evidence_hash}))
    raise SystemExit(exit_code)


if __name__ == '__main__':
    main()
