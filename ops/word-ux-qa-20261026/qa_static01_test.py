#!/usr/bin/env python3
"""Focused synthetic fixtures for new QA packet logic; never contacts a server.

Run only after root coordinates ledger capture. All public trees, Git objects,
preimages and archives here are synthetic and created in an owned cache tempdir.
No QA/customer application, HTTP, SSH, credentials or provider is used.
"""
import base64
import contextlib
import copy
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
CACHE = Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/word-ux-qa-20261026/qa-static-fixtures')
sha = lambda b: hashlib.sha256(b).hexdigest()


def load(name, path):
    module = types.ModuleType(name)
    module.__file__ = str(path)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


def put(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    path.chmod(0o644)


def bind_json(path, value):
    put(path, (json.dumps(value, indent=2) + '\n').encode())
    return {'path': str(path), 'sha256': sha(path.read_bytes())}


def archive_bytes(files):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode='w:gz') as archive:
        for name, raw in sorted(files.items()):
            member = tarfile.TarInfo(name)
            member.size, member.mode, member.mtime = len(raw), 0o644, 0
            archive.addfile(member, io.BytesIO(raw))
    return result.getvalue()


class QAStaticFixtures(unittest.TestCase):
    def setUp(self):
        CACHE.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='owned-', dir=CACHE)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.operator = load('qa_static_fixture_operator', HERE / 'qa-static01.py')
        self.driver = load('qa_static_fixture_driver', HERE / 'run-qa-static01.py')
        self.old_js, self.new_js = 'static/js/main.old.js', 'static/js/main.new.js'
        self.old_index = b'<!doctype html><meta name="qa-brand" content="retained"><script defer src="/static/js/main.old.js"></script>'
        self.new_index = self.old_index.replace(self.old_js.encode(), self.new_js.encode())
        self.old_manifest = json.dumps({'entrypoints': [self.old_js], 'files': {'main.js': '/' + self.old_js}}).encode()
        self.new_manifest = json.dumps({'entrypoints': [self.new_js], 'files': {'main.js': '/' + self.new_js}}).encode()
        self.entrypoint_map = {self.old_js: self.new_js}
        self.candidate = {'index.html': self.new_index, 'asset-manifest.json': self.new_manifest, self.new_js: b'/* synthetic new application chunk */'}

    def public(self):
        root = self.root / 'public'
        old = {'index.html': self.old_index, 'asset-manifest.json': self.old_manifest,
               self.old_js: b'/* retained old application chunk */', 'firm-logo.png': b'synthetic brand image',
               'manifest.json': b'{"name":"synthetic QA PWA"}', '.well-known/assetlinks.json': b'[]',
               'tenants/melamedia/.well-known/apple-app-site-association': b'{"applinks":{}}',
               'tenants/melamedia/logos/logo.png': b'synthetic nested logo',
               'integrations/privacy.html': b'<p>synthetic public legal page</p>',
               'templates/clients-demo.xlsx': b'synthetic public spreadsheet fixture'}
        for path, raw in old.items(): put(root / path, raw)
        return self.operator.QaDiskPublic(root), old

    def config(self, adapter):
        baseline, metadata = self.operator.inventory(adapter)
        raw = archive_bytes(self.candidate)
        c = {'scope': self.operator.SCOPE, 'tenant': 'melamedia', 'rootOrHost': self.operator.PUBLIC,
             'mainCommit': '1' * 40, 'sourceCommit': '2' * 40, 'releaseBindingSha256': '3' * 64,
             'contractSha256': '4' * 64, 'backendChanges': False, 'oldChunksDeleted': 0, 'rootPublicUploads': 0,
             'protected': baseline, 'baselineMetadata': metadata,
             'files': {p: sha(b) for p, b in self.candidate.items()}, 'optionalAbsentOrUnavailable': [],
             'archiveBytes': len(raw), 'archiveSha256': sha(raw), 'entrypointMap': self.entrypoint_map}
        return c, raw

    def publish(self):
        adapter, old = self.public()
        c, raw = self.config(adapter)
        stage = self.operator.PrivateStage(self.root / 'private-checkpoint')
        writes = []
        replace = adapter.replace
        def recorded(path, data, expected):
            writes.append(path)
            return replace(path, data, expected)
        adapter.replace = recorded
        self.operator.operation(adapter, stage, c, 'checkpoint')
        self.operator.check_index(self.old_index, self.new_index, self.old_manifest, self.new_manifest, self.entrypoint_map)
        self.operator.operation(adapter, stage, c, 'upload', raw)
        self.assertEqual(adapter.read('index.html'), self.old_index)
        self.assertEqual(writes, [])
        self.operator.operation(adapter, stage, c, 'publish')
        self.assertEqual(writes, ['asset-manifest.json', 'index.html'])
        self.operator.operation(adapter, stage, c, 'verify')
        return adapter, old, c, stage, writes

    def common_contract(self):
        c = json.loads((HERE / 'contract.example.json').read_text())
        c.update({'sealedByRoot': True, 'observationNonce': 'a' * 32})
        review = {'decision': 'APPROVE', 'scope': self.driver.SCOPE,
                  'operatorSha256': c['operatorSha256'], 'runnerSha256': c['runnerSha256']}
        c['reviews'] = {owner: bind_json(self.root / (owner + '-review.json'), review) for owner in ('root', 'independent')}
        return c

    def git(self, repo, *args):
        environment = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull)
        command = ['git', '-c', 'core.hooksPath=' + os.devnull, '-c', 'user.name=Synthetic fixture',
                   '-c', 'user.email=fixture@example.invalid', *args]
        result = subprocess.run(command, cwd=repo, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return result.stdout.strip().decode()

    def full_packet(self):
        repo = self.root / 'git-source'
        repo.mkdir()
        self.git(repo, 'init', '--initial-branch=synthetic')
        put(repo / 'frontend/package.json', b'{"name":"synthetic-qa-packet","version":"1.0.0"}\n')
        put(repo / 'frontend/package-lock.json', b'{"lockfileVersion":3,"packages":{}}\n')
        put(repo / 'frontend/app.js', b'/* synthetic base */\n')
        self.git(repo, 'add', 'frontend'); self.git(repo, 'commit', '-m', 'Synthetic QA base')
        base = self.git(repo, 'rev-parse', 'HEAD')
        put(repo / 'frontend/app.js', b'/* synthetic main product */\n')
        self.git(repo, 'add', 'frontend'); self.git(repo, 'commit', '-m', 'Synthetic main product')
        main = self.git(repo, 'rev-parse', 'HEAD')
        put(repo / 'frontend/app.js', b'/* synthetic merged QA product */\n')
        self.git(repo, 'add', 'frontend'); self.git(repo, 'commit', '-m', 'Synthetic merged QA candidate')
        candidate = self.git(repo, 'rev-parse', 'HEAD')
        self.git(repo, 'update-ref', 'refs/remotes/origin/main', main)
        self.git(repo, 'update-ref', 'refs/remotes/origin/Melamedia', candidate)
        self.driver.QA_BASE = base  # Only this in-memory test module; no frozen source mutation.
        adapter, _ = self.public()
        baseline, metadata = self.operator.inventory(adapter)
        source = {str(p.relative_to(repo)): sha(p.read_bytes()) for p in sorted((repo / 'frontend').rglob('*')) if p.is_file()}
        raw = archive_bytes(self.candidate)
        archive = self.root / 'publication.tar.gz'; put(archive, raw)
        at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        build = {'tenant': 'melamedia', 'candidateCommit': candidate, 'headAtFinish': candidate, 'exitCode': 0,
                 'apiOrigin': 'https://api-melamedia.mela-media.co.il/api',
                 'result': 'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED',
                 'node': 'v24.19.0', 'nodeAfter': 'v24.19.0', 'sourceStable': True, 'dependencyStable': True,
                 'publicAssetsRestoredAfterBuild': True, 'localPublicEnvironmentScratchRestored': True,
                 'localIntegrationPreviewOnlyNotDeployedQACandidate': False,
                 'scratchRestoreDrift': [], 'sourceDrift': [], 'sourceHashesBefore': source, 'sourceHashesAfter': dict(source),
                 'lockSha256': source['frontend/package-lock.json'], 'installedManifestSha256': '5' * 64,
                 'installedManifestSha256After': '5' * 64, 'publicationReviewArchiveSha256': sha(raw),
                 'publicationReviewFileCount': len(self.candidate)}
        observed = {'exitCode': 0, 'operatorSha256': sha((HERE / 'qa-static01.py').read_bytes()),
                    'observation': {'result': 'PASS_READ_ONLY_QA_STATIC_OBSERVATION', 'target': self.operator.PUBLIC,
                                    'noMutation': True, 'scope': self.operator.SCOPE, 'at': at,
                                    'files': baseline, 'metadata': metadata,
                                    'indexBase64': base64.b64encode(self.old_index).decode(),
                                    'manifestBase64': base64.b64encode(self.old_manifest).decode()}}
        publication = {'result': 'PUSHED_MAIN_THEN_QA', 'mainCommit': main, 'qaCommit': candidate, 'qaBranch': 'Melamedia',
                       'mainPushedAt': '2026-10-26T11:00:00+00:00', 'qaPushedAt': '2026-10-26T11:01:00+00:00'}
        contract = {'repository': str(repo), 'mainCommit': main, 'qaCommit': candidate,
                    'runnerSha256': sha((HERE / 'run-qa-static01.py').read_bytes()),
                    'mainThenQaPublication': bind_json(self.root / 'publication.json', publication),
                    'buildReceipt': bind_json(self.root / 'build.json', build),
                    'baselineObservation': bind_json(self.root / 'observed.json', observed),
                    'archive': {'path': str(archive), 'sha256': sha(raw)},
                    'artifactFiles': bind_json(self.root / 'files.json', {p: sha(b) for p, b in self.candidate.items()}),
                    'entrypointMap': self.entrypoint_map}
        config = {'scope': self.operator.SCOPE, 'tenant': 'melamedia', 'rootOrHost': self.operator.PUBLIC,
                  'operatorSha256': sha((HERE / 'qa-static01.py').read_bytes()),
                  'backendChanges': False, 'oldChunksDeleted': 0, 'rootPublicUploads': 0}
        return repo, contract, config, build, observed

    def test_default_plan_has_no_network_subprocess_or_writes(self):
        original_open = Path.open
        def read_only(path, mode='r', *args, **kwargs):
            if any(flag in mode for flag in ('w', 'a', 'x', '+')):
                raise AssertionError('Default plan attempted filesystem write')
            return original_open(path, mode, *args, **kwargs)
        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(sys, 'argv', ['run-qa-static01.py']))
            stack.enter_context(mock.patch.object(Path, 'open', read_only))
            for name in ('mkdir', 'write_bytes', 'write_text', 'unlink', 'rename', 'replace', 'touch', 'chmod'):
                stack.enter_context(mock.patch.object(Path, name, side_effect=AssertionError('Default plan attempted write: ' + name)))
            for name in ('run', 'check_output', 'Popen'):
                stack.enter_context(mock.patch.object(subprocess, name, side_effect=AssertionError('Default plan attempted subprocess')))
            stack.enter_context(mock.patch.object(socket, 'socket', side_effect=AssertionError('Default plan attempted network')))
            stack.enter_context(contextlib.redirect_stdout(output))
            self.assertEqual(self.driver.main(), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(result['result'], 'LOCAL_PREP_PLAN_ONLY_NO_NETWORK')
        self.assertFalse(result['remoteCalls'])
        self.assertFalse(result['sourceOrFilesystemMutation'])

    def test_fixed_qa_target_and_review_bindings_fail_closed(self):
        original = self.common_contract()
        c, raw = self.driver.common(original, 'observe', True)
        self.assertEqual(c['rootOrHost'], '/var/www/melamedia'); self.assertEqual(raw, b'')
        for key, value in [('host', 'root@invalid.example'), ('tenant', 'melamedlaw'),
                           ('publicRoot', '/var/www/other'), ('backendChanges', True), ('customerPublication', True)]:
            with self.subTest(field=key):
                changed = copy.deepcopy(original); changed[key] = value
                with self.assertRaises(self.driver.Stop): self.driver.common(changed, 'observe', True)
        changed = copy.deepcopy(original); changed['reviews'].pop('independent')
        with self.assertRaisesRegex(self.driver.Stop, 'ROOT_AND_INDEPENDENT_CODE_REVIEW_REQUIRED'):
            self.driver.common(changed, 'observe', True)
        review = {'decision': 'APPROVE', 'scope': self.driver.SCOPE,
                  'operatorSha256': '0' * 64, 'runnerSha256': original['runnerSha256']}
        changed = copy.deepcopy(original); changed['reviews']['independent'] = bind_json(self.root / 'wrong-review.json', review)
        with self.assertRaisesRegex(self.driver.Stop, 'REVIEW_DOES_NOT_BIND_OPERATOR'):
            self.driver.common(changed, 'observe', True)

    def test_existing_public_subtrees_are_hash_bound_but_cannot_be_written(self):
        adapter, old = self.public()
        hashes, metadata = self.operator.inventory(adapter)
        self.assertEqual(hashes, {p: sha(b) for p, b in old.items()})
        self.assertEqual(set(metadata), set(old))
        c, _ = self.config(adapter)
        self.operator.check_public(adapter, c, {p: hashes[p] for p in self.operator.MUTABLE})
        with self.assertRaisesRegex(self.operator.Stop, 'IMMUTABLE_WRITE_SCOPE'):
            adapter.put_new('tenants/melamedia/logos/logo.png', b'forbidden')
        put(adapter.root / 'integrations/privacy.html', b'changed public protected bytes')
        with self.assertRaisesRegex(self.operator.Stop, 'PUBLIC_BASELINE_OR_MUTABLE_DRIFT'):
            self.operator.check_public(adapter, c, {p: hashes[p] for p in self.operator.MUTABLE})

    def test_unknown_public_directory_and_symlink_are_rejected(self):
        adapter, _ = self.public()
        put(adapter.root / 'unknown-subtree/private.txt', b'not read as approved public content')
        with self.assertRaisesRegex(self.operator.Stop, 'UNREVIEWED_PUBLIC_DIRECTORY'):
            self.operator.inventory(adapter)
        (adapter.root / 'unknown-subtree/private.txt').unlink(); (adapter.root / 'unknown-subtree').rmdir()
        (adapter.root / 'static/js/link.js').symlink_to(adapter.root / 'index.html')
        with self.assertRaisesRegex(self.operator.Stop, 'PUBLIC_SYMLINK_REQUIRES_REVIEW'):
            self.operator.inventory(adapter)

    def test_archive_rejects_out_of_scope_root_public_and_wrong_bytes(self):
        _, raw = self.config(self.public()[0])
        files = {p: sha(b) for p, b in self.candidate.items()}
        self.assertEqual(self.operator.check_archive(raw, files), self.candidate)
        bad = dict(self.candidate, **{'manifest.json': b'forbidden root public upload'})
        with self.assertRaisesRegex(self.operator.Stop, 'ARCHIVE_MEMBER_SCOPE'):
            self.operator.check_archive(archive_bytes(bad), {p: sha(b) for p, b in bad.items()})
        wrong = dict(files); wrong[self.new_js] = '0' * 64
        with self.assertRaisesRegex(self.operator.Stop, 'ARCHIVE_MEMBER_HASH_CHANGED'):
            self.operator.check_archive(raw, wrong)

    def test_immutable_collision_and_mutable_cas_reject_before_overwrite(self):
        adapter, old = self.public()
        with self.assertRaisesRegex(self.operator.Stop, 'EXISTING_IMMUTABLE_BYTES_CONFLICT'):
            adapter.put_new(self.old_js, b'conflicting chunk')
        self.assertEqual(adapter.read(self.old_js), old[self.old_js])
        put(adapter.root / 'index.html', b'concurrent unknown index')
        with self.assertRaisesRegex(self.operator.Stop, 'MUTABLE_CAS_CHANGED'):
            adapter.replace('index.html', self.new_index, sha(self.old_index))
        self.assertEqual(adapter.read('index.html'), b'concurrent unknown index')

    def test_publish_entrypoint_last_and_explicit_rollback_retain_all_chunks(self):
        adapter, old, c, stage, writes = self.publish()
        protected = {p: b for p, b in old.items() if p not in self.operator.MUTABLE}
        self.assertEqual(adapter.read('index.html'), self.new_index)
        writes.clear()
        # Recovery deliberately does not require a healthy new candidate chunk.
        put(adapter.root / self.new_js, b'candidate chunk corrupted after publication')
        self.operator.operation(adapter, stage, c, 'rollback')
        self.assertEqual(writes, ['asset-manifest.json', 'index.html'])
        self.assertEqual(adapter.read('index.html'), self.old_index)
        self.assertEqual(adapter.read('asset-manifest.json'), self.old_manifest)
        for path, raw in protected.items(): self.assertEqual(adapter.read(path), raw)
        self.assertEqual(adapter.read(self.new_js), b'candidate chunk corrupted after publication')
        self.assertTrue((stage.directory / 'old-index.html').is_file())
        self.assertTrue((stage.directory / 'journal.json').is_file())

    def test_rollback_metadata_drift_causes_zero_mutable_writes(self):
        adapter, _, c, stage, writes = self.publish(); writes.clear()
        (adapter.root / 'firm-logo.png').chmod(0o600)
        with self.assertRaisesRegex(self.operator.Stop, 'PUBLIC_METADATA_DRIFT'):
            self.operator.operation(adapter, stage, c, 'rollback')
        self.assertEqual(writes, [])
        self.assertEqual(adapter.read('index.html'), self.new_index)
        self.assertNotIn('rollback', json.loads(stage.read('journal.json'))['attempts'])

    def test_rollback_unexpected_path_causes_zero_mutable_writes(self):
        adapter, _, c, stage, writes = self.publish(); writes.clear()
        put(adapter.root / 'unexpected.txt', b'concurrent unrelated public addition')
        with self.assertRaisesRegex(self.operator.Stop, 'UNEXPECTED_PUBLIC_FILE_ADDITION'):
            self.operator.operation(adapter, stage, c, 'rollback')
        self.assertEqual(writes, [])
        self.assertEqual(adapter.read('index.html'), self.new_index)
        self.assertNotIn('rollback', json.loads(stage.read('journal.json'))['attempts'])

    def test_full_packet_forward_ref_drift_rejected_but_historical_rollback_allowed(self):
        repo, contract, config, _, _ = self.full_packet()
        before, _ = self.driver.packet(contract, dict(config), 'checkpoint')
        put(repo / 'future.txt', b'synthetic later legitimate branch advance')
        self.git(repo, 'add', 'future.txt'); self.git(repo, 'commit', '-m', 'Synthetic later branch advance')
        future = self.git(repo, 'rev-parse', 'HEAD')
        self.git(repo, 'update-ref', 'refs/remotes/origin/main', future)
        self.git(repo, 'update-ref', 'refs/remotes/origin/Melamedia', future)
        for phase in ('checkpoint', 'upload', 'publish', 'verify'):
            with self.subTest(phase=phase), self.assertRaisesRegex(self.driver.Stop, 'LOCAL_VERIFIED_REMOTE_TRACKING_BINDING_CHANGED'):
                self.driver.packet(contract, dict(config), phase)
        recovered, _ = self.driver.packet(contract, dict(config), 'rollback')
        self.assertEqual(before['releaseBindingSha256'], recovered['releaseBindingSha256'])
        self.assertEqual(recovered['sourceCommit'], contract['qaCommit'])

    def test_historical_rollback_still_rejects_compiled_source_drift(self):
        _, contract, config, build, _ = self.full_packet()
        build['sourceHashesBefore']['frontend/app.js'] = '0' * 64
        build['sourceHashesAfter']['frontend/app.js'] = '0' * 64
        contract['buildReceipt'] = bind_json(self.root / 'build.json', build)
        with self.assertRaisesRegex(self.driver.Stop, 'COMPILED_SOURCE_NOT_EXACT_QA_GIT_OBJECT'):
            self.driver.packet(contract, config, 'rollback')

    def test_historical_rollback_still_rejects_archive_file_drift(self):
        _, contract, config, _, _ = self.full_packet()
        with Path(contract['archive']['path']).open('ab') as stream: stream.write(b'unreviewed trailing bytes')
        with self.assertRaisesRegex(self.driver.Stop, 'BOUND_FILE_HASH_DRIFT'):
            self.driver.packet(contract, config, 'rollback')

    def test_historical_rollback_still_rejects_entrypoint_preimage_drift(self):
        _, contract, config, _, observed = self.full_packet()
        observed['observation']['indexBase64'] = base64.b64encode(b'changed historical index').decode()
        contract['baselineObservation'] = bind_json(self.root / 'observed.json', observed)
        with self.assertRaisesRegex(self.driver.Stop, 'OBSERVED_ENTRYPOINT_PREIMAGE_CHANGED'):
            self.driver.packet(contract, config, 'rollback')


if __name__ == '__main__':
    unittest.main(verbosity=2)
