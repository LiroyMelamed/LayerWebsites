#!/usr/bin/env python3
"""Idm-only retirement packet. Default is local plan; every remote phase needs review."""
import argparse
import base64
import datetime
import hashlib
import json
import pathlib
import subprocess

sha = lambda b: hashlib.sha256(b).hexdigest()
PHASES = ('backup', 'retire', 'remove')

REMOTE = r'''
import datetime,fcntl,hashlib,json,os,pathlib,re,shutil,stat,subprocess,tarfile,time,uuid
sha=lambda b:hashlib.sha256(b).hexdigest()
class Stop(Exception):pass
def need(ok,code):
    if not ok:raise Stop(code)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
ROOT=pathlib.Path('/var/www/idm')
STAGE=pathlib.Path('/root/idm-frontend-retirement-20261025')
VHOST=pathlib.Path('/etc/nginx/sites-enabled/idm')
def regular(path):
    s=path.lstat();need(stat.S_ISREG(s.st_mode) and path.resolve()==path,'EXPECTED_CANONICAL_REGULAR_FILE');return s
def filehash(path):
    regular(path);h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def journal(event,**fields):
    p=STAGE/'journal.jsonl'
    with p.open('ab') as f:f.write(canonical({'at':stamp(),'event':event,**fields})+b'\n');f.flush();os.fsync(f.fileno())
def jsonwrite(path,value):
    with path.open('xb') as f:f.write(canonical(value)+b'\n');f.flush();os.fsync(f.fileno())
    path.chmod(0o600)
def root_manifest(path):
    need(path.resolve()==path and path.is_dir() and not path.is_symlink(),'ROOT_IDENTITY_FAILED')
    st=path.stat();need(st.st_ino==C['expected']['rootStat']['inode'] and st.st_dev==C['expected']['rootStat']['device'],'ROOT_INODE_OR_DEVICE_CHANGED')
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        mount=line.split(' - ',1)[0].split()[4].replace('\\040',' ')
        need(mount!=str(path) and not mount.startswith(str(path)+'/'),'MOUNT_INSIDE_RETIREMENT_ROOT')
    files={};dirs={}
    for parent,children,names in os.walk(path,followlinks=False):
        p=pathlib.Path(parent);s=p.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_dev==st.st_dev,'DIRECTORY_CHANGED')
        rel=p.relative_to(path).as_posix();dirs[rel]={'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'gid':s.st_gid}
        for name in children:need(not (p/name).is_symlink(),'SYMLINK_APPEARED')
        for name in names:
            p1=p/name;s=p1.lstat();need(stat.S_ISREG(s.st_mode) and s.st_dev==st.st_dev,'UNEXPECTED_FILE_TYPE')
            files[p1.relative_to(path).as_posix()]={'bytes':s.st_size,'sha256':filehash(p1),'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':s.st_mtime_ns,'inode':s.st_ino,'allocatedBytes':s.st_blocks*512}
    need(files==C['expected']['files'] and dirs==C['expected']['directories'],'EXACT_ROOT_MANIFEST_CHANGED')
    return sha(canonical({'files':files,'directories':dirs,'symlinks':{}}))
def protect_config(retired=False):
    for path,info in C['expected']['nginx']['activeConfigFiles'].items():
        p=pathlib.Path(path);need(str(p.resolve())==info['resolved'] and p.is_symlink()==info['isSymlink'],'ACTIVE_CONFIG_PATH_CHANGED')
        if p.is_symlink():need(os.readlink(p)==info['symlinkTarget'],'ACTIVE_CONFIG_SYMLINK_CHANGED')
        expected=C['tombstoneSha256'] if path==str(VHOST) and retired else info['sha256']
        need(sha(p.read_bytes())==expected,'ACTIVE_CONFIG_BYTES_CHANGED')
    import glob
    for edge in C['expected']['nginx']['includeEdges']:
        need(sorted(glob.glob(edge['pattern']))==edge['matches'],'ACTIVE_INCLUDE_MEMBERSHIP_CHANGED')
    for dependency in C['expected']['nginx']['unreadActiveIncludesOutsideReviewedConfigRoots']:
        need(str(pathlib.Path(dependency['path']).resolve())==dependency['resolved'],'PRESERVED_GLOBAL_MODULE_PATH_CHANGED')
    for path,digest in C['neighbourPublicHashes'].items():need(filehash(pathlib.Path(path))==digest,'OTHER_TENANT_PUBLIC_ENTRYPOINT_CHANGED')
    renewal=C['renewal'];need(filehash(pathlib.Path(renewal['path']))==renewal['sha256'],'RENEWAL_CONFIGURATION_CHANGED')
def verify_archive(path):
    expected={'var/www/idm/'+p:v['sha256'] for p,v in C['expected']['files'].items()}
    expected['etc/nginx/sites-enabled/idm']=C['expected']['nginx']['activeConfigFiles'][str(VHOST)]['sha256']
    expected['retirement-manifest.json']=sha(canonical(C['expected'])+b'\n')
    seen=set()
    with tarfile.open(path,'r:*') as tf:
        for m in tf:
            name=m.name.rstrip('/');need(not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts,'UNSAFE_ARCHIVE_MEMBER')
            if m.isdir():continue
            need(m.isfile() and name in expected and name not in seen,'UNEXPECTED_ARCHIVE_MEMBER')
            h=hashlib.sha256();f=tf.extractfile(m)
            for b in iter(lambda:f.read(1048576),b''):h.update(b)
            need(h.hexdigest()==expected[name],'ARCHIVE_MEMBER_BYTES_CHANGED');seen.add(name)
    need(seen==set(expected),'ARCHIVE_MEMBER_MISSING')
    return len(seen)
def backup_gate():
    regular(STAGE/'backup-receipt.json');r=json.loads((STAGE/'backup-receipt.json').read_text())
    need(r['contractSha256']==CONTRACT_SHA and r['manifestSha256']==C['expected']['manifestSha256'],'BACKUP_CONTRACT_MISMATCH')
    need(filehash(STAGE/'payload.tar.gz.cms')==r['ciphertextSha256'],'BACKUP_CIPHERTEXT_CHANGED')
    need(isinstance(OFFSITE,dict) and OFFSITE.get('status')=='VERIFIED_OFFSITE_CIPHERTEXT_AND_FULL_OFFLINE_ARCHIVE','OFFSITE_RESTORE_PROOF_REQUIRED')
    need(OFFSITE.get('contractSha256')==CONTRACT_SHA and OFFSITE.get('ciphertextSha256')==r['ciphertextSha256'] and OFFSITE.get('compressedPlaintextSha256')==r['compressedPlaintextSha256'] and OFFSITE.get('manifestSha256')==r['manifestSha256'],'OFFSITE_PROOF_BINDING_FAILED')
    need(OFFSITE.get('verifiedMemberCount')==C['expected']['fileCount']+2 and OFFSITE.get('offsiteHost')=='owner-mac','OFFSITE_FULL_MEMBER_VERIFICATION_REQUIRED')
    return r
def atomic_vhost(data,expected):
    need(filehash(VHOST)==expected,'VHOST_IMMEDIATE_CAS_FAILED');old=VHOST.stat();tmp=pathlib.Path('/etc/nginx/.idm-retirement-'+sha(data)[:16]+'.tmp')
    need(not tmp.exists() and not tmp.is_symlink(),'VHOST_TEMP_COLLISION')
    with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    os.chmod(tmp,stat.S_IMODE(old.st_mode));os.chown(tmp,old.st_uid,old.st_gid)
    need(filehash(VHOST)==expected,'VHOST_SECOND_CAS_FAILED');os.replace(tmp,VHOST)
    fd=os.open(str(VHOST.parent),os.O_DIRECTORY|os.O_RDONLY);os.fsync(fd);os.close(fd)
def nginx(action):
    cmd=['nginx','-t'] if action=='test' else ['systemctl','reload','nginx']
    with (STAGE/('nginx-'+action+'-'+str(os.getpid())+'-'+uuid.uuid4().hex+'.log')).open('xb') as log:
        p=subprocess.run(cmd,stdout=log,stderr=log,timeout=30)
    need(p.returncode==0,'NGINX_'+action.upper()+'_FAILED')
def _tombstone_probe(scheme,port,remaining):
    started=time.monotonic();limit=min(1.5,remaining);args=['curl','--silent','--show-error','--noproxy','*','--max-time',str(limit),'--resolve','idm.mela-media.co.il:'+str(port)+':127.0.0.1','-o','/dev/null','-w','%{http_code}',scheme+'://idm.mela-media.co.il/']
    try:
        x=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=limit);raw=x.stdout.decode(errors='replace');return{'exitCode':x.returncode,'status':int(raw)if re.fullmatch('[0-9]{3}',raw)else None,'durationMs':round((time.monotonic()-started)*1000),'errorClass':None if x.returncode==0 else'CURL_TRANSPORT'}
    except subprocess.TimeoutExpired:return{'exitCode':124,'status':None,'durationMs':round((time.monotonic()-started)*1000),'errorClass':'ABSOLUTE_TIMEOUT'}
def tombstone_smoke(clock=time.monotonic,sleep=time.sleep,probe=None,journal_fn=None,budget_s=8.0):
    need(isinstance(budget_s,(int,float))and 0<budget_s<=8,'INVALID_API410_CONVERGENCE_BUDGET');probe=probe or _tombstone_probe;journal_fn=journal_fn or journal;started=clock();deadline=started+budget_s;attempt=0
    while clock()<deadline:
        attempt+=1;all_ready=True
        for scheme,port in [('http',80),('https',443)]:
            remaining=deadline-clock()
            if remaining<=0:all_ready=False;break
            r=probe(scheme,port,remaining);journal_fn('api410-probe',attempt=attempt,scheme=scheme,status=r['status'],exitCode=r['exitCode'],durationMs=r['durationMs'],elapsedMs=round((clock()-started)*1000),errorClass=r.get('errorClass'));all_ready=all_ready and r['exitCode']==0 and r['status']==410
        if all_ready and clock()<=deadline:return
        remaining=deadline-clock()
        if remaining>0:sleep(min(.25,remaining))
    raise Stop('IDM_API_TOMBSTONE_NOT_410_WITHIN_BUDGET')
def parent_fd(rootfd,relative):
    parts=pathlib.PurePosixPath(relative).parts;need(parts and '..' not in parts and not relative.startswith('/'),'UNSAFE_RETIREMENT_PATH');fd=os.dup(rootfd)
    for part in parts[:-1]:
        n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=n
    return fd,parts[-1]
def remove_exact_tree(path):
    fd=os.open(str(path),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
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
os.umask(0o077)
lock=os.open('/run/lock/melamedia-release-maintenance.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(lock,(fcntl.LOCK_EX if PHASE in ('retire','remove') else fcntl.LOCK_SH)|fcntl.LOCK_NB)
tenant=os.open('/run/lock/legal-idm-release.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(tenant,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
    need(C['tenant']=='idm' and C['root']==str(ROOT) and C['stage']==str(STAGE),'RETIRED_TENANT_IDENTITY_FAILED')
    if PHASE=='backup':
        protect_config();need(root_manifest(ROOT)==C['expected']['manifestSha256'],'MANIFEST_BINDING_FAILED')
        need(not STAGE.exists() and not STAGE.is_symlink(),'RETIREMENT_STAGE_ALREADY_EXISTS')
        need(shutil.disk_usage('/root').free>C['expected']['fileBytes']*3+67108864,'BACKUP_DISK_RESERVE_INSUFFICIENT')
        recipient=pathlib.Path(C['publicRecipient']['path']);need(filehash(recipient)==C['publicRecipient']['sha256'],'PUBLIC_ENCRYPTION_RECIPIENT_CHANGED')
        STAGE.mkdir(mode=0o700);jsonwrite(STAGE/'.mela-retention-pin',{'owner':'Codex/root','reason':'Terminated Idm verified recovery; no pruning authorized','reviewDate':'2026-11-25'})
        jsonwrite(STAGE/'retirement-manifest.json',C['expected']);(STAGE/'idm-vhost.before').write_bytes(VHOST.read_bytes());journal('backup-started')
        plain=STAGE/'payload.tar.gz';cipher=STAGE/'payload.tar.gz.cms'
        subprocess.run(['nice','-n','10','tar','--create','--gzip','--file',str(plain),'--numeric-owner','--acls','--xattrs','--one-file-system','--hard-dereference','-C','/','var/www/idm','etc/nginx/sites-enabled/idm','-C',str(STAGE),'retirement-manifest.json'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=120)
        need(root_manifest(ROOT)==C['expected']['manifestSha256'],'ROOT_CHANGED_WHILE_ARCHIVING');protect_config();count=verify_archive(plain);plainsha=filehash(plain)
        subprocess.run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-outform','DER','-in',str(plain),'-out',str(cipher),str(recipient)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=120)
        r={'at':stamp(),'tenant':'idm','phase':'backup','contractSha256':CONTRACT_SHA,'manifestSha256':C['expected']['manifestSha256'],'compressedPlaintextSha256':plainsha,'plaintextArchiveFormat':'tar.gz','ciphertextSha256':filehash(cipher),'ciphertextBytes':cipher.stat().st_size,'verifiedMemberCount':count,'remoteCiphertext':str(cipher),'offsiteVerificationStillRequired':True}
        jsonwrite(STAGE/'backup-receipt.json',r);plain.unlink();journal('backup-complete',ciphertextSha256=r['ciphertextSha256']);print(json.dumps(r))
    elif PHASE=='retire':
        need(STAGE.is_dir() and STAGE.resolve()==STAGE and not (STAGE/'retire-receipt.json').exists(),'RETIRE_STAGE_NOT_FRESH');backup_gate();protect_config();root_manifest(ROOT)
        old=(STAGE/'idm-vhost.before').read_bytes();oldsha=C['expected']['nginx']['activeConfigFiles'][str(VHOST)]['sha256'];need(sha(old)==oldsha,'PRIVATE_VHOST_PREIMAGE_CHANGED')
        body=C['tombstone'].encode();need(sha(body)==C['tombstoneSha256'],'TOMBSTONE_BINDING_FAILED');journal('vhost-replacement-started');atomic_vhost(body,oldsha)
        try:nginx('test');nginx('reload');protect_config(retired=True);tombstone_smoke()
        except Exception:
            journal('retire-failed-restore-own-vhost');atomic_vhost(old,C['tombstoneSha256']);nginx('test');nginx('reload');raise
        r={'at':stamp(),'tenant':'idm','phase':'retire','contractSha256':CONTRACT_SHA,'vhostSha256':C['tombstoneSha256'],'httpAndHttps410':True,'otherConfigsAndPublicEntriesUnchanged':True,'sourceDirectoryStillPresent':True,'certificatesRenewalDnsR2HistoryUnchanged':True};jsonwrite(STAGE/'retire-receipt.json',r);journal('retire-complete');print(json.dumps(r))
    elif PHASE=='remove':
        need(STAGE.is_dir() and STAGE.resolve()==STAGE and not (STAGE/'remove-receipt.json').exists(),'REMOVE_STAGE_NOT_FRESH');backup_gate();protect_config(retired=True);tombstone_smoke();need(json.loads((STAGE/'retire-receipt.json').read_text())['contractSha256']==CONTRACT_SHA,'SUCCESSFUL_RETIRE_PROOF_REQUIRED')
        root_manifest(ROOT);quarantine=STAGE/'frontend-quarantine';need(not quarantine.exists() and not quarantine.is_symlink() and STAGE.stat().st_dev==ROOT.stat().st_dev,'QUARANTINE_TARGET_OR_DEVICE_CHANGED')
        journal('exact-root-move-started');os.rename(ROOT,quarantine);journal('exact-root-moved');root_manifest(quarantine);protect_config(retired=True);remove_exact_tree(quarantine);need(not ROOT.exists() and not quarantine.exists(),'EXACT_ROOT_REMOVAL_INCOMPLETE');protect_config(retired=True);tombstone_smoke()
        r={'at':stamp(),'tenant':'idm','phase':'remove','contractSha256':CONTRACT_SHA,'removedFiles':C['expected']['fileCount'],'removedDirectories':C['expected']['directoryCount'],'removedLogicalBytes':C['expected']['fileBytes'],'onlyExactApprovedRootRemoved':True,'encryptedServerAndVerifiedMacRecoveryRetained':True,'allOtherConfigsPublicEntriesCertificatesRenewalDnsR2HistoryUnchanged':True};jsonwrite(STAGE/'remove-receipt.json',r);journal('exact-root-removal-complete');print(json.dumps(r))
    else:raise Stop('UNKNOWN_PHASE')
except Exception as e:
    if STAGE.is_dir():journal('phase-failed-no-blind-retry',phase=PHASE,errorClass=type(e).__name__,code=str(e) if isinstance(e,Stop) else 'OPERATION_FAILED')
    print(json.dumps({'tenant':'idm','phase':PHASE,'result':'STOPPED_NO_BLIND_RETRY','partialMutationPossible':True,'errorClass':type(e).__name__,'code':str(e) if isinstance(e,Stop) else 'OPERATION_FAILED'}));raise SystemExit(1)
finally:
    fcntl.flock(tenant,fcntl.LOCK_UN);os.close(tenant);fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)
'''


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--contract', required=True)
    p.add_argument('--contract-sha', required=True)
    p.add_argument('--phase', choices=PHASES, required=True)
    p.add_argument('--offsite-proof')
    p.add_argument('--execute-reviewed', action='store_true')
    args = p.parse_args()
    raw = pathlib.Path(args.contract).read_bytes()
    if sha(raw) != args.contract_sha:
        raise SystemExit('CONTRACT_HASH_MISMATCH')
    c = json.loads(raw)
    if sha(pathlib.Path(__file__).read_bytes()) != c['operatorSha256']:
        raise SystemExit('OPERATOR_HASH_MISMATCH')
    offsite = json.loads(pathlib.Path(args.offsite_proof).read_text()) if args.offsite_proof else None
    if not args.execute_reviewed:
        print(json.dumps({'result': 'LOCAL_PLAN_ONLY', 'tenant': 'idm', 'phase': args.phase,
                          'root': c['root'], 'fileCount': c['expected']['fileCount'],
                          'bytes': c['expected']['fileBytes'], 'offsiteProofPresent': offsite is not None,
                          'noRemoteOperation': True, 'rootReviewRequiredForEachPhase': True}))
        return
    ns = "import base64,json;C=json.loads(base64.b64decode(" + repr(base64.b64encode(raw).decode()) + "));CONTRACT_SHA=" + repr(args.contract_sha) + ";PHASE=" + repr(args.phase) + ";OFFSITE=" + repr(offsite) + "\n"
    remote = ns + REMOTE
    private = pathlib.Path(c['localPrivateRoot'])
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    with (private / (args.phase + '-' + now + '.stdout')).open('xb') as stdout, (private / (args.phase + '-' + now + '.stderr')).open('xb') as stderr:
        r = subprocess.run(['ssh', '-i', str(pathlib.Path.home() / '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'root@84.46.253.85', 'python3 -'], input=remote.encode(), stdout=stdout, stderr=stderr, timeout=480)
    print(json.dumps({'tenant': 'idm', 'phase': args.phase, 'exitCode': r.returncode,
                      'contractSha256': args.contract_sha, 'privateReceiptDirectory': str(private),
                      'noBlindRetry': True}))
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
