#!/usr/bin/env python3
"""Default local plan; explicit reviewed execution targets one QA static root only."""
import argparse, base64, datetime, fcntl, hashlib, json, os, pathlib
import re, shlex, stat, subprocess, sys, types
HERE = pathlib.Path(__file__).resolve().parent
OPERATOR = pathlib.Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-melamedia-qa-20261026/ops/word-ux-qa-20261026/qa-static01.py')
ROOT = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
EVIDENCE = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/word-ux-fix-20261026/qa-static')
PRIVATE = pathlib.Path('/Users/liroymelamed/.codex/private/word-ux-qa-20261026')
LEDGERS = [ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md', ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
HOST = 'root@84.46.253.85'
PUBLIC = '/var/www/melamedia'
SCOPE = 'WORD_UX_QA_FRONTEND_ONLY'
QA_BASE = '1161fd687db381833552db78a70723573792ab97'
BACKEND_TARGET = {'host': 'root@37.60.230.148', 'root': '/root/Melamedia', 'database': 'melamedia',
                  'pm2Id': 5, 'pm2Name': 'melamedia-api', 'branchState': 'DETACHED'}
BACKEND_VERIFY_RESULT = 'QA_BACKEND_VERIFY_DEDICATED_ONLY'
BACKEND_DRIVER_SHA256 = 'bf4369a26ec6284419bbc848ed4d3b9fb37a200e28d2638256322657e2f93dc3'
BACKEND_RECOVERY_VERIFY_RESULT = 'QA_BACKEND_RECOVERY_VERIFY_DEDICATED_ONLY'
BACKEND_RECOVERY_DRIVER_SHA256 = 'f794387a462ab0ec573624d57f05130413ff92af288914a96fab256e50b4364d'
BACKEND_SOURCE_ADVANCE_VERIFY_RESULT = 'QA_BACKEND_SOURCE_ADVANCE_VERIFY_DEDICATED_ONLY'
BACKEND_SOURCE_ADVANCE_DRIVER_SHA256 = '8f53890e49b8481e0621d45e5b587810621c21eb5b47db38cb416f386fb0addc'
BACKEND_SOURCE_ADVANCE_BASE = '9afc07adde83eae7ead026315dc9291851892cdf'
BACKEND_OBSERVER_SHA256 = 'adced0030fbfc646182d3d44db25b2195f215b3f6c19b11aef3707420e96f2b7'
BACKEND_VERIFY_PREDICATES = frozenset((
    'sourceAndDetachedStateVerified', 'protectedSource103Verified', 'exactMigrationRecorded',
    'unrelatedHistoryPreserved', 'schemaQualifiedDedicatedOnly', 'environmentAndDependenciesPreserved',
    'uppercaseAppEffectiveEnvPreserved', 'nonQaProcessesPreserved', 'singleObservedForkWatchFalsePreserved',
    'healthJsonOk', 'memoryHeadroomVerified', 'privateCheckpointVerified'))
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

def backend_verification(contract, candidate, phase):
    """Consume a sealed, exact QA-backend verify result; never contact the API."""
    require(contract.get('qaBackendExpectedCommit') == candidate, 'QA_BACKEND_MUST_MATCH_FRONTEND_CANDIDATE')
    receipt = checked_json(contract.get('qaBackendVerification'))
    require(isinstance(receipt, dict), 'EXACT_QA_BACKEND_VERIFY_RECEIPT_REQUIRED')
    remote = receipt.get('remote', {})
    historical = (receipt.get('kind') == 'QA_ONLY_BACKEND_RELEASE' and receipt.get('result') == BACKEND_VERIFY_RESULT
                  and receipt.get('driverSha256') == BACKEND_DRIVER_SHA256)
    recovery = (receipt.get('kind') == 'QA_ONLY_BACKEND_RELEASE_RECOVERY' and receipt.get('result') == BACKEND_RECOVERY_VERIFY_RESULT
                and valid_hash(BACKEND_RECOVERY_DRIVER_SHA256) and receipt.get('driverSha256') == BACKEND_RECOVERY_DRIVER_SHA256)
    advance = (receipt.get('kind') == 'QA_ONLY_BACKEND_SOURCE_ADVANCE' and receipt.get('result') == BACKEND_SOURCE_ADVANCE_VERIFY_RESULT
               and valid_hash(BACKEND_SOURCE_ADVANCE_DRIVER_SHA256) and receipt.get('driverSha256') == BACKEND_SOURCE_ADVANCE_DRIVER_SHA256)
    require(advance or ((recovery or historical) and phase == 'rollback'), 'REVIEWED_SOURCE_ADVANCE_OR_HISTORICAL_ROLLBACK_PROOF_REQUIRED')
    expected_result = BACKEND_SOURCE_ADVANCE_VERIFY_RESULT if advance else BACKEND_RECOVERY_VERIFY_RESULT if recovery else BACKEND_VERIFY_RESULT
    require(receipt.get('phase') == 'verify' and receipt.get('sshAttempted') is True
            and type(receipt.get('transportExitCode')) is int and receipt['transportExitCode'] == 0
            and receipt.get('candidateCommit') == candidate and receipt.get('target') == BACKEND_TARGET
            and valid_hash(receipt.get('contractSha256')), 'EXACT_QA_BACKEND_VERIFY_RECEIPT_REQUIRED')
    require(isinstance(remote, dict) and isinstance(remote.get('state'), dict)
            and isinstance(remote['state'].get('source'), dict) and remote.get('phase') == 'verify'
            and remote.get('result') == expected_result and remote.get('target') == BACKEND_TARGET
            and remote.get('candidateCommit') == candidate
            and remote.get('contractSha256') == receipt['contractSha256']
            and remote.get('state', {}).get('source', {}).get('head') == candidate,
            'QA_BACKEND_VERIFY_REMOTE_BINDING_CHANGED')
    predicates = remote.get('predicates')
    require(isinstance(predicates, dict) and all(predicates.get(key) is True for key in BACKEND_VERIFY_PREDICATES),
            'ALL_QA_BACKEND_VERIFY_PREDICATES_REQUIRED')
    if advance:
        source_advance_verification(contract, candidate, receipt, remote)
    elif recovery:
        require(not any(key in record for record in (receipt, remote) for key in ('sourceAdvance', 'backendBytesIdentical', 'noMigrationOrRestart')),
                'MIXED_RECOVERY_AND_SOURCE_ADVANCE_PROOF_REJECTED')
        require(receipt.get('recoveryNoRuntimeMutation') is True and remote.get('recoveryNoRuntimeMutation') is True,
                'READ_ONLY_RECOVERY_PROOF_REQUIRED')
        require(remote.get('originalApplyResultCreated') is False and remote.get('privateRecoveryJournalOnly') is True,
                'RECOVERY_RUNTIME_BOUNDARY_FLAGS_REQUIRED')
        provenance = receipt.get('interruptedApply')
        keys = {'originalOperatorSha256', 'originalContractSha256', 'candidateCommit', 'failedApplyReceipt',
                'failurePhase', 'failureResult', 'failureErrorCode', 'applyResultAbsent', 'checkpointVerified',
                'observedPid', 'observedRestarts', 'checkpointResultSha256', 'applyIntentSha256', 'applyFailureRecordSha256'}
        require(isinstance(provenance, dict) and set(provenance) == keys and remote.get('interruptedApply') == provenance,
                'EXACT_INTERRUPTED_APPLY_PROVENANCE_REQUIRED')
        require(provenance['originalOperatorSha256'] == BACKEND_DRIVER_SHA256
                and valid_hash(provenance['originalContractSha256']) and provenance['originalContractSha256'] != receipt['contractSha256']
                and provenance['candidateCommit'] == candidate and provenance['failurePhase'] == 'apply'
                and provenance['failureResult'] == 'FAILED_FORWARD_REPAIR_REQUIRED' and provenance['failureErrorCode'] == 'QA_HEALTH_NOT_READY'
                and provenance['applyResultAbsent'] is True and provenance['checkpointVerified'] is True
                and all(valid_hash(provenance[key]) for key in ('checkpointResultSha256', 'applyIntentSha256', 'applyFailureRecordSha256')),
                'INTERRUPTED_APPLY_BINDING_CHANGED')
        own = remote['state'].get('pm2', {}).get('own', {})
        require(type(provenance['observedPid']) is int and provenance['observedPid'] > 1
                and type(provenance['observedRestarts']) is int and provenance['observedRestarts'] >= 0
                and own.get('pid') == provenance['observedPid'] and own.get('restarts') == provenance['observedRestarts']
                and own.get('pmId') == 5 and own.get('name') == 'melamedia-api', 'RECOVERY_PROCESS_BINDING_CHANGED')
        failure = checked_json(provenance['failedApplyReceipt'])
        failed_remote = failure.get('remote', {}) if isinstance(failure, dict) else {}
        require(isinstance(failure, dict) and isinstance(failed_remote, dict) and failure.get('kind') == 'QA_ONLY_BACKEND_RELEASE'
                and failure.get('phase') == 'apply' and failure.get('result') == provenance['failureResult']
                and failure.get('driverSha256') == provenance['originalOperatorSha256']
                and failure.get('contractSha256') == provenance['originalContractSha256'] and failure.get('candidateCommit') == candidate
                and failure.get('target') == BACKEND_TARGET and failure.get('sshAttempted') is True
                and type(failure.get('transportExitCode')) is int and failure['transportExitCode'] == 1
                and failed_remote.get('phase') == 'apply' and failed_remote.get('result') == provenance['failureResult']
                and failed_remote.get('contractSha256') == provenance['originalContractSha256']
                and failed_remote.get('errorCode') == provenance['failureErrorCode'], 'ACTUAL_FAILED_APPLY_RECEIPT_REQUIRED')
    else:
        require(not any(key in record for record in (receipt, remote) for key in ('interruptedApply', 'recoveryNoRuntimeMutation', 'sourceAdvance', 'backendBytesIdentical', 'noMigrationOrRestart')),
                'MIXED_HISTORICAL_AND_RECOVERY_PROOF_REJECTED')
    try:
        verified = datetime.datetime.fromisoformat(remote['verifiedAt'].replace('Z', '+00:00'))
        require(verified.tzinfo is not None and verified.utcoffset() == datetime.timedelta(0), 'QA_BACKEND_VERIFY_UTC_TIMESTAMP_REQUIRED')
    except (KeyError, TypeError, ValueError, AttributeError):
        raise Stop('QA_BACKEND_VERIFY_UTC_TIMESTAMP_REQUIRED')
    # Upload/verify retain this exact proof; checkpoint and entrypoint publication
    # require a recent observation. Historical static rollback must remain possible
    # after a later legitimate backend/branch advance and does not claim its state.
    if phase in ('checkpoint', 'publish'):
        age = datetime.datetime.now(datetime.timezone.utc).timestamp() - verified.timestamp()
        require(0 <= age <= 1800, 'FRESH_QA_BACKEND_VERIFY_REQUIRED')
    return receipt


def source_advance_verification(contract, candidate, receipt, remote):
    """Bind a source-only FF to its actual old recovery and unchanged backend bytes."""
    require(all(record.get('backendBytesIdentical') is True and record.get('noMigrationOrRestart') is True
                for record in (receipt, remote)), 'SOURCE_ONLY_ADVANCE_FLAGS_REQUIRED')
    require(not any('recoveryNoRuntimeMutation' in record for record in (receipt, remote)),
            'SOURCE_ADVANCE_MUST_NOT_IMPERSONATE_RECOVERY')
    advance = receipt.get('sourceAdvance')
    keys = {'fromCommit', 'toCommit', 'mainAncestor', 'backendMapSha256', 'backendFileCount',
            'previousRecoveryVerification', 'currentObservation', 'observedPid', 'observedRestarts', 'gitFastForwardOnly'}
    require(isinstance(advance, dict) and set(advance) == keys and remote.get('sourceAdvance') == advance,
            'EXACT_SOURCE_ADVANCE_PROVENANCE_REQUIRED')
    require(advance['fromCommit'] == BACKEND_SOURCE_ADVANCE_BASE and advance['toCommit'] == candidate
            and isinstance(candidate, str) and re.fullmatch('[a-f0-9]{40}', candidate) and candidate != BACKEND_SOURCE_ADVANCE_BASE
            and isinstance(advance['mainAncestor'], str) and re.fullmatch('[a-f0-9]{40}', advance['mainAncestor'])
            and advance['mainAncestor'] == contract.get('mainCommit') and advance['gitFastForwardOnly'] is True
            and type(advance['backendFileCount']) is int and advance['backendFileCount'] == 807
            and valid_hash(advance['backendMapSha256']), 'SOURCE_ADVANCE_COMMITS_OR_SCOPE_CHANGED')
    previous = checked_json(advance['previousRecoveryVerification'])
    require(isinstance(previous, dict) and previous.get('kind') == 'QA_ONLY_BACKEND_RELEASE_RECOVERY'
            and previous.get('result') == BACKEND_RECOVERY_VERIFY_RESULT
            and previous.get('driverSha256') == BACKEND_RECOVERY_DRIVER_SHA256,
            'ACTUAL_PRIOR_RECOVERY_PROOF_REQUIRED')
    # The interrupted apply is historical9af. It must not be relabelled as newQ.
    backend_verification({'qaBackendExpectedCommit':BACKEND_SOURCE_ADVANCE_BASE,
                          'qaBackendVerification':advance['previousRecoveryVerification']},
                         BACKEND_SOURCE_ADVANCE_BASE, 'rollback')
    prior_remote = previous['remote']
    require(receipt.get('interruptedApply') == remote.get('interruptedApply') == previous.get('interruptedApply')
            and receipt['interruptedApply'].get('candidateCommit') == BACKEND_SOURCE_ADVANCE_BASE,
            'HISTORICAL_INTERRUPTED_APPLY_MUST_STAY_AT_BASE')
    state = remote['state']; prior_state = prior_remote['state']
    files = state['source'].get('backendFiles'); prior_files = prior_state['source'].get('backendFiles')
    require(isinstance(files, dict) and len(files) == advance['backendFileCount'] and files == prior_files
            and all(isinstance(path, str) and path.startswith('backend/') and valid_hash(digest) for path, digest in files.items())
            and sha(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()) == advance['backendMapSha256'],
            'FULL_BACKEND_MAP_MUST_REMAIN_BYTE_IDENTICAL')
    require(state['source'].get('branch') == 'DETACHED' and state['source'].get('trackedClean') is True,
            'SOURCE_ADVANCE_DETACHED_CLEAN_REQUIRED')
    own = state.get('pm2', {}).get('own', {}); prior_own = prior_state.get('pm2', {}).get('own', {})
    require(type(advance['observedPid']) is int and advance['observedPid'] == 1610075
            and type(advance['observedRestarts']) is int and advance['observedRestarts'] == 9
            and own.get('pid') == prior_own.get('pid') == advance['observedPid']
            and own.get('restarts') == prior_own.get('restarts') == advance['observedRestarts']
            and own.get('pmId') == 5 and own.get('name') == 'melamedia-api', 'SOURCE_ADVANCE_PROCESS_MUST_NOT_RESTART')
    observed = checked_json(advance['currentObservation'])
    require(isinstance(observed, dict) and observed.get('kind') == 'READ_ONLY_QA_BASELINE_OBSERVATION'
            and observed.get('driverSha256') == BACKEND_OBSERVER_SHA256 and observed.get('host') == BACKEND_TARGET['host']
            and observed.get('sshAttempted') is True and type(observed.get('transportExitCode')) is int
            and observed['transportExitCode'] == 2 and observed.get('result') == 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH',
            'ACTUAL_PRE_ADVANCE_OBSERVATION_REQUIRED')
    try:
        chronology = [datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
                      for value in (prior_remote['verifiedAt'], observed['at'], remote['verifiedAt'])]
        require(all(value.tzinfo is not None and value.utcoffset() == datetime.timedelta(0) for value in chronology)
                and chronology[0] <= chronology[1] <= chronology[2], 'SOURCE_ADVANCE_OBSERVATION_CHRONOLOGY_CHANGED')
    except (KeyError, TypeError, ValueError, AttributeError):
        raise Stop('SOURCE_ADVANCE_OBSERVATION_CHRONOLOGY_CHANGED')
    observation = observed.get('observation', {}); before = observation.get('before'); after = observation.get('after')
    require(isinstance(before, dict) and observation.get('stateStable') is True and before == after
            and before.get('source', {}).get('head') == BACKEND_SOURCE_ADVANCE_BASE
            and before['source'].get('branch') == 'DETACHED' and before['source'].get('trackedClean') is True
            and before['source'].get('backendFiles') == files
            and all(key in prior_state and prior_state[key] == value for key, value in before.items()),
            'PRE_ADVANCE_OBSERVATION_MUST_MATCH_OLD_RECOVERY')
    health = observation.get('health', {})
    require(all(isinstance(health.get(key), dict) and health[key].get('status') == 200 and valid_hash(health[key].get('bodySha256'))
                for key in ('local', 'public')) and health['local']['bodySha256'] == health['public']['bodySha256']
            and observation.get('resources', {}).get('meetsConservativeAvailableMemoryGate') is True,
            'PRE_ADVANCE_HEALTH_OR_HEADROOM_UNQUALIFIED')


def common(contract, phase, execute):
    require(contract.get('schemaVersion') == 1 and contract.get('scope') == SCOPE and
            contract.get('tenant') == 'melamedia' and contract.get('host') == HOST and
            contract.get('publicRoot') == PUBLIC, 'FIXED_QA_TARGET_REQUIRED')
    require(contract.get('operatorSha256') == sha(OPERATOR.read_bytes()) and
            contract.get('runnerSha256') == sha(pathlib.Path(__file__).read_bytes()), 'PREP_SOURCE_CHANGED')
    require(contract.get('backendChanges') is False and contract.get('customerPublication') is False and
            contract.get('oldChunksDeleted') == 0 and contract.get('rootPublicUploads') == 0 and
            contract.get('providerCalls') is False, 'STATIC_QA_ONLY_SCOPE')
    if execute:
        require(contract.get('sealedByRoot') is True, 'UNSEALED_PACKET_NO_EXECUTION')
        reviews(contract)
    c = {'scope': SCOPE, 'tenant': 'melamedia', 'rootOrHost': PUBLIC,
         'operatorSha256': contract['operatorSha256'], 'backendChanges': False,
         'oldChunksDeleted': 0, 'rootPublicUploads': 0}
    if phase == 'observe':
        # This phase observes public static files only, without a backend claim.
        # Historical1161 observation packets remain usable before backend release.
        expected = contract.get('qaBackendExpectedCommit')
        require(expected == QA_BASE or (isinstance(expected, str) and re.fullmatch('[a-f0-9]{40}', expected)
                and expected == contract.get('qaCommit')), 'OBSERVATION_BACKEND_ANCHOR')
        require(re.fullmatch('[a-f0-9]{32}', contract.get('observationNonce', '')), 'FRESH_OBSERVATION_NONCE_REQUIRED')
        c['observationNonce'] = contract['observationNonce']
        return c, b''
    return packet(contract, c, phase)

def packet(contract, c, phase):
    h = helpers()
    main, candidate = contract.get('mainCommit'), contract.get('qaCommit')
    require(all(isinstance(v, str) and re.fullmatch('[a-f0-9]{40}', v) for v in (main, candidate)), 'FROZEN_MAIN_AND_QA_COMMITS_REQUIRED')
    backend_verification(contract, candidate, phase)
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
    identity.update({'qaBackendExpectedCommit': contract['qaBackendExpectedCommit'],
                     'qaBackendVerification': contract['qaBackendVerification']})
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
    parser.add_argument('--contract', default=str(OPERATOR.parent / 'contract.example.json'))
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
                          'for non-observe: exact candidate backend verify receipt; at most1800s old for checkpoint/publish',
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
