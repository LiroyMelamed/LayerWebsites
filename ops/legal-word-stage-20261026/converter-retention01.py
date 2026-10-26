#!/usr/bin/env python3
"""Reviewed metadata-only retention append. Invoked on server only by reviewed driver."""
import base64,fcntl,hashlib,json,os,stat,uuid
TARGETS=('/opt/melamedia-qa-word-converter-20261023/.mela-retention-pin','/root/qa-new-features-20261023-converter/.mela-retention-pin')
NOTE_ID='MELAMEDIA_PRODUCTION_CONVERTER_CONSUMERS_20261026'
NOTE='''
BEGIN MELAMEDIA_PRODUCTION_CONVERTER_CONSUMERS_20261026
Active production dependency: /opt/melamedia-qa-word-converter-20261023/managed-soffice.py.
Consumers: /root/AshrafEssa/backend, /root/LayerWebsites/backend, /root/MorLevi/backend (WORD_TEMPLATE_MAX_CONCURRENT=1 each), and QA /root/Melamedia/backend (default 2).
Retain this converter base and /root/qa-new-features-20261023-converter while any consumer environment references the managed path or the managed wrapper depends on these resources. A QA-style name does not authorize retirement.
Review date: 2026-11-02; review only, no expiry. Retain until a reviewed replacement is active and all consumers/dependencies are verified migrated.
This note changes retention metadata only; no runtime/provider/permissions/install/rootfs/jobs/cleanup change is authorized.
END PRODUCTION_CONVERTER_CONSUMERS
'''.encode()
H=lambda b:hashlib.sha256(b).hexdigest()
mutated=[]
temporary=[]
def need(ok,code):
 if not ok:raise RuntimeError(code)
def parent_identity(p):
 parent=os.path.dirname(p)
 for item in [os.path.sep]+[os.path.join(os.path.sep,*parent.strip('/').split('/')[:i]) for i in range(1,len(parent.strip('/').split('/'))+1)]:
  s=os.lstat(item);need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not stat.S_IMODE(s.st_mode)&0o022,'UNSAFE_EXISTING_PARENT')
 s=os.lstat(parent);return{'dev':s.st_dev,'ino':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode)}
def inspect(p,exclusive=False,lock=True):
 parent=parent_identity(p)
 try:fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 except FileNotFoundError:return{'path':p,'exists':False,'parent':parent},None,None
 try:
  
  if lock:fcntl.flock(fd,(fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)|fcntl.LOCK_NB)
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not stat.S_IMODE(s.st_mode)&0o022 and s.st_size<=65536,'UNSAFE_EXISTING_PIN')
  raw=os.read(fd,65537);t=os.fstat(fd);need((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_mode,s.st_uid,s.st_gid)==(t.st_dev,t.st_ino,t.st_size,t.st_mtime_ns,t.st_mode,t.st_uid,t.st_gid) and len(raw)==s.st_size,'PIN_CHANGED_DURING_READ')
  info={'path':p,'exists':True,'parent':parent,'dev':s.st_dev,'ino':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':len(raw),'sha256':H(raw)}
  return info,raw,fd
 except Exception:os.close(fd);raise
def has_note(raw):
 if NOTE_ID.encode() in raw:need(raw.count(NOTE_ID.encode())==1 and raw.count(NOTE)==1,'CONFLICTING_OR_DUPLICATE_PRODUCTION_NOTE');return True
 return False
def fsync_parent(p):
 fd=os.open(os.path.dirname(p),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def create_absent(p,data,expected):
 need(parent_identity(p)==expected['parent'],'PARENT_CAS_LOST');fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);mutated.append(p)
 try:
  with os.fdopen(fd,'wb',closefd=False) as h:h.write(data);h.flush();os.fsync(fd)
 finally:os.close(fd)
 fsync_parent(p)
def append_existing(p,raw,expected):
 need(parent_identity(p)==expected['parent'],'PARENT_CAS_LOST');tmp=os.path.dirname(p)+'/.mela-retention-pin.append-'+str(uuid.uuid4());fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);temporary.append(tmp)
 try:
  with os.fdopen(fd,'wb',closefd=False) as h:h.write(raw+NOTE);h.flush();os.fchown(fd,expected['uid'],expected['gid']);os.fchmod(fd,expected['mode']);os.fsync(fd)
 finally:os.close(fd)
 # Locks coordinate reviewed writers; recheck exact identity/hash immediately before atomic rename.
 current,data,checkfd=inspect(p,lock=False)
 try:need(current==expected and data==raw,'PIN_CAS_LOST_BEFORE_RENAME')
 finally:
  if checkfd is not None:os.close(checkfd)
 need(parent_identity(p)==expected['parent'],'PARENT_CAS_LOST_BEFORE_RENAME');os.replace(tmp,p);temporary.remove(tmp);mutated.append(p);fsync_parent(p)
def main(packet):
 need(os.getuid()==0,'ROOT_REQUIRED');os.umask(0o077);need(packet.get('mode') in ['preview','append'] and packet.get('noteSha256')==H(NOTE),'WRONG_RETENTION_PACKET');snapshots=[]
 try:
  for p in TARGETS:
   info,raw,fd=inspect(p,packet['mode']=='append');snapshots.append((info,raw,fd))
  for _,raw,_ in snapshots:need(len(raw or b'')+(0 if has_note(raw or b'') else len(NOTE))<=65536,'APPENDED_PIN_SIZE_BOUND')
  if packet['mode']=='preview':
   return{'result':'READONLY_RETENTION_PIN_PREVIEW','noteSha256':H(NOTE),'pins':[{**i,'noteAlreadyPresent':has_note(raw or b''),'beforeBytesBase64':base64.b64encode(raw).decode() if raw is not None else None} for i,raw,_ in snapshots],'noRemoteMutation':True}
  need(packet.get('status')=='REVIEW_READY_APPEND_ONLY_RETENTION_PINS' and packet.get('expectedPins')==[i for i,_,_ in snapshots],'PREVIEW_CAS_CHANGED');out=[]
  for info,raw,_ in snapshots:
   p=info['path'];already=has_note(raw or b'')
   if not already:
    if info['exists']:append_existing(p,raw,info)
    else:create_absent(p,NOTE,info)
   observed,data,newfd=inspect(p,lock=False)
   try:
    expected=(raw or b'') if already else (raw or b'')+NOTE;need(data==expected,'PIN_READBACK_BYTES_CHANGED');need(observed['uid']==(info['uid'] if info['exists'] else 0) and observed['gid']==(info['gid'] if info['exists'] else (info['parent']['gid'] if info['parent']['mode']&stat.S_ISGID else os.getegid())) and observed['mode']==(info['mode'] if info['exists'] else 0o600),'PIN_METADATA_NOT_PRESERVED');out.append({**observed,'oldBytesPreserved':True,'notePresentExactlyOnce':True,'written':not already})
   finally:
    if newfd is not None:os.close(newfd)
  return{'result':'RETENTION_NOTES_APPENDED_AND_READBACK_VERIFIED' if mutated else 'NO_WRITE_UNIQUE_RETENTION_NOTES_ALREADY_PRESENT','pins':out,'mutatedPaths':mutated,'noteSha256':H(NOTE),'runtimeEnvRootfsJobsScriptsPermissionsServicesUnchangedByScope':True,'noCleanupPerformed':True}
 finally:
  for _,_,fd in snapshots:
   if fd is not None:os.close(fd)
if __name__=='__main__':
 try:print(json.dumps(main(PACKET)))
 except Exception as e:print(json.dumps({'result':'RETENTION_OPERATION_STOPPED','code':str(e) if isinstance(e,RuntimeError) else type(e).__name__,'mutatedPaths':mutated,'temporaryPathsRetained':temporary,'partialMutationPossible':bool(mutated or temporary),'noBlindRetry':True,'privatePreimagesMustBeRetained':True}));raise SystemExit(1)
