#!/usr/bin/env python3
"""Final approved own cloud-metadata stage removal, after actual BE purge PASS."""
import ast, datetime, hashlib, json, pathlib, subprocess
O=pathlib.Path(__file__).resolve().parent
SOURCE=O.parent.parent/'legal-system-messages-20261025/idm-retirement/purge-idm-only19.remote.py'
REMOTE=r'''
import datetime,fcntl,hashlib,json,os,pathlib,socket,stat,time
P=pathlib.Path
ROOT=P('/root/idm-cloud-retirement-20261025')
KNOWN={'.mela-retention-pin','objects.private.json','multipart.private.json','inventory-public.json','purge-attempt-started.json','purge-journal.private.jsonl','purge-failure-public.json','backup-targets.private.json','history-objects04.private.json','history-purge05-started.json','history-purge05-journal.private.jsonl','history-purge05-public.json'}
class Stop(Exception):pass
def need(v,c):
    if not v:raise Stop(c)
def H(b):return hashlib.sha256(b).hexdigest()
def canon(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def snapshot():
    s=ROOT.lstat();need(ROOT.resolve()==ROOT and stat.S_ISDIR(s.st_mode) and stat.S_IMODE(s.st_mode)==0o700 and s.st_uid==0,'EXACT_PRIVATE_ROOT_IDENTITY_REQUIRED')
    for line in P('/proc/self/mountinfo').read_text().splitlines():
        mount=line.split(' - ',1)[0].split()[4].replace('\\040',' ');need(mount!=str(ROOT) and not mount.startswith(str(ROOT)+'/'),'MOUNT_INSIDE_PRIVATE_STAGE')
    files={};content={};total=0
    members=list(ROOT.iterdir());need(0<len(members)<=100,'PRIVATE_STAGE_FILE_BOUND')
    for p in members:
        q=p.lstat();need(p.name in KNOWN and stat.S_ISREG(q.st_mode) and q.st_dev==s.st_dev and q.st_nlink==1 and q.st_uid==0 and not(stat.S_IMODE(q.st_mode)&0o077),'UNKNOWN_OR_NONPRIVATE_STAGE_MEMBER')
        total+=q.st_size;need(total<=2097152,'PRIVATE_STAGE_BYTE_BOUND');fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            before=os.fstat(fd);need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(q.st_dev,q.st_ino,q.st_size,q.st_mtime_ns),'FILE_READ_IDENTITY_CHANGED');data=b''
            while True:
                b=os.read(fd,65536)
                if not b:break
                data+=b;need(len(data)<=2097152,'PRIVATE_FILE_READ_BOUND')
            after=os.fstat(fd);need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) and len(data)==q.st_size,'FILE_BYTES_CHANGED_DURING_READ')
        finally:os.close(fd)
        files[p.name]={'inode':q.st_ino,'bytes':q.st_size,'mtimeNs':q.st_mtime_ns};content[p.name]=H(data)
    need(not(ROOT/'s3-current.private.json').exists(),'TEMPORARY_SECRET_NOT_ALREADY_ERASED')
    return {'rootStat':{'device':s.st_dev,'inode':s.st_ino},'files':files,'directories':{'.':True}},content,total
def process_gate():
    procs=list(P('/proc').glob('[0-9]*'));need(len(procs)<=2048,'PROCESS_METADATA_BOUND');count=0;start=time.monotonic()
    for p in procs:
        if p.name==str(os.getpid()):continue
        try:
            cmd=(p/'cmdline').read_bytes();need(str(ROOT).encode() not in cmd,'ACTIVE_PROCESS_REFERENCES_STAGE')
            links=[p/x for x in ('cwd','exe','root')]+list((p/'fd').iterdir())
            for q in links:
                count+=1;need(count<=100000 and time.monotonic()-start<30,'PROCESS_REFERENCE_SCAN_BOUND')
                try:target=os.readlink(q)
                except FileNotFoundError:continue
                need(target!=str(ROOT) and not target.startswith(str(ROOT)+'/'),'ACTIVE_OPEN_STAGE_REFERENCE')
        except FileNotFoundError:continue
    return len(procs),count
def neighbors():
    rows={};members=list(ROOT.parent.iterdir());need(len(members)<=10000,'ROOT_NEIGHBOR_BOUND')
    for p in members:
        if p==ROOT:continue
        s=p.lstat();rows[p.name]=[s.st_dev,s.st_ino,stat.S_IFMT(s.st_mode)]
    return rows
locks=[];mutated=False
try:
    need(os.geteuid()==0 and socket.gethostname()=='vmi2784047','EXACT_BACKEND_HOST_REQUIRED')
    for p in ('/run/lock/melamedia-release-maintenance.lock','/run/lock/melamedia-legal-idm-release.lock'):
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(fd)
    before,hashes,total=snapshot();peer=neighbors();procs,refs=process_gate();need(snapshot()==(before,hashes,total),'FRESH_PRIVATE_STAGE_DRIFT');C={'expected':before};mutated=True;remove_exact_tree(ROOT)
    need(not ROOT.exists() and not ROOT.is_symlink(),'PRIVATE_STAGE_REMOVAL_UNVERIFIED');need(neighbors()==peer,'OTHER_ROOT_ENTRIES_CHANGED')
    print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS_EXACT_IDM_CLOUD_PRIVATE_STAGE_REMOVED','root':str(ROOT),'rootIdentity':before['rootStat'],'removedFiles':len(before['files']),'removedBytes':total,'beforeManifestSha256':H(canon({'metadata':before,'contentSha256':hashes})),'processMetadataCount':procs,'processReferenceCount':refs,'stageAbsent':True,'otherRootEntryIdentitiesPreserved':True,'providerCalls':0,'sharedCredentialsOrKeysTouched':False,'testsBuildBackupRestore':False}))
except Exception as e:
    print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'STOPPED_NO_BLIND_RETRY','errorClass':type(e).__name__,'safeCode':str(e) if isinstance(e,Stop) else None,'partialMutationPossible':mutated,'providerCalls':0}));raise SystemExit(1)
finally:
    for fd in reversed(locks):fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
'''
def main():
    raw=SOURCE.read_bytes();assert hashlib.sha256(raw).hexdigest()=='6ff4e4bbc2e51d0cfa608cc5710059faa44a906521580d75ae3a5ad835fcb51b'
    text=raw.decode();tree=ast.parse(text);helpers='\n\n'.join(ast.get_source_segment(text,n) for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('parent_fd','remove_exact_tree'))
    remote=REMOTE.replace('locks=[];mutated=False',helpers+'\n\nlocks=[];mutated=False')
    p=subprocess.run(['ssh','-i',str(pathlib.Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@37.60.230.148','python3 -'],input=remote.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=80)
    r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'ROOT_APPROVED_FINAL_EXACT_OWN_IDM_CLOUD_PRIVATE_STAGE_ONLY','exitCode':p.returncode,'qualifiedHelperSourceSha256':hashlib.sha256(raw).hexdigest(),'remoteScriptSha256':hashlib.sha256(remote.encode()).hexdigest(),'stdoutSha256':hashlib.sha256(p.stdout).hexdigest(),'stderrSha256':hashlib.sha256(p.stderr).hexdigest(),'stderrBytes':len(p.stderr)}
    if p.stdout:
        try:r['observation']=json.loads(p.stdout)
        except Exception:r['result']='UNVERIFIED_RESPONSE_NO_RETRY'
    else:r['result']='UNVERIFIED_LOCK_OR_TRANSPORT_NO_RETRY'
    dest=O/'remove-private-stage06.json';assert not dest.exists();dest.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'path':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'result':r.get('observation',{}).get('result',r.get('result'))},indent=2))
if __name__=='__main__':main()
