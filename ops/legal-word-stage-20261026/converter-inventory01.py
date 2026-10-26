#!/usr/bin/python3
from pathlib import Path
import hashlib
import json
import os
import stat
import subprocess

base = Path('/opt/melamedia-qa-word-converter-20261023')
root = base/'rootfs'
entries = []
files=sorted(root.rglob('*'))
if len(files)>10000: raise RuntimeError('ROOTFS_ENTRY_BOUND')
for p in files:
    info = p.lstat()
    item = {'path': str(p.relative_to(root)), 'mode': oct(stat.S_IMODE(info.st_mode))}
    if stat.S_ISLNK(info.st_mode):
        item['link'] = os.readlink(p)
    elif stat.S_ISREG(info.st_mode):
        item['bytes'] = info.st_size
        item['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
    else:
        continue
    entries.append(item)
body = json.dumps(entries, separators=(',', ':')).encode()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
active = subprocess.run(['systemctl', 'list-units', 'melamedia-qa-word-*', '--state=active',
                         '--plain', '--no-legend', '--no-pager'], capture_output=True,
                        text=True, timeout=5).stdout.strip()
report = {
    'rootfsEntries': entries, 'manifestSha256': hashlib.sha256(body).hexdigest(),
    'globalDpkgStatusSha256': sha('/var/lib/dpkg/status'),
    'fontPackageVersions': subprocess.run(['dpkg-query', '-W', '-f=${Package} ${Version}\n',
        'fonts-dejavu-core', 'fonts-liberation'], text=True, capture_output=True).stdout.strip(),
    'wrapperSha256': sha(base/'managed-soffice.py'),
    'runnerSha256': sha(root/'qa-sandbox-runner.py'),
    'reaperSha256': sha(base/'cleanup-owned-job.py'),
    'remainingOwnedJobDirectories': len(list(Path('/root/qa-new-features-20261023-converter/jobs').iterdir())),
    'activeOwnedUnitsOrTimers': bool(active),
    'qaEnvironmentActivationPerformedByThisAgent': False,
}

report.pop("rootfsEntries",None)
report['rootfsEntryCount']=len(entries)
report['memoryAvailableBytes']=int(next(l.split()[1] for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))*1024
print(json.dumps(report))
