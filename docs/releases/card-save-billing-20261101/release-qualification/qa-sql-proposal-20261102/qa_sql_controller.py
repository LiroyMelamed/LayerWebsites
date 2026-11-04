#!/usr/bin/python3
"""Review-only artifact. Run solely inside the separately approved QA scope."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import time

UNIT = 'layer-billing-sql-qa-20261102-6a3bd299'
SOURCE = '6a3bd299227291feb0065ae3afa89a1f3ba2967a'
HEAD = '545779e4b99e111959f4684167dfdf46da1f3186'
BOOT = '79d5ef26-007c-4ee2-bfba-15db6bd5b1aa'
ENV_SHA = '9fc4bc04f6faa9e88347d3f94aa926750f616a54d2c9754fd86bc1bf94945281'
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
LIB_SHA = 'b4d9140a7797ccf3ac14f5d9d579b64f157111662940cb8330c632b11a8cea8e'
TESTS = {
    'backend/tests/cardSetupDebtCollection.test.js': 'd1086bc9b5e19d56ab23af2dcf71de5d61ec61a00f48cd0529c842c382888378',
    'backend/tests/selfServiceCardSetupCollection.test.js': '26ed71b456d5f1d206093f1e20a82b49320f37d7de379396c33e45c5cf499f41',
}
LOCKS = ['/run/lock/melamedia-release-maintenance.lock',
         '/run/lock/melamedia-legal-melamedia-release.lock']
CLEAN_ENV = {'PATH': '/usr/bin:/bin', 'GIT_OPTIONAL_LOCKS': '0'}
STOP = None


def check(value, message):
    if not value:
        raise RuntimeError(message)


def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def safe_file(path):
    s = path.lstat()
    check(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o6022,
          'unsafe regular file: ' + str(path))
    check(s.st_nlink == 1, 'hard-linked file: ' + str(path))
    return s


def query(args):
    p = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                       env=CLEAN_ENV, close_fds=True, timeout=10)
    check(p.returncode == 0 and len(p.stdout) < 65536 and not p.stderr,
          'read-only metadata query refused: ' + args[0])
    return p.stdout.strip()


def process_meta(pid, ticks, cwd):
    base = Path('/proc') / str(pid)
    raw = (base / 'stat').read_text()
    start = int(raw[raw.rfind(')') + 2:].split()[19])
    check(start == ticks and os.readlink(base / 'exe') == '/usr/bin/node'
          and os.readlink(base / 'cwd') == cwd, 'QA process identity changed')
    return {'pid': pid, 'startTicks': start, 'exe': '/usr/bin/node', 'cwd': cwd}


def identity():
    check(Path('/proc/sys/kernel/random/boot_id').read_text().strip() == BOOT,
          'host boot changed')
    check(Path('/root/.pm2/pm2.pid').read_text().strip() == '948103', 'daemon PID changed')
    head = query(['/usr/bin/git', '-C', '/root/Melamedia', 'rev-parse', 'HEAD'])
    clean = query(['/usr/bin/git', '-C', '/root/Melamedia', 'status', '--porcelain', '--untracked-files=no'])
    check(head == HEAD and clean == '', 'QA source changed or tracked tree dirty')
    check(sha('/root/Melamedia/backend/.env') == ENV_SHA, 'QA environment preimage changed')
    deps = Path('/root/Melamedia/backend/node_modules')
    expected_deps = '/root/qa-new-features-20261023-5ce621ee/staging/source02/backend/node_modules'
    check(deps.is_symlink() and os.readlink(deps) == expected_deps, 'QA dependency symlink changed')
    project_lock = 'd36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651'
    installed_lock = 'bf476467ea9c57c366d6a610852233c85505ae450a25b95919165c44bf7b249f'
    check(sha('/root/Melamedia/backend/package-lock.json') == project_lock
          and sha(deps / '.package-lock.json') == installed_lock, 'QA dependency lock changed')
    return {'head': head, 'boot': BOOT, 'envSha256': ENV_SHA,
            'dependencyTarget': expected_deps, 'projectLockSha256': project_lock,
            'installedLockSha256': installed_lock,
            'qa': process_meta(2729957, 124260326, '/root/Melamedia/backend'),
            'daemon': process_meta(948103, 48642921, '/')}


def scope_guard(unit):
    check(unit == UNIT, 'unapproved scope unit')
    lines = Path('/proc/self/cgroup').read_text().splitlines()
    check(len(lines) == 1 and lines[0].startswith('0::/'), 'unified cgroup v2 required')
    rel = PurePosixPath(lines[0][3:])
    check('..' not in rel.parts and rel.name == UNIT + '.scope', 'driver outside approved scope')
    cg = Path('/sys/fs/cgroup') / str(rel).lstrip('/')
    values = {name: (cg / name).read_text().strip() for name in
              ['memory.max', 'memory.swap.max', 'pids.max', 'cpu.max', 'memory.oom.group']}
    check(values['memory.max'] == str(2 * 1024**3) and values['memory.swap.max'] == '0'
          and values['pids.max'] == '32' and values['memory.oom.group'] == '1',
          'scope memory/swap/tasks/group OOM limits missing')
    quota, period = values['cpu.max'].split()
    check(quota.isdecimal() and period.isdecimal() and 0 < int(quota) <= int(period) // 2,
          'CPU quota exceeds 50 percent')
    data = query(['/usr/bin/systemctl', 'show', UNIT + '.scope',
                  '--property=ControlGroup,ActiveState,RuntimeMaxUSec,CollectMode,OOMPolicy'])
    props = dict(line.split('=', 1) for line in data.splitlines())
    duration = props.get('RuntimeMaxUSec', '')
    check(duration in ('10min', '600s', '600000000us', '10min 0s'), 'scope runtime must be 600 seconds')
    check(props.get('ControlGroup') == str(rel) and props.get('ActiveState') == 'active'
          and props.get('CollectMode') == 'inactive-or-failed' and props.get('OOMPolicy') == 'kill',
          'scope ownership/lifecycle/OOM policy mismatch')
    return {'path': str(rel), 'limits': values, 'properties': props}


def manifest_guard(bundle, expected):
    check(re.fullmatch('[0-9a-f]{64}', expected) is not None, 'invalid manifest SHA')
    manifest = bundle / 'FILE-MANIFEST.json'
    safe_file(manifest)
    check(sha(manifest) == expected, 'manifest SHA mismatch')
    doc = json.loads(manifest.read_text())
    check(doc.get('productCommit') == SOURCE and doc.get('originalTestsUnchanged') is True,
          'manifest source/test contract mismatch')
    base_stat = bundle.lstat()
    check(stat.S_ISDIR(base_stat.st_mode) and base_stat.st_uid == 0
          and not base_stat.st_mode & 0o6022, 'unsafe bundle directory')
    listed = {}
    for row in doc['files']:
        rel = PurePosixPath(row['path'])
        check(not rel.is_absolute() and '..' not in rel.parts and str(rel) == row['path']
              and str(rel) != 'FILE-MANIFEST.json' and str(rel) not in listed, 'unsafe manifest path')
        listed[str(rel)] = row
    actual = set()
    for parent, dirs, files in os.walk(bundle, followlinks=False):
        for name in dirs + files:
            path = Path(parent) / name
            s = path.lstat()
            check(s.st_uid == 0 and not s.st_mode & 0o6022 and not stat.S_ISLNK(s.st_mode),
                  'unsafe artifact ownership/type/mode')
            check(not (name.startswith('.env') or name.endswith(('.pem', '.key', '.p12', '.pfx'))
                       or name in ('credentials', 'credentials.json', '.npmrc', '.git')),
                  'credential/config path in artifact')
            check(stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode), 'special artifact file')
            if stat.S_ISREG(s.st_mode):
                rel = str(path.relative_to(bundle))
                if rel == 'FILE-MANIFEST.json':
                    continue
                check(rel in listed, 'extra artifact file: ' + rel)
                safe_file(path)
                check(s.st_size == listed[rel]['bytes'] and sha(path) == listed[rel]['sha256'],
                      'artifact size/hash mismatch: ' + rel)
                actual.add(rel)
    check(actual == set(listed), 'missing artifact file')
    required = set(TESTS) | {'qa_sql_controller.py', 'linux_sql_sandbox.py',
                            'strict-test-guard.cjs', 'run-sql-sequences.cjs'}
    check(required <= actual and Path(__file__).resolve() == bundle / 'qa_sql_controller.py',
          'controller/launcher/runner not bound to manifest')
    for name, digest in TESTS.items():
        check(listed[name]['sha256'] == digest, 'unchanged test hash mismatch')
    check(not any(name in actual for name in ('backend/config/db.js', 'backend/server.js', 'backend/app.js')),
          'live application entrypoint in artifact')
    for path, digest in [(Path('/usr/bin/node'), NODE_SHA),
                         (Path('/usr/lib/x86_64-linux-gnu/libseccomp.so.2.5.5'), LIB_SHA)]:
        safe_file(path)
        check(sha(path) == digest, 'Node/libseccomp fingerprint mismatch')
    return {'sha256': expected, 'fileCount': len(actual), 'source': SOURCE,
            'controllerSha256': listed['qa_sql_controller.py']['sha256']}


def atomic(root, name, value):
    tmp = root / ('.' + name + '.' + str(os.getpid()) + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
    os.replace(tmp, root / name)
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def stop_signal(signum, _frame):
    global STOP
    STOP = signum


def stop_child(child):
    # A non-reaped Popen child retains its PID; no unrelated PID/PGID is targeted.
    if child is not None and child.poll() is None:
        try:
            check(os.getpgid(child.pid) == child.pid, 'recorded child lost its process group')
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=2)
        except ProcessLookupError:
            child.wait(timeout=2)


def parse_result(run, test):
    for name in ('stdout.tap', 'stderr.log'):
        check(safe_file(run / name).st_size <= 32 * 1024**2, 'test log too large')
    stdout = (run / 'stdout.tap').read_text()
    stderr = (run / 'stderr.log').read_text()
    ready = [json.loads(line[len('SANDBOX_READY '):]) for line in stderr.splitlines()
             if line.startswith('SANDBOX_READY ')]
    check(len(ready) == 1 and 'SANDBOX_REFUSED' not in stderr, 'kernel sandbox readiness missing')
    r = ready[0]
    check(r.get('uid') == 65534 and r.get('gid') == 65534 and r.get('test') == test
          and r.get('networkNamespaceChanged') is True and r.get('noNewPrivileges') is True
          and r.get('inheritedFds') == '0=/dev/null;1,2=regular logs;>=3 closed', 'kernel sandbox proof mismatch')
    status = r.get('seccomp', {})
    check(status.get('Seccomp') == '2' and status.get('NoNewPrivs') == '1'
          and all(status.get(k) == '0000000000000000' for k in
                  ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')), 'kernel status proof mismatch')
    expected_canaries = {'socket_family_1', 'socket_family_2', 'socket_family_10', 'connect', 'setns', 'unshare',
                         'io_uring_setup', 'pidfd_getfd', 'clone3', 'clone'}
    check(set(r.get('canaries', {})) == expected_canaries
          and all(v == ('ENOSYS' if k == 'clone3' else 'EPERM') for k, v in r['canaries'].items()),
          'kernel deny canaries incomplete')
    probes = []
    for line in stdout.splitlines():
        candidate = line.removeprefix('# ').strip()
        if candidate.startswith('{'):
            try:
                item = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if item.get('probe') == 'FROZEN_SYNTHETIC_SQL_SEQUENCES':
                probes.append(item)
    check(len(probes) == 1, 'final JS guard receipt missing')
    p = probes[0]
    check(p.get('source') == SOURCE and p.get('pglite') == '0.5.10'
          and p.get('networkCanaries') == 4 and p.get('liveDatabase') is False
          and p.get('liveProvider') is False
          and p.get('forbiddenOperations') == {'network': 0, 'forbiddenImport': 0, 'forbiddenFs': 0},
          'JS canaries/forbidden counters failed')
    counts = {}
    for key in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        found = re.findall(r'^# ' + key + r' (\d+)\s*$', stdout, re.MULTILINE)
        check(len(found) == 1, 'missing/ambiguous TAP count: ' + key)
        counts[key] = int(found[0])
    check(counts['tests'] > 0 and counts['pass'] > 0 and counts['fail'] == 0
          and counts['cancelled'] == counts['skipped'] == counts['todo'] == 0
          and counts['tests'] == counts['pass'] and not re.search(r'^not ok\b', stdout, re.MULTILINE),
          'TAP tests failed, skipped, or incomplete')
    return {'tap': counts, 'kernel': r, 'javascript': p,
            'stdoutSha256': sha(run / 'stdout.tap'), 'stderrSha256': sha(run / 'stderr.log')}


def execute_one(bundle, root, test, deadline):
    run = root / Path(test).stem
    run.mkdir(mode=0o700)
    record = {'test': test, 'atUtc': utc(), 'status': 'STARTING'}
    child, peak = None, 0
    try:
        before = identity()
        check(not STOP and time.monotonic() < deadline, 'controller interrupted/deadline expired')
        cmd = ['/usr/bin/unshare', '--net', '--', '/usr/bin/python3', '-I', '-S',
               str(bundle / 'linux_sql_sandbox.py'), '--approved-execution', '--bundle', str(bundle),
               '--run-dir', str(run), '--guard', str(bundle / 'strict-test-guard.cjs'),
               '--runner', str(bundle / 'run-sql-sequences.cjs'), '--test', test,
               '--host-netns', str(os.stat('/proc/self/ns/net').st_ino), '--parent-pid', str(os.getpid())]
        record['command'] = cmd
        atomic(run, 'receipt.json', record)
        with open(run / 'launcher.log', 'xb') as bootstrap:
            os.chmod(run / 'launcher.log', 0o600)
            child = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=bootstrap, stderr=bootstrap,
                                     close_fds=True, start_new_session=True, env={'PATH': '/usr/bin:/bin'}, cwd=bundle)
            record.update(pid=child.pid, pgid=child.pid, status='RUNNING')
            atomic(run, 'receipt.json', record)
            until = min(time.monotonic() + 300, deadline)
            peak = 0
            while child.poll() is None:
                check(not STOP and time.monotonic() < until, 'test interrupted or 300-second/overall deadline exceeded')
                status_path = Path('/proc') / str(child.pid) / 'status'
                try:
                    status = status_path.read_text()
                except FileNotFoundError:
                    continue
                rss = re.search(r'^VmRSS:\s+(\d+) kB$', status, re.MULTILINE)
                current = int(rss[1]) * 1024 if rss else 0
                for log in ('stdout.tap', 'stderr.log', 'launcher.log'):
                    log_path = run / log
                    if log_path.exists():
                        check(log_path.stat().st_size <= 32 * 1024**2, 'test log exceeded 32 MiB')
                peak = max(peak, current)
                check(current <= 1536 * 1024**2, 'test RSS exceeded 1.5 GiB soft limit')
                time.sleep(0.1)
            bootstrap.flush(); os.fsync(bootstrap.fileno())
        record.update(exitCode=child.returncode, peakRssBytes=peak)
        check(child.returncode == 0, 'test launcher/Node exited nonzero')
        record['proof'] = parse_result(run, test)
        check(identity() == before, 'QA identity changed across test')
        record['status'] = 'PASS'
    except BaseException as error:
        record.update(status='FAIL', reason=str(error), errorType=type(error).__name__)
        raise
    finally:
        try:
            stop_child(child)
        finally:
            record['peakRssBytes'] = peak
            if child is not None:
                record['exitCode'] = child.returncode
            record['finishedAtUtc'] = utc()
            atomic(run, 'receipt.json', record)
    return record


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--approved-execution', action='store_true')
    a.add_argument('--bundle', type=Path, required=True)
    a.add_argument('--run-root', type=Path, required=True)
    a.add_argument('--unit', required=True)
    a.add_argument('--manifest-sha', required=True)
    args = a.parse_args()
    check(args.approved_execution and sys.platform == 'linux' and os.geteuid() == 0,
          'separate explicit execution approval and Linux root required')
    check(sys.flags.isolated and sys.flags.no_site, 'invoke controller with python3 -I -S')
    bundle = args.bundle.resolve(strict=True)
    check(args.bundle.is_absolute() and args.bundle == bundle and not args.bundle.is_symlink(), 'bundle must be canonical absolute path')
    root = args.run_root
    check(root.is_absolute() and root.parent.resolve(strict=True) == root.parent
          and root != bundle and bundle not in root.parents and str(root).startswith('/tmp/')
          and not root.exists() and not root.is_symlink(), 'run root must be new canonical /tmp directory outside bundle')
    os.umask(0o077)
    root.mkdir(mode=0o700)
    receipt = {'atUtc': utc(), 'status': 'PREFLIGHT', 'qaServiceChanges': 0,
               'providerCalls': 0, 'hostDatabaseConnections': 0, 'scopeCreatedByController': False,
               'bundle': str(bundle), 'runRoot': str(root), 'tests': []}
    fds, before = [], None
    deadline = time.monotonic() + 570
    for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(sig, stop_signal)
    try:
        for path in LOCKS:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            fds.append(fd)
            check(stat.S_ISREG(os.fstat(fd).st_mode) and os.fstat(fd).st_uid == 0, 'unsafe existing lock')
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        receipt['scope'] = scope_guard(args.unit)
        receipt['manifest'] = manifest_guard(bundle, args.manifest_sha)
        before = identity()
        receipt['before'] = before
        receipt['status'] = 'PREFLIGHT_PASS'
        atomic(root, 'progress.json', receipt)
        for test in TESTS:
            check(not STOP, 'controller interrupted')
            scope_guard(args.unit)
            check(identity() == before, 'QA identity changed before test')
            receipt['tests'].append(execute_one(bundle, root, test, deadline))
            atomic(root, 'progress.json', receipt)
        check(not STOP, 'controller interrupted')
        receipt['status'] = 'PASS'
    except BaseException as error:
        receipt.update(status='FAIL', reason=str(error), errorType=type(error).__name__)
    finally:
        if before is not None:
            try:
                receipt['after'] = identity()
                check(receipt['after'] == before, 'QA identity changed before final receipt')
                receipt['serviceIdentityStable'] = True
            except BaseException as error:
                receipt.update(status='FAIL', serviceIdentityStable=False, finalIdentityReason=str(error))
        if STOP:
            receipt.update(status='FAIL', interruptedSignal=STOP)
        receipt['finishedAtUtc'] = utc()
        atomic(root, 'receipt.json', receipt)
        for fd in reversed(fds):
            os.close(fd)
    print(json.dumps({'status': receipt['status'], 'receipt': str(root / 'receipt.json')}))
    return 0 if receipt['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
