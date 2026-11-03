#!/usr/bin/env python3
"""REVIEW ONLY: proposed one-shot SQL-test launcher; not executed by its author.

Outer approved controller must: run inside the explicitly approved transient
test-only scope with MemoryMax=2G, MemorySwapMax=0, TasksMax=32, CPUQuota=50%,
RuntimeMaxSec=600 (no existing service changes); verify the complete payload manifest, create root-
owned directories, close its own unnecessary FDs, pin host netns/parent identity,
run `unshare --net -- python3 THIS ...` with NO --fork, monitor RSS <=1.5 GiB and
wall time <=300s, run the two exact files serially, and retain/delete only its own
scoped artifacts. This file never changes PM2, environment files, databases,
network interfaces, packages, users or any host configuration.

Threat scope is frozen, reviewed tests/dependencies, not arbitrary hostile code.
Kernel socket/process/namespace restrictions persist across exec and threads.
"""
import argparse
import ctypes as C
import errno
import hashlib
import json
import os
from pathlib import Path
import pwd
import resource
import signal
import stat
import sys

NODE = Path('/usr/bin/node')
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
LIB = Path('/usr/lib/x86_64-linux-gnu/libseccomp.so.2.5.5')
LIB_SHA = 'b4d9140a7797ccf3ac14f5d9d579b64f157111662940cb8330c632b11a8cea8e'
TESTS = {
    'backend/tests/cardSetupDebtCollection.test.js': 'd1086bc9b5e19d56ab23af2dcf71de5d61ec61a00f48cd0529c842c382888378',
    'backend/tests/selfServiceCardSetupCollection.test.js': '26ed71b456d5f1d206093f1e20a82b49320f37d7de379396c33e45c5cf499f41',
}
UID = GID = 65534
SCMP_ALLOW = 0x7fff0000
SCMP_KILL_PROCESS = 0x80000000
SCMP_ERRNO = 0x00050000
SCMP_ARCH_X86_64 = 0xc000003e
SCMP_CMP_MASKED_EQ = 7
CLONE_THREAD = 0x00010000
DENY = (
    'socket', 'socketpair', 'connect', 'bind', 'listen', 'accept', 'accept4',
    'sendto', 'sendmsg', 'sendmmsg', 'recvfrom', 'recvmsg', 'recvmmsg',
    'shutdown', 'getsockopt', 'setsockopt', 'getpeername', 'getsockname',
    'io_uring_setup', 'io_uring_enter', 'io_uring_register',
    'fork', 'vfork', 'ptrace', 'process_vm_readv', 'process_vm_writev',
    'pidfd_open', 'pidfd_getfd', 'setns', 'unshare', 'bpf',
)


def check(ok, message):
    if not ok:
        raise RuntimeError(message)


def fingerprint(path, expected):
    s = path.lstat()
    check(stat.S_ISREG(s.st_mode) and s.st_uid == 0, 'untrusted binary/library owner or type')
    check(not s.st_mode & (stat.S_IWGRP | stat.S_IWOTH | stat.S_ISUID | stat.S_ISGID), 'unsafe binary/library mode')
    with path.open('rb') as f:
        check(hashlib.file_digest(f, 'sha256').hexdigest() == expected, 'binary/library hash drift')


def inside(path, root):
    resolved = path.resolve(strict=True)
    check(resolved.is_relative_to(root), 'path escapes approved bundle')
    return resolved


def proc_status():
    # Only these self-process kernel fields; never process environment maps.
    wanted = {'CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb', 'NoNewPrivs', 'Seccomp'}
    return {k: v.strip() for line in Path('/proc/self/status').read_text().splitlines()
            for k, _, v in [line.partition(':')] if k in wanted}


class ArgCmp(C.Structure):
    _fields_ = [('arg', C.c_uint), ('op', C.c_uint),
                ('datum_a', C.c_uint64), ('datum_b', C.c_uint64)]


class CapHeader(C.Structure):
    _fields_ = [('version', C.c_uint32), ('pid', C.c_int)]


class CapData(C.Structure):
    _fields_ = [('effective', C.c_uint32), ('permitted', C.c_uint32), ('inheritable', C.c_uint32)]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--approved-execution', action='store_true')
    p.add_argument('--bundle', required=True, type=Path)
    p.add_argument('--run-dir', required=True, type=Path)
    p.add_argument('--guard', required=True, type=Path)
    p.add_argument('--runner', required=True, type=Path)
    p.add_argument('--test', required=True, choices=TESTS)
    p.add_argument('--host-netns', required=True, type=int)
    p.add_argument('--parent-pid', required=True, type=int)
    a = p.parse_args()
    check(a.approved_execution, 'proposal only: explicit authorized execution required')
    check(sys.platform == 'linux' and os.uname().machine == 'x86_64', 'unsupported OS/architecture')
    check(os.geteuid() == 0, 'privileged setup must occur before dropping all privileges')
    check(os.getppid() == a.parent_pid and a.parent_pid > 1, 'controller identity changed')
    check(os.stat('/proc/self/ns/net').st_ino != a.host_netns, 'still in host network namespace')
    check(pwd.getpwuid(UID).pw_name == 'nobody' and pwd.getpwuid(UID).pw_gid == GID, 'existing unprivileged identity drift')
    fingerprint(NODE, NODE_SHA)
    try:
        capability = os.getxattr(NODE, 'security.capability')
    except OSError as error:
        check(error.errno in (errno.ENODATA, errno.ENOTSUP), 'cannot verify node file capabilities')
    else:
        check(not capability, 'node file capabilities could clear parent-death signal')
    fingerprint(LIB, LIB_SHA)
    root = a.bundle.resolve(strict=True)
    run = a.run_dir.resolve(strict=True)
    check(root.is_dir() and run.is_dir() and not run.is_relative_to(root), 'invalid bundle/run directory layout')
    # Root-owned, non-writable source tree; no symlinks or credentials/env files.
    for entry in [root, *root.rglob('*')]:
        s = entry.lstat()
        check(s.st_uid == 0 and not entry.is_symlink(), 'bundle owner/symlink violation')
        check(not s.st_mode & (stat.S_IWGRP | stat.S_IWOTH), 'bundle writable by another identity')
        check(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode), 'non-file bundle object')
        check(not entry.name.startswith('.env'), 'environment file prohibited')
    check(run.stat().st_uid == 0 and stat.S_IMODE(run.stat().st_mode) == 0o700, 'run directory must be root0700')
    test = inside(root / a.test, root)
    guard = inside(a.guard, root)
    runner = inside(a.runner, root)
    check(runner.name == 'run-sql-sequences.cjs' and guard.name == 'strict-test-guard.cjs', 'unexpected harness')
    check(hashlib.sha256(test.read_bytes()).hexdigest() == TESTS[a.test], 'test source drift')
    check(not (root / 'backend/config/db.js').exists(), 'application database module must not be copied')
    check(not (root / 'backend/server.js').exists() and not (root / 'backend/app.js').exists(), 'application bootstrap prohibited')

    # Logs are the only writable inherited descriptors. No SSH/channel/socket FD.
    for target, name in [(1, 'stdout.tap'), (2, 'stderr.log')]:
        fd = os.open(run / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        check(stat.S_ISREG(os.fstat(fd).st_mode), 'log is not a regular file')
        os.dup2(fd, target)
        os.close(fd)
    fd = os.open('/dev/null', os.O_RDONLY | os.O_NOFOLLOW)
    os.dup2(fd, 0)
    os.close(fd)

    libc = C.CDLL(None, use_errno=True)
    libc.prctl.restype = C.c_int
    sec = C.CDLL(str(LIB), use_errno=True)
    sec.seccomp_arch_native.restype = C.c_uint32
    check(sec.seccomp_arch_native() == SCMP_ARCH_X86_64, 'libseccomp native architecture mismatch')
    sec.seccomp_init.argtypes = [C.c_uint32]; sec.seccomp_init.restype = C.c_void_p
    sec.seccomp_attr_set.argtypes = [C.c_void_p, C.c_int, C.c_uint32]
    sec.seccomp_syscall_resolve_name.argtypes = [C.c_char_p]; sec.seccomp_syscall_resolve_name.restype = C.c_int
    sec.seccomp_rule_add_array.argtypes = [C.c_void_p, C.c_uint32, C.c_int, C.c_uint, C.POINTER(ArgCmp)]
    sec.seccomp_load.argtypes = [C.c_void_p]
    sec.seccomp_release.argtypes = [C.c_void_p]
    numbers = {name: sec.seccomp_syscall_resolve_name(name.encode()) for name in (*DENY, 'clone', 'clone3')}
    check(all(n >= 0 for n in numbers.values()), 'unresolved syscall: no weakened fallback')
    ctx = sec.seccomp_init(SCMP_ALLOW)
    check(bool(ctx), 'seccomp init failed')
    check(sec.seccomp_attr_set(ctx, 2, SCMP_KILL_PROCESS) == 0, 'bad-architecture policy failed')
    for name in DENY:
        check(sec.seccomp_rule_add_array(ctx, SCMP_ERRNO | errno.EPERM, numbers[name], 0, None) == 0, 'syscall rule failed: ' + name)
    # libc pthreads may fall back to classic clone; allow ONLY same-process threads.
    cmp = ArgCmp(0, SCMP_CMP_MASKED_EQ, CLONE_THREAD, 0)
    check(sec.seccomp_rule_add_array(ctx, SCMP_ERRNO | errno.EPERM, numbers['clone'], 1, C.byref(cmp)) == 0, 'non-thread clone rule failed')
    check(sec.seccomp_rule_add_array(ctx, SCMP_ERRNO | errno.ENOSYS, numbers['clone3'], 0, None) == 0, 'clone3 fallback rule failed')

    # Drop bounding/permitted/effective/inheritable/ambient capabilities and groups.
    last_cap = int(Path('/proc/sys/kernel/cap_last_cap').read_text())
    check(0 <= last_cap < 64, 'unsupported capability layout')
    for cap in range(last_cap + 1):
        check(libc.prctl(24, cap, 0, 0, 0) == 0, 'capability bounding drop failed')  # PR_CAPBSET_DROP
    check(libc.prctl(47, 4, 0, 0, 0) == 0, 'ambient capability clear failed')  # PR_CAP_AMBIENT_CLEAR_ALL
    os.setgroups([])
    os.setresgid(GID, GID, GID)
    os.setresuid(UID, UID, UID)
    header = CapHeader(0x20080522, 0)
    data = (CapData * 2)()
    check(libc.capset(C.byref(header), C.byref(data)) == 0, 'capset clear failed')
    check(libc.prctl(38, 1, 0, 0, 0) == 0, 'no_new_privs failed')
    # UID/GID changes clear PDEATHSIG. Set it AFTER them and close the race.
    check(libc.prctl(1, signal.SIGKILL, 0, 0, 0) == 0, 'parent death signal failed')
    check(os.getppid() == a.parent_pid and a.parent_pid > 1, 'controller died during setup')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (180, 180))
    # The approved test-only cgroup TasksMax, not a shared nobody-UID process
    # limit, bounds threads. Kernel filter independently denies process forks.
    os.chdir(root)
    # Do not inherit credentials, NODE_OPTIONS, PG variables, or BILLING_TEST_POSTGRES.
    clean_env = {'PATH': '/usr/bin:/bin', 'HOME': str(root), 'TMPDIR': str(root),
                 'NODE_ENV': 'test', 'BILLING_TEST_POSTGRES': '0',
                 'BILLING_OPERATIONS_ENABLED': 'true'}
    maximum = resource.getrlimit(resource.RLIMIT_NOFILE)[0]
    check(0 < maximum <= 1048576, 'unexpected fd limit')
    os.closerange(3, int(maximum))
    check(stat.S_ISCHR(os.fstat(0).st_mode), 'stdin must be /dev/null character device')
    for f in [1, 2]:
        check(stat.S_ISREG(os.fstat(f).st_mode), 'stdio socket/file drift')
    check(sec.seccomp_load(ctx) == 0, 'seccomp load failed')
    sec.seccomp_release(ctx)
    status = proc_status()
    check(all(int(status[k], 16) == 0 for k in ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']), 'capability not cleared')
    check(status['NoNewPrivs'] == '1' and status['Seccomp'] == '2', 'kernel restriction not active')
    check(os.getuid() == UID and os.geteuid() == UID, 'uid drop failed')

    # After-filter negative canaries only: no real address/path, no valid fork.
    # Missing socket rule can create only an UNCONNECTED FD, closed before abort.
    libc.syscall.restype = C.c_long
    canaries = {}
    for family in [1, 2, 10]:  # AF_UNIX, AF_INET, AF_INET6
        C.set_errno(0)
        result = libc.syscall(numbers['socket'], family, 1, 0)
        error = C.get_errno()
        if result >= 0:
            os.close(result)
        check(result == -1 and error == errno.EPERM, 'socket canary failed')
        canaries['socket_family_' + str(family)] = 'EPERM'
    for name, args, expected in [
        ('connect', (-1, 0, 0), errno.EPERM),
        ('setns', (-1, 0), errno.EPERM),
        ('unshare', (0,), errno.EPERM),
        ('io_uring_setup', (0, 0), errno.EPERM),
        ('pidfd_getfd', (-1, -1, 0), errno.EPERM),
        ('clone3', (0, 0), errno.ENOSYS),
        # CLONE_SIGHAND without CLONE_VM is invalid even absent the filter.
        ('clone', (0x00000800, 0, 0, 0, 0), errno.EPERM),
    ]:
        C.set_errno(0)
        result = libc.syscall(numbers[name], *args)
        check(result == -1 and C.get_errno() == expected, 'safe syscall canary failed: ' + name)
        canaries[name] = errno.errorcode[expected]
    os.write(2, ('SANDBOX_READY ' + json.dumps({'uid': UID, 'gid': GID, 'seccomp': status,
              'networkNamespaceChanged': True, 'inheritedFds': '0=/dev/null;1,2=regular logs;>=3 closed',
              'noNewPrivileges': True, 'canaries': canaries, 'test': a.test}) + '\n').encode())
    # Direct file execution: node:test auto-runs in this process, NO --test forks.
    argv = [str(NODE), '--experimental-permission', '--no-addons',
            '--max-old-space-size=512', '--v8-pool-size=2',
            '--allow-fs-read=' + str(root), '--require', str(guard), str(runner), a.test]
    os.execve(NODE, argv, clean_env)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        # Never print environment, request bodies or credentials.
        os.write(2, ('SANDBOX_REFUSED ' + type(error).__name__ + ': ' + str(error) + '\n').encode())
        raise SystemExit(125)
