"""Exact Idm-only remnants; no network/provider/backup/restore operations."""
import copy, datetime, fcntl, glob, hashlib, json, os, pathlib, re, stat, subprocess, time, socket, signal
P = pathlib.Path
class Stop(Exception): pass
def need(value, code):
    if not value: raise Stop(code)
def digest(data): return hashlib.sha256(data).hexdigest()
def canon(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def regular(path):
    p = P(path); s = p.lstat()
    need(stat.S_ISREG(s.st_mode) and p.resolve() == p, 'REGULAR_CANONICAL_REQUIRED')
    return s

def run(argv, timeout=30):
    p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    need(p.returncode == 0, 'COMMAND_FAILED:' + P(argv[0]).name)
    return p.stdout

def allowed_server_names(text, allowed):
    names = set(v for line in re.findall(r'\bserver_name\s+([^;]+);', re.sub(r'#[^\n]*', '', text)) for v in line.split())
    need(names and names <= set(allowed), 'VHOST_NOT_EXCLUSIVELY_IDM')

def idm_pm2_log(path):
    p = P(path)
    return str(p.parent) == '/root/.pm2/logs' and bool(re.fullmatch(r'idm-api-(?:out|error)(?:-\d+)?(?:\.log(?:\.\d+(?:\.gz)?)?|__\d{4}-[0-9_.-]+\.log(?:\.gz)?)', p.name))

def log_fields(value):
    found = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('pm_out_log_path', 'pm_err_log_path', 'pm_log_path', 'out_file', 'error_file', 'log_file') and isinstance(item, str) and item.startswith('/'):
                found.add(item)
            elif isinstance(item, (dict, list)):
                found |= log_fields(item)
    elif isinstance(value, list):
        for item in value: found |= log_fields(item)
    return found

def narrow_config(old, kind):
    value = copy.deepcopy(old)
    field, item = ('excluded_projects', 'idm-recovery') if kind == 'retention' else ('protectedRoots', '/root/Idm')
    need(isinstance(value.get(field), list) and value[field].count(item) == 1, 'EXACT_CONFIG_REFERENCE_REQUIRED')
    value[field].remove(item)
    restored = copy.deepcopy(value); restored[field] = old[field]
    need(restored == old, 'UNRELATED_CONFIG_CHANGE')
    return value

def atomic(path, data, expected):
    p = P(path); s = regular(p); need(digest(p.read_bytes()) == expected, 'IMMEDIATE_CONFIG_CAS_FAILED')
    temp = p.with_name('.' + p.name + '.idm-purge-' + str(os.getpid()))
    with temp.open('xb') as f:
        os.fchmod(f.fileno(), stat.S_IMODE(s.st_mode)); os.fchown(f.fileno(), s.st_uid, s.st_gid)
        f.write(data); f.flush(); os.fsync(f.fileno())
    need(digest(p.read_bytes()) == expected, 'SECOND_CONFIG_CAS_FAILED')
    os.replace(temp, p)
    need(p.read_bytes() == data, 'CONFIG_READBACK_FAILED')

def nginx_snapshot(excluded):
    text = run(['nginx', '-T']).decode(errors='replace')
    result = {}
    for path in re.findall(r'^# configuration file ([^\n]+):$', text, re.M):
        if path in excluded: continue
        p = P(path); need(p.exists(), 'ACTIVE_NGINX_PATH_MISSING')
        result[path] = {'resolved': str(p.resolve()), 'link': os.readlink(p) if p.is_symlink() else None, 'sha256': digest(p.read_bytes())}
    need(result, 'NO_ACTIVE_NGINX_CONFIGS')
    return result

def certificate_snapshot(excluded_domain):
    result = {}
    for base in ('/etc/letsencrypt/live', '/etc/letsencrypt/archive', '/etc/letsencrypt/renewal'):
        folder = P(base)
        if not folder.exists(): continue
        members = list(folder.iterdir()); need(len(members) <= 500, 'CERTIFICATE_SCOPE_LIMIT')
        for p in members:
            if p.name in (excluded_domain, excluded_domain + '.conf'): continue
            entries = [p]
            if p.is_dir() and not p.is_symlink(): entries += list(p.rglob('*'))
            need(len(entries) <= 10000, 'CERTIFICATE_METADATA_LIMIT')
            for q in entries:
                s = q.lstat()
                result[str(q)] = [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, stat.S_IMODE(s.st_mode), os.readlink(q) if q.is_symlink() else None]
    return result

def certificate_exclusive(domain, active_before, own_vhosts):
    others = {k: v for k, v in active_before.items() if k not in own_vhosts}
    for path in others:
        text = P(path).read_text(errors='replace')
        need('/etc/letsencrypt/live/' + domain + '/' not in text and '/etc/letsencrypt/archive/' + domain + '/' not in text, 'OTHER_CERTIFICATE_CONSUMER')
    cert = P('/etc/letsencrypt/live') / domain / 'fullchain.pem'
    need(cert.is_symlink() and str(cert.resolve()).startswith('/etc/letsencrypt/archive/' + domain + '/'), 'EXACT_CERTIFICATE_LINEAGE_REQUIRED')
    text = run(['openssl', 'x509', '-in', str(cert), '-noout', '-ext', 'subjectAltName']).decode()
    need(set(re.findall(r'DNS:([^,\s]+)', text)) == {domain}, 'CERTIFICATE_SAN_NOT_EXCLUSIVE')

def public_snapshot(host):
    result = {}
    for path, expected in host['publicPins'].items():
        regular(path); actual = digest(P(path).read_bytes()); need(actual == expected, 'OTHER_PUBLIC_BASELINE_DRIFT')
        result[path] = actual
    return result

def capture_tree(binding):
    path = P(binding['path']); root = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(root.st_mode) and (root.st_dev, root.st_ino) == (binding['device'], binding['inode']), 'EXACT_TREE_ROOT_CHANGED')
    for line in P('/proc/self/mountinfo').read_text().splitlines():
        mount = line.split(' - ', 1)[0].split()[4].replace('\\040', ' ')
        need(mount != str(path) and not mount.startswith(str(path) + '/'), 'MOUNT_INSIDE_PURGE_ROOT')
    files, dirs = {}, {}
    for parent, children, names in os.walk(path, followlinks=False):
        parent = P(parent); s = parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_dev == root.st_dev, 'TREE_DIRECTORY_CHANGED')
        dirs[parent.relative_to(path).as_posix()] = True
        for name in children: need(not (parent / name).is_symlink(), 'TREE_SYMLINK_FORBIDDEN')
        for name in names:
            p = parent / name; s = p.lstat()
            need(stat.S_ISREG(s.st_mode) and s.st_dev == root.st_dev, 'TREE_FILE_TYPE_CHANGED')
            files[p.relative_to(path).as_posix()] = {'inode': s.st_ino, 'bytes': s.st_size, 'mtimeNs': s.st_mtime_ns}
        need(len(files) <= 200000, 'TREE_FILE_LIMIT')
    return {'rootStat': {'device': root.st_dev, 'inode': root.st_ino}, 'files': files, 'directories': dirs}

def parent_fd(rootfd,relative):
    parts=pathlib.PurePosixPath(relative).parts;need(parts and '..' not in parts and not relative.startswith('/'),'UNSAFE_RETIREMENT_PATH');fd=os.dup(rootfd)
    for part in parts[:-1]:
        n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=n
    return fd,parts[-1]
def remove_exact_tree(path):
    fd=os.open(str(path),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        root=os.fstat(fd);need((root.st_dev,root.st_ino)==(C['expected']['rootStat']['device'],C['expected']['rootStat']['inode']),'ROOT_DESCRIPTOR_IDENTITY_CHANGED')
        for name,expected in C['expected']['files'].items():
            pfd,base=parent_fd(fd,name)
            try:
                s=os.stat(base,dir_fd=pfd,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and (s.st_ino,s.st_size,s.st_mtime_ns)==(expected['inode'],expected['bytes'],expected['mtimeNs']),'FILE_IMMEDIATE_DELETE_CAS_FAILED');os.unlink(base,dir_fd=pfd)
            finally:os.close(pfd)
        for name in sorted((p for p in C['expected']['directories'] if p!='.'),key=lambda x:len(pathlib.PurePosixPath(x).parts),reverse=True):
            pfd,base=parent_fd(fd,name)
            try:os.rmdir(base,dir_fd=pfd)
            finally:os.close(pfd)
    finally:os.close(fd)
    path.rmdir()

def own_mutex(host):
    names = {'37.60.230.148': '/run/lock/melamedia-legal-idm-release.lock', '84.46.253.85': '/run/lock/legal-idm-release.lock'}
    need(host in names, 'HOST_MUTEX_SCOPE')
    return names[host]

def reject_other_nginx_log_references(selected, other_active):
    for path in other_active:
        text = re.sub(r'#[^\n]*', '', P(path).read_text(errors='replace'))
        for log in selected:
            pattern = r'(?<![A-Za-z0-9_./-])' + re.escape(log) + r'(?![A-Za-z0-9_./-])'
            need(re.search(pattern, text) is None, 'OTHER_ACTIVE_NGINX_REFERENCES_IDM_LOG')

def main(contract, host_key):
    global C
    os.umask(0o077); host = contract['hosts'][host_key]; events = []; mutated = False
    def deadline(signum, frame): raise Stop('BOUNDED_PURGE_DEADLINE')
    signal.signal(signal.SIGALRM, deadline); signal.alarm(150)
    need(os.geteuid() == 0 and host_key in ('84.46.253.85', '37.60.230.148'), 'HOST_SCOPE')
    need(socket.gethostname() == {'84.46.253.85': 'vmi3233549', '37.60.230.148': 'vmi2784047'}[host_key], 'HOSTNAME_SCOPE')
    if host_key == '37.60.230.148':
        binding = contract.get('cloudPrefixPurgeBinding')
        need(isinstance(binding, dict) and bool(re.fullmatch('[a-f0-9]{64}', binding.get('sha256', ''))), 'ACTUAL_CLOUD_PREFIX_PURGE_BINDING_REQUIRED')
    locks = []
    try:
        for name in ['/run/lock/melamedia-release-maintenance.lock', own_mutex(host_key)]:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW); fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); locks.append(fd)
        need(not P('/root/Idm').exists() if host_key == '37.60.230.148' else not P('/var/www/idm').exists(), 'LIVE_IDM_ROOT_STILL_EXISTS')
        own = host['enabledVhost']; inactive = host['inactiveVhost']; public = public_snapshot(host)
        all_nginx = nginx_snapshot(set()); other_nginx = {k: v for k, v in all_nginx.items() if k not in (own, inactive)}
        before_vhosts = {}
        for path in (own, inactive):
            p = P(path); regular(p); text = p.read_bytes(); allowed_server_names(text.decode(), host['serverNames']); before_vhosts[path] = (text, p.stat())
        need(digest(before_vhosts[own][0]) == host['enabledVhostSha256'], 'OWN_VHOST_CHANGED')
        certificate_exclusive(host['certDomain'], all_nginx, {own, inactive}); other_certs = certificate_snapshot(host['certDomain'])
        trees = [(b, capture_tree(b)) for b in host['trees']]
        pm2_logs = set()
        if host_key == '37.60.230.148':
            current = json.loads(run(['pm2', 'jlist'], 20)); need(all(x.get('pm_id') != 6 for x in current), 'IDM_PROCESS_STILL_REGISTERED')
            other_logs = log_fields(current)
            old = P('/root/idm-backend-retirement-20261025-v2/own-pm2-before.private.json')
            for path in log_fields(json.loads(old.read_text())):
                need(idm_pm2_log(path), 'SAVED_LOG_PATH_NOT_EXCLUSIVE_IDM'); pm2_logs.add(path)
            for pattern in ('idm-api-out*', 'idm-api-error*'):
                matches = list(P('/root/.pm2/logs').glob(pattern)); need(len(matches) <= 500, 'PM2_LOG_SCOPE_LIMIT')
                need(all(idm_pm2_log(str(p)) for p in matches), 'UNKNOWN_IDM_LOG_BASENAME_REVIEW_REQUIRED')
                pm2_logs.update(str(p) for p in matches)
            need(not pm2_logs.intersection(other_logs), 'OTHER_PROCESS_SHARES_IDM_LOG')
            for selected in pm2_logs:
                candidate = P(selected)
                for other in other_logs:
                    peer = P(other)
                    need(candidate.resolve() != peer.resolve(), 'OTHER_PROCESS_LOG_ALIAS')
                    if candidate.exists() and peer.exists():
                        a, b = candidate.stat(), peer.stat(); need((a.st_dev, a.st_ino) != (b.st_dev, b.st_ino), 'OTHER_PROCESS_LOG_HARDLINK')
        old_configs = {}; new_configs = {}
        for item in host['configEdits']:
            p = P(item['path']); regular(p); raw = p.read_bytes(); need(digest(raw) == item['sha256'], 'CONFIG_BASELINE_CHANGED')
            old_configs[str(p)] = raw; new_configs[str(p)] = json.dumps(narrow_config(json.loads(raw), item['kind']), indent=2).encode() + b'\n'
        reject_other_nginx_log_references(set(host['nginxLogs']) | pm2_logs, other_nginx)
        # All rejection preconditions above precede the first mutation.
        mutated = True
        try:
            for path in (own, inactive):
                regular(path); need(P(path).read_bytes() == before_vhosts[path][0], 'VHOST_IMMEDIATE_CAS_FAILED'); P(path).unlink()
            run(['nginx', '-t']); run(['systemctl', 'reload', 'nginx'])
            need(nginx_snapshot(set()) == other_nginx, 'OTHER_ACTIVE_NGINX_CONFIG_CHANGED')
            need(public_snapshot(host) == public, 'OTHER_PUBLIC_CHANGED')
        except Exception:
            # Restore only files we removed/changed, in memory; never clobber an unknown actor.
            for path, (data, s) in before_vhosts.items():
                p = P(path)
                if not p.exists():
                    with p.open('xb') as f: os.fchmod(f.fileno(), stat.S_IMODE(s.st_mode)); os.fchown(f.fileno(), s.st_uid, s.st_gid); f.write(data); f.flush(); os.fsync(f.fileno())
                else:
                    regular(p); need(p.read_bytes() == data, 'UNKNOWN_VHOST_ACTOR_NO_ROLLBACK')
            run(['nginx', '-t']); run(['systemctl', 'reload', 'nginx']); raise
        events.append('exact-idm-vhosts-removed-other-nginx-public-preserved')
        run(['certbot', 'delete', '--non-interactive', '--cert-name', host['certDomain']], 60)
        for path in ('/etc/letsencrypt/live/' + host['certDomain'], '/etc/letsencrypt/archive/' + host['certDomain'], '/etc/letsencrypt/renewal/' + host['certDomain'] + '.conf'):
            need(not P(path).exists() and not P(path).is_symlink(), 'IDM_CERTIFICATE_LINEAGE_NOT_REMOVED')
        need(certificate_snapshot(host['certDomain']) == other_certs, 'OTHER_CERTIFICATE_METADATA_CHANGED')
        need(nginx_snapshot(set()) == other_nginx and public_snapshot(host) == public, 'OTHER_RESOURCES_CHANGED_AFTER_CERTBOT')
        events.append('dedicated-idm-certificate-lineage-removed-other-lineages-preserved')
        logs = set(host['nginxLogs']) | pm2_logs
        reject_other_nginx_log_references(logs, other_nginx)
        for path in sorted(logs):
            p = P(path)
            if not p.exists(): continue
            regular(p); s = p.lstat()
            need(path in host['nginxLogs'] or idm_pm2_log(path), 'LOG_SCOPE')
            need(p.lstat().st_ino == s.st_ino, 'LOG_IDENTITY_CHANGED'); p.unlink()
        deleted_files = deleted_bytes = 0
        def purge_tree(binding, expected):
            global C
            need(capture_tree(binding) == expected, 'DEDICATED_TREE_CHANGED_AFTER_PREFLIGHT')
            C = {'expected': expected}; remove_exact_tree(P(binding['path']))
            events.append('dedicated-tree-removed:' + binding['path'])
            return len(expected['files']), sum(v['bytes'] for v in expected['files'].values())
        preimages = []
        for binding, expected in trees:
            if binding['path'].endswith('/idm-scheduled-deregistration05'):
                preimages.append((binding, expected)); continue
            count, size = purge_tree(binding, expected); deleted_files += count; deleted_bytes += size
        # Root binds actual completed cloud-prefix purge before BE execution. Metadata CAS is last.
        written = []
        try:
            for path, data in new_configs.items():
                atomic(path, data, digest(old_configs[path])); written.append(path); events.append('exact-config-reference-removed:' + path)
        except Exception:
            for path in reversed(written): atomic(path, old_configs[path], digest(new_configs[path]))
            raise
        for binding, expected in preimages:
            count, size = purge_tree(binding, expected); deleted_files += count; deleted_bytes += size
        need(nginx_snapshot(set()) == other_nginx and public_snapshot(host) == public, 'FINAL_OTHER_RESOURCE_DRIFT')
        for path, data in new_configs.items(): need(P(path).read_bytes() == data, 'FINAL_CONFIG_DRIFT')
        print(json.dumps({'at': now(), 'result': 'PASS_EXACT_IDM_REMOTE_REMNANTS_PURGED', 'host': host_key, 'contractSha256': CONTRACT_SHA, 'events': events, 'dedicatedRecoveryFilesRemoved': deleted_files, 'dedicatedRecoveryBytesRemoved': deleted_bytes, 'IdmLogFilesSelected': len(logs), 'pm2LogPaths': sorted(pm2_logs), 'otherNginxPublicCertsPreserved': True, 'sharedArchivesAccountsPM2DumpsUntouched': True, 'noBackupRestoreProviderJobs': True}))
    except Exception as e:
        print(json.dumps({'at': now(), 'result': 'STOPPED_NO_BLIND_RETRY', 'host': host_key, 'contractSha256': CONTRACT_SHA, 'partialMutationPossible': mutated, 'completedEvents': events, 'errorClass': type(e).__name__, 'code': str(e) if isinstance(e, Stop) else 'OPERATION_FAILED'}))
        raise SystemExit(1)
    finally:
        signal.alarm(0)
        for fd in reversed(locks): fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)
