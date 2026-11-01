#!/usr/bin/env python3
"""New recovery-proof adapter fixtures only; prepared without execution.

No real SSH/HTTP/backend access. Existing01 fixtures are helper functions only;
their full historical suite is not collected or rerun.
"""
import copy
import datetime
import hashlib
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


class QAStaticRecoveryGateFixtures(unittest.TestCase):
    def setUp(self):
        self.old = load('historical_static_helpers_only', OLD / 'qa_static01_test.py')
        self.seed = self.old.QAStaticFixtures('test_default_plan_has_no_network_subprocess_or_writes')
        self.seed.setUp(); self.addCleanup(self.seed.doCleanups)
        self.driver = load('qa_static03_under_test', HERE / 'run-qa-static03.py')
        self.seed.driver = self.driver

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
        proof['remote']['state']['pm2']={'own':{'name':'melamedia-api','pmId':5,'pid':1610075,'restarts':9}}
        return proof

    def bind(self, proof):
        candidate = proof['candidateCommit']
        return {'qaBackendExpectedCommit':candidate,
            'qaBackendVerification':self.old.bind_json(self.seed.root/'synthetic-backend-proof.json',proof)}

    def test_default_plan_remains_no_network_subprocess_or_writes(self):
        self.old.QAStaticFixtures.test_default_plan_has_no_network_subprocess_or_writes(self.seed)

    def test_exact_readonly_recovery_is_accepted_and_old02_only_for_historical_rollback(self):
        candidate='f'*40
        for phase in ('checkpoint','upload','publish','verify','rollback'):
            self.driver.backend_verification(self.bind(self.recovery_proof(candidate)),candidate,phase)
        old=self.bind(self.normal_proof(candidate))
        self.driver.backend_verification(old,candidate,'rollback')
        for phase in ('checkpoint','upload','publish','verify'):
            with self.assertRaisesRegex(self.driver.Stop,'REVIEWED_RECOVERY_OR_HISTORICAL_ROLLBACK_PROOF_REQUIRED'):
                self.driver.backend_verification(old,candidate,phase)

    def test_unknown_mixed_missing_or_forged_provenance_is_rejected_even_when_rehashed(self):
        candidate='f'*40
        mutations=[lambda p:p.update(driverSha256='0'*64),lambda p:p.update(kind='QA_ONLY_BACKEND_RELEASE'),
            lambda p:p.pop('interruptedApply'),lambda p:p['remote']['interruptedApply'].update(applyResultAbsent=False),
            lambda p:p.update(recoveryNoRuntimeMutation=1),lambda p:p['remote'].update(recoveryNoRuntimeMutation=False),
            lambda p:p['interruptedApply'].update(originalOperatorSha256='0'*64),
            lambda p:p['interruptedApply'].update(observedPid=123),
            lambda p:p['remote']['state']['source'].update(head='0'*40),
            lambda p:p['remote'].update(originalApplyResultCreated=True),
            lambda p:p['remote'].pop('privateRecoveryJournalOnly')]
        for index,change in enumerate(mutations):
            with self.subTest(index=index):
                proof=self.recovery_proof(candidate);change(proof)
                if index in (6,7):proof['remote']['interruptedApply']=copy.deepcopy(proof['interruptedApply'])
                with self.assertRaises(self.driver.Stop):self.driver.backend_verification(self.bind(proof),candidate,'rollback')
        proof=self.normal_proof(candidate);proof['interruptedApply']={}
        with self.assertRaisesRegex(self.driver.Stop,'MIXED_HISTORICAL_AND_RECOVERY_PROOF_REJECTED'):
            self.driver.backend_verification(self.bind(proof),candidate,'rollback')

    def test_actual_failed_apply_receipt_is_hash_bound_and_metadata_must_match(self):
        candidate='f'*40;proof=self.recovery_proof(candidate)
        binding=proof['interruptedApply']['failedApplyReceipt'];path=Path(binding['path'])
        failure=self.old.json.loads(path.read_bytes());failure['remote']['errorCode']='OTHER_FAILURE'
        new=self.old.bind_json(path,failure)
        proof['interruptedApply']['failedApplyReceipt']=new;proof['remote']['interruptedApply']=copy.deepcopy(proof['interruptedApply'])
        with self.assertRaisesRegex(self.driver.Stop,'ACTUAL_FAILED_APPLY_RECEIPT_REQUIRED'):
            self.driver.backend_verification(self.bind(proof),candidate,'publish')
        proof=self.recovery_proof(candidate);Path(proof['interruptedApply']['failedApplyReceipt']['path']).write_bytes(b'{}')
        with self.assertRaisesRegex(self.driver.Stop,'BOUND_FILE_HASH_DRIFT'):
            self.driver.backend_verification(self.bind(proof),candidate,'rollback')

    def test_same_twelve_predicates_and_utc_freshness_limits_remain_required(self):
        candidate='f'*40
        for key in self.driver.BACKEND_VERIFY_PREDICATES:
            proof=self.recovery_proof(candidate);proof['remote']['predicates'][key]=1
            with self.assertRaisesRegex(self.driver.Stop,'ALL_QA_BACKEND_VERIFY_PREDICATES_REQUIRED'):
                self.driver.backend_verification(self.bind(proof),candidate,'publish')
        fixed=datetime.datetime(2026,10,27,tzinfo=datetime.timezone.utc)
        class Clock(datetime.datetime):
            @classmethod
            def now(cls,tz=None):return fixed
        with mock.patch.object(self.driver.datetime,'datetime',Clock):
            for seconds in (0,1800):
                proof=self.bind(self.recovery_proof(candidate,(fixed-datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint','publish'):self.driver.backend_verification(proof,candidate,phase)
            for seconds in (1800.1,-1):
                proof=self.bind(self.recovery_proof(candidate,(fixed-datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint','publish'):
                    with self.assertRaisesRegex(self.driver.Stop,'FRESH_QA_BACKEND_VERIFY_REQUIRED'):
                        self.driver.backend_verification(proof,candidate,phase)
            proof=self.bind(self.recovery_proof(candidate,(fixed-datetime.timedelta(days=10)).isoformat()))
            for phase in ('upload','verify','rollback'):self.driver.backend_verification(proof,candidate,phase)

    def test_full_packet_still_binds_build_source_origin_refs_and_historical_rollback(self):
        repo,c,config,build,observed=self.seed.full_packet()
        c['runnerSha256']=hashlib.sha256((HERE/'run-qa-static03.py').read_bytes()).hexdigest()
        c.update(self.bind(self.recovery_proof(c['qaCommit'])))
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


if __name__=='__main__':unittest.main(verbosity=2)
