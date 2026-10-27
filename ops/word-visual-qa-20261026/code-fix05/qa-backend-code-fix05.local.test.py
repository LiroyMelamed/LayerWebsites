#!/usr/bin/env python3
"""Prepared local/mocked code-fix fixtures. No SSH, QA app or live DB execution."""
import ast, contextlib, copy, datetime, hashlib, io, json, os, socket, stat, subprocess, sys, tarfile, tempfile, time, types, unittest
from pathlib import Path
from unittest import mock
HERE=Path(__file__).resolve().parent
CACHE=Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-visual-implementation-20261026/code-fix05-fixtures')
sha=lambda b:hashlib.sha256(b).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p.read_bytes())}
def load():
 p=HERE/'qa-backend-code-fix05.py';m=types.ModuleType('code_fix05_local_fixture');m.__file__=str(p)
 exec(compile(p.read_bytes(),str(p),'exec'),m.__dict__);return m
class Fixtures(unittest.TestCase):
 def setUp(self):
  CACHE.mkdir(parents=True,exist_ok=True);self.tmp=tempfile.TemporaryDirectory(prefix='owned-',dir=CACHE);self.addCleanup(self.tmp.cleanup)
  self.dir=Path(self.tmp.name);self.m=load();self.old=json.loads((HERE/'qa-backend-contract05.json').read_text())
  self.prior=json.loads((HERE/'qa-source-advance-verify-20261027T005435082684Z-873525b9.json').read_text())
  at=datetime.datetime.fromisoformat(self.prior['remote']['verifiedAt'])+datetime.timedelta(seconds=60);fixed=at+datetime.timedelta(seconds=60)
  class Clock(datetime.datetime):
   @classmethod
   def now(cls,tz=None):return fixed
  clock=mock.patch.object(self.m.datetime,'datetime',Clock);clock.start();self.addCleanup(clock.stop)
  self.candidate='b'*40;self.main='c'*40;backend=copy.deepcopy(self.old['source']['candidateBackendHashes']);backend.update(self.m.FIXED_CHANGES)
  self.source={'baseCommit':self.m.BASE,'candidateCommit':self.candidate,'mainAncestor':self.main,'candidateBackendHashes':backend,
   'guardScriptSha256':self.old['source']['guardScriptSha256'],'manifestSha256':self.old['source']['manifestSha256'],'repository':str(self.dir)}
  self.review=self.m.review_value(sha(Path(self.m.__file__).read_bytes()));state=self.prior['remote']['state']
  ob={'at':at.isoformat(),'kind':'READ_ONLY_QA_BASELINE_OBSERVATION','driverSha256':self.m.OBSERVER_SHA,'host':self.m.TARGET['host'],
   'sshAttempted':True,'healthRequested':True,'transportExitCode':2,'observation':{'stateStable':True,'before':state,'after':state,
   'health':self.prior['remote']['health'],'resources':{'meetsConservativeAvailableMemoryGate':True}}}
  self.contract={'schema':1,'target':self.m.TARGET,'source':self.source,'originalContract':bind(HERE/'qa-backend-contract05.json'),
   'previousSourceAdvanceVerification':bind(HERE/'qa-source-advance-verify-20261027T005435082684Z-873525b9.json'),
   'currentObservation':self.put('current-observation.json',ob),'mainThenQaPublication':self.put('publication.json',
    {'result':'PUSHED_MAIN_THEN_QA','mainCommit':self.main,'qaCommit':self.candidate,'qaBranch':'Melamedia','mainPushedAt':at.isoformat(),'qaPushedAt':at.isoformat()})}
  self.contract['seal']={'status':'SEALED','operatorSha256':self.review['operatorSha256'],'sourceAdvanceOperatorSha256':self.m.ADVANCE_SHA,
   'recoveryOperatorSha256':self.m.RECOVERY_SHA,'originalOperatorSha256':self.m.ORIGINAL_SHA,'observerSha256':self.m.OBSERVER_SHA,
   'rootReview':self.put('root-review.json',self.review),'evidenceBindings':[]}
  for kind,value in [('backend_tests',{}),('frontend_tests',{}),('frontend_build',{}),('source_qualification',{}),('independent_review',self.review)]:
   self.contract['seal']['evidenceBindings'].append(dict(kind=kind,**self.put(kind+'.json',value)))
  self.path=self.dir/'contract.json';self.write()
 def put(self,name,value):
  p=self.dir/name;p.write_text(json.dumps(value));return bind(p)
 def write(self):self.path.write_text(json.dumps(self.contract))
 def validated(self):
  with mock.patch.object(self.m,'validate_new_evidence',return_value={}):return self.m.load_contract(self.path)
 def functions(self,ns):
  nodes=[n for n in ast.parse(self.m.REMOTE).body if isinstance(n,ast.FunctionDef)]
  exec(compile(ast.Module(body=nodes,type_ignores=[]),'<mocked-code-fix-functions>','exec'),ns);return ns
 def namespace(self):
  n,raw,oldraw,base,recovery,req=self.validated()
  def require(ok,code):
   if not ok:raise RuntimeError(code)
  ns={'require':require,'N':n,'REQ':req,'copy':copy,'re':__import__('re'),'Path':Path,'os':os,'stat':stat,'json':json,
   'datetime':datetime,'time':time,'canonical':self.m.canonical,'digest':sha,'ROOT':self.dir/'qa','CODE_STAGE':self.dir/'code-stage',
   'CODE_BYTES':raw,'CODE_SHA':sha(raw),'nonqa':lambda state:[p for p in state['pm2']['processes'] if p['name']!='melamedia-api'],
   'private_file':self.m.private_write,'plain_file':lambda p,limit=32*1024*1024:p.read_bytes()}
  return n,raw,base,recovery,req,self.functions(ns)
 def test_default_plan_has_no_process_network_or_writes(self):
  output=io.StringIO()
  with contextlib.ExitStack() as stack:
   stack.enter_context(mock.patch.object(sys,'argv',['qa-backend-code-fix05.py']))
   for name in ['mkdir','write_text','write_bytes','unlink','rename','replace','chmod']:
    stack.enter_context(mock.patch.object(Path,name,side_effect=AssertionError('default-plan write')))
   for name in ['run','Popen','check_output']:stack.enter_context(mock.patch.object(subprocess,name,side_effect=AssertionError('default-plan process')))
   stack.enter_context(mock.patch.object(socket,'socket',side_effect=AssertionError('default-plan network')))
   stack.enter_context(contextlib.redirect_stdout(output));self.assertEqual(self.m.main(),0)
  self.assertEqual(json.loads(output.getvalue())['result'],'LOCAL_CODE_FIX_PLAN_ONLY_NO_NETWORK')
 def test_only_reviewed_two_file_delta_and_actual_prior04_are_accepted(self):
  _,_,_,_,_,req=self.validated();self.assertEqual(set(req['codeFix']['changedBackendFiles']),set(self.m.FIXED_CHANGES))
  original=copy.deepcopy(self.contract)
  for change in ['unrelated','missing','wrongafter','base','samehead','wrongtarget','old03']:
   self.contract=copy.deepcopy(original)
   if change=='unrelated':self.contract['source']['candidateBackendHashes']['backend/app.js']='0'*64
   if change=='missing':self.contract['source']['candidateBackendHashes'].pop('backend/app.js')
   if change=='wrongafter':self.contract['source']['candidateBackendHashes']['backend/services/signingV2/authoring.js']='0'*64
   if change=='base':self.contract['source']['baseCommit']='0'*40
   if change=='samehead':self.contract['source']['candidateCommit']=self.m.BASE
   if change=='wrongtarget':self.contract['target']={**self.m.TARGET,'pm2Id':1}
   if change=='old03':self.contract['previousSourceAdvanceVerification']=bind(HERE/'qa-backend-recovery-verify-20261026T233524194148Z-315b400b.json')
   self.write()
   with self.subTest(change=change),self.assertRaises((ValueError,KeyError)):self.validated()
 def test_fresh_pinned_observation_cannot_change_baseline_state(self):
  original=json.loads(Path(self.contract['currentObservation']['path']).read_text())
  for field in ['pid','head','env','history','driver','future','old']:
   ob=copy.deepcopy(original)
   for key in ['before','after']:
    if field=='pid':ob['observation'][key]['pm2']['own']['pid']+=1
    if field=='head':ob['observation'][key]['source']['head']='0'*40
    if field=='env':ob['observation'][key]['ownEnvSha256']='0'*64
    if field=='history':ob['observation'][key]['unrelatedHistorySha256']='0'*64
   if field=='driver':ob['driverSha256']='0'*64
   if field=='future':ob['at']=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=1)).isoformat()
   if field=='old':ob['at']=self.prior['at']
   self.contract['currentObservation']=self.put('changed-observation.json',ob);self.write()
   with self.subTest(field=field),self.assertRaises(ValueError):self.validated()
 def test_new_build_source_review_and_actual_git_maps_are_required(self):
  files={'frontend/package.json':b'{}','frontend/app.js':b'synthetic','scripts/prepare-public-env.cjs':b'synthetic',
   'frontend/public/templates/תבנית.pdf':b'synthetic frontend PDF'}
  backend={'backend/app.js':b'synthetic backend','backend/templates/חוזה.pdf':b'synthetic backend PDF'};hashes={p:sha(b) for p,b in files.items()}
  source={**self.source,'candidateBackendHashes':{p:sha(b) for p,b in backend.items()}}
  build={'result':'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED','candidateCommit':self.candidate,'headAtFinish':self.candidate,
   'tenant':'melamedia','exitCode':0,'sourceStable':True,'dependencyStable':True,'publicAssetsRestoredAfterBuild':True,'localPublicEnvironmentScratchRestored':True,
   'sourceDrift':[],'scratchRestoreDrift':[],'apiOrigin':'https://api-melamedia.mela-media.co.il/api','node':'v24.19.0','nodeAfter':'v24.19.0',
   'installedManifestSha256':'a'*64,'installedManifestSha256After':'a'*64,'sourceHashesBefore':hashes,'sourceHashesAfter':dict(hashes)}
  q={'result':'PASS_QA_SOURCE_AND_EVIDENCE_BINDING','candidateCommit':self.candidate,'mainCommit':self.main,'candidateBackendHashes':source['candidateBackendHashes'],
   'frontendSourceHashes':hashes,'sourceClean':True,'backendEvidenceValid':True,'frontendEvidenceValid':True,'mainFirst':True}
  evidence={'backend_tests':None,'frontend_tests':None,'frontend_build':build,'source_qualification':q,'independent_review':self.review}
  inventory_calls=[]
  def quoted_git_path(name):
   raw=name.encode('utf-8')
   if raw.isascii():return raw
   # Git core.quotePath's default non-ASCII UTF-8 byte quoting, not a mock
   # that incorrectly returns raw Unicode paths for newline-delimited output.
   return b'"'+b''.join(bytes([byte]) if 32<=byte<127 and byte not in (34,92) else ('\\%03o'%byte).encode() for byte in raw)+b'"'
  def git(repo,*args):
   if args in [('rev-parse','HEAD'),('rev-parse','refs/remotes/origin/Melamedia')]:return (self.candidate+'\n').encode()
   if args==('rev-parse','refs/remotes/origin/main'):return (self.main+'\n').encode()
   if args[0]=='status':return b''
   if args[0]=='ls-tree':
    inventory_calls.append(args);names=backend if args[-1]=='backend' else files
    if '-z' in args:return b'\0'.join(name.encode('utf-8') for name in names)+b'\0'
    return b'\n'.join(quoted_git_path(name) for name in names)+b'\n'
   if args[0]=='show':return {**files,**backend}[args[1].split(':',1)[1]]
   raise AssertionError(args)
  with mock.patch.object(self.m,'localgit',side_effect=git),mock.patch.object(self.m.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)):
   quoted=git(self.dir,'ls-tree','-r','--name-only',self.candidate,'frontend','scripts/prepare-public-env.cjs')
   self.assertIn(b'\\327',quoted);self.assertNotEqual(set(quoted.decode().splitlines()),set(files));inventory_calls.clear()
   self.m.validate_new_evidence(evidence,source,self.review['operatorSha256'])
   self.assertEqual(len(inventory_calls),2);self.assertTrue(all('-z' in args for args in inventory_calls))
   for field,value in [('candidateCommit','0'*40),('exitCode',1),('sourceStable',False),('installedManifestSha256After','0'*64)]:
    changed=copy.deepcopy(evidence);changed['frontend_build'][field]=value
    with self.subTest(field=field),self.assertRaises(ValueError):self.m.validate_new_evidence(changed,source,self.review['operatorSha256'])
   changed=copy.deepcopy(evidence);changed['source_qualification']['backendEvidenceValid']=False
   with self.assertRaises(ValueError):self.m.validate_new_evidence(changed,source,self.review['operatorSha256'])
   changed=copy.deepcopy(evidence);changed['independent_review']['scope']='QA_ONLY_BACKEND_SOURCE_ADVANCE'
   with self.assertRaises(ValueError):self.m.validate_new_evidence(changed,source,self.review['operatorSha256'])
   backend['backend/app.js']=b'drift'
   with self.assertRaisesRegex(ValueError,'CANDIDATE_BACKEND_GIT_OBJECT_MISMATCH'):self.m.validate_new_evidence(evidence,source,self.review['operatorSha256'])
 def test_restart_state_allows_only_exact_single_own_runtime_transition(self):
  n,raw,base,recovery,req,ns=self.namespace();before=copy.deepcopy(req['expectedState']);ns['assert_code_state'](before,self.m.BASE)
  after=copy.deepcopy(before);after['source']['head']=self.candidate;after['source']['backendFiles']=self.source['candidateBackendHashes']
  after['source']['backendTreeSha256']=sha(self.m.canonical(self.source['candidateBackendHashes']))
  self.assertNotEqual(before['source']['backendTreeSha256'],after['source']['backendTreeSha256'])
  # A real observer recomputes the map digest immediately after the Git FF,
  # while the process is still the original PID and has not restarted.
  ns['assert_code_state'](after,self.candidate)
  bad_digest=copy.deepcopy(after);bad_digest['source']['backendTreeSha256']=before['source']['backendTreeSha256']
  with self.assertRaisesRegex(RuntimeError,'CODE_FIX_SOURCE_DRIFT'):ns['assert_code_state'](bad_digest,self.candidate)
  own=after['pm2']['own'];own.update(pid=own['pid']+1,restarts=own['restarts']+1,startTicks=str(int(own['startTicks'])+1),startMs=own['startMs']+1,environSha256='9'*64)
  after['pm2']['processes']=[own if p['name']=='melamedia-api' else p for p in after['pm2']['processes']]
  ns['assert_code_state'](after,self.candidate,True)
  for field in ['restarts','pid','schema','effectiveenv','nonqa','control']:
   changed=copy.deepcopy(after)
   if field=='restarts':changed['pm2']['own']['restarts']+=1
   if field=='pid':changed['pm2']['own']['pid']=before['pm2']['own']['pid']
   if field=='schema':changed['schema']['metadataSha256']='0'*64
   if field=='effectiveenv':changed['appEffectiveUppercaseEnv']['sha256']='0'*64
   if field=='nonqa':changed['pm2']['processes'][0]['pid']+=1
   if field=='control':changed['pm2']['own']['controlsSha256']='0'*64
   with self.subTest(field=field),self.assertRaises(RuntimeError):ns['assert_code_state'](changed,self.candidate,True)
 def test_private_code_archive_readback_and_existing_stage_stop_reapplication(self):
  n,raw,base,recovery,req,ns=self.namespace();root=ns['ROOT'];root.mkdir()
  content={'backend/a.js':b'old source','scripts/check-signing-release.cjs':b'guard','docs/signing-v2/release-baseline.json':b'baseline'}
  for name,data in content.items():(root/name).parent.mkdir(parents=True,exist_ok=True);(root/name).write_bytes(data)
  before=copy.deepcopy(req['expectedState']);before['source']['backendFiles']={'backend/a.js':sha(content['backend/a.js'])};req['expectedState']=before
  archive=io.BytesIO()
  with tarfile.open(fileobj=archive,mode='w:') as tar:
   folder=tarfile.TarInfo('backend/');folder.type=tarfile.DIRTYPE;tar.addfile(folder)
   for name,data in content.items():
    info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
  actions=[]
  def git(*args):
   actions.append(args)
   if args[0]=='archive':return archive.getvalue()
   if args[:2]==('cat-file','-e'):return b''
   raise AssertionError(args)
  ns['git']=git
  class LockPath:
   def resolve(self,**kwargs):return self
  parent=LockPath();realpath=ns['Path'];ns['Path']=lambda p,*args:parent if p=='/root' else realpath(p,*args)
  # The remote operator must demand uid0. Local synthetic files belong to the
  # invoking Mac user; simulate uid0 only for this owned mock QA stage, keeping
  # the real mode/type/link checks and exercising a non-root rejection too.
  real_lstat=Path.lstat;simulated_uid=[0]
  def qa_stage_lstat(path,*args,**kwargs):
   info=real_lstat(path,*args,**kwargs)
   if path==ns['CODE_STAGE'] or ns['CODE_STAGE'] in path.parents:
    fields=list(info);fields[4]=simulated_uid[0];return os.stat_result(fields)
   return info
  with mock.patch.object(Path,'lstat',qa_stage_lstat):
   cp=ns['create_code_checkpoint'](before);self.assertEqual([a['name'] for a in cp['artifacts']],['contract.json','code-baseline.json','backend-source.tar','.mela-retention-pin'])
   self.assertEqual(stat.S_IMODE(ns['CODE_STAGE'].stat().st_mode),0o700)
   for a in cp['artifacts']:self.assertEqual(stat.S_IMODE((ns['CODE_STAGE']/a['name']).stat().st_mode),0o600)
   simulated_uid[0]=501
   with self.assertRaisesRegex(RuntimeError,'PRIVATE_CODE_ARTIFACT_REQUIRED'):ns['code_artifact']('contract.json')
   simulated_uid[0]=0;owned=ns['CODE_STAGE']/'contract.json';owned.chmod(0o644)
   with self.assertRaisesRegex(RuntimeError,'PRIVATE_CODE_ARTIFACT_REQUIRED'):ns['code_artifact']('contract.json')
   owned.chmod(0o600)
   with self.assertRaises(FileExistsError):ns['create_code_checkpoint'](before)
  self.assertEqual(sum(x[0]=='archive' for x in actions),1)
 def test_post_ff_digest_drift_and_late_health_failure_stop_with_honest_journals(self):
  for failure in ['post-ff-digest','health']:
   with self.subTest(failure=failure):
    n,raw,base,recovery,req,ns=self.namespace();actions=[];before=req['expectedState'];candidate=copy.deepcopy(before)
    candidate['source']['head']=self.candidate;candidate['source']['backendFiles']=self.source['candidateBackendHashes']
    candidate['source']['backendTreeSha256']=sha(self.m.canonical(self.source['candidateBackendHashes']))
    if failure=='post-ff-digest':candidate['source']['backendTreeSha256']=before['source']['backendTreeSha256']
    states=iter([before,before,candidate,candidate]);ns['CODE_STAGE']=self.dir/('code-stage-'+failure)
    class LockPath:
     def resolve(self,**kwargs):return self
    lock=LockPath();realpath=ns['Path'];ns['Path']=lambda p,*args:lock if p=='/run/lock' else realpath(p,*args)
    def checkpoint(_):ns['CODE_STAGE'].mkdir(mode=0o700);ns['JOURNAL_STARTED']=True;return {'owned':True}
    def healthfail():raise RuntimeError('QA_CODE_FIX_HEALTH_NOT_READY')
    ns.update({'acquire':lambda *a:(True,False),'prior_advance_facts':lambda:None,'observe':lambda:next(states),'code_guard':lambda *a:None,
     'resource_gate':lambda *a:None,'honest_health':lambda:None,'create_code_checkpoint':checkpoint,'candidate_preflight':lambda:None,
     'check_code_checkpoint':lambda *a:None,'code_artifact':lambda name:{'name':name,'bytes':1,'sha256':'a'*64},
     'bounded':lambda cmd,**k:actions.append(cmd),'shutil':types.SimpleNamespace(which=lambda _: '/usr/bin/pm2'),
     'ready_code_health':healthfail,'SOURCE_ACTION_STARTED':False,'RESTART_ACTION_STARTED':False,'JOURNAL_STARTED':False,'LOCKS':[],
     'signal':types.SimpleNamespace(alarm=lambda _:None),'sys':types.SimpleNamespace(stdout=io.StringIO())})
    def exit_code(code):raise SystemExit(code)
    ns['sys'].exit=exit_code
    tail=ast.parse(self.m.REMOTE).body;node=next(n for n in tail if isinstance(n,ast.Try));tail=tail[tail.index(node):]
    with self.assertRaises(SystemExit) as result:exec(compile(ast.Module(body=tail,type_ignores=[]),'<late-failure-handler>','exec'),ns)
    self.assertEqual(result.exception.code,1);value=json.loads(ns['sys'].stdout.getvalue())
    self.assertEqual(value['result'],'QA_CODE_FIX_FAILED_FORWARD_INSPECTION_REQUIRED');self.assertTrue(value['sourceChangeMayHaveOccurred'])
    self.assertEqual(value['restartMayHaveOccurred'],failure=='health')
    self.assertEqual(value['errorCode'],'QA_CODE_FIX_HEALTH_NOT_READY' if failure=='health' else 'CODE_FIX_SOURCE_DRIFT')
    self.assertNotIn('runtimeRestarted',value);self.assertNotIn('predicates',value)
    self.assertEqual(sum('merge' in cmd for cmd in actions),1)
    self.assertEqual(sum(cmd==['/usr/bin/pm2','restart','5'] for cmd in actions),1 if failure=='health' else 0)
    self.assertEqual((ns['CODE_STAGE']/'restart.intent.json').exists(),failure=='health')
    self.assertTrue((ns['CODE_STAGE']/'failure.result.json').exists());self.assertFalse((ns['CODE_STAGE']/'verify.result.json').exists())
 def test_assembled_syntax_contains_no_sql_migration_restore_or_old_apply_entry(self):
  n,raw,oldraw,base,recovery,req=self.validated();payload=self.m.payload(n,raw,oldraw,base,recovery,req)
  tree=ast.parse(payload);compile(tree,'<assembled-code-fix>','exec');names={n.name for n in tree.body if isinstance(n,ast.FunctionDef)}
  self.assertTrue({'do_apply','apply_schema','do_checkpoint','run_file','candidate_objects','release_main','recovery_main'}.isdisjoint(names))
  values={n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)}
  self.assertTrue({'checkout','reset','pg_dump','pg_restore','--force','--update-env','all'}.isdisjoint(values))
  self.assertTrue({'merge','--ff-only','--no-edit','core.hooksPath=/dev/null','fetch','refs/heads/Melamedia','restart','5'}<=values)
  # Match executable SQL, not metadata labels such as NODE_SELECTED_DOTENV_METADATA.
  schema_sql=[ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)
   and any(isinstance(t,ast.Name) and t.id=='SQL' for t in n.targets)]
  self.assertEqual(len(schema_sql),1)
  peer_calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='peer']
  self.assertEqual(len(peer_calls),1);self.assertTrue(all(n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str) for n in peer_calls))
  sql=schema_sql+[n.args[0].value for n in peer_calls]
  self.assertTrue(all(v.startswith('BEGIN READ ONLY;') and v.rstrip().endswith('COMMIT;') for v in sql))
  self.assertFalse(any(__import__('re').search(r'\b(INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE)\b',v) for v in sql))
  for name in ['interrupted_facts','honest_health']:
   original=next(n for n in ast.parse(recovery.REMOTE).body if isinstance(n,ast.FunctionDef) and n.name==name)
   copied=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name);self.assertEqual(ast.dump(original),ast.dump(copied))
if __name__=='__main__':unittest.main(verbosity=2)
