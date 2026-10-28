#!/usr/bin/env python3
"""New backend-proof gate fixtures only. No SSH, HTTP or actual QA access.

Prepare only until root coordinates a ledger-bound run. Existing01 fixtures are
loaded as helper functions; their full13case suite is not collected or rerun.
"""
import copy
import datetime
import hashlib
import json
from pathlib import Path
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent


def load(name, path):
    import types
    module = types.ModuleType(name)
    module.__file__ = str(path)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


class QAStaticBackendGateFixtures(unittest.TestCase):
    def setUp(self):
        self.old = load('old_static_fixture_helpers', HERE / 'qa_static01_test.py')
        self.seed = self.old.QAStaticFixtures('test_default_plan_has_no_network_subprocess_or_writes')
        self.seed.setUp()
        self.addCleanup(self.seed.doCleanups)
        self.driver = load('new_static02_driver', HERE / 'run-qa-static02.py')
        self.seed.driver = self.driver
        self.original_full_packet = self.seed.full_packet
        self.seed.full_packet = self.full_packet

    def proof(self, candidate, at=None):
        at = at or datetime.datetime.now(datetime.timezone.utc).isoformat()
        remote = {'phase': 'verify', 'result': self.driver.BACKEND_VERIFY_RESULT,
                  'contractSha256': 'a' * 64, 'candidateCommit': candidate,
                  'target': dict(self.driver.BACKEND_TARGET), 'verifiedAt': at,
                  'state': {'source': {'head': candidate}},
                  'predicates': {key: True for key in self.driver.BACKEND_VERIFY_PREDICATES}}
        return {'kind': 'QA_ONLY_BACKEND_RELEASE', 'phase': 'verify', 'result': self.driver.BACKEND_VERIFY_RESULT,
                'sshAttempted': True, 'transportExitCode': 0, 'candidateCommit': candidate,
                'contractSha256': 'a' * 64, 'driverSha256': self.driver.BACKEND_DRIVER_SHA256,
                'target': dict(self.driver.BACKEND_TARGET), 'at': at, 'remote': remote}

    def bind_proof(self, contract, proof):
        contract['qaBackendVerification'] = self.old.bind_json(self.seed.root / 'backend-verify.json', proof)

    def full_packet(self):
        values = self.original_full_packet()
        _, contract, _, _, _ = values
        contract['runnerSha256'] = hashlib.sha256((HERE / 'run-qa-static02.py').read_bytes()).hexdigest()
        contract['qaBackendExpectedCommit'] = contract['qaCommit']
        self.bind_proof(contract, self.proof(contract['qaCommit']))
        return values

    def test_default_plan_still_has_no_network_subprocess_or_filesystem_writes(self):
        self.old.QAStaticFixtures.test_default_plan_has_no_network_subprocess_or_writes(self.seed)

    def test_historical_observe_needs_no_new_backend_proof_and_keeps_review_binding(self):
        contract = self.seed.common_contract()
        contract['runnerSha256'] = hashlib.sha256((HERE / 'run-qa-static02.py').read_bytes()).hexdigest()
        review = {'decision': 'APPROVE', 'scope': self.driver.SCOPE,
                  'operatorSha256': contract['operatorSha256'], 'runnerSha256': contract['runnerSha256']}
        contract['reviews'] = {owner: self.old.bind_json(self.seed.root / (owner + '-new-review.json'), review)
                               for owner in ('root', 'independent')}
        contract.pop('qaBackendVerification', None)
        config, raw = self.driver.common(contract, 'observe', True)
        self.assertEqual(config['rootOrHost'], '/var/www/melamedia')
        self.assertEqual(raw, b'')
        changed = copy.deepcopy(contract)
        changed['host'] = 'root@invalid.example'
        with self.assertRaisesRegex(self.driver.Stop, 'FIXED_QA_TARGET_REQUIRED'):
            self.driver.common(changed, 'observe', True)
        changed = copy.deepcopy(contract)
        changed['runnerSha256'] = '0' * 64
        with self.assertRaisesRegex(self.driver.Stop, 'PREP_SOURCE_CHANGED'):
            self.driver.common(changed, 'observe', True)

    def test_exact_backend_receipt_required_and_hash_candidate_target_driver_are_bound(self):
        candidate = 'b' * 40
        contract = {'qaBackendExpectedCommit': candidate}
        good = self.proof(candidate)
        self.bind_proof(contract, good)
        for phase in ('checkpoint', 'upload', 'publish', 'verify', 'rollback'):
            self.driver.backend_verification(contract, candidate, phase)
        changed = dict(contract, qaBackendExpectedCommit=self.driver.QA_BASE)
        with self.assertRaisesRegex(self.driver.Stop, 'QA_BACKEND_MUST_MATCH_FRONTEND_CANDIDATE'):
            self.driver.backend_verification(changed, candidate, 'publish')
        mutations = [
            lambda p: p.update(result='PASS_QA_BACKEND_VERIFY'),
            lambda p: p.update(phase='apply'),
            lambda p: p.update(sshAttempted=False),
            lambda p: p.update(transportExitCode=True),
            lambda p: p.update(candidateCommit='c' * 40),
            lambda p: p.update(driverSha256='0' * 64),
            lambda p: p['target'].update(root='/root/Other'),
            lambda p: p['remote'].update(contractSha256='0' * 64),
            lambda p: p['remote'].update(candidateCommit='c' * 40),
            lambda p: p['remote']['state']['source'].update(head='c' * 40),
            lambda p: p['remote']['target'].update(pm2Id=1),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                proof = copy.deepcopy(good)
                mutate(proof)
                self.bind_proof(contract, proof)
                with self.assertRaises(self.driver.Stop):
                    self.driver.backend_verification(contract, candidate, 'rollback')
        self.bind_proof(contract, good)
        Path(contract['qaBackendVerification']['path']).write_bytes(b'{}')
        with self.assertRaisesRegex(self.driver.Stop, 'BOUND_FILE_HASH_DRIFT'):
            self.driver.backend_verification(contract, candidate, 'rollback')

    def test_all_twelve_backend_predicates_must_be_literal_true(self):
        candidate = 'b' * 40
        contract = {'qaBackendExpectedCommit': candidate}
        for key in self.driver.BACKEND_VERIFY_PREDICATES:
            for value in (False, 1, None):
                with self.subTest(predicate=key, value=value):
                    proof = self.proof(candidate)
                    if value is None:
                        proof['remote']['predicates'].pop(key)
                    else:
                        proof['remote']['predicates'][key] = value
                    self.bind_proof(contract, proof)
                    with self.assertRaisesRegex(self.driver.Stop, 'ALL_QA_BACKEND_VERIFY_PREDICATES_REQUIRED'):
                        self.driver.backend_verification(contract, candidate, 'publish')

    def test_only_checkpoint_publish_require_fresh_proof_and_timestamp_is_aware_utc(self):
        candidate = 'b' * 40
        contract = {'qaBackendExpectedCommit': candidate}
        fixed = datetime.datetime(2026, 10, 27, 0, 0, tzinfo=datetime.timezone.utc)
        class Clock(datetime.datetime):
            @classmethod
            def now(cls, tz=None): return fixed
        with mock.patch.object(self.driver.datetime, 'datetime', Clock):
            for seconds in (0, 1800):
                self.bind_proof(contract, self.proof(candidate, (fixed - datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint', 'publish'):
                    self.driver.backend_verification(contract, candidate, phase)
            for seconds in (1800.001, -1):
                self.bind_proof(contract, self.proof(candidate, (fixed - datetime.timedelta(seconds=seconds)).isoformat()))
                for phase in ('checkpoint', 'publish'):
                    with self.assertRaisesRegex(self.driver.Stop, 'FRESH_QA_BACKEND_VERIFY_REQUIRED'):
                        self.driver.backend_verification(contract, candidate, phase)
            self.bind_proof(contract, self.proof(candidate, (fixed - datetime.timedelta(days=10)).isoformat()))
            for phase in ('upload', 'verify', 'rollback'):
                self.driver.backend_verification(contract, candidate, phase)
        for invalid in ('2026-10-27T00:00:00', '2026-10-27T00:00:00+02:00', 'invalid', None):
            proof = self.proof(candidate)
            proof['remote']['verifiedAt'] = invalid
            self.bind_proof(contract, proof)
            with self.assertRaisesRegex(self.driver.Stop, 'QA_BACKEND_VERIFY_UTC_TIMESTAMP_REQUIRED'):
                self.driver.backend_verification(contract, candidate, 'rollback')

    def test_full_packet_keeps_historical_rollback_guards_and_seals_backend_proof_identity(self):
        repo, contract, config, build, observed = self.full_packet()
        before, _ = self.driver.packet(contract, dict(config), 'checkpoint')
        # Same candidate, different valid verify receipt is a different release
        # binding; it cannot attach to a prior private frontend checkpoint.
        changed = copy.deepcopy(contract)
        proof = self.proof(contract['qaCommit'])
        proof['contractSha256'] = 'd' * 64
        proof['remote']['contractSha256'] = 'd' * 64
        changed['qaBackendVerification'] = self.old.bind_json(self.seed.root / 'second-backend-verify.json', proof)
        after, _ = self.driver.packet(changed, dict(config), 'checkpoint')
        self.assertNotEqual(before['releaseBindingSha256'], after['releaseBindingSha256'])
        self.old.put(repo / 'future.txt', b'synthetic later legitimate branch advance')
        self.seed.git(repo, 'add', 'future.txt')
        self.seed.git(repo, 'commit', '-m', 'Synthetic later branch advance')
        future = self.seed.git(repo, 'rev-parse', 'HEAD')
        self.seed.git(repo, 'update-ref', 'refs/remotes/origin/main', future)
        self.seed.git(repo, 'update-ref', 'refs/remotes/origin/Melamedia', future)
        for phase in ('checkpoint', 'upload', 'publish', 'verify'):
            with self.assertRaisesRegex(self.driver.Stop, 'LOCAL_VERIFIED_REMOTE_TRACKING_BINDING_CHANGED'):
                self.driver.packet(contract, dict(config), phase)
        historical, _ = self.driver.packet(contract, dict(config), 'rollback')
        self.assertEqual(before['releaseBindingSha256'], historical['releaseBindingSha256'])
        raw = Path(contract['archive']['path']).read_bytes()
        Path(contract['archive']['path']).write_bytes(raw + b'drift')
        with self.assertRaisesRegex(self.driver.Stop, 'BOUND_FILE_HASH_DRIFT'):
            self.driver.packet(contract, dict(config), 'rollback')
        Path(contract['archive']['path']).write_bytes(raw)
        changed = copy.deepcopy(contract)
        observed['observation']['indexBase64'] = self.old.base64.b64encode(b'drift').decode()
        changed['baselineObservation'] = self.old.bind_json(self.seed.root / 'changed-observed.json', observed)
        with self.assertRaisesRegex(self.driver.Stop, 'OBSERVED_ENTRYPOINT_PREIMAGE_CHANGED'):
            self.driver.packet(changed, dict(config), 'rollback')
        build['sourceHashesBefore']['frontend/app.js'] = '0' * 64
        build['sourceHashesAfter']['frontend/app.js'] = '0' * 64
        changed = copy.deepcopy(contract)
        changed['buildReceipt'] = self.old.bind_json(self.seed.root / 'changed-build.json', build)
        with self.assertRaisesRegex(self.driver.Stop, 'COMPILED_SOURCE_NOT_EXACT_QA_GIT_OBJECT'):
            self.driver.packet(changed, dict(config), 'rollback')


if __name__ == '__main__':
    unittest.main(verbosity=2)
