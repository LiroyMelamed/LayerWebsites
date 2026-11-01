#!/usr/bin/env python3
"""Read-only persistence inspection. No tests, build, network or source mutations."""
from pathlib import Path
import datetime,hashlib,io,json,subprocess,tarfile
ROOT=Path('/tmp/layer-billing-main-current-20261101')
BASE=ROOT/'docs/releases/card-save-billing-20261101/release-qualification'
OUT=BASE/'reconnection-frontend'
FINAL='6a3bd299227291feb0065ae3afa89a1f3ba2967a'
OLD='9dd9cb3607ee79434fcfb1aed5a40773e5713789'
CUTOFF='074df7520497a0cd6bd95ad70353201c905f0aa6'
issues=[];lost=[];read_hashes={};map_cache={}
def sha(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def gs(*args):return git(*args).decode().strip()
def check(value,reason):
 if not value:issues.append(reason)
 return bool(value)
def record(path):
 p=Path(path)
 if not p.is_file():issues.append('MISSING_EVIDENCE_FILE:'+str(p));return None
 b=p.read_bytes();read_hashes[str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)]=sha(b);return b
# Python3.9 macOS compatibility: avoid Path.is_relative_to on older installations.
def load(path):
 b=record(path)
 if b is None:return None
 try:return json.loads(b)
 except Exception as e:issues.append('CORRUPT_JSON:'+str(path)+':'+str(e));return None
def logproof(path,expected):
 b=record(path);actual=sha(b) if b is not None else None
 return {'path':str(path),'expectedSha256':expected,'actualSha256':actual,'bytes':len(b) if b is not None else None,'matches':check(actual==expected,'LOG_HASH_MISMATCH:'+str(path))}
def blobsha(ref,file):return sha(git('show',ref+':'+file))
def trees(ref):return {folder:gs('rev-parse',ref+':'+folder) for folder in ['frontend','scripts']}
def source_map(ref):
 ts=trees(ref);key=(ts['frontend'],ts['scripts'])
 if key not in map_cache:
  raw=git('archive',ref,'frontend','scripts');m={}
  with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as archive:
   for member in archive.getmembers():
    if member.isfile():m[member.name]=sha(archive.extractfile(member).read())
  map_cache[key]=m
 return map_cache[key]
def dependencies(receipt):
 result={}
 for label,p in receipt.get('dependencyProof',{}).items():
  root=p.get('dependencyPath') or p.get('root');target=Path(root)/'.package-lock.json'
  expected=p.get('installedLockSha256')
  if target.is_file():
   actual=sha(target.read_bytes());status='MATCH' if actual==expected else 'MISMATCH';check(status=='MATCH','DEPENDENCY_LOCK_MISMATCH:'+str(target))
  else:
   actual=None;status='CACHE_ABSENT_RECEIPT_RETAINED';lost.append(str(target))
  result[label]={'root':root,'expectedInstalledLockSha256':expected,'actualInstalledLockSha256':actual,'status':status}
 return result
def artifactproof(build,label,main=False):
 path=Path(build['publicEnvironment']['BUILD_PATH']);expected=build['artifactHashes'];miss=[];bad=[]
 if not path.is_dir():
  lost.append(str(path));return {'path':str(path),'status':'CACHE_ABSENT_RECEIPT_HASHES_RETAINED','expectedFiles':len(expected),'receiptHashCount':len(expected),'missingFiles':None,'mismatches':None}
 actualpaths={str(p.relative_to(path)) for p in path.rglob('*') if p.is_file()}
 for name,want in expected.items():
  target=path/name
  if not target.is_file():miss.append(name)
  elif sha(target.read_bytes())!=want:bad.append(name)
 extra=sorted(actualpaths-set(expected));good=not miss and not bad
 check(good,'COMPILED_ARTIFACT_MISSING_OR_HASH_MISMATCH:'+label)
 archive=path.parent/('frozen-build-isolated.tar' if main else 'source.tar')
 if archive.is_file():
  a=sha(archive.read_bytes());archive_result={'path':str(archive),'status':'MATCH' if a==build['archiveSha256'] else 'MISMATCH','sha256':a};check(archive_result['status']=='MATCH','SOURCE_ARCHIVE_HASH_MISMATCH:'+label)
 else:archive_result={'path':str(archive),'status':'CACHE_ABSENT_RECEIPT_HASH_RETAINED'};lost.append(str(archive))
 wrapper=path.parent/('frozen-build-isolated/frontend/craco.config.js' if main else 'frozen-build/frontend/craco.config.js')
 want=build.get('temporaryCacheWrapperSha256') or build.get('cacheWrapperSha256')
 if wrapper.is_file():
  a=sha(wrapper.read_bytes());wrapper_result={'path':str(wrapper),'status':'MATCH' if a==want else 'MISMATCH','sha256':a};check(wrapper_result['status']=='MATCH','COMPILER_WRAPPER_HASH_MISMATCH:'+label)
 else:wrapper_result={'path':str(wrapper),'status':'CACHE_ABSENT_RECEIPT_HASH_RETAINED'};lost.append(str(wrapper))
 return {'path':str(path),'status':'ALL_EXPECTED_FILES_MATCH' if good else 'PARTIAL_OR_MISMATCH','expectedFiles':len(expected),'presentFiles':len(actualpaths),'verifiedExpectedFiles':len(expected)-len(miss)-len(bad),'missingFiles':miss,'mismatches':bad,'unrecordedExtraFiles':extra,'sourceArchive':archive_result,'compilerCacheWrapper':wrapper_result}
started=datetime.datetime.now(datetime.timezone.utc).isoformat();starthead=gs('rev-parse','HEAD');check(starthead==FINAL,'CURRENT_ROOT_HEAD_NOT_FROZEN_6A3')
check(not gs('diff','--name-only','HEAD','--','backend','frontend','scripts'),'TRACKED_PRODUCT_SOURCE_DIRTY')
freeze=load(BASE/'freeze-cutoff.json');check(freeze['qualifiedCommonRuntime']==FINAL,'WRONG_FROZEN_COMMON_RUNTIME');check(freeze['upstreamCutoff']['refs/heads/main']==CUTOFF,'WRONG_FROZEN_MAIN_CUTOFF')
main=BASE/'main-frontend';fr=load(main/'frontend-tests-receipt.json');br=load(main/'production-build-receipt.json');jr=load(main/'frontend-tests-result.json');dp=load(main/'jest-discovery-proof.json')
check(fr['candidateCommit']==OLD and fr['headAtFinish']==OLD and fr['exitCode']==0 and fr['sourceStable'],'MAIN_FRONT_RECEIPT_INVALID')
check(fr['summary']['numPassedTests']==920 and fr['summary']['numFailedTests']==0 and fr['summary']['numPendingTests']==0 and fr['fileCount']==107,'MAIN_FRONT_COUNTS_INVALID')
check(jr['success'] and jr['numPassedTests']==920 and jr['numPassedTestSuites']==107,'MAIN_JEST_RESULT_INVALID')
check(dp['jestDiscoveredFileCount']==107 and not dp['omittedFiles'] and not dp['extraFiles'],'MAIN_DISCOVERY_INVALID')
check(br['candidateCommit']==OLD and br['headAtFinish']==OLD and br['exitCode']==0 and br['sourceStable'] and len(br['artifactHashes'])==253,'MAIN_BUILD_RECEIPT_INVALID')
main_result={'actualTestCommit':OLD,'frontendSummary':fr['summary'],'actualBuildCommit':OLD,'buildArtifactCount':len(br['artifactHashes']),'logs':[logproof(main/'frontend-tests.log',fr['logSha256']),logproof(main/'production-build.log',br['logSha256'])],'dependencies':dependencies(fr),'compiledArtifacts':artifactproof(br,'main',True),'persistedProvenance':[]}
for name,donor in [('input-equivalence-6fab.json','6fab2887d056262cf52ddb773a377e5ad804f0d7'),('input-equivalence-6a3bd299.json',FINAL)]:
 p=load(main/name);check(p['result']=='PASS_EQUIVALENT_FRONTEND_INPUTS_NOT_FRESH_DONOR_EXECUTION' and p['qualifiedCommit']==OLD and p['donorCommit']==donor,'MAIN_PROVENANCE_SCOPE_INVALID:'+name)
 for folder,v in p['sourceGroups'].items():check(v['baseTree']==gs('rev-parse',OLD+':'+folder) and v['donorTree']==gs('rev-parse',donor+':'+folder) and v['baseTree']==v['donorTree'] and not v['byteMismatches'],'MAIN_TREE_PROOF_MISMATCH:'+name+':'+folder)
 for h in p['conservativeBackendHelperComparison']:check(h['baseSha256']==blobsha(OLD,h['file']) and h['donorSha256']==blobsha(donor,h['file']) and h['baseSha256']==h['donorSha256'],'MAIN_HELPER_PROOF_MISMATCH:'+name+':'+h['file'])
 for receipt,v in p['originalQualificationReceipts'].items():check(v['sha256']==sha((main/receipt).read_bytes()) and v['candidateCommit']==OLD,'MAIN_ORIGINAL_RECEIPT_BINDING_MISMATCH:'+receipt)
 main_result['persistedProvenance'].append({'file':name,'qualifiedCommit':OLD,'donorCommit':donor,'status':'VERIFIED_SOURCE_AND_RECEIPT_BINDING','frontendFiles':p['sourceGroups']['frontend']['fileCount'],'scripts':p['sourceGroups']['scripts']['fileCount'],'helpers':len(p['conservativeBackendHelperComparison'])})
clients=[]
for tenant in ['Melamedia','MelamedLaw','MorLevi','AshrafEssa']:
 folder=BASE/tenant;s=load(folder/'qualification-summary.json');f=load(folder/'frontend.json');b=load(folder/'build.json');c=load(folder/'frontend-build-carry.json');j=load(folder/'frontend-result.json');imp=load(folder/'frontend-import-scope.json')
 candidate=s.get('qualifiedRuntimeCommit') or s.get('qualifiedRuntimeCandidate') or s.get('qualifiedSourceCandidate');cut=s.get('currentSharedMain') or s.get('sharedMainCutoff') or s.get('mainCutoff');baseline=s.get('currentClientBaseline') or s.get('latestClientCutoff') or s.get('latestClientHistory');donor=s.get('finalDonor') or s.get('donor')
 check(cut==CUTOFF and donor==FINAL and baseline==freeze['upstreamCutoff']['refs/heads/'+tenant],'CLIENT_SOURCE_CUTOFF_INVALID:'+tenant)
 ancestry={}
 for label,ref in [('commonRuntime',FINAL),('mainCutoff',CUTOFF),('clientCutoff',baseline)]:
  ok=subprocess.run(['git','merge-base','--is-ancestor',ref,candidate],cwd=ROOT,capture_output=True).returncode==0;ancestry[label]={'commit':ref,'isAncestor':ok};check(ok,'CLIENT_MISSING_CUTOFF_ANCESTRY:'+tenant+':'+label)
 check(c['currentCandidate']==candidate and c['allValid'],'CLIENT_CARRY_WRONG_CANDIDATE:'+tenant)
 check(f['exitCode']==0 and f['sourceStable'] and f['candidate']==f['headAtFinish'] and f['summary']['success'] and f['summary']['numFailedTests']==0 and f['summary']['numPendingTests']==0,'CLIENT_FRONT_RECEIPT_INVALID:'+tenant)
 check(j['success'] and j['numPassedTests']==f['summary']['numPassedTests'] and j['numPassedTestSuites']==f['summary']['numPassedTestSuites'],'CLIENT_JEST_RESULT_INVALID:'+tenant)
 check(b['sourceStable'] and b['candidate']==b['headAtFinish'] and all(code==0 for code in b['exitCodes']) and b['artifactCount']==len(b['artifactHashes']) and b['ownTenantLogoMatches'],'CLIENT_BUILD_RECEIPT_INVALID:'+tenant)
 check(not imp['parserErrors'] and len(imp['directBackendImports'])==4 and len(imp['conservativeBackendHelperPaths'])==10,'CLIENT_IMPORT_SCOPE_INVALID:'+tenant)
 row={'tenant':tenant,'qualifiedRuntimeCommit':candidate,'mainCutoff':cut,'clientCutoff':baseline,'finalDonor':donor,'cutoffAncestry':ancestry,'actualFrontendCommit':f['candidate'],'actualBuildCommit':b['candidate'],'frontendSummary':f['summary'],'buildArtifactCount':b['artifactCount'],'logs':[logproof(folder/'frontend.log',f['logSha256']),logproof(folder/'build.log',b['logSha256'])],'dependencies':dependencies(f),'carryReceipts':[]}
 for carry in c['receipts']:
  label=carry['label'];receipt=f if label=='frontend' else b;old=receipt['candidate'];receiptpath=folder/(label+'.json')
  check(carry['valid'] and carry['currentCandidate']==candidate and carry['oldSourceCandidate']==old and carry['receiptSha256']==sha(receiptpath.read_bytes()),'CLIENT_CARRY_RECEIPT_BINDING_INVALID:'+tenant+':'+label)
  expected={k:v for k,v in receipt['sourceHashes'].items() if k.startswith('frontend/') or k.startswith('scripts/')};actual=source_map(candidate);old_actual=source_map(old)
  check(expected==actual==old_actual and len(expected)==carry['allTrackedFrontendAndScriptsInputCount'],'CLIENT_COMPILE_TEST_INPUT_MAP_INVALID:'+tenant+':'+label)
  expected_hash=sha(json.dumps(expected,sort_keys=True).encode());check(expected_hash==carry['oldInputMapSha256']==carry['currentInputMapSha256'],'CLIENT_INPUT_MAP_HASH_INVALID:'+tenant+':'+label)
  for group,v in carry['treeObjects'].items():check(v['old']==gs('rev-parse',old+':'+group) and v['current']==gs('rev-parse',candidate+':'+group) and v['old']==v['current'],'CLIENT_TREE_OBJECT_INVALID:'+tenant+':'+label+':'+group)
  for file,h in carry['conservativeImportedBackendHelpers'].items():check(h['oldSha256']==blobsha(old,file) and h['currentSha256']==blobsha(candidate,file) and h['oldSha256']==h['currentSha256'],'CLIENT_BACKEND_HELPER_INVALID:'+tenant+':'+label+':'+file)
  for file,h in carry['packageInputs'].items():check(h['oldSha256']==blobsha(old,file) and h['currentSha256']==blobsha(candidate,file) and h['oldSha256']==h['currentSha256'],'CLIENT_PACKAGE_INPUT_INVALID:'+tenant+':'+label+':'+file)
  check(carry['logSha256Matches'],'CLIENT_CARRY_LOG_FLAG_FALSE:'+tenant+':'+label)
  row['carryReceipts'].append({'label':label,'actualReceiptCommit':old,'qualifiedRuntimeCommit':candidate,'receiptSha256':carry['receiptSha256'],'sourceInputCount':len(expected),'sourceInputMapSha256':expected_hash,'status':'SOURCE_PACKAGE_HELPER_RECEIPT_BINDING_VERIFIED','freshExecutionAtFinalCandidate':False})
 row['compiledArtifacts']=artifactproof(b,tenant)
 logo='frontend/public/tenants/'+{'Melamedia':'melamedia','MelamedLaw':'melamedlaw','MorLevi':'morlevy','AshrafEssa':'ashrafessa'}[tenant]+'/firm-logo.png';logo_hash=blobsha(candidate,logo);check(b['artifactHashes']['firm-logo.png']==logo_hash,'CLIENT_COMPILED_LOGO_SOURCE_MISMATCH:'+tenant);row['compiledOwnLogoSourceSha256']=logo_hash
 clients.append(row)
endhead=gs('rev-parse','HEAD');check(endhead==starthead==FINAL,'ROOT_HEAD_CHANGED_DURING_INSPECTION')
changed_inputs=[]
for rel,expected in read_hashes.items():
 p=ROOT/rel if not rel.startswith('/') else Path(rel)
 if not p.is_file() or sha(p.read_bytes())!=expected:changed_inputs.append(rel)
check(not changed_inputs,'EVIDENCE_CHANGED_DURING_INSPECTION:'+','.join(changed_inputs))
result={'startedAtUtc':started,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS_PERSISTED_FRONTEND_EVIDENCE_AND_ARTIFACTS' if not issues and not lost else ('PASS_REPORTS_WITH_LOST_TEMPORARY_CACHES' if not issues else 'ISSUES_REPORTED_NO_TEST_OR_BUILD_RERUN'),'rootHeadAtStart':starthead,'rootHeadAtFinish':endhead,'frozenCommonRuntime':FINAL,'frozenUpstreamMain':CUTOFF,'main':main_result,'clients':clients,'lostTemporaryCaches':sorted(set(lost)),'issues':issues,'evidenceFileHashes':read_hashes,'concurrentEvidenceChanges':changed_inputs,'scope':'Read-only persistence/source/receipt/artifact verification after reconnection. No application tests, compile, provider, database, network, new refs, HEAD/product/dependency mutation or deployment. Original execution receipts stay pinned to their recorded commits; carry proofs are input equivalence, not fresh execution.'}
(OUT/'persistence-proof.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'mainPassed':fr['summary']['numPassedTests'],'mainBuildArtifacts':len(br['artifactHashes']),'clients':[{'tenant':x['tenant'],'qualifiedRuntimeCommit':x['qualifiedRuntimeCommit'],'frontendPassed':x['frontendSummary']['numPassedTests'],'artifactCount':x['buildArtifactCount'],'artifactStatus':x['compiledArtifacts']['status']} for x in clients],'lostCaches':result['lostTemporaryCaches'],'issues':issues}))
