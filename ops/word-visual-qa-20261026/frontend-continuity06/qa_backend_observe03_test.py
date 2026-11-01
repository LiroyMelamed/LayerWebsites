"""Local synthetic-only tests: never execute SSH, PostgreSQL, Node or app code."""
import ast
import contextlib
import copy
import io
import json
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent


def load():
    path = HERE / 'qa-backend-observe03.py'; module = types.ModuleType('observer03_under_test'); module.__file__ = str(path)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


class AugmentedObserverFixtures(unittest.TestCase):
    def setUp(self):
        self.driver = load()
        self.payload = self.driver.build_payload()
        self.expected, self.health_sha = self.driver.baseline()

    def namespace(self):
        namespace = {'__name__': 'read_only_helpers_only'}
        # Exclude main and the signal/transport footer. Merely define the pinned
        # helpers; every I/O-bearing helper is injected before any invocation.
        exec(compile(self.payload.decode().split('def main():', 1)[0], '<synthetic-observer-helpers>', 'exec'), namespace)
        return namespace

    def observation(self):
        return {'result': self.driver.RESULT, 'before': copy.deepcopy(self.expected), 'after': copy.deepcopy(self.expected),
            'observed': True, 'stateStable': True, 'actualCodeFixBaselineMatched': True, 'noRuntimeMutation': True,
            'target': self.driver.TARGET, 'health': {key: {'status': 200, 'jsonOk': True, 'bodySha256': self.health_sha}
                                                   for key in ('local', 'public')},
            'resources': {'meetsConservativeAvailableMemoryGate': True}}

    def test_default_plan_has_no_transport_writes_or_git(self):
        output = io.StringIO()
        with mock.patch('sys.argv', ['observer03']), mock.patch.object(self.driver.subprocess, 'run', side_effect=AssertionError('No subprocess')), \
            mock.patch.object(self.driver.subprocess, 'check_output', side_effect=AssertionError('No Git')), \
            mock.patch.object(self.driver, 'private_write', side_effect=AssertionError('No writes')), contextlib.redirect_stdout(output):
            self.assertEqual(self.driver.main(), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(result['result'], 'PLAN_ONLY_NOT_EXECUTED'); self.assertEqual(result['target'], self.driver.TARGET)
        self.assertEqual(result['baselineVerification'], self.driver.BASELINE_VERIFICATION)

    def test_payload_preserves_original_snapshot_and_exact_selected_read_only_helpers(self):
        old = self.driver.literal(self.driver.pinned_bytes(self.driver.OBSERVER, self.driver.OBSERVER_SHA), 'REMOTE')
        release = self.driver.literal(self.driver.pinned_bytes(self.driver.RELEASE, self.driver.RELEASE_SHA), 'REMOTE_RELEASE')
        functions = lambda text: {node.name: ast.dump(node) for node in ast.parse(text).body if isinstance(node, ast.FunctionDef)}
        current = functions(self.payload)
        for name, definition in functions(old).items():
            if name not in ('main', 'alarm'): self.assertEqual(current[name], definition, name)
        for name in ('effective_env_hash', 'peer', 'history'): self.assertEqual(current[name], functions(release)[name], name)
        for name in ('apply_schema', 'private_file', 'checkpoint', 'restart'): self.assertNotIn(name, current)
        compile(self.payload, '<assembled-readonly-observer03>', 'exec')
        with mock.patch.object(self.driver, 'OBSERVER_SHA', '0' * 64):
            with self.assertRaisesRegex(RuntimeError, 'PINNED_INPUT_CHANGED'): self.driver.build_payload()

    def test_augmentation_restores_both_missing_fields_without_raw_values(self):
        namespace = self.namespace(); bare = copy.deepcopy(self.expected)
        upper = bare.pop('appEffectiveUppercaseEnv'); history = bare.pop('unrelatedHistorySha256'); calls = []
        namespace['snapshot'] = lambda: copy.deepcopy(bare)
        namespace['effective_env_hash'] = lambda pid: (calls.append(pid) or copy.deepcopy(upper))
        namespace['history'] = lambda: history
        result = namespace['augmented_snapshot']()
        self.assertEqual(result, self.expected); self.assertEqual(calls, [1642213])
        self.assertEqual(set(result), set(bare) | {'appEffectiveUppercaseEnv', 'unrelatedHistorySha256'})

    def test_actual_effective_env_helper_filters_uppercase_and_outputs_hash_count_only(self):
        namespace = self.namespace(); sent = []
        namespace['proc'] = lambda _pid: ({}, b'UPPER_SECRET=SYNTHETIC_SENTINEL\0lowercase=ignored\0SECOND=value\0')
        namespace['plain_file'] = lambda *_args: b'FILE_SECRET=ONLY_SYNTHETIC\n'
        def bounded(_argv, data, **_kwargs):
            sent.append(json.loads(data)); return json.dumps({'sha256': 'a' * 64, 'keys': 3}).encode()
        namespace['bounded'] = bounded
        with mock.patch.object(Path, 'resolve', return_value=Path('/synthetic/node')):
            output = io.StringIO()
            with contextlib.redirect_stdout(output): result = namespace['effective_env_hash'](1642213)
            self.assertEqual(result, {'sha256': 'a' * 64, 'keys': 3})
            self.assertEqual(set(sent[0]['initial']), {'UPPER_SECRET', 'SECOND'})
            self.assertNotIn('SYNTHETIC_SENTINEL', json.dumps(result)); self.assertEqual(output.getvalue(), '')
            namespace['proc'] = lambda _pid: ({}, b'DUPLICATE=one\0DUPLICATE=two\0')
            with self.assertRaisesRegex(RuntimeError, 'DUPLICATE_UPPERCASE_INITIAL_ENV'): namespace['effective_env_hash'](1642213)

    def test_actual_history_helper_queries_read_only_metadata_and_requires_one_hash(self):
        namespace = self.namespace(); queries = []
        namespace['peer'] = lambda sql: (queries.append(sql) or ('BEGIN\n' + 'a' * 64 + '\nCOMMIT\n').encode())
        self.assertEqual(namespace['history'](), 'a' * 64)
        self.assertIn('BEGIN READ ONLY;', queries[0]); self.assertIn("SET LOCAL TIME ZONE 'UTC'", queries[0])
        self.assertIn("filename<>'2026-10-26_01_signing_word_authoring_renders.sql'", queries[0])
        self.assertNotIn('INSERT', queries[0]); self.assertNotIn('UPDATE', queries[0]); self.assertNotIn('DELETE', queries[0])
        namespace['peer'] = lambda _sql: ('a' * 64 + '\n' + 'b' * 64).encode()
        with self.assertRaisesRegex(RuntimeError, 'HISTORY_HASH_RESULT'): namespace['history']()

    def test_remote_control_flow_rejects_drift_health_resource_and_busy_without_runtime_calls(self):
        # Extract main's function definition only, so no alarm/footer runs.
        tree = ast.parse(self.payload); node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        class LockPath:
            def __init__(self, path): self.path = path
            def resolve(self, **_kwargs): return self
            def __eq__(self, other): return self.path == other.path
        for mutation in ('none', 'both_missing_history', 'after_upper_changed', 'health', 'resource', 'busy'):
            with self.subTest(mutation=mutation):
                namespace = self.namespace(); namespace['Path'] = LockPath; calls = []
                before = copy.deepcopy(self.expected); after = copy.deepcopy(self.expected)
                if mutation == 'both_missing_history': before.pop('unrelatedHistorySha256'); after.pop('unrelatedHistorySha256')
                if mutation == 'after_upper_changed': after['appEffectiveUppercaseEnv']['sha256'] = '0' * 64
                snapshots = iter((before, after))
                namespace['augmented_snapshot'] = lambda: (calls.append('snapshot') or next(snapshots))
                endpoints = self.observation()['health']
                if mutation == 'health': endpoints['public']['jsonOk'] = False
                namespace['augmented_health'] = lambda: endpoints
                namespace['resources'] = lambda _processes: {'meetsConservativeAvailableMemoryGate': mutation != 'resource'}
                namespace['acquire'] = lambda *_args: (mutation != 'busy', False)
                exec(compile(ast.Module(body=[node], type_ignores=[]), '<synthetic-main-only>', 'exec'), namespace)
                result, code = namespace['main']()
                self.assertEqual(code, 0 if mutation == 'none' else 75 if mutation == 'busy' else 2)
                self.assertTrue(result['noRuntimeMutation'])
                if mutation == 'busy': self.assertEqual(calls, [])
                if mutation == 'none': self.assertTrue(result['qaSingleFork']); self.assertEqual(result['before'], self.expected)

    def test_local_fake_transport_records_success_busy_and_invalid_full_state_safely(self):
        with tempfile.TemporaryDirectory(prefix='qa-observe03-fixtures-') as folder:
            root = Path(folder); ledgers = [root / 'ledger-a', root / 'ledger-b']
            for path in ledgers: path.write_text('Synthetic local ledger\n')
            for case in ('success', 'busy', 'missing_fields'):
                value = self.observation(); code = 0
                if case == 'busy': value = {'result': 'BUSY_NO_OBSERVATION', 'observed': False, 'noRuntimeMutation': True}; code = 75
                if case == 'missing_fields':
                    for key in ('before', 'after'): value[key].pop('appEffectiveUppercaseEnv')
                calls = []
                def transport(argv, *, input, stdout, stderr, timeout):
                    calls.append(argv); self.assertEqual(timeout, 55); self.assertEqual(input, self.payload)
                    stdout.write(json.dumps(value).encode()); stdout.flush()
                    stderr.write(b'SYNTHETIC_PRIVATE_STDERR'); stderr.flush()
                    return types.SimpleNamespace(returncode=code)
                output = io.StringIO()
                with mock.patch('sys.argv', ['observer03', '--observe', '--health']), mock.patch.object(self.driver, 'OUT', root), \
                    mock.patch.object(self.driver, 'LEDGERS', ledgers), mock.patch.object(self.driver.subprocess, 'run', side_effect=transport), \
                    mock.patch.object(self.driver.subprocess, 'check_output', side_effect=AssertionError('No Git')), contextlib.redirect_stdout(output):
                    status = self.driver.main()
                result = json.loads(output.getvalue()); receipt = json.loads(Path(result['receipt']).read_bytes())
                expected = self.driver.RESULT if case == 'success' else 'BUSY_NO_OBSERVATION' if case == 'busy' else 'LOCAL_POSTVALIDATION_FAILED'
                self.assertEqual(receipt['result'], expected); self.assertEqual(status, 0 if case == 'success' else 1)
                self.assertEqual(len(calls), 1); self.assertEqual(calls[0][0], 'ssh')  # intercepted, never executed
                self.assertIn('StrictHostKeyChecking=yes', calls[0]); self.assertNotIn('SYNTHETIC_PRIVATE_STDERR', output.getvalue())
                self.assertEqual(stat.S_IMODE(Path(receipt['privateStdout']['path']).stat().st_mode), 0o600) if case != 'missing_fields' else None
                self.assertEqual(stat.S_IMODE(Path(result['receipt']).stat().st_mode), 0o600)
                for path in ledgers: self.assertIn(expected, path.read_text())


if __name__ == '__main__': unittest.main(verbosity=2)
