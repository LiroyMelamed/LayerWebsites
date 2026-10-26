#!/usr/bin/env python3
"""Reviewed static-only publication. Default is a local plan, never a network call.

Contract changes may refresh backend proof only; stage identity binds all source,
artifact, target and public-baseline inputs. A failed mutating phase never retries.
FTPS uses a private local operator lock and immediate hash checks around verified
TLS rename. It does not claim a server-native atomic compare-and-swap primitive.
"""
import argparse, base64, datetime, fcntl, ftplib, hashlib, io, json, os, pathlib
import re, shlex, ssl, stat, subprocess, sys, tarfile

ROOT = pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OUT = ROOT / 'outputs/word-stage-candidate-20261026/frontend'
PRIVATE = pathlib.Path('/Users/liroymelamed/.codex/private/legal-word-stage-20261026/customer-frontend-publisher')
CREDENTIALS = pathlib.Path('/Users/liroymelamed/Projects/LayerWebsites/frontend/.env.ftp.local')
BACKEND_HISTORY = ROOT / 'outputs/word-stage-candidate-20261026/ops'
TARGETS = {'morlevy': ('ssh', '/var/www/morlevy'), 'ashrafessa': ('ssh', '/var/www/ashrafessa'), 'melamedlaw': ('ftps', 'server01.funet.co.il')}
SOURCES = {'ashrafessa': '596aa5b7eb9b40f8cd5f6927132955ff6caf2175', 'melamedlaw': '0631caf7b1c829673887e12c1d2e3ffc36c1715b', 'morlevy': 'a50afb3fccaaee17633328ef62b5695336d73090'}
BASES = {'ashrafessa': 'ea7df270d591aefa66acb81a73eac81f3aba9d6f', 'melamedlaw': 'e3f62861135642cf6fe5278d1afbb7388a4c8180', 'morlevy': 'cae9a0456fabd1ae144da2b81751c06b2308dc91'}
ROLLBACKS = {'ashrafessa': '501d87cdc562b6778a73f17dc5d058757d6244ff', 'melamedlaw': '22e865a0a5e22eaadaca564ff7eaddadabe47c87', 'morlevy': 'ceb5d44ba418519c2558a404518ac63c8765a9c7'}
BRANCHES = {'melamedlaw': 'MelamedLaw', 'morlevy': 'MorLevi', 'ashrafessa': 'AshrafEssa'}
MUTABLE = ('asset-manifest.json', 'index.html')
PHASES = ('checkpoint', 'upload', 'publish', 'verify', 'rollback')
PREDICATES = ('namedBranchExact','sourceBytesExact','signingGuard103Passed',
 'protected97UnchangedAnd6Revalidated','environmentOnlyOwnedWordDelta','pm2LaunchPreserved',
 'otherProcessesPreserved','providerConnectionsAndBudgetsPreserved',
 'producerCaptureDispatchAndRealWhatsAppOff','schemaQualified','exactFiveMigrationsRecorded',
 'unrelatedMigrationHistoryPreserved','localHealthReady','privateRecoveryMaterialVerified',
 'forwardRollbackLineageVerified','dependenciesAndConverterStable')
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


class Stop(RuntimeError):
    pass


def require(ok, code):
    if not ok:
        raise Stop(code)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def valid_hash(v):
    return isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) is not None


def safe_path(p, write=False):
    if not isinstance(p, str) or not p or p.startswith('/') or re.search(r'[\\\x00-\x1f%?#:]', p):
        return False
    if any(x in ('', '.', '..') or x.startswith('.env') for x in p.split('/')):
        return False
    if write:
        return p in MUTABLE or re.fullmatch(r'static/(?:js|css|media)/[A-Za-z0-9_.-]+', p) is not None
    return p.startswith('static/') or p.startswith('.well-known/') or p == '.htaccess' or '/' not in p


def checked_json(binding):
    require(isinstance(binding, dict) and valid_hash(binding.get('sha256')), 'UNSEALED_LOCAL_EVIDENCE')
    p = pathlib.Path(binding['path'])
    require(not p.is_symlink() and p.is_file(), 'EVIDENCE_LINK_OR_MISSING')
    raw = p.read_bytes()
    require(sha(raw) == binding['sha256'], 'LOCAL_EVIDENCE_BYTES_CHANGED')
    return json.loads(raw)


def check_archive(raw, files):
    require(0 < len(raw) <= 30000000, 'ARCHIVE_SIZE_LIMIT')
    found, total = {}, 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as a:
        for m in a.getmembers():
            require(m.isfile() and not m.islnk() and not m.issym() and safe_path(m.name, True), 'ARCHIVE_MEMBER_SCOPE')
            require(m.name in files and m.name not in found and 0 <= m.size <= 20000000, 'ARCHIVE_MEMBER_UNEXPECTED')
            total += m.size
            require(total <= 150000000, 'ARCHIVE_EXPANSION_LIMIT')
            b = a.extractfile(m).read()
            require(len(b) == m.size and sha(b) == files[m.name], 'ARCHIVE_MEMBER_HASH_CHANGED')
            found[m.name] = b
    require(set(found) == set(files), 'ARCHIVE_MEMBERS_MISSING')
    return found


def check_index(old_index, new_index, old_manifest, new_manifest, mapping):
    old, new = json.loads(old_manifest), json.loads(new_manifest)
    require(isinstance(mapping, dict) and set(mapping) == set(old['entrypoints']), 'OLD_ENTRYPOINT_MAP_SCOPE')
    require(set(mapping.values()) == set(new['entrypoints']) and len(set(mapping.values())) == len(mapping), 'NEW_ENTRYPOINT_MAP_SCOPE')
    require(all(safe_path(x, True) and x.startswith('static/') for x in [*mapping, *mapping.values()]), 'ENTRYPOINT_MAP_PATH')
    def replace(data, values):
        patterns = {k.encode(): v.encode() for k, v in values.items()}
        return re.sub(b'|'.join(re.escape(x) for x in sorted(patterns, key=len, reverse=True)),
                      lambda m: patterns[m.group(0)], data)
    require(replace(old_index, mapping) == new_index and replace(new_index, {v: k for k, v in mapping.items()}) == old_index,
            'INDEX_BOOTSTRAP_OR_OTHER_BYTES_CHANGED')


def receipt_time(v):
    text = v.get('observation', {}).get('at') or v.get('at')
    require(isinstance(text, str), 'BACKEND_RECEIPT_TIME_MISSING')
    return datetime.datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()


def backend_gate(target, tenant, phase, required=True):
    binding = target.get('backendProof')
    if binding is None and not required: return None
    require(binding is not None, 'FRESH_BACKEND_RELEASE_PROOF_REQUIRED')
    receipt = checked_json(binding)
    observation = receipt.get('observation', receipt)
    # Frontend-only recovery may retain a healthy candidate backend; an actual
    # backend recovery instead requires its separate fresh rollback receipt.
    rollback = phase == 'rollback' and receipt.get('phase') == 'rollback'
    expected_source = ROLLBACKS[tenant] if rollback else SOURCES[tenant]
    expected_result = ('PASS_CONDITIONAL_FORWARD_BASE_TREE_AND_OWNED_CONFIG_ROLLBACK' if rollback
                       else 'PASS_FRESH_BACKEND_CODE_SCHEMA_SINGLE_CONFIG_OFF_BINDING')
    require(receipt.get('tenant') == tenant and receipt.get('exitCode') == 0 and
            receipt.get('phase') == ('rollback' if rollback else 'verify'), 'BACKEND_TARGET_OR_PHASE')
    require(observation.get('contractSha256') == receipt.get('contractSha256') and observation.get('phase') == receipt.get('phase'), 'BACKEND_INNER_OUTER_BINDING_CHANGED')
    require(receipt.get('candidateCommit') == SOURCES[tenant] and receipt.get('sourceCommit') == expected_source and
            valid_hash(receipt.get('contractSha256')), 'BACKEND_SOURCE_OR_CONTRACT_BINDING')
    require(observation.get('result') == expected_result and observation.get('tenant') == tenant,
            'BACKEND_RESULT_OR_BRANCH_BINDING')
    if rollback:
        require(receipt.get('recoveryApprovalSha256') == observation.get('recoveryApprovalSha256'), 'ROLLBACK_RECOVERY_BINDING_CHANGED')
        require(observation.get('state',{}).get('branch') == BRANCHES[tenant] and
                observation.get('sourceCommit') == expected_source and
                observation.get('healthProof',{}).get('ready') is True and
                observation.get('wholeDatabaseRestorePerformed') is False and
                observation.get('additiveSchemaAndHistoryRetained') is True and
                observation.get('originalEnvironmentBytesRestored') is True and
                valid_hash(observation.get('recoveryApprovalSha256')), 'BACKEND_ROLLBACK_PRESERVATION_REQUIRED')
    else:
        require(observation.get('branch') == BRANCHES[tenant] and observation.get('sourceCommit') == expected_source and
                observation.get('candidateCommit') == SOURCES[tenant], 'BACKEND_RESULT_OR_BRANCH_BINDING')
        require(all(observation.get('predicates', {}).get(k) is True for k in PREDICATES), 'BACKEND_RELEASE_PREDICATE')
    require(observation.get('state', {}).get('process', {}).get('status') == 'online', 'BACKEND_NOT_ONLINE')
    stamp = receipt_time(receipt)
    require(-60 <= datetime.datetime.now(datetime.timezone.utc).timestamp() - stamp <= 600, 'BACKEND_RECEIPT_NOT_FRESH')
    for path in BACKEND_HISTORY.glob('*.json'):
        try: later = json.loads(path.read_text())
        except (ValueError, OSError): continue
        if later.get('tenant') == tenant and later.get('phase') in ('activate','verify','rollback') and later.get('at'):
            require(receipt_time(later) <= stamp or sha(path.read_bytes()) == binding['sha256'], 'LATER_BACKEND_OPERATION_REQUIRES_NEW_PROOF')
    return {'receiptSha256': binding['sha256'], 'contractSha256': receipt['contractSha256'],
            'sourceCommit': expected_source, 'candidateCommit': SOURCES[tenant],
            'verifiedAt': stamp, 'allPredicatesPassed': True}


def load_packet(contract, tenant, phase, execute=False):
    require(contract.get('schemaVersion') == 1 and contract.get('scope') ==
            'Legal Word stage gated WhatsApp three-customer static publication', 'PUBLICATION_SCOPE')
    require(contract.get('environmentWrites') is False and contract.get('providerCalls') is False and
            contract.get('oldChunksDeleted') == 0 and contract.get('rootPublicUploads') == 0, 'STATIC_ONLY_SCOPE')
    require(contract.get('retentionReviewDate') == '2026-11-02', 'RETENTION_PIN_REQUIRED')
    require(contract.get('scriptSha256') == sha(pathlib.Path(__file__).read_bytes()), 'PUBLISHER_SOURCE_CHANGED')
    target = contract['targets'][tenant]
    require((target.get('transport'),target.get('rootOrHost')) == TARGETS[tenant], 'TARGET_CHANGED')
    require(target.get('sourceCommit') == SOURCES[tenant] and target.get('baseCommit') == BASES[tenant], 'UNREVIEWED_SOURCE')
    frozen = checked_json(contract['frozenCandidates'])
    guards = checked_json(contract['frozenGuardsAndRecovery'])
    own = frozen['clients'][tenant]
    require(own['candidate'] == SOURCES[tenant] and own['base'] == BASES[tenant] and
            own.get('outsideAllowlistChanged') is False and own.get('brandingPublicAssetsChanged') is False,
            'TENANT_DELTA_NOT_QUALIFIED')
    require(guards['guard'] == 'PASS_FOUR_FROZEN_103_FILE_MANIFESTS' and
            guards['checks'][tenant]['commit'] == SOURCES[tenant] and guards['checks'][tenant]['exitCode'] == 0 and
            guards['rollbackCandidates'][tenant]['commit'] == ROLLBACKS[tenant], 'SOURCE_GUARD_OR_RECOVERY_CHANGED')
    repo = pathlib.Path(own['worktree'])
    git = lambda *args: subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.PIPE).decode().strip()
    require(git('rev-parse',SOURCES[tenant]+'^') == BASES[tenant], 'CANDIDATE_PARENT_CHANGED')
    require(set(git('diff','--name-only',BASES[tenant],SOURCES[tenant]).splitlines()) == set(frozen['allowlist']), 'EXACT_RELEASE_DELTA_CHANGED')
    built_source = target.get('builtSourceCommit', SOURCES[tenant])
    require(isinstance(built_source,str) and re.fullmatch('[a-f0-9]{40}',built_source), 'EXACT_BUILD_SOURCE_REQUIRED')
    if built_source != SOURCES[tenant]:
        # Backend-only concurrency configuration does not invalidate a compiled UI.
        # Verify this on Git objects rather than relabeling the original receipt.
        require(git('rev-parse',built_source+':frontend') == git('rev-parse',SOURCES[tenant]+':frontend') and
                git('rev-parse',built_source+':scripts') == git('rev-parse',SOURCES[tenant]+':scripts'), 'FRONTEND_BUILD_INPUT_TREE_CHANGED')
        delta = git('diff','--name-only',built_source,SOURCES[tenant]).splitlines()
        require(delta and all(p.startswith('backend/') for p in delta), 'BUILD_SOURCE_ALIAS_NOT_BACKEND_ONLY')
    build = checked_json(target['buildReceipt'])
    require(build.get('tenant') == tenant and build.get('candidateCommit') == built_source and
            build.get('headAtFinish') == built_source and build.get('baseCommit') == BASES[tenant] and
            build.get('localIntegrationPreviewOnlyNotDeployedQACandidate') is False, 'BUILD_SOURCE_OR_TARGET')
    artifact = build
    if target.get('artifactQualification'):
        qualification = checked_json(target['artifactQualification'])
        require(qualification.get('result') == 'PASS_EXISTING_COMPILE_ARTIFACT_PROVENANCE_NO_REBUILD' and
                qualification.get('tenant') == tenant and qualification.get('candidateCommit') == built_source and
                qualification.get('baseCommit') == BASES[tenant] and qualification.get('originalCompileReceipt') == target['buildReceipt'] and
                qualification.get('sourceStableAtRequalification') is True and qualification.get('dependencyStable') is True and
                qualification.get('compileRerun') is False and qualification.get('noRemoteOrSourceOrDependencyMutation') is True and
                qualification.get('rootPublicAssetsToUpload') == 0 and qualification.get('oldChunksDeleted') == 0,
                'EXISTING_COMPILE_ARTIFACT_QUALIFICATION_REQUIRED')
        require(build.get('result') == 'FAIL_ARTIFACT_PROVENANCE_GATE_AFTER_COMPILE' and
                'MISSING_OR_WRONG_TENANT_BRANDING:manifest.json' in build.get('artifactError',''), 'UNREVIEWED_COMPILE_GATE_FAILURE')
        artifact = qualification
    else:
        require(build.get('result') == 'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED', 'COMPILE_ARTIFACT_NOT_QUALIFIED')
    require(build.get('exitCode') == 0 and
            build.get('sourceStable') is True and build.get('sourceDrift') == [] and
            build.get('dependencyStable') is True and build.get('publicAssetsRestoredAfterBuild') is True and
            build.get('localPublicEnvironmentScratchRestored') is True, 'BUILD_PRESERVATION_NOT_PROVEN')
    provenance = checked_json(target['emittedSourceProof'])
    require(provenance.get('result') == 'QUALIFIED_FROZEN_CLIENT_BUILD_EMITTED_SOURCES' and
            provenance.get('candidateCommit') == built_source and provenance.get('baseCommit') == BASES[tenant] and
            provenance.get('buildReceiptSha256') == target['buildReceipt']['sha256'], 'EMITTED_SOURCE_PROVENANCE_REQUIRED')
    require(all(provenance.get(k) == [] for k in ('unknownOrMissing','nonEolDifferences','nullSourceContents','newMappedOutsideReleaseDelta')), 'UNQUALIFIED_EMITTED_SOURCE')
    files = checked_json(target['publicationFiles'])
    require(1 < len(files) <= 400 and len(files) == artifact['publicationReviewFileCount'] and
            all(safe_path(p,True) and valid_hash(h) for p,h in files.items()) and set(MUTABLE) <= set(files), 'STATIC_ALLOWLIST')
    raw = pathlib.Path(artifact['publicationReviewArchive']).read_bytes()
    require(sha(raw) == artifact['publicationReviewArchiveSha256'], 'ARCHIVE_CHANGED')
    payload = check_archive(raw,files)
    baseline = checked_json(target['historicalCompositeBaseline'])
    require(baseline.get('result') == 'QUALIFIED_POST38_INCUMBENT_PUBLIC_BASELINE' and
            baseline.get('tenant') == tenant and baseline.get('sourceCommit') == BASES[tenant] and
            baseline.get('freshRemoteObservation') is False, 'INCUMBENT_BASELINE_BINDING')
    # Every component is independently sealed; the current publication packet supplies
    # current HTML/manifest, and historical preflight supplies retained root assets/maps.
    previous = checked_json(baseline['publishedManifest'])
    previous_verify = checked_json(baseline['publishedVerifyReceipt'])
    require(previous_verify.get('tenant') == tenant and previous_verify.get('exitCode') == 0 and
            previous_verify.get('sourceCommit') == BASES[tenant] and previous_verify.get('observation',{}).get('result') ==
            'PASS_CURRENT_EXACT_STATIC_AND_PROTECTED_PUBLIC_READBACK_ONLY', 'PREVIOUS_PUBLICATION_NOT_VERIFIED')
    require(previous.get('tenant') == tenant and previous.get('sourceStable') is True and
            git('rev-parse',previous['sourceCommit']+'^{tree}') == git('rev-parse',BASES[tenant]+'^{tree}'), 'PREVIOUS_SOURCE_TREE_CHANGED')
    previous_raw = pathlib.Path(previous['deploymentArchive']).read_bytes()
    require(sha(previous_raw) == previous['archiveSha256'], 'PREVIOUS_ARCHIVE_CHANGED')
    old = check_archive(previous_raw,previous['files'])
    initial = checked_json(baseline['initialStaticReceipt'])
    initial_contract = checked_json(baseline['initialStaticContract'])
    require(initial.get('tenant') == tenant and initial.get('exitCode') == 0 and initial.get('contractSha256') ==
            baseline['initialStaticContract']['sha256'] and initial.get('result') == 'PASS_SCOPED_READ_ONLY_STATIC_PREFLIGHT', 'INITIAL_STATIC_CHAIN')
    initial_target = initial_contract['targets'][tenant]
    require((initial_target['transport'],initial_target['rootOrHost']) == TARGETS[tenant], 'INITIAL_TARGET_CHANGED')
    if tenant == 'melamedlaw':
        require(target.get('credentialPins') == {k:initial_target[k] for k in ('credentialFileSha256','configuredRemotePathSha256','remotePwdSha256')} and
                initial.get('observation',{}).get('verifiedFtpsTls') is True and initial['observation'].get('dataChannelPrivate') is True,
                'FTPS_PINS_OR_TLS_CHAIN')
    protected = {p:row['sha256'] for p,row in initial['observation']['files'].items()}
    maps = checked_json(baseline['initialAdditionalMapsReceipt'])
    require(maps.get('tenant') == tenant and maps.get('exitCode') == 0 and maps.get('observation',{}).get('indexManifestCasPassed') is True, 'ADDITIONAL_MAPS_CHAIN')
    for row in maps['observation'].get('maps',[]):
        p,h=row['path'],row['sha256']
        require(p not in protected or protected[p] == h, 'INITIAL_MAP_HASH_CONFLICT');protected[p]=h
    for p,h in previous['files'].items():
        require(p in MUTABLE or p not in protected or protected[p] == h, 'PREVIOUS_IMMUTABLE_HASH_CONFLICT')
        protected[p]=h
    require(baseline.get('protectedFiles') == protected and all(safe_path(p) and valid_hash(h) for p,h in protected.items()), 'COMPOSITE_BASELINE_CHANGED')
    require(all(sha(old[p]) == protected[p] for p in MUTABLE), 'CURRENT_MUTABLE_BASELINE_CHANGED')
    mapping = artifact['indexMergeProof']['entrypointMap']
    check_index(old['index.html'],payload['index.html'],old['asset-manifest.json'],payload['asset-manifest.json'],mapping)
    omitted = artifact.get('omittedPreexistingDebugMaps',[])
    for item in omitted:
        p=item['path'];runtime=p[:-4] if p.endswith('.map') else None
        require(p in protected and p not in files and protected[p] == item['retainedOldMapSha256'] and
                runtime in files and files[runtime] == protected.get(runtime) == item['runtimeSha256'], 'OMITTED_MAP_NOT_EXACT_RUNTIME')
    absent = initial['observation'].get('optionalAbsentOrUnavailable',[])
    require(all(safe_path(p) and p not in files and p not in previous['files'] for p in absent), 'OPTIONAL_ABSENCE_CHANGED')
    attestation = backend_gate(target,tenant,phase,required=execute and phase!='checkpoint') if target.get('backendProof') or (execute and phase!='checkpoint') else None
    identity={'scope':contract['scope'],'scriptSha256':contract['scriptSha256'],'tenant':tenant,
              'target':{k:v for k,v in target.items() if k!='backendProof'},'files':files,
              'protected':protected,'optionalAbsentOrUnavailable':absent}
    c={'tenant':tenant,'transport':target['transport'],'rootOrHost':target['rootOrHost'],'sourceCommit':SOURCES[tenant],
       'releaseBindingSha256':sha(canonical(identity)),'scriptSha256':contract['scriptSha256'],'files':files,
       'protected':protected,'optionalAbsentOrUnavailable':absent,'archiveBytes':len(raw),'archiveSha256':sha(raw),
       'backendAttestation':attestation,'credentialPins':target.get('credentialPins'),'retentionReviewDate':'2026-11-02'}
    return c,raw


class PrivateStage:
    def __init__(self, directory):
        self.directory = pathlib.Path(directory)

    def init(self, c):
        self.no_links(self.directory)
        require(not self.directory.exists(), 'PRIVATE_STAGE_ALREADY_EXISTS_NO_BLIND_RETRY')
        self.directory.mkdir(parents=True, mode=0o700)
        self.directory.chmod(0o700)
        self.write('.mela-retention-pin', ('Owner: Codex root; Legal Word/stage/gated WhatsApp frontend rollback; review 2026-11-02. Preserve all checkpoints and old/new chunks.\n').encode())
        self.write('journal.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'attempts': {}, 'events': []}))

    def write(self, name, value, exclusive=True):
        require('/' not in name and name not in ('', '.', '..'), 'PRIVATE_NAME_SCOPE')
        p = self.directory / name
        self.no_links(p)
        if exclusive:
            with p.open('xb') as f:
                os.chmod(p, 0o600); f.write(value); f.flush(); os.fsync(f.fileno())
        else:
            temp = p.with_name(p.name + '.tmp-' + str(os.getpid()))
            with temp.open('xb') as f:
                os.chmod(temp, 0o600); f.write(value); f.flush(); os.fsync(f.fileno())
            os.replace(temp, p)

    def read(self, name):
        p = self.directory / name; self.no_links(p)
        return p.read_bytes()

    @staticmethod
    def no_links(path):
        require(not any(p.is_symlink() for p in [path, *path.parents]), 'PRIVATE_STAGE_SYMLINK_REQUIRES_REVIEW')

    def journal(self, c, event, phase=None):
        j = json.loads(self.read('journal.json'))
        require(j['releaseBindingSha256'] == c['releaseBindingSha256'], 'PRIVATE_STAGE_BINDING_CHANGED')
        if phase:
            require(phase not in j['attempts'], 'PHASE_ALREADY_ATTEMPTED_NO_BLIND_RETRY')
            j['attempts'][phase] = {'at': now(), 'contractSha256': c['contractSha256']}
        j['events'].append({'at': now(), **event})
        self.write('journal.json', canonical(j), False)
        return j


class DiskPublic:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.no_links(self.root)
        require(self.root.is_dir(), 'PUBLIC_ROOT_NOT_DIRECTORY')

    @staticmethod
    def no_links(path):
        require(not any(p.is_symlink() for p in [path, *path.parents]), 'PUBLIC_SYMLINK_REQUIRES_REVIEW')

    def path(self, rel):
        require(safe_path(rel), 'PUBLIC_READ_SCOPE')
        p = self.root / rel; self.no_links(p)
        return p

    def read(self, rel):
        p = self.path(rel)
        if not p.exists(): return None
        require(p.is_file() and p.stat().st_size <= 20000000, 'PUBLIC_NOT_REGULAR_OR_SIZE')
        return p.read_bytes()

    def temporary(self, rel, data):
        p = self.path(rel)
        current = self.root
        for part in pathlib.PurePosixPath(rel).parts[:-1]:
            current /= part; self.no_links(current)
            if not current.exists(): current.mkdir(mode=0o755)
            require(current.is_dir(), 'PUBLIC_PARENT_NOT_DIRECTORY')
        temp = p.with_name('.' + p.name + '.legal-off-' + str(os.getpid()))
        mode = stat.S_IMODE(p.stat().st_mode) if p.exists() else 0o644
        with temp.open('xb') as f:
            os.chmod(temp, mode); f.write(data); f.flush(); os.fsync(f.fileno())
        if p.exists(): os.chown(temp, p.stat().st_uid, p.stat().st_gid)
        require(sha(temp.read_bytes()) == sha(data), 'TEMPORARY_READBACK_FAILED')
        return p, temp

    def put_new(self, rel, data):
        require(safe_path(rel, True) and rel.startswith('static/'), 'IMMUTABLE_WRITE_SCOPE')
        old = self.read(rel)
        if old is not None:
            require(sha(old) == sha(data), 'EXISTING_IMMUTABLE_BYTES_CONFLICT')
            return False
        p, temp = self.temporary(rel, data)
        # link is an atomic no-replace install, unlike rename over an existing chunk.
        try: os.link(temp, p)
        except FileExistsError:
            require(self.read(rel) == data, 'CONCURRENT_IMMUTABLE_BYTES_CONFLICT')
        require(self.read(rel) == data, 'IMMUTABLE_READBACK_FAILED')
        require(temp.read_bytes() == data, 'OWN_TEMP_CHANGED')
        temp.unlink()  # only this invocation's exact verified temporary; no chunk is deleted.
        return True

    def replace(self, rel, data, expected):
        require(rel in MUTABLE and sha(self.read(rel) or b'') == expected, 'MUTABLE_CAS_CHANGED')
        p, temp = self.temporary(rel, data)
        require(sha(self.read(rel) or b'') == expected, 'MUTABLE_CAS_CHANGED_BEFORE_RENAME')
        os.replace(temp, p)
        require(self.read(rel) == data, 'MUTABLE_READBACK_FAILED')


class FtpsPublic:
    def __init__(self, pins):
        raw = CREDENTIALS.read_bytes()
        require(pins and sha(raw) == pins['credentialFileSha256'], 'FTPS_CREDENTIAL_FILE_CHANGED')
        env = {k: v.strip().strip('"\x27') for k, v in (line.split('=', 1) for line in raw.decode().splitlines()
               if '=' in line and not line.lstrip().startswith('#'))}
        require(sha(env['MELAMED_LAW_FTP_REMOTE_PATH'].encode()) == pins['configuredRemotePathSha256'], 'CONFIGURED_FTPS_PATH_CHANGED')
        self.f = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=45)
        self.f.connect('server01.funet.co.il', 21)
        self.f.login(env['MELAMED_LAW_FTP_USERNAME'], env['MELAMED_LAW_FTP_PASSWORD']); self.f.prot_p()
        self.f.cwd(env['MELAMED_LAW_FTP_REMOTE_PATH']); self.pwd_hash = pins['remotePwdSha256']; self.pin()

    def pin(self):
        require(sha(self.f.pwd().encode()) == self.pwd_hash, 'FTPS_REMOTE_PWD_CHANGED')

    def close(self):
        try: self.f.quit()
        except Exception: self.f.close()

    def positively_absent(self, rel):
        parent, name = rel.rsplit('/', 1) if '/' in rel else ('.', rel)
        require(parent in ('.', '.well-known', 'static/js', 'static/css', 'static/media'), 'FTPS_ABSENCE_PARENT_NOT_REVIEWED')
        self.pin()
        try:
            entries = list(self.f.mlsd(parent, facts=['type']))
        except ftplib.all_errors:
            raise Stop('FTPS_ABSENCE_NOT_PROVEN_LISTING_UNAVAILABLE')
        require(len(entries) <= 20000, 'FTPS_ABSENCE_LISTING_LIMIT')
        require(all(isinstance(n, str) and '/' not in n and '\\' not in n for n, _ in entries), 'FTPS_MLSD_UNEXPECTED_NAMES')
        # 550 may mean an unreadable existing file. Only a completed parent
        # listing with no exact (or case-folded) basename proves absence.
        require(not any(n.casefold() == name.casefold() for n, _ in entries), 'FTPS_EXISTING_ENTRY_UNREADABLE_OR_UNAVAILABLE')
        self.pin()
        return True

    def read(self, rel):
        require(safe_path(rel), 'FTPS_READ_SCOPE'); self.pin(); out = io.BytesIO()
        def consume(b):
            require(out.tell() + len(b) <= 20000000, 'FTPS_READ_SIZE_LIMIT'); out.write(b)
        try: self.f.retrbinary('RETR ' + rel, consume, blocksize=65536); return out.getvalue()
        except ftplib.error_perm as e:
            if str(e).startswith('550') and self.positively_absent(rel): return None
            raise

    def temporary(self, rel, data):
        self.pin(); require(safe_path(rel, True), 'FTPS_WRITE_SCOPE')
        # These incumbent flat directories must already be readable; this
        # publisher never creates an unproven FTP parent or assumes 550=absent.
        require('/' not in rel or rel.rsplit('/', 1)[0] in ('static/js', 'static/css', 'static/media'), 'FTPS_WRITE_PARENT_SCOPE')
        temp = rel + '.legal-off-' + str(os.getpid())
        require(self.read(temp) is None, 'FTPS_TEMPORARY_ALREADY_EXISTS')
        self.f.storbinary('STOR ' + temp, io.BytesIO(data), blocksize=65536)
        require(self.read(temp) == data, 'FTPS_TEMPORARY_READBACK_FAILED')
        return temp

    def put_new(self, rel, data):
        require(safe_path(rel, True) and rel.startswith('static/'), 'FTPS_IMMUTABLE_SCOPE')
        old = self.read(rel)
        if old is not None:
            require(old == data, 'EXISTING_IMMUTABLE_BYTES_CONFLICT'); return False
        temp = self.temporary(rel, data); current = self.read(rel)
        if current is not None:
            require(current == data, 'CONCURRENT_IMMUTABLE_BYTES_CONFLICT'); return False
        self.pin(); self.f.rename(temp, rel)
        require(self.read(rel) == data, 'FTPS_IMMUTABLE_READBACK_FAILED')
        return True

    def replace(self, rel, data, expected):
        require(rel in MUTABLE and sha(self.read(rel) or b'') == expected, 'FTPS_MUTABLE_CAS_CHANGED')
        temp = self.temporary(rel, data)
        require(sha(self.read(rel) or b'') == expected, 'FTPS_MUTABLE_CAS_CHANGED_BEFORE_RENAME')
        self.pin(); self.f.rename(temp, rel)
        require(self.read(rel) == data, 'FTPS_MUTABLE_READBACK_FAILED')


def check_public(adapter, c, mutable_hashes):
    for p, h in c['protected'].items():
        expected = mutable_hashes[p] if p in MUTABLE else h
        b = adapter.read(p)
        require(b is not None and sha(b) == expected, 'PUBLIC_BASELINE_OR_MUTABLE_DRIFT:' + p)
    for p in c['optionalAbsentOrUnavailable']:
        require(adapter.read(p) is None, 'OPTIONAL_PUBLIC_OBSERVATION_CHANGED:' + p)


def check_chunks(adapter, c):
    for p, h in c['files'].items():
        if p.startswith('static/'):
            b = adapter.read(p); require(b is not None and sha(b) == h, 'IMMUTABLE_READBACK_CHANGED:' + p)


def fresh_attestation(c):
    a = c.get('backendAttestation')
    require(a and a['allPredicatesPassed'] is True and a['candidateCommit'] == c['sourceCommit'], 'BACKEND_OFF_ATTESTATION_REQUIRED')
    require(-60 <= datetime.datetime.now(datetime.timezone.utc).timestamp() - a['verifiedAt'] <= 600, 'BACKEND_OFF_ATTESTATION_EXPIRED')


def operation(adapter, stage, c, phase, raw=None):
    require(phase in PHASES, 'PHASE_SCOPE')
    old_hash = {p: c['protected'][p] for p in MUTABLE}; new_hash = {p: c['files'][p] for p in MUTABLE}
    if phase == 'checkpoint':
        check_public(adapter, c, old_hash)
        existing = {}
        for p, h in c['files'].items():
            if not p.startswith('static/'): continue
            b = adapter.read(p)
            if b is not None:
                require(sha(b) == h, 'EXISTING_IMMUTABLE_BYTES_CONFLICT:' + p); existing[p] = h
        stage.init(c)
        for p in MUTABLE: stage.write('old-' + p, adapter.read(p))
        stage.write('checkpoint.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'existingImmutable': existing, 'oldMutable': old_hash}))
        stage.journal(c, {'step': 'checkpoint-complete'}, phase)
        check_public(adapter, c, old_hash)
        return {'result': 'PASS_PRIVATE_FRONTEND_CHECKPOINT_ONLY', 'existingImmutableFiles': len(existing)}
    checkpoint = json.loads(stage.read('checkpoint.json'))
    require(checkpoint['releaseBindingSha256'] == c['releaseBindingSha256'], 'CHECKPOINT_BINDING_CHANGED')
    for p in MUTABLE: require(sha(stage.read('old-' + p)) == old_hash[p], 'PRIVATE_OLD_MUTABLE_CHANGED')
    if phase == 'upload':
        fresh_attestation(c); check_public(adapter, c, old_hash)
        require(raw is not None and len(raw) == c['archiveBytes'] and sha(raw) == c['archiveSha256'], 'TRANSFER_ARCHIVE_CHANGED')
        files = check_archive(raw, c['files']); stage.journal(c, {'step': 'before-immutable-assets'}, phase)
        for p in MUTABLE: stage.write('new-' + p, files[p])
        created = reused = 0
        for p in sorted(files):
            if not p.startswith('static/'): continue
            stage.journal(c, {'step': 'before-immutable-file', 'path': p, 'sha256': c['files'][p]})
            if adapter.put_new(p, files[p]): created += 1
            else: reused += 1
        check_chunks(adapter, c); check_public(adapter, c, old_hash)
        stage.write('assets-complete.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'created': created, 'reused': reused}))
        stage.journal(c, {'step': 'immutable-assets-complete', 'created': created, 'reused': reused})
        return {'result': 'PASS_IMMUTABLE_ASSETS_FIRST_OLD_INDEX_UNCHANGED', 'created': created, 'reused': reused}
    require(json.loads(stage.read('assets-complete.json'))['releaseBindingSha256'] == c['releaseBindingSha256'], 'ASSETS_PHASE_NOT_COMPLETE')
    if phase == 'publish':
        fresh_attestation(c); check_public(adapter, c, old_hash); check_chunks(adapter, c)
        stage.journal(c, {'step': 'before-mutable-publication'}, phase)
        for p in MUTABLE:  # manifest first; live HTML index is the last write.
            data = stage.read('new-' + p); require(sha(data) == new_hash[p], 'PRIVATE_NEW_MUTABLE_CHANGED')
            fresh_attestation(c); stage.journal(c, {'step': 'before-mutable-rename', 'path': p, 'expectedOldSha256': old_hash[p], 'newSha256': new_hash[p]})
            adapter.replace(p, data, old_hash[p]); stage.journal(c, {'step': 'mutable-replaced', 'path': p})
        check_public(adapter, c, new_hash); check_chunks(adapter, c)
        stage.write('published.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'mutableHashes': new_hash}))
        stage.journal(c, {'step': 'publication-complete'})
        return {'result': 'PASS_EXACT_STATIC_PUBLICATION_NOT_BROWSER_QA', 'indexSha256': new_hash['index.html'], 'assetsFirstIndexLast': True}
    if phase == 'verify':
        fresh_attestation(c)
        require(json.loads(stage.read('published.json'))['releaseBindingSha256'] == c['releaseBindingSha256'], 'PUBLICATION_NOT_COMPLETE')
        check_public(adapter, c, new_hash); check_chunks(adapter, c)
        return {'result': 'PASS_CURRENT_EXACT_STATIC_AND_PROTECTED_PUBLIC_READBACK_ONLY', 'indexSha256': new_hash['index.html']}
    require(phase == 'rollback', 'PHASE_SCOPE')
    fresh_attestation(c)
    current = {}
    for p in MUTABLE:
        b = adapter.read(p); h = sha(b) if b is not None else None
        require(h in (old_hash[p], new_hash[p]), 'UNKNOWN_ACTOR_MUTABLE_BYTES_STOP:' + p); current[p] = h
    # Protected public files and old chunks must remain unchanged even on rollback.
    for p, h in c['protected'].items():
        if p not in MUTABLE:
            b = adapter.read(p); require(b is not None and sha(b) == h, 'PROTECTED_PUBLIC_DRIFT_ON_ROLLBACK:' + p)
    stage.journal(c, {'step': 'before-only-two-mutable-rollback'}, phase)
    for p in MUTABLE:
        if current[p] != old_hash[p]:
            stage.journal(c, {'step': 'before-old-mutable-rename', 'path': p, 'expectedSha256': current[p]})
            adapter.replace(p, stage.read('old-' + p), current[p])
    check_public(adapter, c, old_hash)
    stage.write('rolled-back.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'oldMutableRestored': old_hash, 'chunksDeleted': 0}))
    stage.journal(c, {'step': 'rollback-complete-old-and-new-chunks-retained'})
    return {'result': 'PASS_ONLY_OLD_INDEX_MANIFEST_RESTORED_CHUNKS_RETAINED', 'indexSha256': old_hash['index.html']}


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
ns={'__name__':'publisher_remote','__file__':'reviewed-publish-word-stage03.py'}
exec(compile(code,ns['__file__'],'exec'),ns)
ns['remote_main'](config,""" + repr(phase) + ")"


def remote_main(c, phase):
    os.umask(0o077)
    require(c['tenant'] in ('morlevy', 'ashrafessa') and (c['transport'], c['rootOrHost']) == TARGETS[c['tenant']], 'REMOTE_TARGET_SCOPE')
    stage = PrivateStage('/root/legal-word-stage-frontend-' + c['tenant'] + '-20261026')
    try:
        raw = sys.stdin.buffer.read(c['archiveBytes'] + 1) if phase == 'upload' else None
        result = operation(DiskPublic(c['rootOrHost']), stage, c, phase, raw)
        result.update({'tenant': c['tenant'], 'sourceCommit': c['sourceCommit'], 'contractSha256': c['contractSha256'],
                       'releaseBindingSha256': c['releaseBindingSha256'], 'oldChunksDeleted': 0, 'protectedPublicFilesUnchanged': True,
                       'phase': phase, 'privateCheckpoint': str(stage.directory), 'casMechanism': 'guarded-hash-check-plus-atomic-filesystem-replace'})
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'result': 'STATIC_PHASE_FAILED_NO_BLIND_RETRY', 'tenant': c['tenant'], 'phase': phase,
                          'errorCode': str(e) if isinstance(e, Stop) else type(e).__name__, 'detailsPrivate': True,
                          'privateCheckpoint': str(stage.directory), 'partialMutationPossible': phase in ('upload', 'publish', 'rollback')}))
        raise SystemExit(1)


def main():
    p = argparse.ArgumentParser(); p.add_argument('--contract', required=True); p.add_argument('--contract-sha', required=True)
    p.add_argument('--tenant', choices=TARGETS, required=True); p.add_argument('--phase', choices=PHASES, required=True)
    p.add_argument('--execute-reviewed', action='store_true'); a = p.parse_args()
    raw = pathlib.Path(a.contract).read_bytes(); require(sha(raw) == a.contract_sha, 'CONTRACT_BYTES_CHANGED')
    contract = json.loads(raw); c, archive = load_packet(contract, a.tenant, a.phase, a.execute_reviewed); c['contractSha256'] = a.contract_sha
    if not a.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_PLAN_ONLY_NO_NETWORK', 'tenant': a.tenant, 'phase': a.phase,
                          'releaseBindingSha256': c['releaseBindingSha256'], 'sourceCommit': c['sourceCommit'],
                          'artifactFiles': len(c['files']), 'protectedFiles': len(c['protected']),
                          'backendFreshProofPresent': c['backendAttestation'] is not None, 'backendProofRequiredBeforePublicWrites': True})); return
    ledgers = [ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md', ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md']
    for ledger in ledgers: ledger.read_text()
    os.umask(0o077); PRIVATE.mkdir(parents=True, exist_ok=True); PRIVATE.chmod(0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'); at = now()
    private_out = PRIVATE / (a.tenant + '-' + a.phase + '-' + stamp + '.stdout')
    private_err = PRIVATE / (a.tenant + '-' + a.phase + '-' + stamp + '.stderr')
    exitcode, result = 0, None
    try:
        if c['transport'] == 'ssh':
            code = pathlib.Path(__file__).read_bytes()
            bootstrap = ssh_transport_bootstrap(a.phase)
            transport_input = ssh_transport_frame(code, c, a.phase, archive if a.phase == 'upload' else b'')
            command = ['flock', '--shared', '--nonblock', '/run/lock/melamedia-release-maintenance.lock', 'flock', '--exclusive', '--nonblock',
                       '/run/lock/legal-' + a.tenant + '-release.lock', 'python3', '-c', bootstrap]
            ssh = ['ssh', '-i', str(pathlib.Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                   'root@84.46.253.85', ' '.join(shlex.quote(x) for x in command)]
            with private_out.open('xb') as stdout, private_err.open('xb') as stderr:
                r = subprocess.run(ssh, input=transport_input, stdout=stdout, stderr=stderr, timeout=1500)
            exitcode = r.returncode
            result = json.loads(private_out.read_bytes())
        else:
            lock = PRIVATE / 'melamedlaw-operator.lock'
            with lock.open('a+b') as handle:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                adapter = FtpsPublic(c['credentialPins'])
                try:
                    stage = PrivateStage(PRIVATE / ('melamedlaw-' + c['sourceCommit'][:12]))
                    result = operation(adapter, stage, c, a.phase, archive if a.phase == 'upload' else None)
                    result.update({'tenant': a.tenant, 'phase': a.phase, 'sourceCommit': c['sourceCommit'], 'contractSha256': a.contract_sha,
                                   'releaseBindingSha256': c['releaseBindingSha256'], 'privateLocalCheckpoint': str(stage.directory),
                                   'verifiedFtpsTls': True, 'dataChannelPrivate': True, 'oldChunksDeleted': 0,
                                   'protectedPublicFilesUnchanged': True, 'casMechanism': 'private-operator-lock-immediate-hash-check-verified-TLS-rename-not-server-atomic-CAS'})
                finally: adapter.close()
            private_out.write_text(json.dumps(result)); private_err.write_text('')
    except Exception as e:
        exitcode = 1
        with private_err.open('ab' if private_err.exists() else 'xb') as err:
            err.write(('\nLOCAL_ERROR ' + json.dumps({'type': type(e).__name__, 'detail': str(e)})).encode())
        result = {'result': 'STATIC_PHASE_FAILED_NO_BLIND_RETRY', 'errorCode': str(e) if isinstance(e, Stop) else type(e).__name__,
                  'partialMutationPossible': a.phase in ('upload', 'publish', 'rollback'), 'detailsPrivate': True}
        if not private_out.exists(): private_out.write_text(json.dumps(result))
    for p in (private_out, private_err): p.chmod(0o600)
    receipt = {'at': at, 'tenant': a.tenant, 'phase': a.phase, 'sourceCommit': c['sourceCommit'], 'contractSha256': a.contract_sha,
               'scriptSha256': contract['scriptSha256'], 'releaseBindingSha256': c['releaseBindingSha256'], 'exitCode': exitcode,
               'private0600TransportLogs': True, 'stdoutSha256': sha(private_out.read_bytes()), 'stderrSha256': sha(private_err.read_bytes()),
               'observation': result, 'providerOrEnvOrSchemaChanges': False, 'browserOrFullProductApproval': False}
    dest = OUT / (a.tenant + '-publisher-' + a.phase + '-' + stamp + '.json'); dest.write_text(json.dumps(receipt, indent=2) + '\n')
    entry = '\n- ' + at + ' Legal Word/stage/gated WhatsApp frontend publisher ' + a.tenant + '/' + a.phase + ' exit' + str(exitcode) + ', source' + c['sourceCommit'] + ', evidence ' + str(dest.relative_to(ROOT)) + ' SHA' + sha(dest.read_bytes()) + '. Exact reviewed static-only packet; private recovery/journal, no old chunk deletion/root-public upload/env/key/DB/provider change. Failure and partial state retained; no blind retry/fullproduct or browser approval. Relevant source/artifact/backend/runtime/public bytes drift invalidates proof.\n'
    for ledger in ledgers:
        with ledger.open('a') as f: f.write(entry)
    print(json.dumps({'result': result.get('result'), 'exitCode': exitcode, 'receipt': str(dest)})); raise SystemExit(exitcode)


if __name__ == '__main__':
    main()
