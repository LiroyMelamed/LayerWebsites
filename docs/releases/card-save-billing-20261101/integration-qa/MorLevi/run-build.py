"""Compile a frozen Mor source with synthetic public config and private caches."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

ROOT = Path('/tmp/layer-billing-integration-20261101/MorLevi')
OUT = ROOT / 'docs/releases/card-save-billing-20261101/integration-qa/MorLevi'
CACHE = Path('/tmp/layer-billing-integration-20261101/mor-frontend-cache')
NODE = Path('/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node')
DEPS = (ROOT / 'frontend/node_modules').resolve()
def sha(data): return hashlib.sha256(data).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
def source_hashes():
    return {p: sha((ROOT/p).read_bytes()) for p in git('ls-files', 'frontend', 'scripts').splitlines() if (ROOT/p).is_file()}

head = git('rev-parse', 'HEAD')
source = source_hashes()
deps_before = sha((DEPS/'.package-lock.json').read_bytes())
CACHE.mkdir(exist_ok=True)
archive = CACHE/'source.tar'
with archive.open('wb') as stream:
    subprocess.run(['git', 'archive', head, 'frontend', 'scripts'], cwd=ROOT, stdout=stream, check=True)
frozen = CACHE/'source'
frozen.mkdir(exist_ok=False)
subprocess.run(['tar', '-xf', str(archive), '-C', str(frozen)], check=True)
front = frozen/'frontend'
(front/'node_modules').symlink_to(DEPS, target_is_directory=True)
if any(front.glob('.env*')): raise RuntimeError('UNEXPECTED_FRONTEND_ENV')
wrapper = front/'craco.integration-cache.config.js'
wrapper.write_text("""const path = require('node:path');
const config = require('./craco.config.js');
const configure = config.webpack.configure;
config.webpack.configure = (input, context) => {
  const output = configure(input, context);
  const cache = process.env.INTEGRATION_CACHE;
  if (output.cache) output.cache = { ...output.cache, cacheDirectory: path.join(cache, 'webpack') };
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.loader && /babel-loader/.test(value.loader)) {
      value.options = { ...value.options, cacheDirectory: path.join(cache, 'babel') };
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(output.module.rules);
  for (const plugin of output.plugins) {
    if (plugin?.constructor?.name === 'ESLintWebpackPlugin' && plugin.options) {
      plugin.options.cacheLocation = path.join(cache, 'eslint', '.eslintcache');
    }
  }
  return output;
};
module.exports = config;
""")
env = {k:v for k,v in os.environ.items() if not k.startswith('REACT_APP_') and k not in ['NODE_OPTIONS','PUBLIC_URL','BUILD_PATH','GENERATE_SOURCEMAP']}
env.update({'CI':'false', 'NODE_ENV':'production', 'BROWSERSLIST_IGNORE_OLD_DATA':'true',
            'NODE_OPTIONS':'--max-old-space-size=4096 --require '+str(ROOT/'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs'),
            'REACT_APP_API_BASE_URL':'https://mor-billing-qa.invalid/api', 'REACT_APP_APP_NAME':'MorLevi', 'REACT_APP_MULTI_TENANT':'false',
            'PUBLIC_URL':'', 'BUILD_PATH':str(CACHE/'build'), 'GENERATE_SOURCEMAP':'false', 'INTEGRATION_CACHE':str(CACHE/'compiler-cache')})
commands = [
    [str(NODE), str(front/'scripts/apply-tenant-branding.js'), 'morlevy'],
    [str(NODE), str(front/'scripts/copy-pdf-worker.js')],
    ['python3', '/tmp/layer-billing-integration-20261101/tools/with-build-lock.py', str(NODE), str(DEPS/'@craco/craco/dist/bin/craco.js'), 'build', '--config', str(wrapper)],
]
started = now(); results=[]
with (OUT/'production-build.log').open('w') as stream:
    for command in commands:
        result = subprocess.run(command, cwd=front, env=env, stdout=stream, stderr=subprocess.STDOUT)
        results.append({'command':command, 'exitCode':result.returncode})
        if result.returncode: break
artifacts={str(p.relative_to(CACHE/'build')):sha(p.read_bytes()) for p in sorted((CACHE/'build').rglob('*')) if p.is_file()}
record={'candidateCommit':head,'startedAtUtc':started,'finishedAtUtc':now(),'commands':results,
        'exitCode':results[-1]['exitCode'],'sourceStable':source==source_hashes() and head==git('rev-parse','HEAD'),
        'installedLockStable':deps_before==sha((DEPS/'.package-lock.json').read_bytes()),'sourceArchiveSha256':sha(archive.read_bytes()),
        'sourceHashes':source,'cacheWrapperSha256':sha(wrapper.read_bytes()),'buildPath':str(CACHE/'build'),
        'publicConfig':{k:v for k,v in env.items() if k.startswith('REACT_APP_') or k in ['PUBLIC_URL','GENERATE_SOURCEMAP']},
        'buildArtifactsSha256':artifacts,'network':'Native fetch and TCP external/application DB network guard; no provider/API action.',
        'scope':'Production compiler with exact frozen source, Mor branding and synthetic public API. No deployment or actual tenant environment acceptance.',
        'cachePolicy':'Only generated frozen-copy config changes compiler cache paths; normal lint/optimization retained. No shared dependency source mutated.'}
(OUT/'production-build.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'gate':'production-build','candidate':head,'exitCode':record['exitCode'],'sourceStable':record['sourceStable'],'artifacts':len(artifacts)}))
raise SystemExit(0 if record['exitCode']==0 and record['sourceStable'] and record['installedLockStable'] else 1)
