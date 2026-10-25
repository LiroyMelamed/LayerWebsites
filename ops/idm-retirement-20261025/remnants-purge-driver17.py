"""Root-reviewed, per-host Idm-only purger. Default is a local plan."""
import argparse, base64, datetime, hashlib, json, os, pathlib, subprocess
ROOT = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OUT = ROOT / 'outputs/legal-system-messages-20261025/idm-retirement'
PRIVATE = pathlib.Path('/Users/liroymelamed/.codex/private/idm-retirement-20261025/purge17')
sha = lambda b: hashlib.sha256(b).hexdigest()
def checked(binding):
    p = pathlib.Path(binding['path']); assert p.is_file() and not p.is_symlink()
    b = p.read_bytes(); assert sha(b) == binding['sha256']; return json.loads(b)
def main():
    p = argparse.ArgumentParser(); p.add_argument('--contract', required=True); p.add_argument('--contract-sha', required=True)
    p.add_argument('--host', required=True, choices=['84.46.253.85', '37.60.230.148']); p.add_argument('--execute-reviewed', action='store_true'); a = p.parse_args()
    raw = pathlib.Path(a.contract).read_bytes(); assert sha(raw) == a.contract_sha
    c = json.loads(raw); remote = (OUT / 'purge-idm-only17.remote.py').read_bytes()
    assert sha(remote) == c['remoteSourceSha256'] and sha(pathlib.Path(__file__).read_bytes()) == c['driverSha256']
    backend = checked(c['backendDeleteReceipt']); o = backend['observation']
    assert backend['exitCode'] == 0 and o['tenant'] == 'idm' and o['result'] == 'PASS_EXACT_IDM_BACKEND_AND_DATABASE_RETIRED'
    assert o['exactDatabaseIdmDropped'] and o['exactRootIdmRemoved'] and o['pm2Id6RemovedAndActivePlusFallbackPersistenceIdmFree']
    if not a.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_PLAN_ONLY_NO_NETWORK', 'host': a.host, 'trees': [x['path'] for x in c['hosts'][a.host]['trees']], 'cloudPrefixBindingPresent': c.get('cloudPrefixPurgeBinding') is not None})); return
    if a.host == '37.60.230.148':
        binding = c['cloudPrefixPurgeBinding']; assert isinstance(binding, dict)
        actual = checked(binding); obs = actual.get('observation', actual)
        assert actual.get('exitCode', 0) == 0 and obs.get('result') == binding['expectedResult'] and binding['expectedResult'].startswith('PASS')
        assert obs.get('tenant', 'idm') == 'idm'
    ledgers = [ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md', ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md']
    for ledger in ledgers: ledger.read_text()
    os.umask(0o077); PRIVATE.mkdir(mode=0o700, parents=True, exist_ok=True); PRIVATE.chmod(0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out, err = PRIVATE / (a.host + '-' + stamp + '.stdout'), PRIVATE / (a.host + '-' + stamp + '.stderr')
    payload = ('import base64,json;CONTRACT_SHA=' + repr(a.contract_sha) + ';c=json.loads(base64.b64decode(' + repr(base64.b64encode(raw).decode()) + '))\n').encode() + remote + ('\nmain(c,' + repr(a.host) + ')\n').encode()
    with out.open('xb') as stdout, err.open('xb') as stderr:
      try:
        proc = subprocess.run(['ssh', '-i', str(pathlib.Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'root@' + a.host, 'python3 -'], input=payload, stdout=stdout, stderr=stderr, timeout=240)
        code = proc.returncode
      except subprocess.TimeoutExpired:
        code = 124
    try: observation = json.loads(out.read_bytes())
    except Exception: observation = {'result': 'UNKNOWN_RESULT_REVIEW_PRIVATE_LOGS'}
    receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': a.host, 'tenant': 'idm', 'exitCode': code, 'contractSha256': a.contract_sha, 'remoteSha256': sha(remote), 'observation': observation, 'stdoutSha256': sha(out.read_bytes()), 'stderrSha256': sha(err.read_bytes()), 'stderrBytes': err.stat().st_size, 'rawLogsPrivate0600': True, 'noBlindRetry': True}
    dest = OUT / ('purge17-' + a.host + '-' + stamp + '.json'); dest.write_text(json.dumps(receipt, indent=2) + '\n')
    for ledger in ledgers:
        with ledger.open('a') as f: f.write('\n- ' + receipt['at'] + ' ROOT approved exact Idm-only purge17 ' + a.host + ' exit' + str(code) + '; evidence ' + str(dest.relative_to(ROOT)) + ' SHA' + sha(dest.read_bytes()) + '. Latest human recoverywaiver; exact known roots/logs/vhosts/dedicatedcert/configCAS only, privatekeys never exported; sharedarchives/globalPM2/ACME/otherclients preserved. No newbackup/restore/providerjobs; any failure/partialstate retained/no blindretry.\n')
    print(json.dumps({'receipt': str(dest), 'sha256': sha(dest.read_bytes()), 'exitCode': code, 'result': observation.get('result')})); raise SystemExit(code)
if __name__ == '__main__': main()
