#!/usr/bin/env python3
"""Local client-only qualification. No live environment/provider calls."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,subprocess,sys
P=argparse.ArgumentParser();P.add_argument('--repo',type=Path,required=True);P.add_argument('--tenant',required=True,choices=['Melamedia','AshrafEssa','MelamedLaw','MorLevi']);P.add_argument('--action',required=True,choices=['backend','transport','frontend','build','guard','deps']);a=P.parse_args()
ROOT=a.repo.resolve();TENANT=a.tenant;KEY={'Melamedia':'melamedia','AshrafEssa':'ashrafessa','MelamedLaw':'melamedlaw','MorLevi':'morlevy'}[TENANT]
OUT=ROOT/'docs/releases/card-save-billing-20261101/release-qualification'/TENANT;OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/layer-billing-release-clients-20261101/cache')/TENANT;CACHE.mkdir(parents=True,exist_ok=True)
NODE='/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node';FDEPS=Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/frontend/node_modules').resolve();BDEPS=Path('/tmp/layer-billing-lock-deps/node_modules').resolve()
MUTEX=['python3','/tmp/layer-billing-integration-20261101/tools/with-build-lock.py'];SANDBOX=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)']
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args,raw=False):return subprocess.check_output(['git',*args],cwd=ROOT) if raw else subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
def sources():return {p:sha((ROOT/p).read_bytes()) for p in git('ls-files','-z','backend','frontend','scripts','docs/signing-v2/release-baseline.json').split('\0') if p and (ROOT/p).is_file()}
def deps():
 result={}
 for part,d in [('backend',BDEPS),('frontend',FDEPS)]:
  lock=json.loads((ROOT/part/'package-lock.json').read_bytes())['packages'];drift=[];checked=0;optional=0
  for package,item in lock.items():
   if not package:continue
   p=d.parent/package
   if not p.exists() and item.get('optional'):optional+=1;continue
   actual=json.loads((p/'package.json').read_bytes()).get('version') if (p/'package.json').exists() else None;checked+=1
   if actual!=item.get('version'):drift.append({'package':package,'expected':item.get('version'),'actual':actual})
  result[part]={'lockSha256':sha((ROOT/part/'package-lock.json').read_bytes()),'installedLockSha256':sha((d/'.package-lock.json').read_bytes()),'checked':checked,'absentOptional':optional,'drift':drift,'root':str(d)}
  if drift:raise RuntimeError(part+' dependency drift')
 return result
HEAD=git('rev-parse','HEAD');BEFORE=sources();DEP=deps()
ENV={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG'] if k in os.environ};ENV.update({'NODE_ENV':'test','DB_DISABLE_CONNECT_TEST':'true','NODE_PATH':str(BDEPS),'REACT_APP_APP_NAME':KEY,'BROWSERSLIST_IGNORE_OLD_DATA':'true'})
def save(name,d):
 d.update({'tenant':TENANT,'candidate':HEAD,'headAtFinish':git('rev-parse','HEAD'),'sourceStable':BEFORE==sources(),'sourceHashes':BEFORE,'dependencyProof':DEP,'scope':'isolated local source only; no provider/customer/production/deploy acceptance'})
 (OUT/name).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n');return d
if a.action=='deps':save('dependencies.json',{'atUtc':now()});print('exact dependencies verified');sys.exit(0)
if a.action=='guard':
 r=subprocess.run([NODE,'scripts/check-signing-release.cjs'],cwd=ROOT,env=ENV,capture_output=True,text=True);d=save('source-guard.json',{'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr});print(r.stdout+r.stderr);sys.exit(r.returncode or(not d['sourceStable']))
if a.action=='backend':
 tests=ROOT/'backend/tests';pattern=re.compile(r'^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$')
 billing=sorted('backend/tests/'+p.name for p in tests.glob('*.test.js') if pattern.match(p.name) or 'BILLING_OPERATIONS_ENABLED' in p.read_text())
 common=['backend/tests/'+x for x in ['clientDocumentProfile.test.js','clientDocumentProfile.readScope.test.js','clientDocumentProfile.postgres.test.js','customerIdentity.recovery.test.js','clientPortal.mainScope.test.js','clientPortal.unit.test.js','authMiddleware.shape.test.js','signingV2.featureEntryRoutes.test.js','signingV2.wordOriginBoundary.test.js','signingWordRoutes.test.js']]
 rows=[];guard=ROOT/'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs'
 for label,files in [('billing-and-gate',billing),('common',common)]:
  command=[NODE,'--require',str(guard),'--test','--test-reporter=tap','--test-concurrency=2',*files];started=now();r=subprocess.run(command,cwd=ROOT,env=ENV,capture_output=True,text=True);log=r.stdout+r.stderr;(OUT/(label+'.tap')).write_text(log);summary={}
  for key in ['tests','pass','fail','skipped','cancelled']:
   m=re.search(r'^# '+key+r' (\d+)$',log,re.M);summary[key]=int(m[1]) if m else None
  row={'label':label,'started':started,'finished':now(),'command':command,'files':files,'exitCode':r.returncode,'summary':summary,'logSha256':sha(log.encode())};rows.append(row);print(json.dumps({'label':label,'exit':r.returncode,'summary':summary}),flush=True)
 d=save('backend.json',{'results':rows,'providerCalls':'synthetic only','externalNetwork':'native guard blocks before connection','applicationDbAccess':False,'actualPostgres':False});sys.exit(0 if all(x['exitCode']==0 for x in rows) and d['sourceStable'] else 1)
if a.action=='transport':
 files=['backend/tests/'+x for x in ['qaOutboundNoop.recovery.test.js','signingV2.completedCopyNotification.test.js','signingV2.transportOutcomes.test.js','systemMessagesOutbox.test.js','systemMessagesSdkRecovery.test.js','systemMessageConsentController.test.js']]
 guard=ROOT/'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs';command=[NODE,'--require',str(guard),'--test','--test-reporter=tap','--test-concurrency=2',*files];started=now()
 r=subprocess.run(command,cwd=ROOT,env=ENV,capture_output=True,text=True);log=r.stdout+r.stderr;(OUT/'transport-and-outbox.tap').write_text(log);summary={}
 for key in ['tests','pass','fail','skipped','cancelled']:
  m=re.search(r'^# '+key+r' (\d+)$',log,re.M);summary[key]=int(m[1]) if m else None
 d=save('transport.json',{'started':started,'finished':now(),'command':command,'files':files,'exitCode':r.returncode,'summary':summary,'logSha256':sha(log.encode()),'providerCalls':'synthetic only','externalNetwork':'native guard blocks before connection','applicationDbAccess':False,'actualPostgres':False});print(json.dumps({'exit':r.returncode,'summary':summary,'sourceStable':d['sourceStable']}),flush=True);sys.exit(0 if r.returncode==0 and d['sourceStable']else 1)
if a.action=='frontend':
 files=sorted(str(p.relative_to(ROOT/'frontend')) for p in (ROOT/'frontend/src').rglob('*') if p.is_file()and('.test.' in p.name or '.spec.' in p.name));assert all(x.endswith('.test.js')for x in files)
 env={**ENV,'CI':'true','NODE_OPTIONS':'--max-old-space-size=4096'}
 command=[*MUTEX,*SANDBOX,NODE,str(FDEPS/'react-scripts/bin/react-scripts.js'),'test','--watchAll=false','--runInBand','--cacheDirectory',str(CACHE/'jest'),'--json','--outputFile',str(OUT/'frontend-result.json'),'--runTestsByPath',*files];started=now()
 with (OUT/'frontend.log').open('w')as f:r=subprocess.run(command,cwd=ROOT/'frontend',env=env,stdout=f,stderr=subprocess.STDOUT)
 report=json.loads((OUT/'frontend-result.json').read_bytes())if(OUT/'frontend-result.json').exists()else{}
 d=save('frontend.json',{'started':started,'finished':now(),'command':command,'files':files,'exitCode':r.returncode,'summary':{k:report.get(k)for k in ['success','numTotalTests','numPassedTests','numFailedTests','numPendingTests','numPassedTestSuites','numFailedTestSuites']},'logSha256':sha((OUT/'frontend.log').read_bytes()),'network':'OS deny network*'})
 print(json.dumps({'exit':r.returncode,'summary':d['summary'],'stable':d['sourceStable']}),flush=True);sys.exit(0 if r.returncode==0 and report.get('success')and d['sourceStable']else 1)
if a.action=='build':
 stage=CACHE/'frozen-build';stage.mkdir(parents=True,exist_ok=False);archive=CACHE/'source.tar'
 with archive.open('wb')as f:subprocess.run(['git','archive',HEAD,'frontend','scripts'],cwd=ROOT,stdout=f,check=True)
 subprocess.run(['tar','-xf',str(archive),'-C',str(stage)],check=True);front=stage/'frontend';(front/'node_modules').symlink_to(FDEPS);assert not list(front.glob('.env*'))
 original=front/'craco.source.config.cjs';(front/'craco.config.js').rename(original)
 wrapper="""const path=require('node:path');const base=require('./craco.source.config.cjs');const cache=CACHEPATH;
function walk(r){if(!r||typeof r!=='object')return;if(typeof r.loader==='string'&&r.loader.includes('babel-loader'))r.options={...(r.options||{}),cacheDirectory:path.join(cache,'babel')};for(const k of ['use','oneOf','rules'])if(Array.isArray(r[k]))r[k].forEach(walk);else if(r[k]&&typeof r[k]==='object')walk(r[k]);}
module.exports={...base,webpack:{...(base.webpack||{}),configure(c,x){const o=base.webpack&&base.webpack.configure?base.webpack.configure(c,x):c;if(o.cache&&typeof o.cache==='object')o.cache={...o.cache,cacheDirectory:path.join(cache,'webpack')};(o.module.rules||[]).forEach(walk);for(const p of o.plugins||[])if(p?.constructor?.name==='ESLintWebpackPlugin')p.options={...p.options,cacheLocation:path.join(cache,'eslint/.eslintcache')};for(const p of o.optimization?.minimizer||[])if(p?.options&&Object.hasOwn(p.options,'parallel'))p.options.parallel=2;return o;}}};""".replace('CACHEPATH',json.dumps(str(CACHE/'compiler-cache')))
 (front/'craco.config.js').write_text(wrapper);build=CACHE/'production-build'
 env={**ENV,'NODE_ENV':'production','CI':'false','NODE_OPTIONS':'--max-old-space-size=4096','REACT_APP_API_BASE_URL':'http://127.0.0.1:55799/api','PUBLIC_URL':'','BUILD_PATH':str(build),'GENERATE_SOURCEMAP':'false'}
 commands=[[*SANDBOX,NODE,str(front/'scripts/copy-pdf-worker.js')],[*SANDBOX,NODE,str(front/'scripts/apply-tenant-branding.js'),KEY],[*MUTEX,*SANDBOX,NODE,str(FDEPS/'@craco/craco/dist/bin/craco.js'),'build']];started=now();codes=[]
 with(OUT/'build.log').open('w')as f:
  for command in commands:
   r=subprocess.run(command,cwd=front,env=env,stdout=f,stderr=subprocess.STDOUT);codes.append(r.returncode)
   if r.returncode:break
 artifacts={str(p.relative_to(build)):sha(p.read_bytes())for p in sorted(build.rglob('*'))if p.is_file()}if build.exists()else{}
 ownlogo=front/'public/tenants'/KEY/'firm-logo.png';builtlogo=build/'firm-logo.png';logoOk=builtlogo.exists()and sha(ownlogo.read_bytes())==sha(builtlogo.read_bytes())
 d=save('build.json',{'started':started,'finished':now(),'commands':commands,'exitCodes':codes,'artifactHashes':artifacts,'artifactCount':len(artifacts),'ownTenantLogoMatches':logoOk,'publicEnvironment':{k:env[k]for k in ['REACT_APP_APP_NAME','REACT_APP_API_BASE_URL','BUILD_PATH','GENERATE_SOURCEMAP']},'archiveSha256':sha(archive.read_bytes()),'originalCracoSha256':sha(original.read_bytes()),'cacheWrapperSha256':sha(wrapper.encode()),'network':'OS deny network*','logSha256':sha((OUT/'build.log').read_bytes()),'deploymentPayload':False})
 print(json.dumps({'exitCodes':codes,'artifacts':len(artifacts),'logo':logoOk,'stable':d['sourceStable']}),flush=True);sys.exit(0 if len(codes)==3 and  not any(codes)and logoOk and d['sourceStable']else 1)
