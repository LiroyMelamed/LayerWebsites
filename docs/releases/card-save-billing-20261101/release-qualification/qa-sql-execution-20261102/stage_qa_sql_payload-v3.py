#!/usr/bin/python3
"""Review-only receiver; stages one pinned archive and NEVER executes its contents."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import stat
import subprocess
import sys
import tarfile

TARGET = Path('/tmp/layer-billing-sql-sequences-20261102-6a3bd299')
UNIT = 'layer-billing-sql-qa-20261102-6a3bd299.scope'
ARCHIVE_SHA = 'cb2f03ea1a0e6141960d017897f11d0de868a3932d84e1d58ae74b4d5c70c08c'
MANIFEST_SHA = 'd24165b8df2a825d715d1e38690d16f08c626484c7268cccaaf9bd3bc08c5399'
SOURCE = '6a3bd299227291feb0065ae3afa89a1f3ba2967a'
HEAD = '545779e4b99e111959f4684167dfdf46da1f3186'
BOOT = '79d5ef26-007c-4ee2-bfba-15db6bd5b1aa'
ENV_SHA = '9fc4bc04f6faa9e88347d3f94aa926750f616a54d2c9754fd86bc1bf94945281'
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
DEP_TARGET = '/root/qa-new-features-20261023-5ce621ee/staging/source02/backend/node_modules'
PROJECT_LOCK = 'd36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651'
INSTALLED_LOCK = 'bf476467ea9c57c366d6a610852233c85505ae450a25b95919165c44bf7b249f'
LOCKS = ['/run/lock/melamedia-release-maintenance.lock',
         '/run/lock/melamedia-legal-melamedia-release.lock']
MAX_ARCHIVE = 16 * 1024**2
MAX_EXPANDED = 64 * 1024**2
CLEAN_ENV = {'PATH': '/usr/bin:/bin', 'GIT_OPTIONAL_LOCKS': '0'}


def check(value, reason):
    if not value:
        raise RuntimeError(reason)


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def query(args):
    p = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True,
                       text=True, env=CLEAN_ENV, close_fds=True, timeout=10)
    check(p.returncode == 0 and len(p.stdout) < 65536 and not p.stderr,
          'read-only metadata query failed')
    return p.stdout.strip()


def process_meta(pid, ticks, cwd):
    base = Path('/proc') / str(pid)
    raw = (base / 'stat').read_text()
    actual = int(raw[raw.rfind(')') + 2:].split()[19])
    check(actual == ticks and os.readlink(base / 'exe') == '/usr/bin/node'
          and os.readlink(base / 'cwd') == cwd, 'QA process identity changed')
    return {'pid': pid, 'startTicks': actual, 'exe': '/usr/bin/node', 'cwd': cwd}


def identity():
    check(Path('/proc/sys/kernel/random/boot_id').read_text().strip() == BOOT, 'host boot changed')
    check(Path('/root/.pm2/pm2.pid').read_text().strip() == '948103', 'PM2 daemon changed')
    head = query(['/usr/bin/git', '-C', '/root/Melamedia', 'rev-parse', 'HEAD'])
    clean = query(['/usr/bin/git', '-C', '/root/Melamedia', 'status', '--porcelain', '--untracked-files=no'])
    check(head == HEAD and clean == '', 'QA source changed or dirty')
    check(sha('/root/Melamedia/backend/.env') == ENV_SHA, 'QA environment hash changed')
    deps = Path('/root/Melamedia/backend/node_modules')
    check(deps.is_symlink() and os.readlink(deps) == DEP_TARGET, 'QA dependency target changed')
    check(sha('/root/Melamedia/backend/package-lock.json') == PROJECT_LOCK
          and sha(deps / '.package-lock.json') == INSTALLED_LOCK, 'QA dependency lock changed')
    check(sha('/usr/bin/node') == NODE_SHA, 'QA Node fingerprint changed')
    return {'head': head, 'boot': BOOT, 'envSha256': ENV_SHA, 'nodeSha256': NODE_SHA,
            'dependencyTarget': DEP_TARGET, 'projectLockSha256': PROJECT_LOCK,
            'installedLockSha256': INSTALLED_LOCK,
            'qa': process_meta(2729957, 124260326, '/root/Melamedia/backend'),
            'daemon': process_meta(948103, 48642921, '/')}


def scope_absent():
    p = subprocess.run(['/usr/bin/systemctl', 'show', UNIT,
                        '--property=LoadState,ActiveState,ControlGroup'],
                       stdin=subprocess.DEVNULL, capture_output=True, text=True,
                       env=CLEAN_ENV, close_fds=True, timeout=10)
    check(p.returncode in (0, 1, 4) and len(p.stdout) < 8192, 'scope metadata query failed')
    props = dict(line.split('=', 1) for line in p.stdout.splitlines() if '=' in line)
    check(props.get('LoadState') == 'not-found' and props.get('ActiveState') == 'inactive'
          and props.get('ControlGroup', '') == '', 'test scope already exists or is uncertain')
    return props


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(name, data):
    temp = TARGET / ('.' + name + '.' + str(os.getpid()) + '.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream, indent=2, sort_keys=True)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
    os.replace(temp, TARGET / name)
    fsync_dir(TARGET)


def interrupt(signum, _frame):
    raise InterruptedError('staging interrupted by signal ' + str(signum))


def safe_name(name):
    path = PurePosixPath(name)
    check(name != '' and not path.is_absolute() and '..' not in path.parts
          and '.' not in path.parts and str(path) == name and '\\' not in name,
          'unsafe archive path')
    check(not any(part.startswith('.env') or part in ('.git', '.npmrc', 'credentials', 'credentials.json')
                  or part.endswith(('.pem', '.key', '.p12', '.pfx')) for part in path.parts),
          'credential/config path in archive')
    return path


def receive_archive():
    incoming = TARGET / 'incoming.tar.gz'
    digest, total = hashlib.sha256(), 0
    fd = os.open(incoming, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        while True:
            data = sys.stdin.buffer.read(min(65536, MAX_ARCHIVE + 1 - total))
            if not data:
                break
            total += len(data)
            check(total <= MAX_ARCHIVE, 'archive exceeds 16 MiB')
            stream.write(data); digest.update(data)
        stream.flush(); os.fsync(stream.fileno())
    check(digest.hexdigest() == ARCHIVE_SHA, 'incoming archive SHA mismatch')
    fsync_dir(TARGET)
    return incoming, total


def validate_archive(archive):
    members = archive.getmembers()
    check(len(members) == 324 and all(m.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and not m.issym() and not m.islnk() for m in members),
          'expected exactly 324 regular non-link archive members')
    names, expanded = {}, 0
    for member in members:
        safe_name(member.name)
        check(member.name not in names and 0 <= member.size <= MAX_EXPANDED, 'duplicate/oversized archive member')
        names[member.name] = member
        expanded += member.size
        check(expanded <= MAX_EXPANDED, 'expanded archive exceeds 64 MiB')
    check('FILE-MANIFEST.json' in names and names['FILE-MANIFEST.json'].size <= 1024**2,
          'missing/oversized manifest')
    with archive.extractfile(names['FILE-MANIFEST.json']) as stream:
        raw = stream.read()
    check(hashlib.sha256(raw).hexdigest() == MANIFEST_SHA, 'manifest SHA mismatch')
    manifest = json.loads(raw)
    check(manifest.get('productCommit') == SOURCE and manifest.get('originalTestsUnchanged') is True,
          'manifest source/test contract mismatch')
    rows = {}
    for row in manifest['files']:
        name = row['path']; safe_name(name)
        check(name != 'FILE-MANIFEST.json' and name not in rows, 'duplicate/recursive manifest row')
        rows[name] = row
    check(len(rows) == 323 and set(rows) | {'FILE-MANIFEST.json'} == set(names), 'manifest/archive inventory mismatch')
    check({'qa_sql_controller.py', 'linux_sql_sandbox.py', 'strict-test-guard.cjs', 'run-sql-sequences.cjs'} <= set(rows),
          'missing controller/launcher/guard/runner')
    hashes = {}
    for name, member in names.items():
        digest = hashlib.sha256()
        with archive.extractfile(member) as stream:
            while True:
                data = stream.read(65536)
                if not data:
                    break
                digest.update(data)
        expected = MANIFEST_SHA if name == 'FILE-MANIFEST.json' else rows[name]['sha256']
        check(digest.hexdigest() == expected and (name == 'FILE-MANIFEST.json' or member.size == rows[name]['bytes']),
              'archive member hash/size mismatch')
        hashes[name] = expected
    # Explicitly disallow a file serving as any other member's ancestor.
    for name in names:
        check(not any(str(parent) in names for parent in PurePosixPath(name).parents if str(parent) != '.'),
              'archive file/directory collision')
    return names, expanded, hashes


def extract(archive, names, hashes):
    payload = TARGET / 'payload'
    payload.mkdir(mode=0o700)
    directories = {payload}
    for name in sorted(names):
        destination = payload / name
        missing = []
        parent = destination.parent
        while parent != payload:
            missing.append(parent); parent = parent.parent
        for parent in reversed(missing):
            if parent not in directories:
                parent.mkdir(mode=0o700); directories.add(parent)
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out, archive.extractfile(names[name]) as source:
            shutil.copyfileobj(source, out, length=65536)
            out.flush(); os.fchmod(out.fileno(), 0o444); os.fsync(out.fileno())
        check(sha(destination) == hashes[name], 'extracted file recheck failed')
    for directory in sorted(directories, key=lambda p: len(p.parts), reverse=True):
        os.chmod(directory, 0o555); fsync_dir(directory)
    fsync_dir(TARGET)
    return payload


def main():
    result = {'atUtc': utc(), 'status': 'PREFLIGHT', 'target': str(TARGET),
              'archiveSha256': ARCHIVE_SHA, 'manifestSha256': MANIFEST_SHA,
              'sqlExecuted': False, 'nodeExecuted': False, 'scopeCreated': False,
              'serviceChanges': 0, 'databaseConnections': 0, 'providerCalls': 0,
              'cleanupPerformed': False}
    locks, created, before = [], False, None
    try:
        check(sys.argv[1:] == ['--approved-staging'] and sys.platform == 'linux'
              and os.geteuid() == 0 and sys.flags.isolated and sys.flags.no_site,
              'explicit approved staging via Linux root python3 -I -S required')
        os.umask(0o077)
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(signum, interrupt)
        for path in LOCKS:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW); locks.append(fd)
            st = os.fstat(fd)
            check(stat.S_ISREG(st.st_mode) and st.st_uid == 0, 'unsafe existing lock')
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        before = identity(); result['before'] = before
        result['scopeBefore'] = scope_absent()
        memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        available = int(memory['MemAvailable'].strip().split()[0]) * 1024
        free = shutil.disk_usage('/tmp').free
        check(available >= 4 * 1024**3 and free >= 512 * 1024**2, 'insufficient available memory/disk')
        result['resourcesBefore'] = {'memAvailableBytes': available, 'tmpFreeBytes': free}
        check(TARGET.parent.resolve(strict=True) == TARGET.parent and not TARGET.is_symlink(), 'noncanonical target parent')
        # Exclusive mkdir is the first staging mutation; existing/partial targets are never reused.
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGHUP, signal.SIGINT})
        try:
            TARGET.mkdir(mode=0o755)
            created = True
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        os.chmod(TARGET, 0o755); fsync_dir(TARGET.parent)
        atomic('.mela-retention-pin', {'reason': 'synthetic SQL approval task',
                                      'owner': 'codex', 'reviewDate': '2026-11-03'})
        result['status'] = 'RECEIVING_ARCHIVE'; atomic('stage-progress.json', result)
        incoming, byte_count = receive_archive(); result['archiveBytes'] = byte_count
        result['status'] = 'ARCHIVE_RECEIVED'; atomic('stage-progress.json', result)
        with tarfile.open(incoming, mode='r:gz') as archive:
            names, expanded, hashes = validate_archive(archive)
            result.update(status='ARCHIVE_VALIDATED', regularFiles=len(names), expandedBytes=expanded)
            atomic('stage-progress.json', result)
            payload = extract(archive, names, hashes)
        result['after'] = identity()
        check(result['after'] == before, 'QA identity changed during staging')
        result['scopeAfter'] = scope_absent()
        result.update(status='STAGED_VERIFIED_NOT_EXECUTED', payload=str(payload), serviceIdentityStable=True)
        atomic('STAGED-PIN.json', {'archiveSha256': ARCHIVE_SHA, 'manifestSha256': MANIFEST_SHA,
                                 'regularFiles': 324, 'source': SOURCE, 'sqlExecuted': False})
    except BaseException as error:
        result.update(status='PARTIAL_PRESERVED_DO_NOT_RETRY' if created else 'BLOCKED_NO_STAGING_CREATED',
                      errorType=type(error).__name__, reason=str(error))
    finally:
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(signum, signal.SIG_IGN)
        if before is not None and 'after' not in result:
            try:
                result['after'] = identity()
                result['serviceIdentityStable'] = result['after'] == before
            except BaseException as error:
                result.update(serviceIdentityStable=False, finalIdentityReason=str(error))
        result['finishedAtUtc'] = utc()
        if created:
            try:
                atomic('stage-receipt.json', result)
            except BaseException as error:
                result.update(status='PARTIAL_PRESERVED_RECEIPT_WRITE_FAILED', receiptErrorType=type(error).__name__)
        for fd in reversed(locks):
            os.close(fd)
    print(json.dumps(result, sort_keys=True))
    return 0 if result['status'] == 'STAGED_VERIFIED_NOT_EXECUTED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
