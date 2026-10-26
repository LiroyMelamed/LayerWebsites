#!/usr/bin/env python3
"""Fixed Melamedia QA static operator. Invoked in memory by reviewed stdin driver.

Helpers below are scoped excerpts of reviewed publish-word-stage03.py; see README.
Only static chunks and two entrypoints may be written. No application imports,
HTTP, database, backend, process, environment or provider operation exists here.
"""
import base64, datetime, hashlib, io, json, os, pathlib, re, stat, sys, tarfile
MUTABLE = ('asset-manifest.json', 'index.html')
PHASES = ('checkpoint', 'upload', 'publish', 'verify', 'rollback')
PUBLIC = '/var/www/melamedia'
SCOPE = 'WORD_UX_QA_FRONTEND_ONLY'
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
class Stop(RuntimeError): pass
def require(ok, code):
    if not ok: raise Stop(code)

def safe_path(p, write=False):
    if not isinstance(p, str) or not p or p.startswith('/') or re.search(r'[\\\x00-\x1f%?#:]', p):
        return False
    if any(x in ('', '.', '..') or x.startswith('.env') for x in p.split('/')):
        return False
    if write:
        return p in MUTABLE or re.fullmatch(r'static/(?:js|css|media)/[A-Za-z0-9_.-]+', p) is not None
    return p.startswith('static/') or p.startswith('.well-known/') or p == '.htaccess' or '/' not in p

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

class PrivateStage:
    def __init__(self, directory):
        self.directory = pathlib.Path(directory)

    def init(self, c):
        self.no_links(self.directory)
        require(not self.directory.exists(), 'PRIVATE_STAGE_ALREADY_EXISTS_NO_BLIND_RETRY')
        self.directory.mkdir(parents=True, mode=0o700)
        self.directory.chmod(0o700)
        self.write('.mela-retention-pin', ('Owner: Codex root; Melamedia QA Word UX static rollback; review 2026-11-02. Preserve all checkpoints and old/new chunks.\n').encode())
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

def qa_read_path(p):
    # Existing CRA public content contains tenant assets, integration legal pages
    # and synthetic spreadsheet templates. They are read/protected, never written.
    if safe_path(p): return True
    if not isinstance(p, str) or not p or p.startswith('/') or re.search(r'[\\\x00-\x1f%?#:]', p): return False
    if any(x in ('', '.', '..') or x.startswith('.env') for x in p.split('/')): return False
    return p.startswith(('tenants/', 'integrations/', 'templates/'))


class QaDiskPublic(DiskPublic):
    def path(self, rel):
        require(qa_read_path(rel), 'QA_PUBLIC_READ_SCOPE')
        p = self.root / rel; self.no_links(p)
        return p


def inventory(adapter):
    """Hash only fixed-root public files, rejecting links/secrets before reading."""
    files, metadata, total = {}, {}, 0
    def visit(directory):
        nonlocal total
        adapter.no_links(directory)
        for path in sorted(directory.iterdir()):
            require(not path.is_symlink(), 'PUBLIC_SYMLINK_REQUIRES_REVIEW')
            rel = str(path.relative_to(adapter.root))
            require(qa_read_path(rel), 'UNREVIEWED_PUBLIC_PATH')
            info = path.lstat()
            if stat.S_ISDIR(info.st_mode):
                require(any(rel == root or rel.startswith(root + '/') for root in ('static', '.well-known', 'tenants', 'integrations', 'templates')), 'UNREVIEWED_PUBLIC_DIRECTORY')
                visit(path)
            else:
                require(stat.S_ISREG(info.st_mode) and info.st_size <= 20000000, 'PUBLIC_NOT_REGULAR_OR_SIZE')
                total += info.st_size
                require(total <= 1000000000 and len(files) < 20000, 'PUBLIC_INVENTORY_LIMIT')
                raw = adapter.read(rel)
                after = path.lstat()
                require((info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_mode, info.st_uid, info.st_gid) ==
                        (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_mode, after.st_uid, after.st_gid), 'PUBLIC_CHANGED_DURING_READ')
                files[rel] = sha(raw)
                metadata[rel] = {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}
    visit(adapter.root)
    require(set(MUTABLE) <= files.keys(), 'PUBLIC_ENTRYPOINTS_MISSING')
    return files, metadata


def qa_packet_guard(c):
    require(c.get('scope') == SCOPE and c.get('tenant') == 'melamedia' and c.get('rootOrHost') == PUBLIC, 'QA_ONLY_SCOPE')
    require(c.get('backendChanges') is False and c.get('rootPublicUploads') == 0 and c.get('oldChunksDeleted') == 0, 'STATIC_ONLY_SCOPE')
    require(all(re.fullmatch('[a-f0-9]{40}', c.get(k, '')) for k in ('mainCommit', 'sourceCommit')), 'SOURCE_COMMIT_BINDING')
    require(re.fullmatch('[a-f0-9]{64}', c.get('releaseBindingSha256', '')), 'RELEASE_BINDING')


def check_public(adapter, c, mutable_hashes):
    current, metadata = inventory(adapter)
    require(set(current) <= set(c['protected']) | set(c['files']), 'UNEXPECTED_PUBLIC_FILE_ADDITION')
    for p, h in c['protected'].items():
        require(current.get(p) == (mutable_hashes[p] if p in MUTABLE else h), 'PUBLIC_BASELINE_OR_MUTABLE_DRIFT:' + p)
        require(metadata.get(p) == c['baselineMetadata'][p], 'PUBLIC_METADATA_DRIFT:' + p)
    for p in c['optionalAbsentOrUnavailable']:
        require(p not in current, 'OPTIONAL_PUBLIC_OBSERVATION_CHANGED:' + p)


def check_chunks(adapter, c):
    for p, h in c['files'].items():
        if p.startswith('static/'):
            b = adapter.read(p); require(b is not None and sha(b) == h, 'IMMUTABLE_READBACK_CHANGED:' + p)

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
        qa_packet_guard(c); check_public(adapter, c, old_hash)
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
        qa_packet_guard(c); check_public(adapter, c, old_hash); check_chunks(adapter, c)
        stage.journal(c, {'step': 'before-mutable-publication'}, phase)
        for p in MUTABLE:  # manifest first; live HTML index is the last write.
            data = stage.read('new-' + p); require(sha(data) == new_hash[p], 'PRIVATE_NEW_MUTABLE_CHANGED')
            qa_packet_guard(c); stage.journal(c, {'step': 'before-mutable-rename', 'path': p, 'expectedOldSha256': old_hash[p], 'newSha256': new_hash[p]})
            adapter.replace(p, data, old_hash[p]); stage.journal(c, {'step': 'mutable-replaced', 'path': p})
        check_public(adapter, c, new_hash); check_chunks(adapter, c)
        stage.write('published.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'mutableHashes': new_hash}))
        stage.journal(c, {'step': 'publication-complete'})
        return {'result': 'PASS_EXACT_STATIC_PUBLICATION_NOT_BROWSER_QA', 'indexSha256': new_hash['index.html'], 'assetsFirstIndexLast': True}
    if phase == 'verify':
        qa_packet_guard(c)
        require(json.loads(stage.read('published.json'))['releaseBindingSha256'] == c['releaseBindingSha256'], 'PUBLICATION_NOT_COMPLETE')
        check_public(adapter, c, new_hash); check_chunks(adapter, c)
        return {'result': 'PASS_CURRENT_EXACT_STATIC_AND_PROTECTED_PUBLIC_READBACK_ONLY', 'indexSha256': new_hash['index.html']}
    require(phase == 'rollback', 'PHASE_SCOPE')
    qa_packet_guard(c)
    current = {}
    for p in MUTABLE:
        b = adapter.read(p); h = sha(b) if b is not None else None
        require(h in (old_hash[p], new_hash[p]), 'UNKNOWN_ACTOR_MUTABLE_BYTES_STOP:' + p); current[p] = h
    # Protected public files and old chunks must remain unchanged even on rollback.
    for p, h in c['protected'].items():
        if p not in MUTABLE:
            b = adapter.read(p); require(b is not None and sha(b) == h, 'PROTECTED_PUBLIC_DRIFT_ON_ROLLBACK:' + p)
    check_public(adapter, c, current)  # Validate metadata/path set before any recovery write.
    stage.journal(c, {'step': 'before-only-two-mutable-rollback'}, phase)
    for p in MUTABLE:
        if current[p] != old_hash[p]:
            stage.journal(c, {'step': 'before-old-mutable-rename', 'path': p, 'expectedSha256': current[p]})
            adapter.replace(p, stage.read('old-' + p), current[p])
    check_public(adapter, c, old_hash)
    stage.write('rolled-back.json', canonical({'releaseBindingSha256': c['releaseBindingSha256'], 'oldMutableRestored': old_hash, 'chunksDeleted': 0}))
    stage.journal(c, {'step': 'rollback-complete-old-and-new-chunks-retained'})
    return {'result': 'PASS_ONLY_OLD_INDEX_MANIFEST_RESTORED_CHUNKS_RETAINED', 'indexSha256': old_hash['index.html']}


def remote_main(c, phase):
    os.umask(0o077)
    stage = None
    try:
        require(phase in (*PHASES, 'observe') and c.get('scope') == SCOPE and c.get('rootOrHost') == PUBLIC and c.get('tenant') == 'melamedia', 'QA_ONLY_SCOPE')
        adapter = QaDiskPublic(PUBLIC)
        if phase == 'observe':
            require(re.fullmatch('[a-f0-9]{32}', c.get('observationNonce', '')), 'OBSERVATION_NONCE_REQUIRED')
            before, metadata = inventory(adapter)
            index, manifest = adapter.read('index.html'), adapter.read('asset-manifest.json')
            after, after_metadata = inventory(adapter)
            require(before == after and metadata == after_metadata, 'PUBLIC_CHANGED_DURING_OBSERVATION')
            result = {'result': 'PASS_READ_ONLY_QA_STATIC_OBSERVATION', 'at': now(), 'observationNonce': c['observationNonce'],
                      'files': before, 'metadata': metadata, 'indexBase64': base64.b64encode(index).decode(),
                      'manifestBase64': base64.b64encode(manifest).decode(), 'noMutation': True}
        else:
            qa_packet_guard(c)
            stage = PrivateStage('/root/word-ux-qa-20261026-' + c['releaseBindingSha256'][:20])
            if phase == 'checkpoint':
                age = datetime.datetime.now(datetime.timezone.utc).timestamp() - c['baselineObservedAt']
                require(-60 <= age <= 1800, 'FRESH_QA_STATIC_OBSERVATION_REQUIRED')
            raw = sys.stdin.buffer.read(c['archiveBytes'] + 1) if phase == 'upload' else None
            if phase == 'upload':
                files = check_archive(raw, c['files'])
                check_index(stage.read('old-index.html'), files['index.html'], stage.read('old-asset-manifest.json'), files['asset-manifest.json'], c['entrypointMap'])
            result = operation(adapter, stage, c, phase, raw)
            result.update({'privateCheckpoint': str(stage.directory), 'oldChunksDeleted': 0, 'rootPublicUploads': 0,
                           'protectedPublicFilesAndMetadataUnchanged': True,
                           'casMechanism': 'nonblocking-coordination-locks-immediate-hash-check-atomic-replace-not-native-compare-and-swap'})
        result.update({'scope': SCOPE, 'phase': phase, 'target': PUBLIC, 'tenant': 'melamedia',
                       'contractSha256': c['contractSha256'], 'operatorSha256': c['operatorSha256'],
                       'mainCommit': c.get('mainCommit'), 'sourceCommit': c.get('sourceCommit'),
                       'releaseBindingSha256': c.get('releaseBindingSha256'), 'backendChanges': False,
                       'appImportsOrHTTPOrProviderCalls': False})
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({'result': 'QA_STATIC_PHASE_FAILED_NO_BLIND_RETRY', 'scope': SCOPE, 'phase': phase,
                          'errorCode': str(error) if isinstance(error, Stop) else type(error).__name__,
                          'privateCheckpoint': str(stage.directory) if stage else None,
                          'partialMutationPossible': phase in ('checkpoint', 'upload', 'publish', 'rollback'),
                          'detailsPrivate': True}))
        raise SystemExit(1)
