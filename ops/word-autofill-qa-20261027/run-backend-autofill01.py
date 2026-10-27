#!/usr/bin/env python3
"""Explicit local Node tests; records source drift and both protected ledgers."""
import datetime, hashlib, json, os, pathlib, subprocess, sys

WORK = pathlib.Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-melamedia-qa-20261026')
OUT = pathlib.Path(__file__).resolve().parent
NODE = pathlib.Path('/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
DEPENDENCIES = pathlib.Path('/Users/liroymelamed/Projects/LayerWebsites/backend/node_modules')
PGLITE = pathlib.Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-system-messages-20261025/pglite-qa/node_modules')
LEDGERS = [pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs') / p for p in
    ('signing-implementation-20261007/TEST-LEDGER.md', 'office-whatsapp-20261023/TEST-LEDGER.md')]
sha = lambda b: hashlib.sha256(b).hexdigest()

def sources():
    paths = []
    for directory in ('backend/lib', 'backend/services/signingV2', 'backend/routes', 'backend/tests'):
        paths.extend(p for p in (WORK / directory).rglob('*') if p.is_file() and p.suffix in ('.js', '.cjs', '.json', '.sql'))
    paths.extend(WORK / ('backend/' + p) for p in ('package.json', 'package-lock.json'))
    return {str(p.relative_to(WORK)): sha(p.read_bytes()) for p in sorted(set(paths))}

def dependency_hashes():
    result = {'node': {'path': str(NODE), 'sha256': sha(NODE.read_bytes())}}
    for root, names in ((DEPENDENCIES, ('pdf-lib', 'pdfjs-dist', 'pg', 'saxes', 'adm-zip')), (PGLITE, ('@electric-sql/pglite',))):
        for name in names:
            package = root / name
            files = {str(p.relative_to(package)): sha(p.read_bytes()) for p in sorted(package.rglob('*')) if p.is_file()}
            if not files or not (package / 'package.json').is_file(): raise RuntimeError('Missing verified existing dependency: ' + str(package))
            result[name] = {'path': str(package.resolve()), 'version': json.loads((package / 'package.json').read_text())['version'],
                'files': len(files), 'treeSha256': sha(json.dumps(files, sort_keys=True).encode())}
        manifest = root / '.package-lock.json'
        result[str(manifest)] = sha(manifest.read_bytes()) if manifest.is_file() else None
    return result

def main():
    tests = sys.argv[1:]
    if not tests or any(not (p.startswith('backend/tests/') or p == '/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/backend/tests/wordTemplates.autoFillAcceptance.test.js') or not p.endswith('.test.js') or '..' in pathlib.PurePosixPath(p).parts for p in tests):
        raise SystemExit('Explicit backend/tests/*.test.js only')
    # Read the actual ledgers before execution, not merely an earlier summary.
    ledger_reads = {str(p): sha(p.read_bytes()) for p in LEDGERS}
    before = sources()
    acceptance_path = pathlib.Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/backend/tests/wordTemplates.autoFillAcceptance.test.js')
    acceptance_hash_before = sha(acceptance_path.read_bytes())
    dependencies = dependency_hashes()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=WORK, text=True).strip()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    log = OUT / ('backend-units-' + stamp + '.log')
    receipt = OUT / ('backend-units-' + stamp + '.json')
    command = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', str(NODE), '--test', '--test-concurrency=1', *tests]
    environment = dict(os.environ)
    environment['WORD_AUTOFILL_QA_BACKEND'] = str(WORK / 'backend')
    environment['TMPDIR'] = '/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-autofill-qa-20261027/tmp'
    pathlib.Path(environment['TMPDIR']).mkdir(parents=True, exist_ok=True)
    environment['NODE_PATH'] = str(DEPENDENCIES) + ':' + str(PGLITE)
    # These are pure/in-memory suites. No app DB, provider or test socket opt-in.
    for key in list(environment):
        if key.startswith(('PG', 'DB_', 'DATABASE_', 'WORD_SERVICE_TEST_', 'WORD_HTTP_TEST_', 'SIGNING_V2_TEST_')):
            del environment[key]
    with log.open('w') as stream:
        os.chmod(log, 0o600)
        process = subprocess.run(command, cwd=WORK, env=environment, stdout=stream, stderr=subprocess.STDOUT, check=False)
    after = sources()
    acceptance_hash_after = sha(acceptance_path.read_bytes())
    dependencies_after = dependency_hashes()
    changed = sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))
    result = {'scope': 'LOCAL_EXPLICIT_NODE_UNIT_AND_IN_MEMORY_SQL_ONLY', 'head': head, 'worktree': str(WORK),
        'tests': tests, 'command': command, 'exitCode': process.returncode, 'sourceStable': not changed and acceptance_hash_before == acceptance_hash_after,
        'externalAcceptanceTest': {'path': str(acceptance_path), 'sha256': acceptance_hash_before, 'sourceRoot': str(WORK / 'backend')},
        'sourceChanged': changed, 'sourceHashes': before, 'ledgersRead': ledger_reads, 'dependencies': dependencies,
        'dependenciesStable': dependencies == dependencies_after,
        'log': str(log), 'logSha256': sha(log.read_bytes()),
        'result': 'PASS_SCOPED' if process.returncode == 0 and not changed and dependencies == dependencies_after and acceptance_hash_before == acceptance_hash_after else 'FAIL_OR_SOURCE_CHANGED',
        'limits': 'No live PostgreSQL, real converter, browser, provider, remote, deployment or customer QA claim. Dirty source is hash-bound, not a tested commit.'}
    receipt.write_text(json.dumps(result, indent=2) + '\n')
    entry = '\n- ' + datetime.datetime.now(datetime.timezone.utc).isoformat() + ' Word visual implementation local backend units HEAD ' + head + ', ' + result['result'] + ', exit ' + str(process.returncode) + ', sourceStable=' + str(not changed) + ', evidence ' + str(receipt) + ' SHA256 ' + sha(receipt.read_bytes()) + '. Exact working source/dependencies and commands bound in receipt; no live DB/converter/browser/provider/remote/customer/deploy qualification. Tested source/shared imports/runtime/dependency changes invalidate scope.\n'
    for ledger in LEDGERS:
        with ledger.open('a') as stream: stream.write(entry)
    print(json.dumps({k: result[k] for k in ('result', 'exitCode', 'sourceStable', 'sourceChanged', 'log')}))
    print(str(receipt))
    raise SystemExit(0 if result['result'] == 'PASS_SCOPED' else 1)

if __name__ == '__main__': main()
