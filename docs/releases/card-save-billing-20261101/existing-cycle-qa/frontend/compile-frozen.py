#!/usr/bin/env python3
"""Compile exact Git source in a disposable archive; cache isolation only."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys
ROOT=Path('/tmp/layer-billing-debt-20261101')
OUT=ROOT/'docs/releases/card-save-billing-20261101/existing-cycle-qa/frontend'
CACHE=Path('/tmp/layer-billing-debt-20261101-frontend-cache')
STAGE=CACHE/'frozen-build-isolated'
DEPS=Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/frontend/node_modules').resolve()
NODE='/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node'
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*a):return subprocess.check_output(['git',*a],cwd=ROOT,text=True).strip()
def source():return {p:sha((ROOT/p).read_bytes()) for p in git('ls-files','frontend','scripts').splitlines() if (ROOT/p).is_file()}
head=git('rev-parse','HEAD')
if head!='c21c897b00fb3a969bd977d62615e6325879a1fc':raise RuntimeError('HEAD_DRIFT')
before=source();installed_hash=sha((DEPS/'.package-lock.json').read_bytes())
STAGE.mkdir(parents=True,exist_ok=False)
archive=CACHE/'frozen-build-isolated.tar'
with archive.open('wb') as stream:subprocess.run(['git','archive',head,'frontend','scripts'],cwd=ROOT,stdout=stream,check=True)
subprocess.run(['tar','-xf',str(archive),'-C',str(STAGE)],check=True)
front=STAGE/'frontend';(front/'node_modules').symlink_to(DEPS,target_is_directory=True)
if any(front.glob('.env*')):raise RuntimeError('ENV_FILE_IN_ARCHIVE')
original=front/'craco.source.config.cjs'
(front/'craco.config.js').rename(original)
wrapper="""const path = require('node:path');
const base = require('./craco.source.config.cjs');
const cache = CACHE_PATH;
function loaders(rule) {
  if (!rule || typeof rule !== 'object') return;
  if (typeof rule.loader === 'string' && rule.loader.includes('babel-loader')) {
    rule.options = { ...(rule.options || {}), cacheDirectory: path.join(cache, 'babel') };
  }
  if (Array.isArray(rule.use)) rule.use.forEach(loaders);
  if (rule.use && !Array.isArray(rule.use) && typeof rule.use === 'object') loaders(rule.use);
  if (Array.isArray(rule.oneOf)) rule.oneOf.forEach(loaders);
  if (Array.isArray(rule.rules)) rule.rules.forEach(loaders);
}
module.exports = { ...base, webpack: { ...(base.webpack || {}), configure(config, context) {
  const result = base.webpack && base.webpack.configure ? base.webpack.configure(config, context) : config;
  if (result.cache && typeof result.cache === 'object') result.cache = { ...result.cache, cacheDirectory: path.join(cache, 'webpack') };
  (result.module && result.module.rules || []).forEach(loaders);
  for (const plugin of result.plugins || []) if (plugin && plugin.constructor && plugin.constructor.name === 'ESLintWebpackPlugin') plugin.options = { ...plugin.options, cacheLocation: path.join(cache, 'eslint', '.eslintcache') };
  for (const plugin of result.optimization && result.optimization.minimizer || []) if (plugin && plugin.options && Object.hasOwn(plugin.options, 'parallel')) plugin.options.parallel = 2;
  return result;
} } };
""".replace('CACHE_PATH',json.dumps(str(CACHE/'compiler-cache')))
(front/'craco.config.js').write_text(wrapper)
env={k:v for k,v in os.environ.items() if not k.startswith('REACT_APP_') and k not in ['NODE_OPTIONS','PUBLIC_URL','BUILD_PATH','GENERATE_SOURCEMAP','CI']}
env.update({'CI':'false','NODE_ENV':'production','NODE_OPTIONS':'--max-old-space-size=4096','REACT_APP_API_BASE_URL':'http://127.0.0.1:55701/api','PUBLIC_URL':'','BUILD_PATH':str(CACHE/'production-build-isolated'),'GENERATE_SOURCEMAP':'false','BROWSERSLIST_IGNORE_OLD_DATA':'true'})
sandbox=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)']
pre=sandbox+[NODE,str(front/'scripts/copy-pdf-worker.js')]
command=['python3','/tmp/layer-billing-integration-20261101/tools/with-build-lock.py',*sandbox,NODE,str(DEPS/'@craco/craco/dist/bin/craco.js'),'build']
started=now()
with (OUT/'production-build.log').open('w') as stream:
 prep=subprocess.run(pre,cwd=front,env=env,stdout=stream,stderr=subprocess.STDOUT)
 result=subprocess.run(command,cwd=front,env=env,stdout=stream,stderr=subprocess.STDOUT) if prep.returncode==0 else prep
artifacts={str(p.relative_to(CACHE/'production-build-isolated')):sha(p.read_bytes()) for p in sorted((CACHE/'production-build-isolated').rglob('*')) if p.is_file()} if (CACHE/'production-build-isolated').exists() else {}
stable=before==source() and installed_hash==sha((DEPS/'.package-lock.json').read_bytes())
receipt={'startedAtUtc':started,'finishedAtUtc':now(),'candidateCommit':head,'headAtFinish':git('rev-parse','HEAD'),'archiveSha256':sha(archive.read_bytes()),'originalCracoSha256':sha(original.read_bytes()),'temporaryCacheWrapperSha256':sha((front/'craco.config.js').read_bytes()),'temporaryCacheWrapper':wrapper,'resourceCap':'minimizer parallelism2; Node heap4096MiB; local build mutex','prebuildCommand':pre,'command':command,'publicEnvironment':{k:env[k] for k in ['CI','NODE_ENV','NODE_OPTIONS','REACT_APP_API_BASE_URL','PUBLIC_URL','BUILD_PATH','GENERATE_SOURCEMAP']},'network':'OS sandbox deny network*','noEnvFiles':True,'exitCode':result.returncode,'sourceStable':stable,'sourceHashes':before,'installedLockBeforeSha256':installed_hash,'installedLockAfterSha256':sha((DEPS/'.package-lock.json').read_bytes()),'artifactHashes':artifacts,'logSha256':sha((OUT/'production-build.log').read_bytes()),'scope':'Production compiler with exact frozen main source and synthetic local public API; cache locations/resource limits only overridden. Main branding retained. No tenant-configured build, runtime/backend/browser/provider/deployment acceptance.'}
(OUT/'production-build-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'exitCode':result.returncode,'sourceStable':stable,'artifactCount':len(artifacts)}),flush=True)
sys.exit(0 if result.returncode==0 and stable else 1)
