#!/usr/bin/env python3
"""Offline frontend suite; only reads source/dependencies and writes local evidence/cache."""
import datetime,hashlib,json,os,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[5]
out=pathlib.Path(__file__).resolve().parent
node='/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
cache=pathlib.Path('/tmp/layer-billing-integration-cache/MelamedLaw/jest');cache.mkdir(parents=True,exist_ok=True)
git=lambda *a:subprocess.check_output(['git',*a],cwd=root,text=True).strip()
h=lambda b:hashlib.sha256(b).hexdigest()
files=git('ls-files','frontend').splitlines()
def pins():return {p:h((root/p).read_bytes()) for p in files if (root/p).is_file()}
before=pins();candidate=git('rev-parse','HEAD')
tests=sorted(str(p.relative_to(root/'frontend')) for p in (root/'frontend/src').rglob('*.test.js'))
other=[str(p) for p in (root/'frontend/src').rglob('*') if p.is_file() and ('.test.' in p.name or '.spec.' in p.name) and not p.name.endswith('.test.js')]
assert not other,other
cmd=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)',node,str(root/'frontend/node_modules/react-scripts/bin/react-scripts.js'),'test','--watchAll=false','--runInBand','--cacheDirectory',str(cache),'--json','--outputFile',str(out/'frontend-jest.json'),'--runTestsByPath',*tests]
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (out/'frontend-tests.log').open('w') as f:r=subprocess.run(cmd,cwd=root/'frontend',stdout=f,stderr=subprocess.STDOUT,env={**os.environ,'CI':'true','BROWSERSLIST_IGNORE_OLD_DATA':'true','REACT_APP_APP_NAME':'melamedlaw'})
result=json.loads((out/'frontend-jest.json').read_text()) if (out/'frontend-jest.json').exists() else {}
stable=before==pins() and candidate==git('rev-parse','HEAD')
report={'startedAtUtc':started,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':candidate,'nodeVersion':subprocess.check_output([node,'--version'],text=True).strip(),'network':'OS sandbox deny network*','scope':'all discovered frontend unit/integration tests, not browser/provider','publicTenantAppName':'melamedlaw','testFiles':tests,'sourceHashes':before,'sourceStable':stable,'exitCode':r.returncode,'summary':{k:result.get(k) for k in ['numPassedTests','numFailedTests','numPendingTests','numPassedTestSuites','numFailedTestSuites']},'logSha256':h((out/'frontend-tests.log').read_bytes()),'result':'PASS' if r.returncode==0 and result.get('success') is True and stable else 'FAIL_OR_DRIFT'}
(out/'frontend-summary.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['candidate','result','summary','sourceStable','exitCode']}))
raise SystemExit(0 if report['result']=='PASS' else 1)
