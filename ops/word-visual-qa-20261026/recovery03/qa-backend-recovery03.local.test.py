#!/usr/bin/env python3
"""Six focused local fixtures. Never executes assembled payload/SSH/app/SQL.

Root coordinates this run and both ledgers. All generated files live in an owned
outside-Documents cache; fixed original metadata receipts are read only.
"""
import ast, contextlib, copy, datetime, hashlib, io, json, socket, subprocess, sys, tempfile, types, unittest
from pathlib import Path
from unittest import mock
HERE=Path(__file__).resolve().parent
CACHE=Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-visual-implementation-20261026/recovery03-fixtures')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def binding(path):return {'path':str(path),'sha256':sha(path.read_bytes())}
def load():
    p=HERE/'qa-backend-recovery03.py';m=types.ModuleType('recovery03_local_fixture');m.__file__=str(p)
    exec(compile(p.read_bytes(),str(p),'exec'),m.__dict__);return m

class RecoveryFixtures(unittest.TestCase):
    def setUp(self):
        CACHE.mkdir(parents=True,exist_ok=True);self.tmp=tempfile.TemporaryDirectory(prefix='owned-',dir=CACHE)
        self.addCleanup(self.tmp.cleanup);self.dir=Path(self.tmp.name);self.m=load()
        self.ob=json.loads((HERE/'qa-backend-observe-20261026T232132805723Z-51664fbb.json').read_text())
        fixed=datetime.datetime.fromisoformat(self.ob['at'])+datetime.timedelta(seconds=60)
        class Clock(datetime.datetime):
            @classmethod
            def now(cls,tz=None):return fixed
        clock=mock.patch.object(self.m.datetime,'datetime',Clock);clock.start();self.addCleanup(clock.stop)
        self.contract={'schema':1,'target':self.m.TARGET,'candidateCommit':self.m.CANDIDATE,
            'originalContract':binding(HERE/'qa-backend-contract05.json'),
            'checkpointReceipt':binding(HERE/'qa-backend-release-checkpoint-20261026T231602429735Z-0c547e0e.json'),
            'failedApplyReceipt':binding(HERE/'qa-backend-release-apply-20261026T231707652575Z-0f56b2f2.json'),
            'postFailureObservation':binding(HERE/'qa-backend-observe-20261026T232132805723Z-51664fbb.json')}
        review={'decision':'APPROVE','scope':self.m.KIND,'operatorSha256':sha(Path(self.m.__file__).read_bytes()),
            'originalOperatorSha256':self.m.ORIGINAL_SHA,'observerSha256':self.m.OBSERVER_SHA}
        self.contract['seal']={'status':'SEALED','operatorSha256':review['operatorSha256'],
            'originalOperatorSha256':self.m.ORIGINAL_SHA,'observerSha256':self.m.OBSERVER_SHA,
            'reviews':{k:self.put(k+'-fixture-review.json',review) for k in ['root','independent']}}
        self.path=self.dir/'contract.json';self.write_contract()
    def put(self,name,value):
        p=self.dir/name;p.write_text(json.dumps(value));return binding(p)
    def write_contract(self):self.path.write_text(json.dumps(self.contract))
    def validated(self):return self.m.load_contract(self.path)

    def test_default_plan_has_no_network_subprocess_or_writes(self):
        output=io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(sys,'argv',['qa-backend-recovery03.py']))
            for name in ['mkdir','write_text','write_bytes','unlink','rename','replace','chmod']:
                stack.enter_context(mock.patch.object(Path,name,side_effect=AssertionError('default plan write')))
            for name in ['run','Popen','check_output']:
                stack.enter_context(mock.patch.object(subprocess,name,side_effect=AssertionError('default plan process')))
            stack.enter_context(mock.patch.object(socket,'socket',side_effect=AssertionError('default plan network')))
            stack.enter_context(contextlib.redirect_stdout(output));self.assertEqual(self.m.main(),0)
        self.assertEqual(json.loads(output.getvalue())['result'],'LOCAL_RECOVERY_PLAN_ONLY_NO_NETWORK')

    def test_exact_metadata_contract_reviews_and_failure_provenance_are_bound(self):
        r,raw,oldraw,base,req=self.validated()
        self.assertEqual(req['provenance']['failureResult'],'FAILED_FORWARD_REPAIR_REQUIRED')
        self.assertEqual(req['provenance']['failureErrorCode'],'QA_HEALTH_NOT_READY')
        self.assertEqual(req['provenance']['observedPid'],1610075)
        self.assertEqual(req['expectedState']['pm2']['own']['instances'],None)
        original=copy.deepcopy(self.contract)
        for key,value in [('candidateCommit','0'*40),('target',dict(self.m.TARGET,pm2Id=1))]:
            self.contract=copy.deepcopy(original);self.contract[key]=value;self.write_contract()
            with self.assertRaises(ValueError):self.validated()
        self.contract=copy.deepcopy(original);self.contract['seal']['reviews'].pop('independent');self.write_contract()
        with self.assertRaisesRegex(ValueError,'TWO_RECOVERY_REVIEWS_REQUIRED'):self.validated()
        self.contract=copy.deepcopy(original);self.contract['seal']['operatorSha256']='0'*64;self.write_contract()
        with self.assertRaisesRegex(ValueError,'SEALED_RECOVERY_CODE_REQUIRED'):self.validated()

    def test_observed_source_process_stability_and_freshness_fail_closed(self):
        original=copy.deepcopy(self.ob)
        for field,value in [('pid',1610076),('restarts',10),('instances',2),('watchExactlyFalse',False)]:
            ob=copy.deepcopy(original)
            for key in ['before','after']:ob['observation'][key]['pm2']['own'][field]=value
            self.contract['postFailureObservation']=self.put('changed-observation.json',ob);self.write_contract()
            with self.subTest(field=field),self.assertRaises(ValueError):self.validated()
        ob=copy.deepcopy(original);ob['at']='2026-01-01T00:00:00+00:00'
        self.contract['postFailureObservation']=self.put('old-observation.json',ob);self.write_contract()
        with self.assertRaisesRegex(ValueError,'FRESH_POST_FAILURE_OBSERVATION_REQUIRED'):self.validated()

    def test_original_receipt_hash_prevents_fictional_apply_success(self):
        old=json.loads(Path(self.contract['failedApplyReceipt']['path']).read_text())
        old['result']='QA_BACKEND_APPLIED_VERIFIED_DEDICATED_ONLY'
        self.contract['failedApplyReceipt']=self.put('fictional-apply.json',old);self.write_contract()
        with self.assertRaisesRegex(ValueError,'EXACT_ORIGINAL_RECEIPTS_REQUIRED'):self.validated()

    def test_interrupted_stage_records_must_match_and_apply_result_stays_absent(self):
        _,_,oldraw,_,req=self.validated();old=json.loads(oldraw)
        saved=json.loads(Path(self.contract['checkpointReceipt']['path']).read_text())['remote']
        def require(ok,code):
            if not ok:raise RuntimeError(code)
        namespace={'require':require,'os':__import__('os'),'re':__import__('re'),'STAGE':self.dir,'REQ':req,'C':old,
            'checkpoint':lambda:saved,'read_json':lambda p:json.loads(p.read_text()),'digest':sha,'canonical':self.m.canonical}
        tree=ast.parse(self.m.REMOTE);function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='interrupted_facts')
        exec(compile(ast.Module(body=[function],type_ignores=[]),'<fixture-interrupted-facts>','exec'),namespace)
        self.put('apply.intent.json',req['expectedIntent']);self.put('apply.failure-'+'a'*12+'.json',req['expectedFailure'])
        self.assertEqual(namespace['interrupted_facts'](),saved)
        self.put('apply.result.json',{'result':'fictional'})
        with self.assertRaisesRegex(RuntimeError,'ORIGINAL_APPLY_RESULT_MUST_REMAIN_ABSENT'):namespace['interrupted_facts']()
        (self.dir/'apply.result.json').unlink();self.put('apply.intent.json',{'state':'changed'})
        with self.assertRaisesRegex(RuntimeError,'ORIGINAL_APPLY_INTENT_DRIFT'):namespace['interrupted_facts']()

    def test_assembled_remote_syntax_reuses_only_pinned_readonly_helpers_and_explicit_health_ua(self):
        _,raw,oldraw,base,req=self.validated();source=self.m.payload(base,oldraw,req,sha(raw),'a'*32)
        tree=ast.parse(source);compile(tree,'<assembled-recovery-payload>','exec')
        names={n.name for n in tree.body if isinstance(n,ast.FunctionDef)}
        self.assertTrue(set(self.m.HELPERS)<=names)
        self.assertTrue({'do_apply','apply_schema','candidate_objects','do_checkpoint','run_file'}.isdisjoint(names))
        constants={n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)}
        self.assertTrue({'restart','merge','fetch','pg_dump','pg_restore'}.isdisjoint(constants))
        self.assertIn('Mela-QA-readonly-observe/1',constants)
        self.assertIn('QA_BACKEND_RECOVERY_VERIFY_DEDICATED_ONLY',constants)
        for name in self.m.HELPERS:
            original=next(n for n in ast.parse(base.REMOTE_RELEASE).body if isinstance(n,ast.FunctionDef) and n.name==name)
            copied=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertEqual(ast.dump(original),ast.dump(copied))

if __name__=='__main__':unittest.main(verbosity=2)
