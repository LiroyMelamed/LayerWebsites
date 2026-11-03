#!/usr/bin/env python3
"""Frozen public-configuration compiles only; no app startup or publication."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys,tarfile,re
ROOT=Path('/tmp/layer-billing-main-current-20261101')
BASE=Path('/tmp/layer-billing-deploy-payloads-20261101')
OUT=ROOT/'docs/releases/card-save-billing-20261101/release-qualification/deploy-frontend-payloads/authorized-retry'
CONFIG=OUT.parent/'public-environment-allowlist.json'
DEPS=Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026/frontend/node_modules').resolve()
NODE='/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node'
CASES=[('Melamedia','melamedia','efe1ee371ad96bc76963ac1848076055cb83066b'),('AshrafEssa','ashrafessa','9eaebbdb6c23d56d974546e233b8905d19570ef5'),('MorLevi','morlevy','b05d66f9f7873753e520c554f4b2c1c540e6682b'),('MelamedLaw','melamedlaw','21d51f5766e5df0b0ac497fce4cc9d16bdd8bbf5')]
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args,raw=False):
 b=subprocess.check_output(['git',*args],cwd=ROOT)
 return b if raw else b.decode().strip()
def inputs():
 files=git('ls-files','-z','backend','frontend','scripts','docs/signing-v2/release-baseline.json').split('\0')
 return {p:sha((ROOT/p).read_bytes())for p in files if p and(ROOT/p).is_file()}
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
OUT.mkdir(parents=True,exist_ok=False)
public=json.loads(CONFIG.read_text());canonical=sha(json.dumps(public['values'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
assert canonical==public['canonicalAllowlistSha256']=='a291ed29cdcd85bb809471ffbf48e70890b3206037be9096a2b40bf6d84c8667'
source_before=inputs();toolchain_before=sha((DEPS/'.package-lock.json').read_bytes());root_head=git('rev-parse','HEAD')
SANDBOX=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)']
all_results=[]
for tenant,key,candidate in CASES:
 target=BASE/key;target.mkdir();stage=target/'frozen-source';stage.mkdir();cache=target/'compiler-cache';build=target/'compiled';archive=target/'source.tar'
 paths=git('ls-tree','-r','--name-only',candidate,'frontend','scripts').splitlines()
 assert not any(Path(p).name.startswith('.env')for p in paths), 'Dotenv is not a compiler input'
 lock_bytes=git('show',candidate+':frontend/package-lock.json',raw=True);lock=json.loads(lock_bytes)['packages'];drift=[];checked=0;optional=0
 for package,item in lock.items():
  if not package:continue
  p=DEPS.parent/package
  if not p.exists()and item.get('optional'):optional+=1;continue
  actual=json.loads((p/'package.json').read_text()).get('version')if(p/'package.json').exists()else None;checked+=1
  if actual!=item.get('version'):drift.append({'package':package,'expected':item.get('version'),'actual':actual})
 assert not drift,(tenant,drift)
 with archive.open('wb')as f:subprocess.run(['git','archive',candidate,'frontend','scripts'],cwd=ROOT,stdout=f,check=True)
 subprocess.run(['tar','-xf',str(archive),'-C',str(stage)],check=True)
 front=stage/'frontend';(front/'node_modules').symlink_to(DEPS,target_is_directory=True)
 assert not list(front.glob('.env*'))
 original=front/'craco.source.config.cjs';(front/'craco.config.js').rename(original)
 wrapper="""const path=require('node:path');const base=require('./craco.source.config.cjs');const cache=CACHEPATH;
function walk(r){if(!r||typeof r!=='object')return;if(typeof r.loader==='string'&&r.loader.includes('babel-loader'))r.options={...(r.options||{}),cacheDirectory:path.join(cache,'babel')};for(const k of ['use','oneOf','rules'])if(Array.isArray(r[k]))r[k].forEach(walk);else if(r[k]&&typeof r[k]==='object')walk(r[k]);}
module.exports={...base,webpack:{...(base.webpack||{}),configure(c,x){const o=base.webpack&&base.webpack.configure?base.webpack.configure(c,x):c;if(o.cache&&typeof o.cache==='object')o.cache={...o.cache,cacheDirectory:path.join(cache,'webpack')};(o.module.rules||[]).forEach(walk);for(const p of o.plugins||[])if(p?.constructor?.name==='ESLintWebpackPlugin')p.options={...p.options,cacheLocation:path.join(cache,'eslint/.eslintcache')};for(const p of o.optimization?.minimizer||[])if(p?.options&&Object.hasOwn(p.options,'parallel'))p.options.parallel=2;return o;}}};""".replace('CACHEPATH',json.dumps(str(cache)))
 (front/'craco.config.js').write_text(wrapper)
 env={k:os.environ[k]for k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']if k in os.environ}
 env.update({'NODE_ENV':'production','CI':'false','NODE_OPTIONS':'--max-old-space-size=4096','BROWSERSLIST_IGNORE_OLD_DATA':'true','PUBLIC_URL':'','BUILD_PATH':str(build),'GENERATE_SOURCEMAP':'false'})
 env.update(public['values'][key]);assert {k:v for k,v in env.items()if k.startswith('REACT_APP_')}==public['values'][key]
 commands=[SANDBOX+[NODE,str(front/'scripts/copy-pdf-worker.js')],SANDBOX+[NODE,str(front/'scripts/apply-tenant-branding.js'),key],SANDBOX+[NODE,str(DEPS/'@craco/craco/dist/bin/craco.js'),'build']]
 log=OUT/(key+'.log');started=now();codes=[]
 print(json.dumps({'tenant':tenant,'state':'LOCAL_FROZEN_COMPILE_START','candidate':candidate,'atUtc':started}),flush=True)
 with log.open('w')as f:
  for cmd in commands:
   r=subprocess.run(cmd,cwd=front,env=env,stdout=f,stderr=subprocess.STDOUT);codes.append(r.returncode)
   if r.returncode:break
 artifacts={str(p.relative_to(build)):sha(p.read_bytes())for p in sorted(build.rglob('*'))if p.is_file()}if build.exists()else{}
 api_found=bool(artifacts)and any(env['REACT_APP_API_BASE_URL'].encode()in p.read_bytes()for p in(build/'static/js').glob('*.js'))
 logo=build/'firm-logo.png';own=front/'public/tenants'/key/'firm-logo.png';logo_ok=logo.exists()and sha(logo.read_bytes())==sha(own.read_bytes())
 entrypoints=[];static_archive=None;archive_members=[]
 if len(codes)==3 and not any(codes):
  manifest=json.loads((build/'asset-manifest.json').read_text());entrypoints=manifest['entrypoints']
  assert all(p.startswith('static/')and(build/p).is_file()for p in entrypoints)
  static_archive=target/(key+'-static-only.tar.gz')
  archive_members=[x for x in artifacts if x.startswith('static/')]
  with tarfile.open(static_archive,'w:gz')as tf:
   for name in archive_members:tf.add(build/name,arcname=name,recursive=False)
  with tarfile.open(static_archive,'r:gz')as tf:assert sorted(tf.getnames())==sorted(archive_members)
 row={'tenant':tenant,'key':key,'candidateCommit':candidate,'frozenUpstream':'074df7520497a0cd6bd95ad70353201c905f0aa6','sourceFrontendTree':git('rev-parse',candidate+':frontend'),'sourceScriptsTree':git('rev-parse',candidate+':scripts'),'startedAtUtc':started,'finishedAtUtc':now(),'exitCodes':codes,'commands':commands,'publicEnvironment':{k:v for k,v in env.items()if k.startswith('REACT_APP_')or k in ['NODE_ENV','CI','NODE_OPTIONS','PUBLIC_URL','BUILD_PATH','GENERATE_SOURCEMAP']},'publicAllowlistCanonicalSha256':canonical,'noDotenv':True,'network':'OS sandbox deny network*; no application startup','exactDependencies':{'checked':checked,'optionalAbsent':optional,'drift':drift,'sourceLockSha256':sha(lock_bytes),'installedLockSha256':toolchain_before},'sourceArchiveSha256':sha(archive.read_bytes()),'originalCracoSha256':sha(original.read_bytes()),'cacheWrapperSha256':sha(wrapper.encode()),'resourceCap':'one shared heavy-work mutex; minifierparallel2; Nodeheap4096MiB','artifactCount':len(artifacts),'artifactHashes':artifacts,'compiledApiBaseFound':api_found,'ownTenantLogoMatches':logo_ok,'compiledEntrypoints':entrypoints,'compiledIndexSha256':artifacts.get('index.html'),'assetManifestSha256':artifacts.get('asset-manifest.json'),'staticOnlyArchive':str(static_archive)if static_archive else None,'staticArchiveMembers':archive_members,'staticOnlyArchiveSha256':sha(static_archive.read_bytes())if static_archive else None,'logSha256':sha(log.read_bytes()),'activationReady':False,'activationHolds':['fresh current protected-root/index/manifest/CSP binding','reviewed compare-and-swap entrypoint publication','remaining release QA/backup/restore/drain/financial gates'],'notInStaticArchive':['index.html','asset-manifest.json','root branding/icons/CSP/server config','dotenv/secrets'],'applicationBoots':0,'providerOperations':0,'deploymentPerformed':False}
 save(OUT/(key+'.json'),row);all_results.append(row)
 print(json.dumps({'tenant':tenant,'state':'LOCAL_FROZEN_COMPILE_FINISH','exitCodes':codes,'artifacts':len(artifacts),'apiBaseFound':api_found,'ownLogo':logo_ok,'atUtc':row['finishedAtUtc']}),flush=True)
 if len(codes)!=3 or any(codes)or not api_found or not logo_ok:break
stable=source_before==inputs();deps_stable=toolchain_before==sha((DEPS/'.package-lock.json').read_bytes())
summary={'recordedAtUtc':now(),'attempt':'single retry after earlier known-not-executed approval rejection','previousDenialPreserved':True,'rootHeadAtStart':root_head,'rootHeadAtFinish':git('rev-parse','HEAD'),'sourceStable':stable,'dependencyStable':deps_stable,'sourceInputHashesBefore':source_before,'publicAllowlistCanonicalSha256':canonical,'results':[{k:r[k]for k in ['tenant','candidateCommit','exitCodes','artifactCount','compiledApiBaseFound','ownTenantLogoMatches','staticOnlyArchive','staticOnlyArchiveSha256','activationReady']}for r in all_results],'allFourBuilt':len(all_results)==4 and all(len(r['exitCodes'])==3 and not any(r['exitCodes'])and r['compiledApiBaseFound']and r['ownTenantLogoMatches']for r in all_results),'noApplicationStartup':True,'providerOperations':0,'deploymentPerformed':False,'outputRoot':str(BASE),'scope':'local immutable-source public-configuration build and static-only archive preparation; not activation/deployment acceptance'}
save(OUT/'summary.json',summary)
print(json.dumps({'state':'ALL_LOCAL_COMPILES_FINISHED','allFourBuilt':summary['allFourBuilt'],'sourceStable':stable,'dependencyStable':deps_stable}),flush=True)
sys.exit(0 if summary['allFourBuilt']and stable and deps_stable else 1)
