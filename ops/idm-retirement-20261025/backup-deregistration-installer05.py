"""Prepared Idm-only reversible metadata installer. Importing performs no work."""
import base64
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import tarfile
import time


SOURCE = '/usr/local/sbin/melamedia-backup-retention.py'
RETENTION = '/etc/melamedia-backup.d/retention.json'
PRODUCER = '/etc/melamedia-backup.d/config.json'
ORDER = [SOURCE, RETENTION, PRODUCER]
STAGE = '/var/backups/melamedia-maintenance/20261025/idm-scheduled-deregistration05'
RECIPIENT = '/etc/melamedia-backup.d/recipient.cert.pem'
GLOBAL_LOCK = '/run/lock/melamedia-release-maintenance.lock'
NATIVE_LOCKS = ['/var/backups/melamedia-recovery/.lock',
                '/var/lib/melamedia-backup-retention/.lock',
                '/var/backups/melamedia-publisher/.lock']
UNITS = ['melamedia-server-backup', 'melamedia-backup-retention',
         'melamedia-publish-frontend', 'melamedia-backup-freshness']
READONLY = {
    '/etc/melamedia-backup.d/publisher.json', '/etc/melamedia-backup.d/alerts.json',
    '/etc/melamedia-release-cleaner.json', '/etc/cron.d/melamedia-tenant-backups',
    '/etc/crontab', '/var/spool/cron/crontabs/root',
    '/usr/local/sbin/melamedia-server-backup.py',
    '/usr/local/sbin/melamedia-backup-watch.py',
    '/usr/local/sbin/melamedia-publish-frontend.py', '/usr/local/bin/tenant_backup.sh',
    '/etc/systemd/system/melamedia-backup-alert@.service',
    '/etc/systemd/system/melamedia-release-cleanup.service',
    '/etc/systemd/system/melamedia-release-cleanup.timer',
} | {'/etc/systemd/system/' + name + suffix for name in UNITS for suffix in ['.service', '.timer']}
BASE_SOURCE = 'fc26181e42d3c32df6038e90620b5069efde7fcff795ea92cda69b3a52abfe63'
NEW_SOURCE = 'f2dc2352c70a831935546fe9fb4f007182b03f560a8e0541f2e81f342939027c'
BASE_PRODUCER = 'e849967e64e7964a72dc99d43b196ade4ed56865c4175ee0c3f8c63766fab1d5'
BASE_RETENTION = 'a7bef968421cabd336393d2134966f3b28de122300755b28cb009a8c4c0e7f07'
PREDICATES = ['idmProducerProjectRemoved', 'idmLocalProjectRemoved', 'idmLegacyLocalEntryRemoved',
              'idmBucketRetentionTargetRemoved', 'exactIdmProjectExcludedAcrossAllHostRecoveryPrefixes',
              'allNonIdmProducerObjectsUnchanged', 'allUntargetedRetentionFieldsAndObjectsUnchanged',
              'publisherSevenProjectsUnchanged', 'sharedAlertsAndCleanupConfigUnchanged',
              'sharedServicesTimersAndCronUnchanged', 'historicalIdmBackupPathsAndCloudObjectsNotMutated',
              'noJobsOrAlertsOrProviderExecution', 'reviewedCoordinationLocksHeld']


class Refused(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Refused(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def serialize(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def build_changes(old, source, guards):
    require(set(old) == set(ORDER), 'EDIT_PATH_SCOPE')
    require(all(sha(old[p]) == guards['files'][p] for p in ORDER), 'FILE_SHA_CAS')
    require(sha(source) == guards['newSource'], 'PROPOSED_SOURCE_SHA')
    producer, retention = json.loads(old[PRODUCER]), json.loads(old[RETENTION])
    require(producer['host'] == 'vmi2784047' and producer['root'] == '/var/backups/melamedia-recovery'
            and producer['recipient'] == RECIPIENT, 'PRODUCER_LOCATION_OR_RECIPIENT')
    projects = producer['projects']
    require(projects[5]['name'] == 'idm-recovery'
            and canonical(projects[5]) == guards['idmProject'], 'IDM_PROJECT_CAS')
    require({p['name']: canonical(p) for p in projects if p['name'] != 'idm-recovery'}
            == guards['otherProjects'], 'OTHER_PRODUCER_OBJECTS_CHANGED')
    require(sum(p['name'] == 'idm-recovery' for p in projects) == 1, 'IDM_PROJECT_NOT_UNIQUE')
    for key, index in [('local_projects', 5), ('legacy_local', 4), ('targets', 5)]:
        require(canonical(retention[key][index]) == guards['retentionObjects'][key],
                'IDM_RETENTION_OBJECT_CAS')
    require(retention['local_projects'][5] == 'idm-recovery'
            and retention['legacy_local'][4]['root'] == '/var/backups/idm'
            and retention['targets'][5]['env'] == '/root/Idm/backend/.env'
            and 'excluded_projects' not in retention, 'IDM_RETENTION_SELECTION')
    require(canonical(retention['targets'][0]) == guards['target0'], 'SHARED_TARGET_CHANGED')
    del projects[5]
    del retention['local_projects'][5]
    del retention['legacy_local'][4]
    del retention['targets'][5]
    retention['excluded_projects'] = ['idm-recovery']
    return {SOURCE: source, RETENTION: serialize(retention), PRODUCER: serialize(producer)}


class Files:
    """Exact-path operations; fixture root exists only for pure local tests."""
    def __init__(self, root=Path('/'), enforce_owner=True):
        self.root = Path(root)
        self.enforce_owner = enforce_owner

    def path(self, absolute):
        require(absolute.startswith('/') and '..' not in Path(absolute).parts, 'PATH_SCOPE')
        return self.root / absolute.lstrip('/')

    def regular(self, absolute):
        p = self.path(absolute)
        self.no_links(absolute)
        st = p.stat()
        require(stat.S_ISREG(st.st_mode) and (not self.enforce_owner or st.st_uid == 0),
                'REGULAR_ROOT_FILE_REQUIRED')
        require(st.st_size <= 524288, 'FILE_TOO_LARGE')
        return p, st

    def no_links(self, absolute):
        current = self.root
        for part in Path(absolute).parts[1:]:
            current = current / part
            require(not current.is_symlink(), 'SYMLINK_REFUSED')

    def read(self, absolute):
        p, _ = self.regular(absolute)
        return p.read_bytes()

    def atomic(self, absolute, data, mode):
        require(absolute in ORDER or absolute.startswith(STAGE + '/'), 'WRITE_PATH_SCOPE')
        p = self.path(absolute)
        self.no_links(absolute)
        original_stat = self.regular(absolute)[1] if p.exists() else None
        require(not p.parent.is_symlink(), 'WRITE_PARENT_SYMLINK')
        temp = p.with_name('.' + p.name + '.idm-dereg05-' + str(os.getpid()))
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
                os.fchmod(stream.fileno(), mode)
                if original_stat is not None and self.enforce_owner:
                    os.fchown(stream.fileno(), original_stat.st_uid, original_stat.st_gid)
            os.replace(temp, p)
            parent_fd = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
        finally:
            if temp.exists():
                temp.unlink()


class Transaction:
    def __init__(self, files, old, new, modes):
        self.files, self.old, self.new, self.modes = files, old, new, modes
        self.rollback_attempted = False

    def journal(self, value):
        self.files.atomic(STAGE + '/journal.json', serialize(value), 0o600)

    def rollback(self):
        self.rollback_attempted = True
        deadline = time.monotonic() + 45
        require(all(sha(self.files.read(p)) in {sha(self.old[p]), sha(self.new[p])} for p in ORDER),
                'ROLLBACK_UNKNOWN_DRIFT_REFUSED')
        self.journal({'state': 'rollback_started', 'editPaths': ORDER})
        for p in reversed(ORDER):
            require(time.monotonic() < deadline, 'ROLLBACK_DEADLINE')
            current = self.files.read(p)
            require(sha(current) in {sha(self.old[p]), sha(self.new[p])},
                    'ROLLBACK_UNKNOWN_DRIFT_REFUSED')
            if current != self.old[p]:
                self.files.atomic(p, self.old[p], self.modes[p])
        require(all(self.files.read(p) == self.old[p] for p in ORDER), 'ROLLBACK_READBACK_FAILED')
        self.journal({'state': 'rollback_complete', 'originalBytesRestored': True})

    def install(self, check, after_write=lambda _index: None):
        self.journal({'state': 'prepared', 'changes': {p: {'before': sha(self.old[p]),
                      'after': sha(self.new[p])} for p in ORDER}})
        try:
            for index, p in enumerate(ORDER):
                check()
                require(self.files.read(p) == self.old[p], 'BEFORE_REPLACE_SHA_CAS')
                self.journal({'state': 'before_write', 'path': p, 'index': index})
                self.files.atomic(p, self.new[p], self.modes[p])
                require(self.files.read(p) == self.new[p], 'REPLACE_READBACK_FAILED')
                self.journal({'state': 'after_write', 'path': p, 'index': index})
                after_write(index)
            check()
            require(all(self.files.read(p) == self.new[p] for p in ORDER), 'FINAL_READBACK_FAILED')
        except Exception:
            self.rollback()
            raise


def command(args, remaining):
    require(remaining > 0, 'INSTALLER_DEADLINE')
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=min(5, remaining), check=False)
    require(result.returncode == 0, 'READONLY_METADATA_COMMAND_FAILED')
    return result.stdout.decode().strip()


def idle_window(deadline):
    result = {}
    for name in UNITS:
        def properties(unit, fields):
            text = command(['systemctl', 'show', unit] + ['--property=' + field for field in fields],
                           deadline - time.monotonic())
            return dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
        service = properties(name + '.service', ['ActiveState', 'SubState'])
        timer = properties(name + '.timer', ['ActiveState', 'NextElapseUSecRealtime'])
        require(service.get('ActiveState') in {'inactive', 'failed'}, 'NATIVE_JOB_NOT_IDLE')
        require(timer.get('ActiveState') == 'active' and timer.get('NextElapseUSecRealtime'),
                'NATIVE_TIMER_WINDOW_UNKNOWN')
        epoch = int(command(['date', '--date=' + timer['NextElapseUSecRealtime'], '+%s'],
                            deadline - time.monotonic()))
        require(epoch - time.time() > 180, 'NATIVE_TIMER_WINDOW_TOO_CLOSE')
        result[name] = {'serviceIdle': True, 'timerBeyond180Seconds': True}
    return result


def lock_existing(files, absolute, stack):
    p, _ = files.regular(absolute)
    handle = stack.enter_context(p.open('rb'))
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)


def check_pins(files, pins):
    require(set(pins) == READONLY, 'READONLY_PIN_PATH_SCOPE')
    for p, expected in pins.items():
        if expected is None:
            require(not files.path(p).exists() and not files.path(p).is_symlink(), 'ABSENT_PATH_CHANGED')
        else:
            require(sha(files.read(p)) == expected, 'PROTECTED_FILE_CHANGED')


def validate(contract):
    require(contract.get('scope') == 'IDM_ONLY_REVERSIBLE_SCHEDULED_DEREGISTRATION'
            and contract.get('rootApproval') == 'ROOT_REVIEWED_EXECUTE'
            and contract.get('phase') == 'apply' and contract.get('host') == '37.60.230.148'
            and contract.get('stage') == STAGE, 'DRAFT_OR_UNAPPROVED_CONTRACT')
    require(contract.get('guards', {}).get('files') == {
        SOURCE: BASE_SOURCE, PRODUCER: BASE_PRODUCER, RETENTION: BASE_RETENTION}
        and contract['guards'].get('newSource') == NEW_SOURCE, 'EXACT_SOURCE_BINDING_REQUIRED')
    require(contract.get('receiptPredicateNames') == PREDICATES
            and isinstance(contract.get('publicRecipientSha256'), str)
            and len(contract['publicRecipientSha256']) == 64,
            'PUBLIC_RECIPIENT_OR_RECEIPT_BINDING_REQUIRED')
    require(contract.get('planSha256') == '7ab2701707774f908423ae32e690b85199f07d2ac6e5ef5aa41cf3ffaa107bc8'
            and isinstance(contract.get('prerequisiteCorrectionSha256'), str)
            and len(contract['prerequisiteCorrectionSha256']) == 64
            and contract.get('fullDatabaseRestoreRequiredForThisReversibleStep') is False
            and contract.get('destructiveRetirementRequiresFullRestore') is True,
            'EXACT_PLAN_OR_PREREQUISITE_CORRECTION_REQUIRED')


def main(contract):
    os.umask(0o077)
    validate(contract)
    require(os.geteuid() == 0 and socket.gethostname() == 'vmi2784047', 'EXACT_BACKEND_ROOT_REQUIRED')
    files = Files()
    source = base64.b64decode(contract['proposedSourceBase64'], validate=True)
    result = {'result': 'IDM_DEREGISTRATION_NOT_EXECUTED', 'tenant': 'idm'}
    with contextlib.ExitStack() as stack:
        lock_existing(files, GLOBAL_LOCK, stack)
        deadline = time.monotonic() + 45
        check_pins(files, contract['readonlyPins'])
        old = {p: files.read(p) for p in ORDER}
        new = build_changes(old, source, contract['guards'])
        idle_window(deadline)
        for lock in NATIVE_LOCKS:
            lock_existing(files, lock, stack)
        idle_window(deadline)
        require(not files.path(STAGE).exists(), 'OWN_STAGE_ALREADY_EXISTS_REVIEW_REQUIRED')
        files.no_links(STAGE)
        files.path(STAGE).mkdir(mode=0o700, parents=True)
        files.path(STAGE).chmod(0o700)
        files.atomic(STAGE + '/.mela-retention-pin',
                     b'Owner: Codex root. Idm config/source preimages. Preserve history. Review 2026-11-01.\n', 0o600)
        modes = {p: stat.S_IMODE(files.regular(p)[1].st_mode) for p in ORDER}
        for index, p in enumerate(ORDER):
            files.atomic(STAGE + '/before-' + str(index), old[p], 0o600)
        metadata = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'modes': modes,
                    'before': {p: sha(b) for p, b in old.items()},
                    'after': {p: sha(b) for p, b in new.items()},
                    'contractSha256': globals().get('REVIEWED_CONTRACT_SHA')}
        files.atomic(STAGE + '/preimage-metadata.json', serialize(metadata), 0o600)
        recipient = files.read(RECIPIENT)
        require(b'BEGIN CERTIFICATE' in recipient and b'PRIVATE KEY' not in recipient,
                'PUBLIC_RECIPIENT_CERTIFICATE_REQUIRED')
        require(sha(recipient) == contract['publicRecipientSha256'], 'PUBLIC_RECIPIENT_SHA_CHANGED')
        archive = files.path(STAGE + '/preimages.tar')
        with tarfile.open(archive, 'x') as tar:
            for name in ['before-0', 'before-1', 'before-2', 'preimage-metadata.json']:
                tar.add(files.path(STAGE + '/' + name), arcname=name, recursive=False)
        archive.chmod(0o600)
        with archive.open('rb') as stream:
            os.fsync(stream.fileno())
        encrypted = files.path(STAGE + '/preimages.cms')
        encryption = subprocess.run(['openssl', 'cms', '-encrypt', '-binary', '-aes-256-gcm',
                                     '-outform', 'DER', '-in', str(archive), '-out', str(encrypted),
                                     str(files.path(RECIPIENT))], stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=max(1, deadline - time.monotonic()))
        require(encryption.returncode == 0 and encrypted.is_file() and encrypted.stat().st_size > 0,
                'PRIVATE_PREIMAGE_ENCRYPTION_FAILED')
        encrypted.chmod(0o600)
        parsed = subprocess.run(['openssl', 'cms', '-cmsout', '-inform', 'DER', '-in',
                                 str(encrypted), '-noout'], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=max(1, deadline - time.monotonic()))
        require(parsed.returncode == 0, 'PRIVATE_ENCRYPTED_PREIMAGE_PARSE_FAILED')
        with encrypted.open('rb') as stream:
            os.fsync(stream.fileno())
        preimages = {'privateDirectory': STAGE, 'archiveSha256': sha(archive.read_bytes()),
                     'encryptedSha256': sha(encrypted.read_bytes()), 'publicRecipientSha256': sha(recipient),
                     'rawPreimageHashes': metadata['before'], 'fullDatabaseRestoreClaimed': False}
        files.atomic(STAGE + '/encrypted-preimages.json', serialize(preimages), 0o600)
        check_pins(files, contract['readonlyPins'])
        idle_window(deadline)
        transaction = Transaction(files, old, new, modes)
        def check():
            require(time.monotonic() < deadline, 'INSTALLER_DEADLINE')
            check_pins(files, contract['readonlyPins'])
        try:
            transaction.install(check)
            idle_window(deadline)
            result = {'at': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'result': 'PASS_IDM_ONLY_BACKUP_RETENTION_DEREGISTRATION', 'tenant': 'idm',
                      'planSha256': contract['planSha256'],
                      'prerequisiteCorrectionSha256': contract['prerequisiteCorrectionSha256'],
                      'installedRetentionSourceSha256': NEW_SOURCE,
                      'configBeforeAfterSha256': {'before': metadata['before'], 'after': metadata['after']},
                      'privateEncryptedPreimages': preimages, 'sourceAndConfigPreimagesRetained': True,
                      'watchCoordination': 'No global watch flock exists; service idle and timer quiet-window checked.',
                      'predicates': {key: True for key in PREDICATES}}
            transaction.journal({'state': 'complete', 'receiptSha256': sha(serialize(result))})
            files.atomic(STAGE + '/actual-deregistration-receipt.json', serialize(result), 0o600)
        except Exception:
            # This invocation is entirely before downstream Idm quiescence.
            if not transaction.rollback_attempted and any(files.read(p) != old[p] for p in ORDER):
                transaction.rollback()
            receipt = files.path(STAGE + '/actual-deregistration-receipt.json')
            if receipt.exists():
                files.atomic(STAGE + '/attempted-receipt-before-failure.json', receipt.read_bytes(), 0o600)
                files.atomic(STAGE + '/actual-deregistration-receipt.json', serialize({
                    'result': 'FAIL_IDM_DEREGISTRATION_REVIEW_REQUIRED', 'tenant': 'idm',
                    'rollbackAttempted': transaction.rollback_attempted}), 0o600)
            raise
    return result


if 'REVIEWED_CONTRACT_JSON_B64' in globals():
    try:
        raw_contract = base64.b64decode(REVIEWED_CONTRACT_JSON_B64, validate=True)
        require(len(raw_contract) <= 262144 and sha(raw_contract) == REVIEWED_CONTRACT_SHA,
                'REVIEWED_CONTRACT_BYTES_CHANGED')
        print(json.dumps(main(json.loads(raw_contract))))
    except Exception as error:
        print(json.dumps({'result': 'IDM_DEREGISTRATION_FAILED_OR_DEFERRED', 'tenant': 'idm',
                          'code': str(error) if isinstance(error, Refused) else type(error).__name__,
                          'detailsPrivate': True, 'noBlindRetry': True}))
        raise SystemExit(1)
