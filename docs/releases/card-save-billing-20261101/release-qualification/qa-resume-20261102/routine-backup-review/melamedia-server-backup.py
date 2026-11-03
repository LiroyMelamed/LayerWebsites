#!/usr/bin/env python3
"""Root-only, dated recovery bundles; no application writes or remote deletion.

Only the public CMS recipient is installed on servers. Recovery private key stays
on the operator workstation. Remote coverage is successful only after readback.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from urllib.parse import quote, urlsplit


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def run(args, *, stdout=subprocess.DEVNULL, input=None, timeout=600):
    # Error text can contain connection secrets or database contents: never log it.
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=stdout,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        p.communicate(input=input, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        p.wait()
        raise RuntimeError(f'{Path(args[0]).name} timeout') from None
    if p.returncode:
        raise RuntimeError(f'{Path(args[0]).name} exit={p.returncode}')


def env_values(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$', line)
        if not m:
            continue
        value = m[2].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        else:
            value = re.split(r'\s+#', value, maxsplit=1)[0].rstrip()
        result[m[1]] = value
    return result


def curl_config(value):
    if any(c in value for c in '\n\r\0'):
        raise ValueError('Invalid multiline storage setting')
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def transfer_timeout(size):
    if type(size) is not int or size <= 0:
        raise RuntimeError('Invalid transfer size')
    # Allow a 1 MiB/s transfer plus setup time, while keeping the job bounded.
    return max(600, min(1800, math.ceil(size / (1024 * 1024)) + 300))


def remote_transfer(method, local, env_path, expected_bucket, key, expected_bytes=None):
    if method not in ('GET', 'PUT'):
        raise RuntimeError('Unsupported transfer method')
    e = env_values(env_path)
    if any(not e.get(k) for k in ['S3_ENDPOINT', 'S3_BUCKET', 'S3_KEY', 'S3_SECRET']):
        raise RuntimeError('Storage configuration incomplete')
    if e['S3_BUCKET'] != expected_bucket:
        raise RuntimeError('Storage bucket changed; review required')
    endpoint = urlsplit(e['S3_ENDPOINT'])
    if (endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username or endpoint.password
            or endpoint.port not in (None, 443) or endpoint.query or endpoint.fragment or endpoint.path not in ['', '/']):
        raise RuntimeError('Invalid HTTPS storage endpoint')
    if not re.fullmatch(r'[a-zA-Z0-9.-]+\.r2\.cloudflarestorage\.com', endpoint.hostname):
        raise RuntimeError('Unreviewed storage endpoint')
    size = Path(local).stat().st_size if method == 'PUT' else (expected_bytes if expected_bytes is not None else 2 * 1024**3)
    per_attempt = transfer_timeout(size)
    url = e['S3_ENDPOINT'].rstrip('/') + '/' + quote(expected_bucket, safe='') + '/' + quote(key, safe='/')
    sha = digest(local) if method == 'PUT' else hashlib.sha256(b'').hexdigest()
    cfg = ('user = ' + curl_config(e['S3_KEY'] + ':' + e['S3_SECRET']) + '\n'
           'header = ' + curl_config('x-amz-content-sha256: ' + sha) + '\n')
    # Only retry known connection/transfer faults. Authentication and validation
    # failures stop immediately. Each GET opens its output afresh; PUT is the
    # same immutable ciphertext/key, so a retry cannot create a duplicate backup.
    transient = {'curl timeout'} | {'curl exit=' + str(n) for n in (5, 6, 7, 18, 28, 35, 52, 55, 56, 92)}
    deadline = time.monotonic() + per_attempt + 315
    for attempt in range(3):
        remaining = int(deadline - time.monotonic())
        if remaining <= 15:
            raise RuntimeError('Offsite ' + method + ' retry budget exhausted')
        limit = min(per_attempt, remaining - 10)
        args = ['/usr/bin/curl', '--disable', '--config', '-', '--aws-sigv4', 'aws:amz:auto:s3',
                '--silent', '--fail', '--connect-timeout', '15', '--max-time', str(limit),
                '--proto', '=https', '--url', url]
        if method == 'PUT':
            args += ['--upload-file', str(local), '--output', '/dev/null']
        else:
            args += ['--max-filesize', str(size), '--output', str(local)]
        try:
            run(args, input=cfg.encode(), timeout=limit + 10)
            return
        except RuntimeError as error:
            if str(error) not in transient or attempt == 2:
                raise RuntimeError('Offsite ' + method + ' failed: ' + str(error)) from None
            time.sleep(min(2 ** attempt, max(0, deadline - time.monotonic() - 15)))


def prune(root, now, retention_days, max_complete_sets=None):
    complete = []
    for p in root.iterdir():
        # No globs over unrelated backups; no symlink traversal; complete sets only.
        if p.is_symlink() or not p.is_dir() or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}', p.name):
            continue
        m = p / 'manifest.json'
        if not m.is_file() or m.is_symlink():
            continue
        try:
            data = json.loads(m.read_text())
            old = dt.datetime.fromisoformat(data['created_at'])
            if data.get('local_complete') is True and now - old > dt.timedelta(days=retention_days):
                shutil.rmtree(p)
            elif data.get('local_complete') is True:
                complete.append((old, p))
        except (ValueError, KeyError, TypeError):
            continue
    if max_complete_sets is not None:
        for _, p in sorted(complete, reverse=True)[max_complete_sets:]:
            shutil.rmtree(p)


def database_only_scope(project, config, *, sqlite_supported=False):
    """Fail closed on accidental file backups or empty database-only bundles."""
    if config.get('backup_scope', 'database-only') != 'database-only':
        raise RuntimeError('Unsupported backup scope')
    postgres_enabled = 'database' in project
    sqlite_enabled = 'sqlite_database' in project
    if int(postgres_enabled) + int(sqlite_enabled) != 1:
        raise RuntimeError('Database-only backup requires exactly one database source')
    if postgres_enabled:
        database = project['database']
        if (not isinstance(database, str)
                or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*', database)):
            raise RuntimeError('Invalid PostgreSQL database-only source')
    else:
        source = project['sqlite_database']
        if (not sqlite_supported or not isinstance(source, str) or not source
                or any(ord(c) < 32 for c in source) or not Path(source).is_absolute()):
            raise RuntimeError('Invalid SQLite database-only source')
    if project.get('recovery_paths', []) != [] or 'object_snapshot' in project:
        raise RuntimeError('Database-only backup must not include files or object snapshots')
    return True


def backup(project, config, stamp):
    name = project['name']
    if not re.fullmatch(r'[a-z0-9-]+', name):
        raise ValueError('Invalid project name')
    database_only = database_only_scope(project, config, sqlite_supported=False)
    root = Path(config['root']) / name
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    now = dt.datetime.now(dt.timezone.utc)
    final = root / (stamp + '-' + os.urandom(4).hex())
    with tempfile.TemporaryDirectory(prefix='.partial-', dir=root) as tmp:
        work = Path(tmp)
        payload = work / 'payload'
        payload.mkdir(mode=0o700)
        files = []
        if project.get('database'):
            dump = payload / 'database.dump'
            with dump.open('wb') as out:
                run(['runuser', '-u', 'postgres', '--', 'pg_dump', '-Fc',
                     '--dbname', project['database']], stdout=out)
            run(['pg_restore', '--list', str(dump)])
            run(['pg_restore', '--file=/dev/null', str(dump)])
            files.append({'name': 'database.dump', 'sha256': digest(dump), 'bytes': dump.stat().st_size})
        inner = {'project': name, 'host': config['host'], 'created_at': now.isoformat(),
                 'database': project.get('database'), 'recovery_paths': project.get('recovery_paths', []),
                 'files': files, 'shared_recovery_project': project.get('shared_recovery_project'),
                 'source_status': project.get('source_status', 'live')}
        if database_only:
            expected_payload = 'database.dump'
            if ({p.name for p in payload.iterdir()} != {expected_payload}
                    or len(files) != 1 or files[0]['name'] != expected_payload):
                raise RuntimeError('Database-only payload scope mismatch')
            inner.update(backup_scope='database-only', database_kind='postgresql',
                         shared_recovery_project=None)
        (payload / 'manifest.json').write_text(json.dumps(inner, indent=2) + '\n')
        plain = work / 'bundle.tar'
        run(['tar', '--create', '--file', str(plain), '--directory', str(payload), '.'])
        enc = work / 'bundle.cms'
        run(['openssl', 'cms', '-encrypt', '-binary', '-aes-256-gcm', '-outform', 'DER',
             '-in', str(plain), '-out', str(enc), config['recipient']])
        final.mkdir(mode=0o700)
        shutil.move(enc, final / 'bundle.cms')
    artifact = final / 'bundle.cms'
    info = {'project': name, 'host': config['host'], 'created_at': now.isoformat(),
            'local_complete': True, 'encrypted': True, 'sha256': digest(artifact),
            'bytes': artifact.stat().st_size, 'offsite': 'pending_destination'}
    if database_only:
        info.update(backup_scope='database-only', database_kind='postgresql')
    manifest = final / 'manifest.json'
    manifest.write_text(json.dumps(info, indent=2) + '\n')
    storage = project.get('storage')
    if storage:
        key = 'server-recovery/' + config['host'] + '/' + name + '/' + final.name + '.cms'
        try:
            remote_transfer('PUT', artifact, storage['env'], storage['bucket'], key)
            with tempfile.TemporaryDirectory(prefix='.readback-', dir=root) as tmp:
                readback = Path(tmp) / 'bundle.cms'
                remote_transfer('GET', readback, storage['env'], storage['bucket'], key, info['bytes'])
                if digest(readback) != info['sha256']:
                    raise RuntimeError('Offsite checksum mismatch')
            info.update(offsite='verified_readback', remote_key=key)
        except Exception as e:
            info.update(offsite='failed', failure=type(e).__name__,
                        failure_stage=str(e) if isinstance(e, RuntimeError) else 'storage')
    manifest.write_text(json.dumps(info, indent=2) + '\n')
    # Expiry is delegated to the verified 72-hour retention service.
    print(json.dumps(info), flush=True)
    return info['local_complete'] if config.get('local_generation_only') else info['offsite'] == 'verified_readback'


def main():
    os.umask(0o077)
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--project')
    args = ap.parse_args()
    config = json.loads(Path(args.config).read_text())
    if socket.gethostname() != config['host']:
        raise SystemExit('Host identity mismatch')
    root = Path(config['root'])
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        results = []
        projects = [p for p in config['projects'] if not args.project or p['name'] == args.project]
        if not projects:
            raise SystemExit('Unknown project')
        for project in projects:
            try:
                results.append(backup(project, config, stamp))
            except Exception as e:
                print(json.dumps({'project': project['name'], 'local_complete': False,
                                  'error_type': type(e).__name__,
                                  'failure_stage': str(e) if isinstance(e, RuntimeError) else 'local'}), flush=True)
                results.append(False)
        # Missing remote coverage is not reported as overall successful backup.
        raise SystemExit(0 if all(results) else 3)


if __name__ == '__main__':
    main()
