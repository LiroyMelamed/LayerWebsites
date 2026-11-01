#!/usr/bin/env python3
"""Focused local source-advance fixtures; root coordinates execution/ledgers.

No assembled remote payload, SSH, app, live database or provider is executed.
Only owned outside-cloud cache files and mocks are mutated by these fixtures.
"""
import ast, contextlib, copy, datetime, hashlib, io, json, socket, subprocess, sys, tempfile, types, unittest
from pathlib import Path
from unittest import mock
HERE=Path(__file__).resolve().parent
CACHE=Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-visual-implementation-20261026/source-advance04-fixtures')
sha=lambda b:hashlib.sha256(b).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p.read_bytes())}
def load():
 p=HERE/'qa-source-advance04.py';m=types.ModuleType('source_advance04_local_fixture');m.__file__=str(p)
 exec(compile(p.read_bytes(),str(p),'exec'),m.__dict__);return m
class Fixtures(unittest.TestCase):
 def setUp(self):
  CACHE.mkdir(parents=True,exist_ok=True);self.tmp=tempfile.TemporaryDirectory(prefix='owned-',dir=CACHE);self.addCleanup(self.tmp.cleanup)
  self.dir=Path(self.tmp.name);self.m=load();self.old=json.loads((HERE/'qa-backend-contract05.json').read_text())
  self.recovery=json.loads((HERE/'qa-backend-recovery-verify-20261026T233524194148Z-315b400b.json').read_text())
  at=datetime.datetime.fromisoformat(self.recovery['remote']['verifiedAt'])+datetime.timedelta(seconds=60)
  fixed=at+datetime.timedelta(seconds=60)
  class Clock(datetime.datetime):
   @classmethod
   def now(cls,tz=None):return fixed
  clock=mock.patch.object(self.m.datetime,'datetime',Clock);clock.start();self.addCleanup(clock.stop)
  self.candidate='b'*40;self.main='c'*40
  self.source={'baseCommit':self.m.BASE,'candidateCommit':self.candidate,'mainAncestor':self.main,
   'candidateBackendHashes':copy.deepcopy(self.old['source']['candidateBackendHashes']),
   'guardScriptSha256':self.old['source']['guardScriptSha256'],'manifestSha256':self.old['source']['manifestSha256'],'repository':str(self.dir)}
  self.review={'decision':'APPROVE','scope':self.m.KIND,'operatorSha256':sha(Path(self.m.__file__).read_bytes()),
   'recoveryOperatorSha256':self.m.RECOVERY_SHA,'originalOperatorSha256':self.m.ORIGINAL_SHA,'observerSha256':self.m.OBSERVER_SHA}
  state=self.recovery['remote']['state'];ob={'at':at.isoformat(),'observation':{'stateStable':True,'before':state,'after':state,
   'health':self.recovery['remote']['health'],'resources':{'meetsConservativeAvailableMemoryGate':True}}}
  self.contract={'schema':1,'target':self.m.TARGET,'source':self.source,'originalContract':bind(HERE/'qa-backend-contract05.json'),
   'recoveryVerification':bind(HERE/'qa-backend-recovery-verify-20261026T233524194148Z-315b400b.json'),
   'currentObservation':self.put('current-observation.json',ob),'mainThenQaPublication':self.put('publication.json',
    {'result':'PUSHED_MAIN_THEN_QA','mainCommit':self.main,'qaCommit':self.candidate,'qaBranch':'Melamedia',
     'mainPushedAt':at.isoformat(),'qaPushedAt':at.isoformat()})}
  self.contract['seal']={'status':'SEALED','operatorSha256':self.review['operatorSha256'],'recoveryOperatorSha256':self.m.RECOVERY_SHA,
   'originalOperatorSha256':self.m.ORIGINAL_SHA,'observerSha256':self.m.OBSERVER_SHA,
   'rootReview':self.put('root-review.json',self.review),'evidenceBindings':[]}
  for kind,value in [('backend_tests',{}),('frontend_tests',{}),('frontend_build',{}),('source_qualification',{}),('independent_review',self.review)]:
   self.contract['seal']['evidenceBindings'].append(dict(kind=kind,**self.put(kind+'.json',value)))
  self.path=self.dir/'contract.json';self.write()
 def put(self,name,value):
  p=self.dir/name;p.write_text(json.dumps(value));return bind(p)
 def write(self):self.path.write_text(json.dumps(self.contract))
 def validated(self):
  # New build/Git validation is independently tested below. Other contract,
  # existing02/03 code/receipt, fresh state and provenance checks remain real.
  with mock.patch.object(self.m,'validate_new_evidence',return_value={}):return self.m.load_contract(self.path)
 def test_default_plan_no_writes_subprocess_or_network(self):
  output=io.StringIO()
  with contextlib.ExitStack() as stack:
   stack.enter_context(mock.patch.object(sys,'argv',['qa-source-advance04.py']))
   for name in ['mkdir','write_text','write_bytes','unlink','rename','replace','chmod']:
    stack.enter_context(mock.patch.object(Path,name,side_effect=AssertionError('default-plan write')))
   for name in ['run','Popen','check_output']:
    stack.enter_context(mock.patch.object(subprocess,name,side_effect=AssertionError('default-plan process')))
   stack.enter_context(mock.patch.object(socket,'socket',side_effect=AssertionError('default-plan network')))
   stack.enter_context(contextlib.redirect_stdout(output));self.assertEqual(self.m.main(),0)
  self.assertEqual(json.loads(output.getvalue())['result'],'LOCAL_SOURCE_ADVANCE_PLAN_ONLY_NO_NETWORK')
 def test_new_candidate_all807_bytes_and_old_recovery_failure_are_required(self):
  n,raw,oldraw,base,recovery,req=self.validated()
  self.assertEqual(req['sourceAdvance']['fromCommit'],self.m.BASE);self.assertEqual(req['sourceAdvance']['toCommit'],self.candidate)
  self.assertEqual(req['provenance']['candidateCommit'],self.m.BASE);self.assertEqual(req['provenance']['failureResult'],'FAILED_FORWARD_REPAIR_REQUIRED')
  original=copy.deepcopy(self.contract)
  for change in ['backend','base','guard','candidate']:
   self.contract=copy.deepcopy(original)
   if change=='backend':self.contract['source']['candidateBackendHashes']['backend/app.js']='0'*64
   if change=='base':self.contract['source']['baseCommit']='0'*40
   if change=='guard':self.contract['source']['guardScriptSha256']='0'*64
   if change=='candidate':self.contract['source']['candidateCommit']=self.m.BASE
   self.write()
   with self.subTest(change=change),self.assertRaises(ValueError):self.validated()
 def test_current_observation_must_follow_recovery_and_preserve_state(self):
  original=json.loads(Path(self.contract['currentObservation']['path']).read_text())
  for field in ['pid','restarts','head','environment']:
   ob=copy.deepcopy(original)
   for key in ['before','after']:
    if field=='pid':ob['observation'][key]['pm2']['own']['pid']+=1
    if field=='restarts':ob['observation'][key]['pm2']['own']['restarts']+=1
    if field=='head':ob['observation'][key]['source']['head']='0'*40
    if field=='environment':ob['observation'][key]['ownEnvSha256']='0'*64
   self.contract['currentObservation']=self.put('changed-observation.json',ob);self.write()
   with self.subTest(field=field),self.assertRaises(ValueError):self.validated()
  ob=copy.deepcopy(original);ob['at']=self.recovery['at']
  self.contract['currentObservation']=self.put('earlier-observation.json',ob);self.write()
  with self.assertRaisesRegex(ValueError,'CURRENT_OBSERVATION_MUST_FOLLOW_RECOVERY'):self.validated()
 def evidence_fixture(self):
  files={'frontend/package.json':b'{}','frontend/package-lock.json':b'{}','frontend/app.js':b'synthetic','scripts/prepare-public-env.cjs':b'synthetic'}
  hashes={p:sha(b) for p,b in files.items()}
  b={'result':'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED','candidateCommit':self.candidate,'headAtFinish':self.candidate,
   'tenant':'melamedia','exitCode':0,'sourceStable':True,'dependencyStable':True,'publicAssetsRestoredAfterBuild':True,
   'localPublicEnvironmentScratchRestored':True,'sourceDrift':[],'scratchRestoreDrift':[],
   'apiOrigin':'https://api-melamedia.mela-media.co.il/api','node':'v24.19.0','nodeAfter':'v24.19.0',
   'installedManifestSha256':'a'*64,'installedManifestSha256After':'a'*64,'sourceHashesBefore':hashes,'sourceHashesAfter':dict(hashes)}
  q={'result':'PASS_QA_SOURCE_AND_EVIDENCE_BINDING','candidateCommit':self.candidate,'mainCommit':self.main,
   'candidateBackendHashes':self.source['candidateBackendHashes'],'frontendSourceHashes':hashes,
   'sourceClean':True,'backendEvidenceValid':True,'frontendEvidenceValid':True,'mainFirst':True}
  return files,{'backend_tests':None,'frontend_tests':None,'frontend_build':b,'source_qualification':q,'independent_review':self.review}
 def test_new_build_source_review_and_git_object_hashes_are_exact(self):
  files,e=self.evidence_fixture()
  def git(repo,*args):
   if args==('rev-parse','HEAD') or args==('rev-parse','refs/remotes/origin/Melamedia'):return (self.candidate+'\n').encode()
   if args==('rev-parse','refs/remotes/origin/main'):return (self.main+'\n').encode()
   if args[0]=='status':return b''
   if args[0]=='ls-tree':return ('\n'.join(files)+'\n').encode()
   if args[0]=='show':return files[args[1].split(':',1)[1]]
   raise AssertionError(args)
  with mock.patch.object(self.m,'localgit',side_effect=git),mock.patch.object(self.m.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)):
   self.m.validate_new_evidence(e,self.source,self.review['operatorSha256'])
   for field,value in [('exitCode',1),('candidateCommit','0'*40),('sourceStable',False),('installedManifestSha256After','0'*64)]:
    changed=copy.deepcopy(e);changed['frontend_build'][field]=value
    with self.subTest(field=field),self.assertRaises(ValueError):self.m.validate_new_evidence(changed,self.source,self.review['operatorSha256'])
   changed=copy.deepcopy(e);changed['source_qualification']['backendEvidenceValid']=False
   with self.assertRaises(ValueError):self.m.validate_new_evidence(changed,self.source,self.review['operatorSha256'])
   changed=copy.deepcopy(e);changed['independent_review']['scope']='QA_ONLY_BACKEND_RELEASE'
   with self.assertRaisesRegex(ValueError,'SOURCE_ADVANCE_REVIEW_REQUIRED'):self.m.validate_new_evidence(changed,self.source,self.review['operatorSha256'])
   files['frontend/app.js']=b'drift'
   with self.assertRaisesRegex(ValueError,'NEW_BUILD_GIT_OBJECT_MISMATCH'):self.m.validate_new_evidence(e,self.source,self.review['operatorSha256'])
 def test_remote_state_rejects_pid_env_schema_drift_and_failed_preflight_never_ff(self):
  n,raw,oldraw,base,recovery,req=self.validated();state=copy.deepcopy(req['expectedState']);saved={'baseline':{}}
  def require(ok,code):
   if not ok:raise RuntimeError(code)
  ns={'require':require,'N':n,'REQ':req,'after_schema':lambda *a:None,'invariant_controls':lambda *a:None}
  node=next(x for x in ast.parse(self.m.REMOTE).body if isinstance(x,ast.FunctionDef) and x.name=='assert_source_state')
  exec(compile(ast.Module(body=[node],type_ignores=[]),'<state-guard>','exec'),ns)
  ns['assert_source_state'](state,self.m.BASE,saved);advanced=copy.deepcopy(state);advanced['source']['head']=self.candidate
  ns['assert_source_state'](advanced,self.candidate,saved)
  for field in ['pid','env','schema']:
   changed=copy.deepcopy(advanced)
   if field=='pid':changed['pm2']['own']['pid']+=1
   if field=='env':changed['ownEnvSha256']='0'*64
   if field=='schema':changed['schema']['metadataSha256']='0'*64
   with self.subTest(field=field),self.assertRaises(RuntimeError):ns['assert_source_state'](changed,self.candidate,saved)
  actions=[]
  def fail_preflight():raise RuntimeError('BACKEND807_BYTES_CHANGED')
  class LockPath:
   def resolve(self,**kwargs):return self
  lockpath=LockPath()
  ns.update({'Path':lambda p:lockpath if p=='/run/lock' else Path(p),'acquire':lambda *a:(True,False),'interrupted_facts':lambda:saved,'observe':lambda:state,
   'check_worktree_guard':lambda *a:None,'resource_gate':lambda *a:None,'honest_health':lambda:None,
   'private_file':lambda *a:None,'STAGE':self.dir,'PREFIX':'owned-fixture','ADVANCE_SHA':'a'*64,'canonical':self.m.canonical,
   'candidate_preflight':fail_preflight,'bounded':lambda *a,**k:actions.append(a),'SOURCE_ACTION_STARTED':False,'JOURNAL_STARTED':False})
  node=next(x for x in ast.parse(self.m.REMOTE).body if isinstance(x,ast.FunctionDef) and x.name=='advance_main')
  exec(compile(ast.Module(body=[node],type_ignores=[]),'<advance-order>','exec'),ns)
  with self.assertRaisesRegex(RuntimeError,'BACKEND807_BYTES_CHANGED'):ns['advance_main']()
  self.assertEqual(actions,[]);self.assertFalse(ns['SOURCE_ACTION_STARTED'])
 def test_assembled_syntax_has_only_source_ff_and_preserves_old_helpers(self):
  n,raw,oldraw,base,recovery,req=self.validated();code=self.m.payload(n,raw,oldraw,base,recovery,req)
  tree=ast.parse(code);compile(tree,'<assembled-source-advance>','exec')
  names={x.name for x in tree.body if isinstance(x,ast.FunctionDef)}
  self.assertTrue({'do_apply','apply_schema','do_checkpoint','run_file','recovery_main'}.isdisjoint(names))
  values={x.value for x in ast.walk(tree) if isinstance(x,ast.Constant) and isinstance(x.value,str)}
  self.assertTrue({'restart','checkout','reset','pg_dump','pg_restore','--force'}.isdisjoint(values))
  self.assertTrue({'merge','--ff-only','--no-edit','core.hooksPath=/dev/null','fetch','refs/heads/Melamedia'}<=values)
  for name in ['interrupted_facts','honest_health']:
   original=next(x for x in ast.parse(recovery.REMOTE).body if isinstance(x,ast.FunctionDef) and x.name==name)
   copied=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name==name)
   self.assertEqual(ast.dump(original),ast.dump(copied))
if __name__=='__main__':unittest.main(verbosity=2)
