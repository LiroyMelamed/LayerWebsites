#!/usr/bin/env python3
"""Prepared source-advance adapter fixtures; root coordinates execution/ledgers.

All receipts, public files, archives and Git objects are synthetic in an owned
outside-Documents tempdir. No SSH, HTTP, app, DB, credentials or provider access.
"""
import ast
import copy
import datetime
import hashlib
import json
import types
from pathlib import Path
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
OLD = Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-melamedia-qa-20261026/ops/word-ux-qa-20261026')


def load(name, path):
    module = types.ModuleType(name); module.__file__ = str(path)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


class QAStaticSourceAdvanceFixtures(unittest.TestCase):
    def setUp(self):
        self.old = load('historical_static_helpers_only', OLD / 'qa_static01_test.py')
        self.seed = self.old.QAStaticFixtures('test_default_plan_has_no_network_subprocess_or_writes')
        self.seed.setUp(); self.addCleanup(self.seed.doCleanups)
        self.driver = load('qa_static04_under_test', HERE / 'run-qa-static04.py')
        self.seed.driver = self.driver
        self.files = {f'backend/synthetic-fixture/{i:04}.js': hashlib.sha256(str(i).encode()).hexdigest() for i in range(807)}
        self.main = 'e' * 40

    def normal_proof(self, candidate, at=None):
        at = at or datetime.datetime.now(datetime.timezone.utc).isoformat()
        remote = {'phase':'verify','result':self.driver.BACKEND_VERIFY_RESULT,'contractSha256':'a'*64,
            'candidateCommit':candidate,'target':dict(self.driver.BACKEND_TARGET),'verifiedAt':at,
            'state':{'source':{'head':candidate}},'predicates':{key:True for key in self.driver.BACKEND_VERIFY_PREDICATES}}
        return {'kind':'QA_ONLY_BACKEND_RELEASE','phase':'verify','result':self.driver.BACKEND_VERIFY_RESULT,
            'sshAttempted':True,'transportExitCode':0,'candidateCommit':candidate,'contractSha256':'a'*64,
            'driverSha256':self.driver.BACKEND_DRIVER_SHA256,'target':dict(self.driver.BACKEND_TARGET),'remote':remote}

    def recovery_proof(self, candidate, at=None):
        proof = self.normal_proof(candidate, at)
        failure = {'kind':'QA_ONLY_BACKEND_RELEASE','phase':'apply','result':'FAILED_FORWARD_REPAIR_REQUIRED',
            'sshAttempted':True,'transportExitCode':1,'candidateCommit':candidate,'contractSha256':'b'*64,
            'driverSha256':self.driver.BACKEND_DRIVER_SHA256,'target':dict(self.driver.BACKEND_TARGET),
            'remote':{'phase':'apply','result':'FAILED_FORWARD_REPAIR_REQUIRED','contractSha256':'b'*64,'errorCode':'QA_HEALTH_NOT_READY'}}
        provenance = {'originalOperatorSha256':self.driver.BACKEND_DRIVER_SHA256,'originalContractSha256':'b'*64,
            'candidateCommit':candidate,'failedApplyReceipt':self.old.bind_json(self.seed.root/'synthetic-failed-apply.json',failure),
            'failurePhase':'apply','failureResult':'FAILED_FORWARD_REPAIR_REQUIRED','failureErrorCode':'QA_HEALTH_NOT_READY',
            'applyResultAbsent':True,'checkpointVerified':True,'observedPid':1610075,'observedRestarts':9,
            'checkpointResultSha256':'c'*64,'applyIntentSha256':'d'*64,'applyFailureRecordSha256':'e'*64}
        proof.update({'kind':'QA_ONLY_BACKEND_RELEASE_RECOVERY','result':self.driver.BACKEND_RECOVERY_VERIFY_RESULT,
            'driverSha256':self.driver.BACKEND_RECOVERY_DRIVER_SHA256,'recoveryNoRuntimeMutation':True,'interruptedApply':provenance})
        proof['remote'].update({'result':self.driver.BACKEND_RECOVERY_VERIFY_RESULT,'recoveryNoRuntimeMutation':True,
            'interruptedApply':copy.deepcopy(provenance),'originalApplyResultCreated':False,'privateRecoveryJournalOnly':True})
        proof['remote']['state'] = {'source':{'head':candidate,'branch':'DETACHED','trackedClean':True,'backendFiles':dict(self.files)},
            'pm2':{'own':{'name':'melamedia-api','pmId':5,'pid':1610075,'restarts':9}}}
        return proof

    def advance_proof(self, candidate, main=None, at=None):
        verified = datetime.datetime.fromisoformat((at or datetime.datetime.now(datetime.timezone.utc).isoformat()).replace('Z', '+00:00'))
        previous = self.recovery_proof(self.driver.BACKEND_SOURCE_ADVANCE_BASE,(verified-datetime.timedelta(seconds=60)).isoformat())
        previous_binding = self.old.bind_json(self.seed.root/'synthetic-prior-recovery.json',previous)
        before = copy.deepcopy(previous['remote']['state'])
        observed = {'at':(verified-datetime.timedelta(seconds=30)).isoformat(),'kind':'READ_ONLY_QA_BASELINE_OBSERVATION','driverSha256':self.driver.BACKEND_OBSERVER_SHA256,
            'host':self.driver.BACKEND_TARGET['host'],'sshAttempted':True,'transportExitCode':2,
            'result':'OBSERVED_DRIFT_OR_BASELINE_MISMATCH','observation':{'stateStable':True,'before':before,'after':copy.deepcopy(before),
                'health':{key:{'status':200,'bodySha256':'8'*64} for key in ('local','public')},
                'resources':{'meetsConservativeAvailableMemoryGate':True}}}
        observed_binding = self.old.bind_json(self.seed.root/'synthetic-pre-advance-observation.json',observed)
        provenance = {'fromCommit':self.driver.BACKEND_SOURCE_ADVANCE_BASE,'toCommit':candidate,'mainAncestor':main or self.main,
            'backendMapSha256':hashlib.sha256(json.dumps(self.files,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'backendFileCount':807,'previousRecoveryVerification':previous_binding,'currentObservation':observed_binding,
            'observedPid':1610075,'observedRestarts':9,'gitFastForwardOnly':True}
        proof = self.normal_proof(candidate,verified.isoformat())
        proof.update({'kind':'QA_ONLY_BACKEND_SOURCE_ADVANCE','result':self.driver.BACKEND_SOURCE_ADVANCE_VERIFY_RESULT,
            'driverSha256':self.driver.BACKEND_SOURCE_ADVANCE_DRIVER_SHA256,'backendBytesIdentical':True,'noMigrationOrRestart':True,
            'sourceAdvance':provenance,'interruptedApply':copy.deepcopy(previous['interruptedApply'])})
        state=copy.deepcopy(before);state['source']['head']=candidate
        proof['remote'].update({'result':self.driver.BACKEND_SOURCE_ADVANCE_VERIFY_RESULT,'backendBytesIdentical':True,
            'noMigrationOrRestart':True,'sourceAdvance':copy.deepcopy(provenance),'interruptedApply':copy.deepcopy(previous['interruptedApply']),
            'state':state})
        return proof

    def bind(self, proof, main=None):
        return {'qaBackendExpectedCommit':proof['candidateCommit'],'mainCommit':main or self.main,
            'qaBackendVerification':self.old.bind_json(self.seed.root/'synthetic-backend-proof.json',proof)}

    def rebind_advance(self, proof, key, value):
        proof['sourceAdvance'][key]=value
        proof['remote']['sourceAdvance']=copy.deepcopy(proof['sourceAdvance'])

    def test_default_plan_remains_no_network_subprocess_or_writes(self):
        self.old.QAStaticFixtures.test_default_plan_has_no_network_subprocess_or_writes(self.seed)

    def test_source_advance_is_forward_authority_and_old_proofs_are_rollback_only(self):
        candidate='f'*40
        for phase in ('checkpoint','upload','publish','verify','rollback'):
            self.driver.backend_verification(self.bind(self.advance_proof(candidate)),candidate,phase)
        mixed=self.recovery_proof(self.driver.BACKEND_SOURCE_ADVANCE_BASE);mixed['sourceAdvance']={}
        with self.assertRaisesRegex(self.driver.Stop,'MIXED_RECOVERY_AND_SOURCE_ADVANCE_PROOF_REJECTED'):
            self.driver.backend_verification(self.bind(mixed),mixed['candidateCommit'],'rollback')
        for factory in (self.normal_proof,self.recovery_proof):
            historical=factory(self.driver.BACKEND_SOURCE_ADVANCE_BASE)
            self.driver.backend_verification(self.bind(historical),historical['candidateCommit'],'rollback')
            for phase in ('checkpoint','upload','publish','verify'):
                with self.assertRaisesRegex(self.driver.Stop,'REVIEWED_SOURCE_ADVANCE_OR_HISTORICAL_ROLLBACK_PROOF_REQUIRED'):
                    self.driver.backend_verification(self.bind(historical),historical['candidateCommit'],phase)

    def test_flags_commits_complete_backend_map_and_process_identity_fail_closed(self):
        candidate='f'*40
        changes=[lambda p:p.update(driverSha256='0'*64),lambda p:p.update(kind='QA_ONLY_BACKEND_RELEASE_RECOVERY'),
            lambda p:p.update(backendBytesIdentical=1),lambda p:p['remote'].update(noMigrationOrRestart=False),
            lambda p:p.update(recoveryNoRuntimeMutation=True),lambda p:self.rebind_advance(p,'gitFastForwardOnly',False),
            lambda p:self.rebind_advance(p,'fromCommit','0'*40),lambda p:self.rebind_advance(p,'toCommit','1'*40),
            lambda p:self.rebind_advance(p,'mainAncestor','2'*40),lambda p:self.rebind_advance(p,'backendFileCount',806),
            lambda p:self.rebind_advance(p,'backendMapSha256','0'*64),lambda p:self.rebind_advance(p,'observedPid',123),
            lambda p:self.rebind_advance(p,'observedRestarts',10),lambda p:p['remote']['state']['source'].update(branch='Melamedia'),
            lambda p:p['remote']['state']['source'].update(trackedClean=False),
            lambda p:p['remote']['state']['source']['backendFiles'].update({'backend/synthetic-fixture/0000.js':'0'*64}),
            lambda p:p['remote']['state']['source']['backendFiles'].pop('backend/synthetic-fixture/0000.js'),
            lambda p:p['remote']['state']['pm2']['own'].update(pid=123),
            lambda p:p['sourceAdvance'].pop('currentObservation')]
        for index,change in enumerate(changes):
            with self.subTest(index=index):
                proof=self.advance_proof(candidate);change(proof)
                with self.assertRaises(self.driver.Stop):self.driver.backend_verification(self.bind(proof),candidate,'publish')

    def test_historical_apply_cannot_be_relabelled_as_the_new_candidate(self):
        candidate='f'*40;proof=self.advance_proof(candidate)
        proof['interruptedApply']['candidateCommit']=candidate;proof['remote']['interruptedApply']=copy.deepcopy(proof['interruptedApply'])
        with self.assertRaisesRegex(self.driver.Stop,'HISTORICAL_INTERRUPTED_APPLY_MUST_STAY_AT_BASE'):
            self.driver.backend_verification(self.bind(proof),candidate,'publish')
        proof=self.advance_proof(candidate);pb=proof['sourceAdvance']['previousRecoveryVerification'];previous=json.loads(Path(pb['path']).read_bytes())
        fb=previous['interruptedApply']['failedApplyReceipt'];failure=json.loads(Path(fb['path']).read_bytes());failure['candidateCommit']=candidate
        previous['interruptedApply']['failedApplyReceipt']=self.old.bind_json(Path(fb['path']),failure)
        previous['remote']['interruptedApply']=copy.deepcopy(previous['interruptedApply'])
        self.rebind_advance(proof,'previousRecoveryVerification',self.old.bind_json(Path(pb['path']),previous))
        with self.assertRaisesRegex(self.driver.Stop,'ACTUAL_FAILED_APPLY_RECEIPT_REQUIRED'):
            self.driver.backend_verification(self.bind(proof),candidate,'publish')

    def test_bound_recovery_and_pre_advance_observation_metadata_are_checked(self):
        candidate='f'*40
        for kind in ('recovery_hash','observer_hash','observer_driver','observer_source','observer_health','observer_state','observer_earlier','observer_later'):
            with self.subTest(kind=kind):
                proof=self.advance_proof(candidate)
                if kind=='recovery_hash':Path(proof['sourceAdvance']['previousRecoveryVerification']['path']).write_bytes(b'{}')
                elif kind=='observer_hash':Path(proof['sourceAdvance']['currentObservation']['path']).write_bytes(b'{}')
                else:
                    binding=proof['sourceAdvance']['currentObservation'];observed=json.loads(Path(binding['path']).read_bytes())
                    if kind=='observer_driver':observed['driverSha256']='0'*64
                    if kind=='observer_earlier':observed['at']='2020-01-01T00:00:00+00:00'
                    if kind=='observer_later':observed['at']='2099-01-01T00:00:00+00:00'
                    if kind=='observer_source':
                        for key in ('before','after'):observed['observation'][key]['source']['head']=candidate
                    if kind=='observer_health':observed['observation']['health']['public']['status']=403
                    if kind=='observer_state':
                        for key in ('before','after'):observed['observation'][key]['pm2']['own']['restarts']=10
                    self.rebind_advance(proof,'currentObservation',self.old.bind_json(Path(binding['path']),observed))
                with self.assertRaises(self.driver.Stop):self.driver.backend_verification(self.bind(proof),candidate,'publish')

    def test_all_twelve_literal_predicates_and_same_utc_freshness_limits_remain(self):
        candidate='f'*40
        for key in self.driver.BACKEND_VERIFY_PREDICATES:
            proof=self.advance_proof(candidate);proof['remote']['predicates'][key]=1
            with self.assertRaisesRegex(self.driver.Stop,'ALL_QA_BACKEND_VERIFY_PREDICATES_REQUIRED'):
                self.driver.backend_verification(self.bind(proof),candidate,'publish')
        fixed=datetime.datetime(2026,10,27,tzinfo=datetime.timezone.utc)
        class Clock(datetime.datetime):
            @classmethod
            def now(cls,tz=None):return fixed
        with mock.patch.object(self.driver.datetime,'datetime',Clock):
            for seconds in (0,1800):
                proof=self.bind(self.advance_proof(candidate,at=(fixed-datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint','publish'):self.driver.backend_verification(proof,candidate,phase)
            for seconds in (1800.1,-1):
                proof=self.bind(self.advance_proof(candidate,at=(fixed-datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint','publish'):
                    with self.assertRaisesRegex(self.driver.Stop,'FRESH_QA_BACKEND_VERIFY_REQUIRED'):
                        self.driver.backend_verification(proof,candidate,phase)
            proof=self.bind(self.advance_proof(candidate,at=(fixed-datetime.timedelta(days=10)).isoformat()))
            for phase in ('upload','verify','rollback'):self.driver.backend_verification(proof,candidate,phase)

    def test_full_packet_still_binds_build_source_refs_and_historical_rollback(self):
        repo,c,config,build,observed=self.seed.full_packet()
        c['runnerSha256']=hashlib.sha256((HERE/'run-qa-static04.py').read_bytes()).hexdigest()
        c.update(self.bind(self.advance_proof(c['qaCommit'],c['mainCommit']),c['mainCommit']))
        before,_=self.driver.packet(c,dict(config),'checkpoint')
        self.old.put(repo/'future.txt',b'synthetic later branch advance')
        self.seed.git(repo,'add','future.txt');self.seed.git(repo,'commit','-m','Synthetic later advance')
        future=self.seed.git(repo,'rev-parse','HEAD')
        for ref in ('refs/remotes/origin/main','refs/remotes/origin/Melamedia'):self.seed.git(repo,'update-ref',ref,future)
        with self.assertRaisesRegex(self.driver.Stop,'LOCAL_VERIFIED_REMOTE_TRACKING_BINDING_CHANGED'):
            self.driver.packet(c,dict(config),'publish')
        historical,_=self.driver.packet(c,dict(config),'rollback')
        self.assertEqual(before['releaseBindingSha256'],historical['releaseBindingSha256'])
        build['sourceHashesBefore']['frontend/app.js']='0'*64;build['sourceHashesAfter']['frontend/app.js']='0'*64
        changed=copy.deepcopy(c);changed['buildReceipt']=self.old.bind_json(self.seed.root/'synthetic-wrong-source-build.json',build)
        with self.assertRaisesRegex(self.driver.Stop,'COMPILED_SOURCE_NOT_EXACT_QA_GIT_OBJECT'):
            self.driver.packet(changed,dict(config),'rollback')

    def test_other_packet_transport_and_lock_guard_functions_are_unchanged(self):
        old_tree=ast.parse((HERE/'run-qa-static03.py').read_text());new_tree=ast.parse((HERE/'run-qa-static04.py').read_text())
        old={n.name:ast.dump(n) for n in old_tree.body if isinstance(n,ast.FunctionDef)}
        new={n.name:ast.dump(n) for n in new_tree.body if isinstance(n,ast.FunctionDef)}
        for name in old:
            if name!='backend_verification':self.assertEqual(old[name],new[name],name)
        self.assertEqual(hashlib.sha256(self.driver.OPERATOR.read_bytes()).hexdigest(),
                         '2a0d147f10579bdb755f81a989414609ead7332444ebd8e30bb9840f714523d8')


if __name__=='__main__':unittest.main(verbosity=2)
