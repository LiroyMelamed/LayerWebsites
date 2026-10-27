"""Synthetic local fixtures for the distinct backend-code-fix publication gate."""
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
QA = Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-melamedia-qa-20261026')


def load(name, path):
    module = types.ModuleType(name); module.__file__ = str(path)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


class QAStaticCodeFixFixtures(unittest.TestCase):
    def setUp(self):
        historical = load('historical04_fixture_helpers_only', HERE / 'qa_static04_test.py')
        self.factory = historical.QAStaticSourceAdvanceFixtures('test_default_plan_remains_no_network_subprocess_or_writes')
        self.factory.setUp(); self.addCleanup(self.factory.doCleanups)
        self.driver = load('static05_under_test', HERE / 'run-qa-static05.py')
        self.factory.driver = self.driver; self.factory.seed.driver = self.driver
        self.seed = self.factory.seed; self.old = self.factory.old
        self.main = 'e' * 40; self.candidate = 'f' * 40
        self.contents = {f'backend/synthetic-fixture/{i:04}.js': str(i).encode() for i in range(805)}
        for path in self.driver.BACKEND_CODE_FIX_PATHS:
            self.contents[path] = ('Synthetic old source ' + path).encode()
        self.before_files = {path: hashlib.sha256(raw).hexdigest() for path, raw in self.contents.items()}
        self.factory.files = self.before_files
        self.after_contents = dict(self.contents)
        for path, expected in self.driver.BACKEND_CODE_FIX_AFTER_HASHES.items():
            raw = (QA / path).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), expected, 'Reviewed app fixture source drift')
            self.after_contents[path] = raw
        self.after_files = {path: hashlib.sha256(raw).hexdigest() for path, raw in self.after_contents.items()}
        def immutable_git(_repo, *args):
            if args == ('ls-tree', '-r', '-z', '--name-only', self.candidate, 'backend'):
                return ('\0'.join(sorted(self.after_contents)) + '\0').encode()
            if args[:1] == ('show',) and len(args) == 2 and args[1].startswith(self.candidate + ':'):
                return self.after_contents[args[1].split(':', 1)[1]]
            raise AssertionError('Unexpected synthetic Git read: ' + repr(args))
        patch = mock.patch.object(self.driver, 'git', side_effect=immutable_git)
        patch.start(); self.addCleanup(patch.stop)

    def binding(self, name, value):
        return self.old.bind_json(self.seed.root / name, value)

    def bind(self, proof):
        return {'repository': str(self.seed.root), 'mainCommit': self.main,
                'qaBackendExpectedCommit': proof['candidateCommit'],
                'qaBackendVerification': self.binding('synthetic-code-fix-proof.json', proof)}

    def code_fix(self, at=None):
        verified = datetime.datetime.fromisoformat((at or datetime.datetime.now(datetime.timezone.utc).isoformat()).replace('Z', '+00:00'))
        prior = self.factory.advance_proof(self.driver.BACKEND_CODE_FIX_BASE, self.main,
                                           (verified - datetime.timedelta(seconds=120)).isoformat())
        old = prior['remote']['state']
        digest = lambda files: hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        old['source'].update(backendFileCount=807, backendTreeSha256=digest(self.before_files))
        old['pm2']['own'].update(startTicks='72611127', startMs=1800000000000, environSha256='1' * 64,
            controlsSha256='2' * 64, cwdSha256='3' * 64, execSha256='4' * 64, status='online', unstableRestarts=0,
            cwd='/root/Melamedia/backend', execPath='/root/Melamedia/backend/server.js',
            execMode='fork_mode', instances=None, watchEnabled=False, watchExactlyFalse=True)
        mirrored = {key: old['pm2']['own'][key] for key in ('pmId', 'name', 'pid', 'restarts', 'startTicks', 'startMs',
                    'environSha256', 'controlsSha256', 'cwdSha256', 'execSha256', 'status', 'unstableRestarts')}
        old['pm2']['processes'] = [mirrored, {'pmId': 1, 'name': 'synthetic-other-api', 'pid': 777,
                                                'restarts': 2, 'controlsSha256': '5' * 64}]
        old.update(ownEnvSha256='6' * 64, appEffectiveUppercaseEnv={'keys': ['NODE_ENV'], 'sha256': '7' * 64},
                   dependencies={'manifestSha256': '8' * 64}, modes={'dedicated': True},
                   schema={'metadataSha256': '9' * 64}, unrelatedHistorySha256='0' * 64)
        prior_binding = self.binding('synthetic-prior04.json', prior)
        health = {key: {'status': 200, 'bodySha256': '8' * 64} for key in ('local', 'public')}
        observed = {'at': (verified - datetime.timedelta(seconds=60)).isoformat(), 'kind': 'READ_ONLY_QA_BASELINE_OBSERVATION',
            'driverSha256': self.driver.BACKEND_OBSERVER_SHA256, 'host': self.driver.BACKEND_TARGET['host'],
            'sshAttempted': True, 'transportExitCode': 2, 'result': 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH',
            'observation': {'before': copy.deepcopy(old), 'after': copy.deepcopy(old), 'stateStable': True,
                            'health': health, 'resources': {'meetsConservativeAvailableMemoryGate': True}}}
        state = copy.deepcopy(old)
        # Match4b1351's actual post-FF source observation: the derived tree digest
        # changes with the candidate map before any restart can be qualified.
        state['source'].update(head=self.candidate, backendFiles=dict(self.after_files), backendTreeSha256=digest(self.after_files))
        transition = {'oldPid': 1610075, 'oldRestarts': 9, 'oldStartTicks': '72611127', 'newPid': 2610075,
                      'newRestarts': 10, 'newStartTicks': '82611127', 'restartCountDelta': 1}
        for own in (state['pm2']['own'], state['pm2']['processes'][0]):
            own.update(pid=transition['newPid'], restarts=transition['newRestarts'], startTicks=transition['newStartTicks'],
                       startMs=1800000010000, environSha256='9' * 64)
        fix = {'fromCommit': self.driver.BACKEND_CODE_FIX_BASE, 'toCommit': self.candidate, 'mainAncestor': self.main,
            'backendFileCount': 807, 'baselineBackendMapSha256': digest(self.before_files),
            'candidateBackendMapSha256': digest(self.after_files),
            'changedBackendFiles': {path: {'before': self.before_files[path], 'after': self.after_files[path]}
                                    for path in self.driver.BACKEND_CODE_FIX_PATHS},
            'previousSourceAdvanceVerification': prior_binding,
            'currentObservation': self.binding('synthetic-pre05-observation.json', observed),
            'gitFastForwardOnly': True, 'pm2RestartOnlyId': 5}
        contract_sha = '6' * 64
        checkpoint = {'stage': '/root/word-code-fix-qa-20261027-' + contract_sha[:20], 'artifacts': [
            {'name': name, 'bytes': 123, 'sha256': contract_sha if name == 'contract.json' else 'a' * 64}
            for name in ('contract.json', 'code-baseline.json', 'backend-source.tar', '.mela-retention-pin')]}
        intent = {'name': 'restart.intent.json', 'bytes': 123, 'sha256': 'b' * 64}
        proof = {'kind': 'QA_ONLY_BACKEND_CODE_FIX', 'phase': 'verify', 'result': self.driver.BACKEND_CODE_FIX_VERIFY_RESULT,
            'driverSha256': self.driver.BACKEND_CODE_FIX_DRIVER_SHA256, 'candidateCommit': self.candidate,
            'contractSha256': contract_sha, 'target': dict(self.driver.BACKEND_TARGET), 'sshAttempted': True, 'transportExitCode': 0,
            'codeFix': fix, 'runtimeTransition': transition, 'codeCheckpoint': checkpoint, 'restartIntent': intent,
            'interruptedApply': copy.deepcopy(prior['interruptedApply']), 'originalApplyResultCreated': False,
            'sourceChanged': True, 'backendCodeChanged': True, 'runtimeRestarted': True,
            'noMigrationOrEnvironmentOrDependencyChange': True}
        remote = {key: copy.deepcopy(proof[key]) for key in ('kind', 'phase', 'result', 'candidateCommit', 'contractSha256', 'target',
            'codeFix', 'runtimeTransition', 'codeCheckpoint', 'restartIntent', 'interruptedApply', 'originalApplyResultCreated',
            'sourceChanged', 'backendCodeChanged', 'runtimeRestarted', 'noMigrationOrEnvironmentOrDependencyChange')}
        remote.update(verifiedAt=verified.isoformat(), state=state,
                      predicates={key: True for key in self.driver.BACKEND_VERIFY_PREDICATES},
                      health={key: {**value, 'jsonOk': True} for key, value in health.items()},
                      resources={'meetsConservativeAvailableMemoryGate': True})
        proof['remote'] = remote
        return proof

    def mutate_both(self, proof, key, value):
        proof[key] = value; proof['remote'][key] = copy.deepcopy(value)

    def test_default_plan_and_unchanged_packet_transport_lock_functions(self):
        self.old.QAStaticFixtures.test_default_plan_has_no_network_subprocess_or_writes(self.seed)
        old = {node.name: ast.dump(node) for node in ast.parse((HERE / 'run-qa-static04.py').read_text()).body if isinstance(node, ast.FunctionDef)}
        new = {node.name: ast.dump(node) for node in ast.parse((HERE / 'run-qa-static05.py').read_text()).body if isinstance(node, ast.FunctionDef)}
        for name in old:
            if name != 'backend_verification': self.assertEqual(old[name], new[name], name)
        self.assertEqual(hashlib.sha256(self.driver.OPERATOR.read_bytes()).hexdigest(),
                         '2a0d147f10579bdb755f81a989414609ead7332444ebd8e30bb9840f714523d8')

    def test_only_frozen05_is_forward_authority_old_proofs_are_historical_rollback_only(self):
        self.assertRegex(self.driver.BACKEND_CODE_FIX_DRIVER_SHA256, '^[a-f0-9]{64}$')
        proof = self.code_fix()
        for phase in ('checkpoint', 'upload', 'publish', 'verify', 'rollback'):
            self.driver.backend_verification(self.bind(proof), self.candidate, phase)
        historical = [self.factory.advance_proof(self.driver.BACKEND_CODE_FIX_BASE),
                      self.factory.recovery_proof(self.driver.BACKEND_SOURCE_ADVANCE_BASE),
                      self.factory.normal_proof(self.driver.BACKEND_SOURCE_ADVANCE_BASE)]
        for proof in historical:
            contract = self.factory.bind(proof)
            self.driver.backend_verification(contract, proof['candidateCommit'], 'rollback')
            for phase in ('checkpoint', 'upload', 'publish', 'verify'):
                with self.assertRaisesRegex(self.driver.Stop, 'REVIEWED_CODE_FIX_OR_HISTORICAL_ROLLBACK_PROOF_REQUIRED'):
                    self.driver.backend_verification(contract, proof['candidateCommit'], phase)

    def test_exact_two_file_delta_full807_map_and_candidate_git_bytes_are_required(self):
        changes = [lambda p: p.update(driverSha256='0' * 64), lambda p: p.update(kind='QA_ONLY_BACKEND_SOURCE_ADVANCE'),
            lambda p: p['remote'].pop('kind'),
            lambda p: p['codeFix'].update(pm2RestartOnlyId=4), lambda p: p['codeFix'].update(backendFileCount=806),
            lambda p: p['codeFix'].update(mainAncestor='0' * 40), lambda p: p['codeFix'].update(fromCommit='0' * 40),
            lambda p: p['codeFix'].update(candidateBackendMapSha256='0' * 64),
            lambda p: p['codeFix']['changedBackendFiles'].pop('backend/services/signingV2/authoring.js'),
            lambda p: p['remote']['state']['source']['backendFiles'].pop(next(iter(self.after_files))),
            lambda p: p['remote']['state']['source']['backendFiles'].update({'backend/synthetic-fixture/0000.js': '0' * 64})]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                proof = self.code_fix(); change(proof)
                proof['remote']['codeFix'] = copy.deepcopy(proof['codeFix'])
                with self.assertRaises(self.driver.Stop): self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')
        proof = self.code_fix(); self.after_contents['backend/services/signingV2/authoring.js'] = b'Synthetic substituted Git object'
        with self.assertRaisesRegex(self.driver.Stop, 'CODE_FIX_BACKEND_MAP_NOT_EXACT_CANDIDATE_GIT_OBJECT'):
            self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')

    def test_single_restart_transition_and_all_other_state_are_preserved(self):
        changes = [lambda p: p['runtimeTransition'].update(newRestarts=11), lambda p: p['runtimeTransition'].update(restartCountDelta=True),
            lambda p: p['runtimeTransition'].update(newPid=1610075), lambda p: p['runtimeTransition'].update(newStartTicks='72611127'),
            lambda p: p['remote']['state']['pm2']['processes'][1].update(pid=999),
            lambda p: p['remote']['state']['pm2']['own'].update(controlsSha256='0' * 64),
            lambda p: p['remote']['state']['pm2']['processes'][0].update(pid=999),
            lambda p: p['remote']['state']['appEffectiveUppercaseEnv'].update(sha256='0' * 64),
            lambda p: p['remote']['state'].update(ownEnvSha256='0' * 64),
            lambda p: p['remote']['state']['dependencies'].update(manifestSha256='0' * 64),
            lambda p: p['remote']['state']['schema'].update(metadataSha256='0' * 64),
            lambda p: p['remote']['state'].update(unrelatedHistorySha256='1' * 64)]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                proof = self.code_fix(); change(proof); proof['remote']['runtimeTransition'] = copy.deepcopy(proof['runtimeTransition'])
                with self.assertRaises(self.driver.Stop): self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')

    def test_checkpoint_intent_original_failure_and_bound_observation_cannot_be_forged(self):
        for mutation in ('checkpoint_missing', 'checkpoint_contract', 'checkpoint_stage', 'intent_missing', 'intent_name',
                         'prior_hash', 'observer_hash', 'observer_state', 'observer_later', 'interrupted_candidate'):
            with self.subTest(mutation=mutation):
                proof = self.code_fix()
                if mutation == 'checkpoint_missing': proof['codeCheckpoint']['artifacts'].pop()
                if mutation == 'checkpoint_contract': proof['codeCheckpoint']['artifacts'][0]['sha256'] = '0' * 64
                if mutation == 'checkpoint_stage': proof['codeCheckpoint']['stage'] += '-other'
                if mutation == 'intent_missing': proof.pop('restartIntent')
                if mutation == 'intent_name': proof['restartIntent']['name'] = 'other.json'
                if mutation == 'prior_hash': Path(proof['codeFix']['previousSourceAdvanceVerification']['path']).write_bytes(b'{}')
                if mutation == 'observer_hash': Path(proof['codeFix']['currentObservation']['path']).write_bytes(b'{}')
                if mutation in ('observer_state', 'observer_later'):
                    binding = proof['codeFix']['currentObservation']; observed = json.loads(Path(binding['path']).read_bytes())
                    if mutation == 'observer_later': observed['at'] = '2099-01-01T00:00:00Z'
                    else:
                        for key in ('before', 'after'): observed['observation'][key]['source']['head'] = self.candidate
                    proof['codeFix']['currentObservation'] = self.binding('synthetic-changed-observation.json', observed)
                if mutation == 'interrupted_candidate': proof['interruptedApply']['candidateCommit'] = self.candidate
                for key in ('codeFix', 'codeCheckpoint', 'interruptedApply'):
                    proof['remote'][key] = copy.deepcopy(proof[key])
                if 'restartIntent' in proof: proof['remote']['restartIntent'] = copy.deepcopy(proof['restartIntent'])
                with self.assertRaises(self.driver.Stop): self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')

    def test_literal_predicates_runtime_flags_and_no_mixed_old_flags(self):
        for key in self.driver.BACKEND_VERIFY_PREDICATES:
            proof = self.code_fix(); proof['remote']['predicates'][key] = 1
            with self.assertRaisesRegex(self.driver.Stop, 'ALL_QA_BACKEND_VERIFY_PREDICATES_REQUIRED'):
                self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')
        for key in ('sourceChanged', 'backendCodeChanged', 'runtimeRestarted', 'noMigrationOrEnvironmentOrDependencyChange'):
            proof = self.code_fix(); self.mutate_both(proof, key, 1)
            with self.assertRaisesRegex(self.driver.Stop, 'CODE_FIX_RUNTIME_FLAGS_REQUIRED'):
                self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')
        for key, value in (('backendBytesIdentical', False), ('noMigrationOrRestart', False), ('recoveryNoRuntimeMutation', False), ('sourceAdvance', {})):
            proof = self.code_fix(); self.mutate_both(proof, key, value)
            with self.assertRaisesRegex(self.driver.Stop, 'CODE_FIX_MUST_NOT_IMPERSONATE_SOURCE_ONLY_OR_RECOVERY'):
                self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')

    def test_same_aware_utc_and_phase_specific1800second_freshness_limits(self):
        fixed = datetime.datetime(2026, 10, 27, tzinfo=datetime.timezone.utc)
        class Clock(datetime.datetime):
            @classmethod
            def now(cls, tz=None): return fixed
        with mock.patch.object(self.driver.datetime, 'datetime', Clock):
            for seconds in (0, 1800):
                proof = self.code_fix((fixed - datetime.timedelta(seconds=seconds)).isoformat())
                for phase in ('checkpoint', 'publish'): self.driver.backend_verification(self.bind(proof), self.candidate, phase)
            for seconds in (1800.1, -1):
                proof = self.code_fix((fixed - datetime.timedelta(seconds=seconds)).isoformat())
                for phase in ('checkpoint', 'publish'):
                    with self.assertRaisesRegex(self.driver.Stop, 'FRESH_QA_BACKEND_VERIFY_REQUIRED'):
                        self.driver.backend_verification(self.bind(proof), self.candidate, phase)
            proof = self.code_fix((fixed - datetime.timedelta(days=10)).isoformat())
            for phase in ('upload', 'verify', 'rollback'): self.driver.backend_verification(self.bind(proof), self.candidate, phase)
        proof = self.code_fix(); proof['remote']['verifiedAt'] = '2026-10-27T00:00:00'
        with self.assertRaises(self.driver.Stop): self.driver.backend_verification(self.bind(proof), self.candidate, 'publish')


if __name__ == '__main__': unittest.main(verbosity=2)
