#!/usr/bin/env python3
"""Independent Mac ciphertext download, authenticated decrypt and full offline restore."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import tarfile
import tempfile

sha = lambda b: hashlib.sha256(b).hexdigest()


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda: f.read(1048576), b''):
            h.update(data)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--contract', required=True)
    p.add_argument('--contract-sha', required=True)
    p.add_argument('--backup-receipt', required=True)
    p.add_argument('--private-key', required=True)
    p.add_argument('--execute-reviewed', action='store_true')
    a = p.parse_args()
    raw = pathlib.Path(a.contract).read_bytes()
    assert sha(raw) == a.contract_sha, 'CONTRACT_HASH_MISMATCH'
    c = json.loads(raw)
    assert sha(pathlib.Path(__file__).read_bytes()) == c['offsiteVerifierSha256'], 'VERIFIER_HASH_MISMATCH'
    r = json.loads(pathlib.Path(a.backup_receipt).read_text())
    assert r['tenant'] == 'idm' and r['phase'] == 'backup' and r['contractSha256'] == a.contract_sha
    assert r['manifestSha256'] == c['expected']['manifestSha256']
    if not a.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_OFFSITE_RESTORE_PLAN_ONLY', 'ciphertextSha256': r['ciphertextSha256'],
                          'remoteCiphertext': '/root/idm-frontend-retirement-20261025/payload.tar.gz.cms',
                          'noNetworkNoPrivateKeyUse': True}))
        return
    key = pathlib.Path(a.private_key)
    assert key.is_file() and not key.is_symlink() and stat.S_IMODE(key.stat().st_mode) & 0o077 == 0, 'PRIVATE_KEY_IDENTITY_OR_MODE'
    os.umask(0o077)
    private = pathlib.Path(c['localPrivateRoot'])
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    assert private.resolve() == private and not private.is_symlink()
    archive = private / 'idm-frontend-payload.tar.gz.cms'
    assert not archive.exists() and not archive.is_symlink(), 'OFFSITE_ARCHIVE_COLLISION_NO_BLIND_RETRY'
    remote = """import os,fcntl,pathlib,stat,sys
fd=os.open('/run/lock/melamedia-release-maintenance.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB)
p=pathlib.Path('/root/idm-frontend-retirement-20261025/payload.tar.gz.cms');s=p.lstat()
assert stat.S_ISREG(s.st_mode) and p.resolve()==p and 0<s.st_size<1600000000
with p.open('rb') as f:
 for data in iter(lambda:f.read(1048576),b''):sys.stdout.buffer.write(data)
fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
"""
    with archive.open('xb') as output, (private / 'offsite-download.stderr').open('xb') as errors:
        proc = subprocess.run(['ssh', '-i', str(pathlib.Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                               'root@84.46.253.85', 'python3 -'], input=remote.encode(), stdout=output, stderr=errors, timeout=120)
    assert proc.returncode == 0 and archive.stat().st_size == r['ciphertextBytes'] and digest(archive) == r['ciphertextSha256'], 'OFFSITE_READBACK_MISMATCH'
    expected = {'var/www/idm/' + name: value['sha256'] for name, value in c['expected']['files'].items()}
    expected['etc/nginx/sites-enabled/idm'] = c['expected']['nginx']['activeConfigFiles']['/etc/nginx/sites-enabled/idm']['sha256']
    expected['retirement-manifest.json'] = sha(json.dumps(c['expected'], sort_keys=True, separators=(',', ':')).encode() + b'\n')
    with tempfile.TemporaryDirectory(prefix='idm-restore-', dir=private) as tmp:
        tmp = pathlib.Path(tmp)
        plain = tmp / 'payload.tar.gz'
        with (private / 'offsite-decrypt.stderr').open('xb') as errors:
            proc = subprocess.run(['/opt/homebrew/bin/openssl', 'cms', '-decrypt', '-binary', '-inform', 'DER', '-in', str(archive), '-inkey', str(key), '-out', str(plain)],
                                  stdout=subprocess.DEVNULL, stderr=errors, timeout=120)
        assert proc.returncode == 0 and digest(plain) == r['compressedPlaintextSha256'], 'AUTHENTICATED_DECRYPT_OR_TAR_HASH_FAILED'
        restored = tmp / 'restored'
        restored.mkdir(mode=0o700)
        seen = set()
        with tarfile.open(plain, 'r:*') as tar:
            for member in tar:
                name = member.name.rstrip('/')
                assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
                destination = restored / name
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
                    continue
                assert member.isfile() and name in expected and name not in seen, 'UNEXPECTED_RESTORE_MEMBER'
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with destination.open('xb') as output:
                    source = tar.extractfile(member)
                    for data in iter(lambda: source.read(1048576), b''):
                        output.write(data)
                assert digest(destination) == expected[name], 'RESTORED_FILE_HASH_MISMATCH'
                seen.add(name)
        assert seen == set(expected), 'RESTORED_MEMBER_MISSING'
        assert json.loads((restored / 'retirement-manifest.json').read_text()) == c['expected'], 'RESTORED_MANIFEST_MISMATCH'
    result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tenant': 'idm',
              'status': 'VERIFIED_OFFSITE_CIPHERTEXT_AND_FULL_OFFLINE_ARCHIVE', 'offsiteHost': 'owner-mac',
              'contractSha256': a.contract_sha, 'ciphertextSha256': r['ciphertextSha256'],
              'compressedPlaintextSha256': r['compressedPlaintextSha256'], 'plaintextArchiveFormat': 'tar.gz', 'manifestSha256': r['manifestSha256'],
              'verifiedMemberCount': len(seen), 'privateCiphertext': str(archive),
              'fullOfflineExtractionAndHashes': True, 'privateKeyNeverExported': True,
              'liveRestoreOrRemoteWrite': False, 'plaintextRestoreTemporaryDirectoryRemoved': True}
    receipt = private / 'verified-offsite-restore.json'
    assert not receipt.exists(), 'OFFSITE_RECEIPT_COLLISION'
    receipt.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'result': result['status'], 'receipt': str(receipt), 'sha256': sha(receipt.read_bytes())}))


if __name__ == '__main__':
    if not __debug__:
        raise SystemExit('PYTHON_OPTIMIZATION_FORBIDDEN')
    main()
