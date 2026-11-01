#!/usr/bin/env python3
"""All discovered local frontend tests; OS network denied, no build or install."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
FRONT = ROOT / 'frontend'
CACHE = Path('/tmp/layer-billing-integration-20261101/ashraf-jest-cache')
NODE = '/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def source():
    return {str(p.relative_to(ROOT)): sha(p) for p in sorted((FRONT / 'src').rglob('*')) if p.is_file()}

tests = sorted(str(p.relative_to(FRONT)) for p in (FRONT / 'src').rglob('*.test.js'))
other = [str(p) for p in (FRONT / 'src').rglob('*') if p.is_file() and ('.test.' in p.name or '.spec.' in p.name) and not p.name.endswith('.test.js')]
assert tests and not other, 'Unhandled or absent test suffix'
before = source()
packages = {p: sha(FRONT / p) for p in ['package.json', 'package-lock.json', 'node_modules/.package-lock.json']}
candidate = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
env = {k: v for k, v in os.environ.items() if k in ['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'LC_ALL']}
env.update(CI='true', BROWSERSLIST_IGNORE_OLD_DATA='true', NODE_ENV='test')
result_path = OUT / 'frontend-jest-result.json'
command = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', NODE,
           str(FRONT / 'node_modules/react-scripts/bin/react-scripts.js'), 'test', '--watchAll=false', '--runInBand',
           '--cacheDirectory', str(CACHE), '--json', '--outputFile', str(result_path), '--runTestsByPath', *tests]
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
with (OUT / 'frontend-tests.log').open('w') as stream:
    process = subprocess.run(command, cwd=FRONT, env=env, stdout=stream, stderr=subprocess.STDOUT)
after = source()
package_after = {p: sha(FRONT / p) for p in packages}
result = json.loads(result_path.read_bytes()) if result_path.exists() else {}
summary = {k: result.get(k) for k in ['numPassedTests', 'numFailedTests', 'numPendingTests', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites']}
receipt = {'startedAtUtc': start, 'completedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'candidateCommit': candidate, 'headAtFinish': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
           'nodeVersion': subprocess.check_output([NODE, '--version'], text=True).strip(), 'scope': 'ALL_DISCOVERED_FRONTEND_TESTS_OS_NETWORK_DENIED',
           'discoveredTests': tests, 'discoveredTestFiles': len(tests), 'command': command, 'exitCode': process.returncode,
           'summary': summary, 'success': result.get('success'), 'sourceStable': before == after,
           'changedSourceFiles': [p for p in before.keys() | after.keys() if before.get(p) != after.get(p)],
           'packageHashes': packages, 'packageHashesAfter': package_after, 'dependencyStable': packages == package_after,
           'sourceHashes': before, 'logSha256': sha(OUT / 'frontend-tests.log')}
(OUT / 'frontend-results.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ['candidateCommit', 'discoveredTestFiles', 'exitCode', 'summary', 'sourceStable', 'dependencyStable']}))
raise SystemExit(0 if process.returncode == 0 and result.get('success') and before == after and packages == package_after else 1)
