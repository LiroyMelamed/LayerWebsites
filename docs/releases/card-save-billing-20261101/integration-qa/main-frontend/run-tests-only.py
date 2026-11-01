#!/usr/bin/env python3
"""All discovered frontend tests on the exact combined source; no code changes."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys
ROOT=Path('/tmp/layer-billing-integration-20261101/main')
OUT=ROOT/'docs/releases/card-save-billing-20261101/integration-qa/main-frontend'
CACHE=Path('/tmp/layer-billing-integration-20261101/main-frontend-cache')
NODE='/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node'
DEPS=Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/frontend/node_modules').resolve()
BDEPS=Path('/tmp/layer-billing-lock-deps/node_modules').resolve()
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*a):return subprocess.check_output(['git',*a],cwd=ROOT,text=True).strip()
def source():return {p:sha((ROOT/p).read_bytes()) for p in git('ls-files','frontend','backend','scripts').splitlines() if (ROOT/p).is_file()}
head=git('rev-parse','HEAD')
if head!='176ff60a377136ce6a01b43c1defd23f2fe0674b':raise RuntimeError('HEAD_CHANGED')
if (ROOT/'frontend/node_modules').resolve()!=DEPS:raise RuntimeError('FRONTEND_DEPENDENCY_LINK_CHANGED')
if (ROOT/'backend/node_modules').resolve()!=BDEPS:raise RuntimeError('BACKEND_DEPENDENCY_LINK_CHANGED')
if any((ROOT/'frontend').glob('.env*')):raise RuntimeError('UNEXPECTED_FRONTEND_ENV')
proof={};before=source()
for label,deps,folder in [('frontend',DEPS,'frontend'),('backend',BDEPS,'backend')]:
 lock=json.loads((ROOT/folder/'package-lock.json').read_bytes())['packages'];checked=0;absent_optional=0;drift=[]
 for package,item in lock.items():
  if not package:continue
  p=deps.parent/package
  if not p.exists() and item.get('optional'):absent_optional+=1;continue
  version=json.loads((p/'package.json').read_bytes()).get('version') if (p/'package.json').exists() else None
  checked+=1
  if version!=item.get('version'):drift.append({'path':package,'expected':item.get('version'),'actual':version})
 proof[label]={'sourceLockSha256':sha((ROOT/folder/'package-lock.json').read_bytes()),'installedLockSha256':sha((deps/'.package-lock.json').read_bytes()),'checkedPackages':checked,'optionalAbsent':absent_optional,'requiredVersionMismatches':drift,'dependencyPath':str(deps)}
 if drift:raise RuntimeError(label+'_LOCK_DRIFT')
files=sorted(str(p.relative_to(ROOT/'frontend')) for p in (ROOT/'frontend/src').rglob('*') if p.is_file() and ('.test.' in p.name or '.spec.' in p.name))
if any(not p.endswith('.test.js') for p in files):raise RuntimeError('UNHANDLED_TEST_SUFFIX')
env={k:v for k,v in os.environ.items() if not k.startswith('REACT_APP_') and k not in ['NODE_OPTIONS','PUBLIC_URL','BUILD_PATH','GENERATE_SOURCEMAP','TZ']}
env.update({'CI':'true','NODE_ENV':'test','BROWSERSLIST_IGNORE_OLD_DATA':'true','NODE_OPTIONS':'--max-old-space-size=4096'})
command=['python3','/tmp/layer-billing-integration-20261101/tools/with-build-lock.py','/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)',NODE,str(DEPS/'react-scripts/bin/react-scripts.js'),'test','--watchAll=false','--runInBand','--cacheDirectory',str(CACHE/'jest'),'--json','--outputFile',str(OUT/'frontend-tests-result.json'),'--runTestsByPath',*files]
started=now()
with (OUT/'frontend-tests.log').open('w') as stream:result=subprocess.run(command,cwd=ROOT/'frontend',env=env,stdout=stream,stderr=subprocess.STDOUT)
report=json.loads((OUT/'frontend-tests-result.json').read_bytes()) if (OUT/'frontend-tests-result.json').exists() else {}
stable=before==source() and head==git('rev-parse','HEAD') and all(value['installedLockSha256']==sha((Path(value['dependencyPath'])/'.package-lock.json').read_bytes()) for value in proof.values())
receipt={'startedAtUtc':started,'finishedAtUtc':now(),'candidateCommit':head,'nodeVersion':subprocess.check_output([NODE,'--version'],text=True).strip(),'command':command,'fileCount':len(files),'testFiles':files,'network':'OS sandbox deny network*','timezone':'system default; no custom TZ','dependencyProof':proof,'exitCode':result.returncode,'sourceStable':stable,'sourceHashes':before,'logSha256':sha((OUT/'frontend-tests.log').read_bytes()),'summary':{k:report.get(k) for k in ['success','numTotalTests','numPassedTests','numFailedTests','numPendingTests','numPassedTestSuites','numFailedTestSuites']},'scope':'All discovered frontend unit/component tests including actual imported backend modules, no browser/API/provider/deploy acceptance.'}
(OUT/'frontend-tests-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:receipt[k] for k in ['candidateCommit','fileCount','exitCode','sourceStable','summary']}),flush=True)
sys.exit(0 if result.returncode==0 and report.get('success') and stable else 1)
