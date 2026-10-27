"""Run selected existing frontend regressions and bind results to observed source bytes."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys

WORK = Path(os.environ.get('WORD_UX_TEST_WORKTREE', '/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026'))
if str(WORK) not in (
    '/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026',
    '/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-melamedia-qa-20261026',
):
    raise SystemExit('Only the two owned Word UX source worktrees are allowed')
OUT = Path(__file__).parent
CACHE = Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-autofill-qa-20261027')
NODE = Path('/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
LEDGERS = [Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs') / item for item in (
    'signing-implementation-20261007/TEST-LEDGER.md', 'office-whatsapp-20261023/TEST-LEDGER.md')]

def source_hashes():
    return {str(p.relative_to(WORK)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((WORK / 'frontend/src').rglob('*')) if p.is_file()}

def main():
    tests = sys.argv[1:]
    if not tests or any(not value.startswith('src/') or not value.endswith('.test.js') for value in tests):
        raise SystemExit('Provide explicit frontend src/*.test.js paths only')
    ledger_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in LEDGERS}
    before = source_hashes()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=WORK, text=True).strip()
    node_version = subprocess.check_output([str(NODE), '--version'], text=True).strip()
    package_hashes = {name: hashlib.sha256((WORK / 'frontend' / name).read_bytes()).hexdigest()
                      for name in ('package.json', 'package-lock.json', 'node_modules/.package-lock.json')}
    word_locales = {language: json.loads((WORK / f'frontend/src/i18n/locales/{language}.json').read_text())['signingWord']
                    for language in ('he', 'ar', 'en')}
    locale_differences = {language: sorted(set(word_locales['he']) ^ set(values))
                          for language, values in word_locales.items()}
    whitespace = subprocess.run(['git', 'diff', '--check'], cwd=WORK, capture_output=True, text=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = OUT / f'frontend-regression-{stamp}.log'
    receipt = OUT / f'frontend-regression-{stamp}.json'
    command = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', str(NODE), str(WORK / 'frontend/node_modules/react-scripts/bin/react-scripts.js'),
               'test', '--watchAll=false', '--runInBand', '--cacheDirectory', str(CACHE / 'jest'),
               '--json', '--outputFile', str(CACHE / ('jest-result-' + stamp + '.json')), '--runTestsByPath', *tests]
    CACHE.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, CI='true', BROWSERSLIST_IGNORE_OLD_DATA='true')
    with log.open('w') as stream:
        os.chmod(log, 0o600)
        process = subprocess.run(command, cwd=WORK / 'frontend', env=environment,
                                 stdout=stream, stderr=subprocess.STDOUT, check=False)
    after = source_hashes()
    jest_path = CACHE / ('jest-result-' + stamp + '.json')
    jest_summary = json.loads(jest_path.read_text()) if jest_path.exists() else {}
    changed = sorted(key for key in before.keys() | after.keys() if before.get(key) != after.get(key))
    result = {'kind': 'SCOPED_FRONTEND_REGRESSION_ONLY', 'head': head,
              'worktree': str(WORK),
              'nodeVersion': node_version, 'packageHashes': package_hashes,
              'localeKeyDifferences': locale_differences, 'diffCheckExit': whitespace.returncode,
              'diffCheckOutput': whitespace.stdout + whitespace.stderr,
              'tests': tests, 'command': command, 'exitCode': process.returncode,
              'sourceStableDuringRun': not changed, 'sourceChanged': changed,
              'sourceHashes': before, 'ledgersReadBeforeRun': ledger_hashes,
              'log': str(log), 'logSha256': hashlib.sha256(log.read_bytes()).hexdigest(),
              'result': 'PASS_SCOPED' if process.returncode == 0 and not changed
                        and not any(locale_differences.values()) and whitespace.returncode == 0
                        else 'FAIL_OR_SOURCE_CHANGED',
              'jestSummary': {key: jest_summary.get(key) for key in ('numPassedTests','numFailedTests','numPendingTests','numPassedTestSuites','numFailedTestSuites')}, 'fullAppBrowserQA': False, 'productionActions': False,
              'invalidatedBy': 'Changes to tested source, tests, shared imports, package/runtime or installed dependencies.'}
    receipt.write_text(json.dumps(result, indent=2) + '\n')
    line = ('\n- ' + datetime.datetime.now(datetime.timezone.utc).isoformat() +
            ' Word UX scoped frontend regression head ' + head + ', result ' + result['result'] +
            ', exit ' + str(process.returncode) + ', sourceStable=' + str(not changed) +
            ', evidence ' + str(receipt) + ' SHA256 ' + hashlib.sha256(receipt.read_bytes()).hexdigest() +
            '. Working-source hashes bound in receipt; uncommitted edits are not claimed as a tested commit. '
            'No full-app/browser/auth/backend/provider/customer/production QA claim. '
            'Tested source/shared imports/tests/package/runtime/dependency drift invalidates this scope.\n')
    for ledger in LEDGERS:
        with ledger.open('a') as stream:
            stream.write(line)
    print(json.dumps({key: result[key] for key in ('result', 'head', 'exitCode', 'sourceStableDuringRun', 'sourceChanged', 'log')}))
    print(str(receipt))
    raise SystemExit(0 if result['result'] == 'PASS_SCOPED' else 1)

if __name__ == '__main__':
    main()
