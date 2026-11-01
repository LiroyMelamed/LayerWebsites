"""Prepared local fixtures for mobile frontend continuity and scoped protected manifest refresh."""
import ast
import copy
import datetime
import hashlib
import json
import types
from pathlib import Path
import unittest
from unittest import mock
HERE=Path(__file__).resolve().parent
LEGACY=Path('/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/word-visual-implementation-20261026')

def load(name,path):
 m=types.ModuleType(name);m.__file__=str(path);exec(compile(path.read_bytes(),str(path),'exec'),m.__dict__);return m

class QAMobileContinuityFixtures(unittest.TestCase):
 def setUp(self):
  old=load('reviewed_static05_fixture_helpers',LEGACY/'qa_static05_test.py')
  self.factory=old.QAStaticCodeFixFixtures('test_default_plan_and_unchanged_packet_transport_lock_functions')
  self.factory.setUp();self.addCleanup(self.factory.doCleanups)
  self.m=load('static07_under_test',HERE/'run-qa-static07.py')
  self.factory.driver=self.m;self.factory.factory.driver=self.m;self.factory.seed.driver=self.m
  self.backend=self.factory.candidate;self.candidate='2'*40;self.main='1'*40
  self.m.BACKEND_CONTINUITY_COMMIT=self.backend
  self.m.BACKEND_REFRESH_DRIVER_SHA256='3'*64
  self.proof=self.factory.code_fix((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=2)).isoformat())
  self.verification=self.bind('historical-code-fix.json',self.proof)
  self.m.BACKEND_CONTINUITY_VERIFICATION_SHA256=self.verification['sha256']
  self.front_before={p:('Synthetic old frontend '+p).encode() for p in self.m.FRONTEND_CONTINUITY_PATHS if p!=self.m.FRONTEND_ADDED_TEST}
  self.front_after={p:('Synthetic corrected frontend '+p).encode() for p in self.m.FRONTEND_CONTINUITY_PATHS}
  self.delta={p:{'before':self.m.sha(self.front_before[p]) if p in self.front_before else None,'after':self.m.sha(self.front_after[p])} for p in self.front_after}
  state=self.proof['remote']['state']
  self.observed={'kind':self.m.BACKEND_REFRESH_KIND,'result':self.m.BACKEND_REFRESH_RESULT,'driverSha256':self.m.BACKEND_REFRESH_DRIVER_SHA256,
   'host':self.m.BACKEND_TARGET['host'],'target':self.m.BACKEND_TARGET,'sshAttempted':True,'transportExitCode':0,'healthRequested':True,
   'baselineVerification':self.verification,'at':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=10)).isoformat(),
   'observation':{'before':copy.deepcopy(state),'after':copy.deepcopy(state),'stateStable':True,'noRuntimeMutation':True,
    'health':self.proof['remote']['health'],'resources':{'meetsConservativeAvailableMemoryGate':True}}}
  self.contract={'repository':str(self.factory.seed.root),'mainCommit':self.main,'qaCommit':self.candidate,
   'qaBackendExpectedCommit':self.backend,'qaBackendVerification':self.verification,'backendContinuity':{
    'kind':'FRONTEND_ONLY_UNCHANGED_BACKEND','backendCommit':self.backend,'backendFileCount':807,
    'backendMapSha256':self.proof['codeFix']['candidateBackendMapSha256'],'currentObservation':self.bind('fresh-observation.json',self.observed),
    'frontendChanges':self.delta}}
  patch=mock.patch.object(self.m,'git',side_effect=self.git);patch.start();self.addCleanup(patch.stop)
  patch=mock.patch.object(self.m.subprocess,'run',return_value=types.SimpleNamespace(returncode=0));patch.start();self.addCleanup(patch.stop)
 def bind(self,name,value):return self.factory.binding(name,value)
 def git(self,repo,*args):
  if args[:4]==('ls-tree','-r','-z','--name-only') and args[4] in (self.backend,self.candidate) and args[5:] == ('backend',):
   return ('\0'.join(sorted(self.factory.after_contents))+'\0').encode()
  if args[0]=='show':
   commit,path=args[1].split(':',1)
   if path in self.factory.after_contents and commit in (self.backend,self.candidate):return self.factory.after_contents[path]
   if path in self.front_after:return (self.front_before if commit==self.backend else self.front_after)[path]
  if args==('diff','--name-only','-z',self.backend,self.candidate,'--','frontend','scripts/prepare-public-env.cjs'):
   return ('\0'.join(sorted(self.front_after))+'\0').encode()
  if args[:2]==('ls-tree','-z') and args[2] in (self.backend,self.candidate) and args[3]=='--' and args[4] in self.front_after:
   if args[2]==self.backend and args[4]==self.m.FRONTEND_ADDED_TEST:return b''
   return ('100644 blob '+'a'*40+'\t'+args[4]+'\0').encode()
  raise AssertionError('Unexpected local synthetic Git read: '+repr(args))
 def rebind_observation(self,value):
  self.contract['backendContinuity']['currentObservation']=self.bind('changed-refresh.json',value)
 def test_default_plan_and_historical_gate_body_are_preserved(self):
  self.factory.old.QAStaticFixtures.test_default_plan_has_no_network_subprocess_or_writes(self.factory.seed)
  old_tree=ast.parse((LEGACY/'run-qa-static06.py').read_text());new_tree=ast.parse((HERE/'run-qa-static07.py').read_text())
  old={n.name:n for n in old_tree.body if isinstance(n,ast.FunctionDef)};new={n.name:n for n in new_tree.body if isinstance(n,ast.FunctionDef)}
  self.assertEqual(ast.dump(old['_historical_backend_verification']),ast.dump(new['_historical_backend_verification']))
  for name in old:
   if name not in ('backend_verification','packet'):self.assertEqual(ast.dump(old[name]),ast.dump(new[name]),name)
  self.assertIn('backendContinuity',ast.get_source_segment((HERE/'run-qa-static07.py').read_text(),new['packet']))
  self.assertIn('qaProtectedManifest',ast.get_source_segment((HERE/'run-qa-static07.py').read_text(),new['packet']))
  self.assertIn('validate_qa_manifest',ast.get_source_segment((HERE/'run-qa-static07.py').read_text(),new['packet']))
  observe={'schemaVersion':1,'scope':self.m.SCOPE,'tenant':'melamedia','host':self.m.HOST,'publicRoot':self.m.PUBLIC,
   'operatorSha256':self.m.sha(self.m.OPERATOR.read_bytes()),'runnerSha256':self.m.sha(Path(self.m.__file__).read_bytes()),
   'backendChanges':False,'customerPublication':False,'oldChunksDeleted':0,'rootPublicUploads':0,'providerCalls':False,
   'qaBackendExpectedCommit':self.backend,'qaCommit':self.candidate,'observationNonce':'a'*32}
  config,archive=self.m.common(observe,'observe',False);self.assertEqual(config['observationNonce'],'a'*32);self.assertEqual(archive,b'')
 def test_new_frontend_uses_old_actual_backend_proof_and_fresh_full_state(self):
  self.assertNotEqual(self.main,self.proof['codeFix']['mainAncestor'])
  with mock.patch.object(self.m,'_historical_backend_verification',wraps=self.m._historical_backend_verification) as legacy:
   for phase in ('checkpoint','upload','publish','verify','rollback'):
    returned=self.m.backend_verification(self.contract,self.candidate,phase)
    self.assertEqual(returned['candidateCommit'],self.backend)
   calls=[call for call in legacy.call_args_list if call.args[1]==self.backend]
   self.assertEqual(len(calls),5)
   self.assertTrue(all(call.args[0]['mainCommit']==self.proof['codeFix']['mainAncestor'] and call.args[2]=='verify' for call in calls))
 def test_all807_backend_bytes_and_exact_nine_typed_frontend_changes_are_required(self):
  original=self.git
  for failure in ('backend-byte','backend-missing','extra-frontend','symlink','delta-hash','anchor-map','ancestor','addition-exists','existing-missing','addition-hash','existing-null'):
   def changed(repo,*args):
    if failure=='backend-byte' and args[0]=='show' and args[1].startswith(self.candidate+':backend/'):
     return b'Synthetic changed backend byte'
    if failure=='backend-missing' and args[:5]==('ls-tree','-r','-z','--name-only',self.candidate):
     return ('\0'.join(sorted(self.factory.after_contents)[1:])+'\0').encode()
    if failure=='extra-frontend' and args[0]=='diff':return original(repo,*args)+b'frontend/unreviewed.js\0'
    if failure=='symlink' and args[:2]==('ls-tree','-z'):return ('120000 blob '+'a'*40+'\t'+args[4]+'\0').encode()
    if failure=='addition-exists' and args[:4]==('ls-tree','-z',self.backend,'--') and args[4]==self.m.FRONTEND_ADDED_TEST:return ('100644 blob '+'a'*40+'\t'+args[4]+'\0').encode()
    if failure=='existing-missing' and args[:4]==('ls-tree','-z',self.backend,'--') and args[4] in self.front_before:return b''
    return original(repo,*args)
   contract=copy.deepcopy(self.contract)
   if failure=='delta-hash':contract['backendContinuity']['frontendChanges'][next(iter(self.delta))]['after']='0'*64
   if failure=='anchor-map':contract['backendContinuity']['backendMapSha256']='0'*64
   if failure=='addition-hash':contract['backendContinuity']['frontendChanges'][self.m.FRONTEND_ADDED_TEST]['before']='0'*64
   if failure=='existing-null':contract['backendContinuity']['frontendChanges'][next(iter(self.front_before))]['before']=None
   with self.subTest(failure=failure),mock.patch.object(self.m,'git',side_effect=changed),mock.patch.object(self.m.subprocess,'run',return_value=types.SimpleNamespace(returncode=1 if failure=='ancestor' else 0)):
    with self.assertRaises(self.m.Stop):self.m.backend_verification(contract,self.candidate,'publish')
 def test_augmented_refresh_must_preserve_full_state_health_reserve_and_identity(self):
  for failure in ('missing-history','missing-effective-env','pid','restarts','nonqa','schema','deps','driver','kind','health','memory','unstable','mutation','baseline'):
   observed=copy.deepcopy(self.observed)
   for key in ('before','after'):
    state=observed['observation'][key]
    if failure=='missing-history':state.pop('unrelatedHistorySha256')
    if failure=='missing-effective-env':state.pop('appEffectiveUppercaseEnv')
    if failure=='pid':state['pm2']['own']['pid']+=1
    if failure=='restarts':state['pm2']['own']['restarts']+=1
    if failure=='nonqa':state['pm2']['processes'][-1]['pid']+=1
    if failure=='schema':state['schema']['metadataSha256']='0'*64
    if failure=='deps':state['dependencies']['manifestSha256']='0'*64
   if failure=='driver':observed['driverSha256']='0'*64
   if failure=='kind':observed['kind']='READ_ONLY_QA_BASELINE_OBSERVATION'
   if failure=='health':observed['observation']['health']['public']['status']=403
   if failure=='memory':observed['observation']['resources']['meetsConservativeAvailableMemoryGate']=False
   if failure=='unstable':observed['observation']['stateStable']=False
   if failure=='mutation':observed['observation']['noRuntimeMutation']=False
   if failure=='baseline':observed['baselineVerification']['sha256']='0'*64
   self.rebind_observation(observed)
   with self.subTest(failure=failure),self.assertRaises(self.m.Stop):self.m.backend_verification(self.contract,self.candidate,'publish')
 def test_refresh_freshness_is_separate_from_historical_backend_receipt(self):
  for offset in (1801,-30):
   observed=copy.deepcopy(self.observed)
   observed['at']=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=offset)).isoformat();self.rebind_observation(observed)
   with self.subTest(offset=offset),self.assertRaisesRegex(self.m.Stop,'FRESH_AUGMENTED_BACKEND_REFRESH_REQUIRED'):
    self.m.backend_verification(self.contract,self.candidate,'publish')
  observed=copy.deepcopy(self.observed);observed['at']=self.proof['at'] if 'at' in self.proof else '2000-01-01T00:00:00+00:00';self.rebind_observation(observed)
  with self.assertRaisesRegex(self.m.Stop,'BACKEND_REFRESH_UTC_CHRONOLOGY_REQUIRED'):
   self.m.backend_verification(self.contract,self.candidate,'publish')
 def test_legacy_proofs_are_rollback_only_without_frontend_continuity(self):
  legacy=self.factory.bind(self.proof)
  self.m.backend_verification(legacy,self.backend,'rollback')
  for phase in ('checkpoint','upload','publish','verify'):
   with self.subTest(phase=phase),self.assertRaisesRegex(self.m.Stop,'EXPLICIT_FRONTEND_ONLY_BACKEND_CONTINUITY_REQUIRED'):
    self.m.backend_verification(legacy,self.backend,phase)
 def test_current_qa_manifest_preserves103_paths_and_only_two_scoped_hash_refreshes(self):
  contents={f'backend/synthetic-protected/{i:03}.js':('unchanged protected '+str(i)).encode() for i in range(101)}
  old_files={p:self.m.sha(raw) for p,raw in contents.items()}
  old_files.update({p:self.delta[p]['before'] for p in self.m.PROTECTED_REFRESH_PATHS})
  old={'schema':1,'requiredAncestor':'4'*40,'files':old_files}
  manifest=copy.deepcopy(old);manifest['files'].update({p:self.delta[p]['after'] for p in self.m.PROTECTED_REFRESH_PATHS})
  encode=lambda value:json.dumps(value,sort_keys=True).encode()
  guard=b'Synthetic reviewed read-only signing release checker'
  self.m.PROTECTED_BASE_MANIFEST_SHA256=self.m.sha(encode(old));self.m.PROTECTED_GUARD_SHA256=self.m.sha(guard)
  binding={'manifestSha256':self.m.sha(encode(manifest)),'guardScriptSha256':self.m.PROTECTED_GUARD_SHA256,
   'protectedFileCount':103,'changedProtectedFiles':{p:self.delta[p] for p in self.m.PROTECTED_REFRESH_PATHS}}
  original=self.git
  for failure in ('positive','missing','declared-sha','guard','count','removed','ancestor','extra-refresh','wrong-source','forged-change','path-swap','release-ancestor'):
   current=copy.deepcopy(manifest);contract=copy.deepcopy(self.contract);contract['qaProtectedManifest']=copy.deepcopy(binding)
   if failure=='missing':contract.pop('qaProtectedManifest')
   if failure=='count':contract['qaProtectedManifest']['protectedFileCount']=102
   if failure=='removed':current['files'].pop(next(iter(contents)))
   if failure=='ancestor':current['requiredAncestor']='0'*40
   if failure=='extra-refresh':current['files'][next(iter(contents))]='0'*64
   if failure=='path-swap':current['files']['backend/unreviewed.js']=current['files'].pop(next(iter(contents)))
   if failure=='forged-change':contract['qaProtectedManifest']['changedProtectedFiles'][next(iter(self.m.PROTECTED_REFRESH_PATHS))]['before']=None
   if 'qaProtectedManifest' in contract:contract['qaProtectedManifest']['manifestSha256']=self.m.sha(encode(current))
   if failure=='declared-sha':contract['qaProtectedManifest']['manifestSha256']='0'*64
   def git(repo,*args):
    if args[0]=='show':
     commit,path=args[1].split(':',1)
     if path==self.m.PROTECTED_MANIFEST_PATH:return encode(old if commit==self.backend else current)
     if path==self.m.PROTECTED_GUARD_PATH:return guard+b'drift' if failure=='guard' else guard
     if path in contents:return b'Synthetic corrupt protected source' if failure=='wrong-source' else contents[path]
    return original(repo,*args)
   with self.subTest(failure=failure),mock.patch.object(self.m,'git',side_effect=git),mock.patch.object(self.m.subprocess,'run',return_value=types.SimpleNamespace(returncode=1 if failure=='release-ancestor' else 0)):
    if failure=='positive':self.m.validate_qa_manifest(contract,Path(contract['repository']),self.candidate)
    else:
     with self.assertRaises(self.m.Stop):self.m.validate_qa_manifest(contract,Path(contract['repository']),self.candidate)
if __name__=='__main__':unittest.main(verbosity=2)
