#!/usr/bin/env python3
"""Default local plan; explicit reviewed execution targets one QA static root only."""
import argparse, base64, datetime, fcntl, hashlib, json, os, pathlib
import re, shlex, stat, subprocess, sys, types
HERE = pathlib.Path(__file__).resolve().parent
OPERATOR = HERE / 'qa-static01.py'
ROOT = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
EVIDENCE = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/word-ux-fix-20261026/qa-static')
PRIVATE = pathlib.Path('/Users/liroymelamed/.codex/private/word-ux-qa-20261026')
LEDGERS = [ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md', ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
HOST = 'root@84.46.253.85'
PUBLIC = '/var/www/melamedia'
SCOPE = 'WORD_UX_QA_FRONTEND_ONLY'
QA_BASE = '1161fd687db381833552db78a70723573792ab97'
PHASES = ('observe', 'checkpoint', 'upload', 'publish', 'verify', 'rollback')
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
class Stop(RuntimeError): pass
def require(ok, code):
    if not ok: raise Stop(code)
def valid_hash(v): return isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) is not None

def checked_file(binding):
    require(isinstance(binding, dict) and valid_hash(binding.get('sha256')), 'UNSEALED_LOCAL_EVIDENCE')
    p = pathlib.Path(binding['path'])
    require(p.is_file() and not p.is_symlink(), 'BOUND_FILE_MISSING_OR_LINK')
    raw = p.read_bytes()
    require(sha(raw) == binding['sha256'], 'BOUND_FILE_HASH_DRIFT')
    return raw

def checked_json(binding): return json.loads(checked_file(binding))
def git(repo, *args): return subprocess.check_output(['git', *args], cwd=repo, stderr=subprocess.DEVNULL)
def timestamp(text): return datetime.datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()

def helpers():
    namespace = {'__name__': 'reviewed_qa_static_helpers', '__file__': str(OPERATOR)}
    exec(compile(OPERATOR.read_bytes(), str(OPERATOR), 'exec'), namespace)
    return types.SimpleNamespace(**namespace)

def reviews(contract):
    records = contract.get('reviews', {})
    require(set(records) == {'root', 'independent'}, 'ROOT_AND_INDEPENDENT_CODE_REVIEW_REQUIRED')
    for binding in records.values():
        review = checked_json(binding)
        require(review.get('decision') == 'APPROVE' and review.get('scope') == SCOPE and
                review.get('operatorSha256') == contract['operatorSha256'] and
                review.get('runnerSha256') == contract['runnerSha256'], 'REVIEW_DOES_NOT_BIND_OPERATOR')

def common(contract, phase, execute):
    require(contract.get('schemaVersion') == 1 and contract.get('scope') == SCOPE and
            contract.get('tenant') == 'melamedia' and contract.get('host') == HOST and
            contract.get('publicRoot') == PUBLIC, 'FIXED_QA_TARGET_REQUIRED')
    require(contract.get('operatorSha256') == sha(OPERATOR.read_bytes()) and
            contract.get('runnerSha256') == sha(pathlib.Path(__file__).read_bytes()), 'PREP_SOURCE_CHANGED')
    require(contract.get('backendChanges') is False and contract.get('customerPublication') is False and
            contract.get('oldChunksDeleted') == 0 and contract.get('rootPublicUploads') == 0 and
            contract.get('providerCalls') is False and contract.get('qaBackendExpectedCommit') == QA_BASE, 'STATIC_QA_ONLY_SCOPE')
    if execute:
        require(contract.get('sealedByRoot') is True, 'UNSEALED_PACKET_NO_EXECUTION')
        reviews(contract)
    c = {'scope': SCOPE, 'tenant': 'melamedia', 'rootOrHost': PUBLIC,
         'operatorSha256': contract['operatorSha256'], 'backendChanges': False,
         'oldChunksDeleted': 0, 'rootPublicUploads': 0}
    if phase == 'observe':
        require(re.fullmatch('[a-f0-9]{32}', contract.get('observationNonce', '')), 'FRESH_OBSERVATION_NONCE_REQUIRED')
        c['observationNonce'] = contract['observationNonce']
        return c, b''
    return packet(contract, c, phase)

def packet(contract, c, phase):
    h = helpers()
    main, candidate = contract.get('mainCommit'), contract.get('qaCommit')
    require(all(isinstance(v, str) and re.fullmatch('[a-f0-9]{40}', v) for v in (main, candidate)), 'FROZEN_MAIN_AND_QA_COMMITS_REQUIRED')
    repo = pathlib.Path(contract['repository'])
    require(repo.is_dir() and not repo.is_symlink(), 'SOURCE_REPOSITORY_MISSING_OR_LINK')
    for parent in (main, QA_BASE):
        require(subprocess.run(['git', 'merge-base', '--is-ancestor', parent, candidate], cwd=repo,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0, 'QA_CANDIDATE_MUST_PRESERVE_MAIN_AND_QA_BASE')
    publication = checked_json(contract['mainThenQaPublication'])
    require(publication.get('result') == 'PUSHED_MAIN_THEN_QA' and publication.get('mainCommit') == main and
            publication.get('qaCommit') == candidate and publication.get('qaBranch') == 'Melamedia' and
            timestamp(publication['mainPushedAt']) <= timestamp(publication['qaPushedAt']), 'MAIN_FIRST_THEN_QA_PUBLICATION_PROOF_REQUIRED')
    # Recovery binds immutable historical Git/build/preimage evidence. A later
    # legitimate branch advance must not prevent restoring these known entrypoints.
    if phase != 'rollback':
        require(git(repo, 'rev-parse', 'refs/remotes/origin/main').decode().strip() == main and
                git(repo, 'rev-parse', 'refs/remotes/origin/Melamedia').decode().strip() == candidate, 'LOCAL_VERIFIED_REMOTE_TRACKING_BINDING_CHANGED')
    build = checked_json(contract['buildReceipt'])
    require(build.get('tenant') == 'melamedia' and build.get('candidateCommit') == candidate and build.get('exitCode') == 0 and
            build.get('apiOrigin') == 'https://api-melamedia.mela-media.co.il/api' and
            build.get('result') == 'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED' and
            build.get('headAtFinish') == candidate and build.get('node') == 'v24.19.0' and build.get('nodeAfter') == 'v24.19.0' and
            build.get('sourceStable') is True and build.get('dependencyStable') is True and
            build.get('publicAssetsRestoredAfterBuild') is True and
            build.get('localPublicEnvironmentScratchRestored') is True and
            build.get('localIntegrationPreviewOnlyNotDeployedQACandidate') is not True and
            not build.get('scratchRestoreDrift') and not build.get('sourceDrift'), 'EXACT_QA_BRANDED_BUILD_REQUIRED')
    source_hashes = build.get('sourceHashesBefore')
    require(isinstance(source_hashes, dict) and source_hashes and source_hashes == build.get('sourceHashesAfter'), 'COMPILED_SOURCE_BINDING_REQUIRED')
    expected_paths = set(git(repo, 'ls-tree', '-r', '--name-only', candidate, 'frontend', 'scripts/prepare-public-env.cjs').decode().splitlines())
    require(set(source_hashes) == expected_paths, 'FULL_TRACKED_FRONTEND_BUILD_INPUT_SCOPE_REQUIRED')
    for path, digest in source_hashes.items():
        require(valid_hash(digest) and sha(git(repo, 'show', candidate + ':' + path)) == digest, 'COMPILED_SOURCE_NOT_EXACT_QA_GIT_OBJECT:' + path)
    require(build.get('lockSha256') == source_hashes['frontend/package-lock.json'] and valid_hash(build.get('installedManifestSha256')) and
            build.get('installedManifestSha256After') == build['installedManifestSha256'], 'BUILD_DEPENDENCY_BINDING_REQUIRED')
    observation_receipt = checked_json(contract['baselineObservation'])
    observation = observation_receipt.get('observation', {})
    require(observation_receipt.get('exitCode') == 0 and observation_receipt.get('operatorSha256') == c['operatorSha256'] and
            observation.get('result') == 'PASS_READ_ONLY_QA_STATIC_OBSERVATION' and observation.get('target') == PUBLIC and
            observation.get('noMutation') is True and observation.get('scope') == SCOPE, 'FRESH_BOUND_QA_PUBLIC_PREIMAGE_REQUIRED')
    baseline, metadata = observation.get('files'), observation.get('metadata')
    require(isinstance(baseline, dict) and len(baseline) <= 20000 and set(metadata) == set(baseline) and
            set(h.MUTABLE) <= set(baseline), 'COMPLETE_PUBLIC_BASELINE_REQUIRED')
    for path, digest in baseline.items():
        require(h.qa_read_path(path) and valid_hash(digest), 'UNSAFE_BASELINE_PATH_OR_HASH')
        m = metadata[path]
        require(set(m) == {'mode','uid','gid'} and all(type(v) is int and v >= 0 for v in m.values()) and m['mode'] <= 0o7777, 'INVALID_BASELINE_METADATA')
    raw = checked_file(contract['archive'])
    require(contract['archive']['sha256'] == build.get('publicationReviewArchiveSha256'), 'BUILD_ARCHIVE_BINDING_REQUIRED')
    files = checked_json(contract['artifactFiles'])
    require(isinstance(files, dict) and set(h.MUTABLE) <= set(files) and len(files) <= 10000 and
            all(h.safe_path(p, True) and valid_hash(v) for p, v in files.items()), 'SAFE_REVIEWED_STATIC_FILES_REQUIRED')
    require(len(files) == build.get('publicationReviewFileCount'), 'BUILD_PUBLICATION_FILE_COUNT_CHANGED')
    contents = h.check_archive(raw, files)
    old_index, old_manifest = base64.b64decode(observation['indexBase64'], validate=True), base64.b64decode(observation['manifestBase64'], validate=True)
    require(sha(old_index) == baseline['index.html'] and sha(old_manifest) == baseline['asset-manifest.json'], 'OBSERVED_ENTRYPOINT_PREIMAGE_CHANGED')
    h.check_index(old_index, contents['index.html'], old_manifest, contents['asset-manifest.json'], contract['entrypointMap'])
    for path, digest in files.items():
        require(path in h.MUTABLE or path not in baseline or baseline[path] == digest, 'IMMUTABLE_COLLISION_REQUIRES_REVIEW:' + path)
    identity = {'scope': SCOPE, 'host': HOST, 'root': PUBLIC, 'mainCommit': main, 'qaCommit': candidate,
                'operatorSha256': c['operatorSha256'], 'runnerSha256': contract['runnerSha256'],
                'mainThenQaPublication': contract['mainThenQaPublication'], 'buildReceipt': contract['buildReceipt'],
                'baselineObservation': contract['baselineObservation'], 'archive': contract['archive'],
                'artifactFiles': contract['artifactFiles'], 'entrypointMap': contract['entrypointMap']}
    c.update({'mainCommit': main, 'sourceCommit': candidate, 'protected': baseline, 'baselineMetadata': metadata,
              'baselineObservedAt': timestamp(observation['at']), 'files': files, 'optionalAbsentOrUnavailable': [],
              'archiveBytes': len(raw), 'archiveSha256': sha(raw), 'entrypointMap': contract['entrypointMap'],
              'releaseBindingSha256': sha(canonical(identity))})
    return c, raw

def ssh_transport_frame(code, config, phase, archive=b''):
    """Length/hash-framed stdin, leaving only the upload archive for remote_main."""
    require(phase in PHASES and isinstance(code, bytes) and isinstance(config, dict) and isinstance(archive, bytes), 'SSH_FRAME_TYPES_OR_PHASE')
    require(phase == 'upload' or not archive, 'SSH_FRAME_UNEXPECTED_ARCHIVE')
    config_bytes = canonical(config)
    require(0 < len(code) <= 2000000 and 1 < len(config_bytes) <= 2000000, 'SSH_FRAME_SIZE_LIMIT')
    header = (str(len(code)) + ' ' + str(len(config_bytes)) + ' ' + sha(code) + ' ' + sha(config_bytes) + '\n').encode('ascii')
    return header + code + config_bytes + archive

def ssh_transport_bootstrap(phase):
    """Bounded argv bootstrap; validate the complete code/config frame before exec."""
    require(phase in PHASES, 'SSH_FRAME_PHASE_SCOPE')
    return r"""import sys,json,hashlib
stream=sys.stdin.buffer
header=stream.readline(200)
parts=header[:-1].split(b' ') if header.endswith(b'\n') else []
if len(parts)!=4 or not parts[0].isdigit() or not parts[1].isdigit(): raise RuntimeError('SSH_FRAME_HEADER')
n,m=int(parts[0]),int(parts[1])
if not (0<n<=2000000 and 1<m<=2000000): raise RuntimeError('SSH_FRAME_SIZE_LIMIT')
if any(len(d)!=64 or any(c not in b'0123456789abcdef' for c in d) for d in parts[2:]): raise RuntimeError('SSH_FRAME_DIGEST_HEADER')
def read_exact(size):
    data=bytearray()
    while len(data)<size:
        part=stream.read(size-len(data))
        if not part: raise RuntimeError('SSH_FRAME_TRUNCATED')
        data.extend(part)
    return bytes(data)
code=read_exact(n)
config_bytes=read_exact(m)
if hashlib.sha256(code).hexdigest().encode()!=parts[2] or hashlib.sha256(config_bytes).hexdigest().encode()!=parts[3]: raise RuntimeError('SSH_FRAME_DIGEST_MISMATCH')
config=json.loads(config_bytes)
if not isinstance(config,dict): raise RuntimeError('SSH_FRAME_CONFIG_TYPE')
if hashlib.sha256(code).hexdigest()!=config.get('operatorSha256'): raise RuntimeError('SSH_OPERATOR_CONFIG_BINDING')
ns={'__name__':'publisher_remote','__file__':'reviewed-qa-static01.py'}
exec(compile(code,ns['__file__'],'exec'),ns)
ns['remote_main'](config,""" + repr(phase) + ")"

def private_directory(path):
    require(not any(p.is_symlink() for p in [path, *path.parents]), 'PRIVATE_OUTPUT_SYMLINK')
    path.mkdir(parents=True, exist_ok=True, mode=0o700); path.chmod(0o700)


def execute(contract, c, archive, phase, contract_sha):
    ledger_reads = {str(p): sha(p.read_bytes()) for p in LEDGERS}
    private_directory(PRIVATE); private_directory(EVIDENCE)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    at, out, err = now(), PRIVATE / (phase + '-' + stamp + '.stdout'), PRIVATE / (phase + '-' + stamp + '.stderr')
    result, exitcode, attempted = None, 1, False
    c['contractSha256'] = contract_sha
    try:
        with (PRIVATE / 'operator.lock').open('a+b') as lock:
            os.chmod(lock.name, 0o600); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # The Court mutex is deliberately reused so the two QA operators cannot overlap.
            command = ['flock', '--shared', '--nonblock', '/run/lock/melamedia-release-maintenance.lock',
                       'flock', '--exclusive', '--nonblock', '/run/lock/melamedia-court-owner-import-qa.lock',
                       'python3', '-c', ssh_transport_bootstrap(phase)]
            ssh = ['ssh', '-T', '-i', str(pathlib.Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', HOST,
                   ' '.join(shlex.quote(v) for v in command)]
            code = OPERATOR.read_bytes()
            require(sha(code) == c['operatorSha256'], 'OPERATOR_CHANGED_BEFORE_TRANSPORT')
            frame = ssh_transport_frame(code, c, phase, archive if phase == 'upload' else b'')
            with out.open('xb') as stdout, err.open('xb') as stderr:
                os.chmod(out, 0o600); os.chmod(err, 0o600); attempted = True
                completed = subprocess.run(ssh, input=frame, stdout=stdout, stderr=stderr, timeout=900)
            exitcode = completed.returncode
            require(out.stat().st_size <= 6000000, 'TRANSPORT_OUTPUT_LIMIT')
            result = json.loads(out.read_bytes())
            if exitcode == 0:
                expected = {'observe': 'PASS_READ_ONLY_QA_STATIC_OBSERVATION', 'checkpoint': 'PASS_PRIVATE_FRONTEND_CHECKPOINT_ONLY',
                            'upload': 'PASS_IMMUTABLE_ASSETS_FIRST_OLD_INDEX_UNCHANGED', 'publish': 'PASS_EXACT_STATIC_PUBLICATION_NOT_BROWSER_QA',
                            'verify': 'PASS_CURRENT_EXACT_STATIC_AND_PROTECTED_PUBLIC_READBACK_ONLY',
                            'rollback': 'PASS_ONLY_OLD_INDEX_MANIFEST_RESTORED_CHUNKS_RETAINED'}
                require(result.get('result') == expected[phase] and result.get('scope') == SCOPE and
                        result.get('target') == PUBLIC and result.get('phase') == phase and
                        result.get('contractSha256') == contract_sha and result.get('operatorSha256') == c['operatorSha256'], 'REMOTE_RECEIPT_BINDING_OR_RESULT_FAILED')
                if phase != 'observe':
                    require(result.get('releaseBindingSha256') == c['releaseBindingSha256'] and
                            result.get('mainCommit') == c['mainCommit'] and result.get('sourceCommit') == c['sourceCommit'] and
                            result.get('oldChunksDeleted') == 0 and result.get('rootPublicUploads') == 0 and
                            result.get('protectedPublicFilesAndMetadataUnchanged') is True, 'REMOTE_PRESERVATION_RECEIPT_FAILED')
                else:
                    require(result.get('observationNonce') == c['observationNonce'] and result.get('noMutation') is True, 'REMOTE_OBSERVATION_BINDING_FAILED')
    except Exception as error:
        exitcode = 1
        with err.open('ab' if err.exists() else 'xb') as stream:
            os.chmod(err, 0o600)
            stream.write(('\nLOCAL_ERROR ' + type(error).__name__ + (':' + str(error) if isinstance(error, Stop) else '')).encode())
        result = {'result': 'QA_STATIC_PHASE_FAILED_NO_BLIND_RETRY', 'errorCode': str(error) if isinstance(error, Stop) else type(error).__name__,
                  'partialMutationPossible': attempted and phase in ('checkpoint', 'upload', 'publish', 'rollback'),
                  'transportAttempted': attempted, 'detailsPrivate': True}
        if not out.exists(): out.write_text(json.dumps(result)); out.chmod(0o600)
    receipt = {'at': at, 'scope': SCOPE, 'tenant': 'melamedia', 'phase': phase, 'exitCode': exitcode,
               'operatorSha256': c['operatorSha256'], 'runnerSha256': contract['runnerSha256'], 'contractSha256': contract_sha,
               'sourceCommit': c.get('sourceCommit'), 'mainCommit': c.get('mainCommit'),
               'releaseBindingSha256': c.get('releaseBindingSha256'), 'transportAttempted': attempted,
               'stdoutSha256': sha(out.read_bytes()), 'stderrSha256': sha(err.read_bytes()),
               'private0600TransportLogs': True, 'ledgersReadBeforeAttempt': ledger_reads, 'observation': result,
               'backendEnvSchemaProviderPermissionChanges': False, 'customerPublication': False,
               'browserOrFullProductApproval': False, 'noBlindRetry': True}
    dest = EVIDENCE / (phase + '-' + stamp + '.json')
    with dest.open('x') as stream: os.chmod(dest, 0o600); json.dump(receipt, stream, indent=2); stream.write('\n')
    line = ('\n- ' + now() + ' Word UX QA frontend-only static ' + phase + ' exit' + str(exitcode) +
            '; source ' + str(c.get('sourceCommit')) + '; evidence ' + str(dest) + ' SHA256 ' + sha(dest.read_bytes()) +
            '. Exact static observation/operation only; no backend, schema, environment, provider, permission or customer publication. '
            'Old/new chunks and private recovery retained; no browser/full-product result. Failed/partial attempt retained; no blind retry. '
            'Relevant source/build/runtime/public bytes drift invalidates corresponding qualification.\n')
    for ledger in LEDGERS:
        with ledger.open('a') as stream: stream.write(line)
    print(json.dumps({'result': result.get('result'), 'exitCode': exitcode, 'receipt': str(dest), 'receiptSha256': sha(dest.read_bytes())}))
    return exitcode


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contract', default=str(HERE / 'contract.example.json'))
    parser.add_argument('--contract-sha')
    parser.add_argument('--phase', choices=PHASES, default='checkpoint')
    parser.add_argument('--execute-reviewed', action='store_true')
    args = parser.parse_args()
    path = pathlib.Path(args.contract)
    require(path.is_file() and not path.is_symlink(), 'CONTRACT_MISSING_OR_LINK')
    raw = path.read_bytes(); contract = json.loads(raw); contract_sha = sha(raw)
    if args.contract_sha is not None: require(args.contract_sha == contract_sha, 'CONTRACT_BYTES_CHANGED')
    if not args.execute_reviewed and contract.get('sealedByRoot') is not True:
        print(json.dumps({'result': 'LOCAL_PREP_PLAN_ONLY_NO_NETWORK', 'phase': args.phase,
                          'scope': SCOPE, 'host': HOST, 'publicRoot': PUBLIC,
                          'operatorSha256': sha(OPERATOR.read_bytes()), 'runnerSha256': sha(pathlib.Path(__file__).read_bytes()),
                          'sealed': False, 'executionRequires': ['root and independent review bound to both script hashes',
                          'sealed root-reviewed exact contract and explicit --contract-sha',
                          'for non-observe: fresh QA static observation, pushed main then QA proof, frozen QA-branded build/source/archive',
                          'explicit --execute-reviewed'], 'remoteCalls': False, 'sourceOrFilesystemMutation': False}))
        return 0
    require(not args.execute_reviewed or args.contract_sha is not None, 'EXECUTION_REQUIRES_EXPLICIT_CONTRACT_SHA')
    c, archive = common(contract, args.phase, args.execute_reviewed)
    if not args.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_VALIDATED_PLAN_ONLY_NO_NETWORK', 'phase': args.phase,
                          'sourceCommit': c.get('sourceCommit'), 'mainCommit': c.get('mainCommit'),
                          'releaseBindingSha256': c.get('releaseBindingSha256'), 'artifactFiles': len(c.get('files', {})),
                          'protectedFiles': len(c.get('protected', {})), 'remoteCalls': False})); return 0
    return execute(contract, c, archive, args.phase, contract_sha)


if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'result': 'LOCAL_PACKET_VALIDATION_FAILED_NO_REMOTE',
                          'errorCode': str(error) if isinstance(error, Stop) else type(error).__name__, 'detailsWithheld': True}))
        raise SystemExit(1)
