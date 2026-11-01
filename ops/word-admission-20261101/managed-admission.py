#!/usr/bin/python3
"""Two host-wide leases in front of the unchanged, bounded managed converter.

The CLI has no configuration flags/environment overrides. Config injection is
only for the isolated no-provider fixture harness. Never unlink the lock files.
"""
import dataclasses
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid

BUSY = 75
INNER_SHA256 = 'e3b0019497b698906678070f39102230581c3e8120618ca5267635e0f8169052'
HEX = re.compile(r'^[0-9a-f]{32}$')
UNIT = re.compile(r'^melamedia-qa-word-[0-9a-f]{32}\.service$')


@dataclasses.dataclass(frozen=True)
class Config:
    state: Path
    private: Path
    inner: Path
    inner_sha256: str
    slots: int = 2
    deadline: float = 82.0
    owner: int = 0
    inspector: object = None


PRODUCTION = Config(Path('/var/lib/melamedia-word-admission-20261101'),
    Path('/root/qa-new-features-20261023-converter'),
    Path('/opt/melamedia-qa-word-converter-20261023/managed-soffice-inner-e3b0019497b69890.py'),
    INNER_SHA256)


def private_directory(path, owner):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != owner
            or info.st_mode & 0o077 or path.resolve() != path):
        raise ValueError('UNSAFE_DIRECTORY')


def safe_file(path, owner, flags=os.O_RDONLY, mode=0o600):
    fd = os.open(path, flags | os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner
            or info.st_nlink != 1 or info.st_mode & 0o077):
        os.close(fd)
        raise ValueError('UNSAFE_FILE')
    return fd


def read_json(path, owner):
    try:
        fd = safe_file(path, owner)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as handle:
        raw = handle.read(32769)
    if len(raw) > 32768:
        raise ValueError('OVERSIZED_STATE')
    return json.loads(raw)


def write_json(path, value, owner):
    temporary = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    fd = safe_file(temporary, owner, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        with os.fdopen(fd, 'w') as handle:
            json.dump(value, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        d = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        temporary.unlink(missing_ok=True)


def journal(config, slot):
    value = read_json(config.state / ('slot-%d.json' % slot), config.owner)
    if value is None:
        return None
    if (value.get('schema') != 1 or value.get('slot') != slot or not HEX.fullmatch(value.get('token', ''))
            or type(value.get('createdAt')) not in (int, float)):
        raise ValueError('INVALID_JOURNAL')
    if 'innerPid' in value and (type(value['innerPid']) is not int or value['innerPid'] <= 1):
        raise ValueError('INVALID_JOURNAL')
    if 'unit' in value and (not UNIT.fullmatch(value['unit']) or not HEX.fullmatch(value.get('stageId', ''))
            or value.get('reaperUnit') != 'melamedia-qa-word-reap-' + value['stageId']):
        raise ValueError('INVALID_JOURNAL')
    return value


def live_resources(config):
    """Only owned resource names and systemd states; never read document data."""
    if config.inspector:
        return config.inspector(config)
    private_directory(config.private, config.owner)
    jobs = config.private / 'jobs'
    info = jobs.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != config.owner or info.st_mode & 0o077:
        raise ValueError('UNSAFE_JOBS')
    stages = set()
    for path in jobs.iterdir():
        if not HEX.fullmatch(path.name) or not stat.S_ISDIR(path.lstat().st_mode):
            raise ValueError('UNKNOWN_STAGE')
        stages.add(path.name)
    result = subprocess.run(['/usr/bin/systemctl', 'list-units', '--all', '--no-legend', '--plain',
        '--full', 'melamedia-qa-word-*'], capture_output=True, timeout=3,
        env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    if result.returncode or len(result.stdout) > 131072:
        raise ValueError('UNOBSERVABLE_UNITS')
    units = set()
    for line in result.stdout.decode('utf-8', 'strict').splitlines():
        parts = line.split()
        if len(parts) < 4 or not parts[0].startswith('melamedia-qa-word-'):
            raise ValueError('UNKNOWN_UNIT')
        if parts[2] not in ('inactive', 'failed'):
            units.add(parts[0])
    return units, stages


def learn_resources(config, value):
    if 'innerPid' not in value or 'unit' in value:
        return value
    # The PID is a pointer into the incumbent coordinator's private resource
    # report, never a process-liveness or stale-lock test.
    path = config.private / ('active-%d.json' % value['innerPid'])
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except FileNotFoundError:
        return value
    with os.fdopen(fd, 'rb') as handle:
        info = os.fstat(handle.fileno())
        raw = handle.read(32769)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != config.owner or info.st_nlink != 1 or len(raw) > 32768:
        raise ValueError('UNSAFE_ACTIVE_REPORT')
    report = json.loads(raw)
    if (not UNIT.fullmatch(report.get('unit', '')) or not HEX.fullmatch(report.get('stageId', ''))
            or report.get('reaperUnit') != 'melamedia-qa-word-reap-' + report['stageId']
            or report.get('reaperMaxDelaySeconds') != 72 or report.get('mode') != 'convert'):
        raise ValueError('INVALID_ACTIVE_REPORT')
    value = {**value, **{key: report[key] for key in ('unit', 'stageId', 'reaperUnit')}}
    write_json(config.state / ('slot-%d.json' % value['slot']), value, config.owner)
    return value


def resources_for(value):
    if not value or 'unit' not in value:
        return set(), set()
    return {value['unit'], value['reaperUnit'] + '.timer', value['reaperUnit'] + '.service'}, {value['stageId']}


def lock(config, name, nonblocking=True):
    fd = safe_file(config.state / name, config.owner, os.O_RDWR | os.O_CREAT)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | (fcntl.LOCK_NB if nonblocking else 0))
        return fd
    except BaseException:
        os.close(fd)
        raise


def acquire(config):
    private_directory(config.state, config.owner)
    private_directory(config.private, config.owner)
    info = config.inner.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != config.owner or info.st_mode & 0o022
            or info.st_nlink != 1 or config.inner.resolve() != config.inner
            or hashlib.sha256(config.inner.read_bytes()).hexdigest() != config.inner_sha256):
        raise ValueError('INNER_CHANGED')
    coordinator = lock(config, 'coordinator.lock')
    try:
        values = [journal(config, slot) for slot in range(config.slots)]
        values = [learn_resources(config, value) if value else None for value in values]
        units, stages = live_resources(config)
        known_units, known_stages = set(), set()
        for value in values:
            u, s = resources_for(value)
            known_units |= u
            known_stages |= s
        if units - known_units or stages - known_stages:
            raise ValueError('UNACCOUNTED_RESOURCES')
        for slot, value in enumerate(values):
            try:
                lease = lock(config, 'slot-%d.lock' % slot)
            except BlockingIOError:
                continue
            owned_units, owned_stages = resources_for(value)
            still_owned = bool(units & owned_units or stages & owned_stages) if owned_units else bool(units or stages)
            if value and still_owned:
                # All holders may have crashed. The independent original reaper
                # must finish first. A learned exact resource journal can be
                # reclaimed while the other slot is busy. Unlearned state
                # requires global quiescence. Never reclaim by elapsed time/PID.
                os.close(lease)
                continue
            value = {'schema': 1, 'slot': slot, 'token': uuid.uuid4().hex, 'createdAt': time.time()}
            try:
                write_json(config.state / ('slot-%d.json' % slot), value, config.owner)
                return lease, value
            except BaseException:
                os.close(lease)
                raise
        raise BlockingIOError('ALL_SLOTS_BUSY')
    finally:
        os.close(coordinator)


def clear_if_safe(config, value):
    coordinator = lock(config, 'coordinator.lock')
    try:
        current = journal(config, value['slot'])
        if not current or current['token'] != value['token']:
            return False
        value = learn_resources(config, current)
        units, stages = live_resources(config)
        owned_units, owned_stages = resources_for(value)
        safe = not (units & owned_units or stages & owned_stages) if owned_units else not (units or stages)
        if safe:
            (config.state / ('slot-%d.json' % value['slot'])).unlink()
        return safe
    finally:
        os.close(coordinator)


def guardian(config, lease, value, channel, args):
    """Survives caller's process-group kill and holds the lease through cleanup."""
    os.setsid()
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    null = os.open(os.devnull, os.O_RDWR)
    for target in (0, 1, 2):
        os.dup2(null, target)
    if null > 2:
        os.close(null)
    inner = None
    code = BUSY
    deadline = time.monotonic() + config.deadline
    cancelled = False
    try:
        # Kernel lease also lives in the incumbent coordinator if this guardian
        # crashes. The original stdin cancellation pipe is untouched.
        inner = subprocess.Popen([str(config.inner), *args], pass_fds=(lease,),
            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, start_new_session=True)
        value = {**value, 'innerPid': inner.pid, 'guardianPid': os.getpid()}
        write_json(config.state / ('slot-%d.json' % value['slot']), value, config.owner)
        while time.monotonic() < deadline:
            try:
                value = learn_resources(config, value)
                if inner.poll() is not None and clear_if_safe(config, value):
                    code = max(0, inner.returncode) if inner.returncode >= 0 else 1
                    break
            except (OSError, ValueError, subprocess.SubprocessError):
                # Failed observation cannot free capacity.
                pass
            if not cancelled and select.select([channel], [], [], 0)[0]:
                if channel.recv(1) == b'':
                    cancelled = True
                    if inner.poll() is None:
                        inner.terminate()
            time.sleep(0.02)
    except BaseException:
        pass
    finally:
        if inner is not None and inner.poll() is None:
            # Its independent reaper remains armed. A retained journal prevents
            # capacity reuse until unit/stage absence is observed later.
            inner.kill()
            try:
                inner.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
        try:
            channel.sendall(json.dumps({'exit': min(code, 255)}).encode())
        except OSError:
            pass
        channel.close()
        os.close(lease)
    os._exit(0)


def run(config, args):
    if config.slots not in (1, 2) or not 0 < config.deadline <= 82:
        return BUSY
    try:
        lease, value = acquire(config)
    except (OSError, ValueError, subprocess.SubprocessError):
        return BUSY
    caller, worker = socket.socketpair()
    try:
        pid = os.fork()
    except OSError:
        caller.close()
        worker.close()
        os.close(lease)
        return BUSY
    if pid == 0:
        caller.close()
        guardian(config, lease, value, worker, args)
    worker.close()
    os.close(lease)

    def cancel(signum, _frame):
        caller.close()
        os._exit(128 + signum)
    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)
    try:
        caller.settimeout(config.deadline + 2)
        response = caller.recv(256)
        result = json.loads(response)
        return result['exit'] if type(result.get('exit')) is int and 0 <= result['exit'] <= 255 else BUSY
    except (OSError, ValueError):
        return BUSY
    finally:
        caller.close()
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass


if __name__ == '__main__':
    sys.exit(run(PRODUCTION, sys.argv[1:]))
