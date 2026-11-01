#!/usr/bin/env python3
"""Local production compilation with own Ashraf branding and synthetic public env.

No install, publishing, remote access, provider, application DB or shared-cache write.
All OS network is denied; a parent-owned local mutex serializes heavy compiles.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
FRONT = ROOT / 'frontend'
RUN = Path('/tmp/layer-billing-integration-20261101/ashraf-production-compile')
NODE = '/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
MUTEX = '/tmp/layer-billing-integration-20261101/tools/with-build-lock.py'
SANDBOX = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)']

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def source():
    return {str(p.relative_to(ROOT)): sha(p) for directory in ['frontend/src', 'frontend/public']
            for p in sorted((ROOT / directory).rglob('*')) if p.is_file()}

RUN.mkdir(parents=True, exist_ok=False)
before = source()
candidate = git('rev-parse', 'HEAD')
dependency_before = sha(FRONT / 'node_modules/.package-lock.json')
assert not git('diff', '--name-only', 'HEAD', '--', 'frontend', 'backend', 'scripts'), 'Dirty product source'
assert (FRONT / 'public/tenants/ashrafessa/logo512.png').is_file(), 'Icon regeneration is outside this compile'
assert not (FRONT / '.env').exists() and not (FRONT / '.env.production.ashrafessa').exists(), 'Existing env must be preserved'
synthetic = {'REACT_APP_API_BASE_URL': 'http://127.0.0.1:55999/api', 'REACT_APP_CENTRAL_API_URL': 'http://127.0.0.1:55999',
             'REACT_APP_APP_NAME': 'ashrafessa', 'REACT_APP_MULTI_TENANT': 'false', 'REACT_APP_DEFAULT_LANG': 'he'}
variant = FRONT / '.env.production.ashrafessa'
variant.write_text(''.join(k + '=' + v + '\n' for k, v in synthetic.items()))
env = {k: v for k, v in os.environ.items() if k in ['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'LC_ALL']}
env.update(synthetic, NODE_ENV='production', CI='false', BUILD_PATH=str(RUN / 'build'),
           BABEL_CACHE_PATH=str(RUN / 'cache/babel-register.json'), NODE_OPTIONS='--max-old-space-size=4096',
           BROWSERSLIST_IGNORE_OLD_DATA='true')
config = RUN / 'compile.craco.cjs'
config.write_text("""'use strict';
const path = require('node:path');
const base = require(%s);
const cache = %s;
const original = base.webpack.configure;
function loaders(rule) {
  if (!rule || typeof rule !== 'object') return;
  if (rule.options && Object.prototype.hasOwnProperty.call(rule.options, 'cacheDirectory')) rule.options.cacheDirectory = path.join(cache, 'babel-loader');
  for (const name of ['oneOf', 'rules', 'use']) if (Array.isArray(rule[name])) rule[name].forEach(loaders);
  if (rule.use && !Array.isArray(rule.use) && typeof rule.use === 'object') loaders(rule.use);
}
module.exports = {...base, webpack: {...base.webpack, configure(config, context) {
  config = original(config, context);
  config.cache = {...config.cache, cacheDirectory: path.join(cache, 'webpack')};
  (config.module.rules || []).forEach(loaders);
  for (const plugin of config.plugins || []) {
    if (plugin.constructor.name === 'ESLintWebpackPlugin') plugin.options.cacheLocation = path.join(cache, 'eslintcache');
  }
  for (const plugin of config.optimization.minimizer || []) if (plugin.options && Object.prototype.hasOwnProperty.call(plugin.options, 'parallel')) plugin.options.parallel = 2;
  return config;
}}};
""" % (json.dumps(str(FRONT / 'craco.config.js')), json.dumps(str(RUN / 'cache'))))
commands = [SANDBOX + [NODE, str(FRONT / 'scripts/copy-pdf-worker.js')],
            SANDBOX + [NODE, str(FRONT / 'scripts/apply-tenant-branding.js'), 'ashrafessa'],
            SANDBOX + [NODE, str(ROOT / 'scripts/prepare-public-env.cjs'), 'ashrafessa'],
            ['python3', MUTEX, *SANDBOX, NODE, str(FRONT / 'node_modules/@craco/craco/dist/bin/craco.js'), 'build', '--config', str(config)]]
print(json.dumps({'status': 'LOCAL_COMPILE_QUEUED', 'candidate': candidate, 'buildRoot': str(RUN)}), flush=True)
started = now()
exits = []
scratch_changes = []
cleanup = []
try:
    with (OUT / 'production-compile.log').open('w') as log:
        for command in commands:
            log.write('COMMAND ' + json.dumps(command) + '\n'); log.flush()
            result = subprocess.run(command, cwd=FRONT, env=env, stdout=log, stderr=subprocess.STDOUT)
            exits.append(result.returncode)
            if result.returncode:
                break
    prepared = source()
    scratch_changes = [p for p in before.keys() | prepared.keys() if before.get(p) != prepared.get(p)]
    allowed = lambda p: p.startswith(('frontend/public/', 'frontend/src/assets/images/logos/'))
    assert all(allowed(p) for p in scratch_changes), 'Unexpected source mutation'
finally:
    subprocess.run(['git', 'restore', '--source=HEAD', '--', 'frontend/public', 'frontend/src/assets/images/logos'], cwd=ROOT, check=True)
    for p in source().keys() - before.keys():
        if p.startswith(('frontend/public/', 'frontend/src/assets/images/logos/')):
            (ROOT / p).unlink(); cleanup.append(p)
    for p in [FRONT / '.env', variant]:
        if p.exists():
            p.unlink(); cleanup.append(str(p.relative_to(ROOT)))
after = source()
build = RUN / 'build'
assets = {str(p.relative_to(build)): sha(p) for p in sorted(build.rglob('*')) if p.is_file()}
branding_matches = (build / 'firm-logo.png').is_file() and sha(build / 'firm-logo.png') == sha(FRONT / 'public/tenants/ashrafessa/firm-logo.png')
receipt = {'startedAtUtc': started, 'completedAtUtc': now(), 'candidateCommit': candidate,
           'headAtFinish': git('rev-parse', 'HEAD'), 'scope': 'LOCAL_PRODUCTION_COMPILE_SYNTHETIC_PUBLIC_CONFIG_NOT_DEPLOYABLE_RELEASE',
           'environment': synthetic, 'osNetworkDenied': True, 'commands': commands, 'exitCodes': exits,
           'result': 'PASS_COMPILE' if len(exits) == 4 and all(code == 0 for code in exits) and before == after and branding_matches else 'FAIL_OR_SOURCE_DRIFT',
           'sourceStableAfterCleanup': before == after, 'sourceDriftAfterCleanup': [p for p in before.keys() | after.keys() if before.get(p) != after.get(p)],
           'expectedScratchChanges': scratch_changes, 'ownedGeneratedFilesRemoved': cleanup, 'sourceHashesBefore': before,
           'dependencyLockBeforeSha256': dependency_before, 'dependencyLockAfterSha256': sha(FRONT / 'node_modules/.package-lock.json'),
           'buildRoot': str(RUN), 'configSha256': sha(config), 'buildFilesSha256': assets, 'ashrafFirmLogoMatches': branding_matches,
           'logSha256': sha(OUT / 'production-compile.log'),
           'limits': 'No browser/provider/API/customer/loaded-runtime acceptance; no publish or real deployment configuration.'}
(OUT / 'production-compile.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ['candidateCommit', 'result', 'exitCodes', 'sourceStableAfterCleanup', 'ashrafFirmLogoMatches', 'buildRoot']}))
raise SystemExit(0 if receipt['result'] == 'PASS_COMPILE' else 1)
