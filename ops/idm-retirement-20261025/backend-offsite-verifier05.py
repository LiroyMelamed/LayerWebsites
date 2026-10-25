#!/usr/bin/env python3
"""Independent owner-Mac full archive + isolated PostgreSQL restore. Default never executes."""
import argparse,datetime,hashlib,json,os,pathlib,re,secrets,shlex,shutil,stat,subprocess,tarfile,types,uuid
R=pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2');O=R/'outputs/idm-retirement-20261025/backend';H=lambda b:hashlib.sha256(b).hexdigest();canon=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
KEY=pathlib.Path('/Users/liroymelamed/.codex/secure-backup-recovery/servers-20261008/recipient.key.pem');CERT=KEY.with_name('recipient.cert.pem');SSL='/opt/homebrew/bin/openssl';PG=pathlib.Path('/opt/homebrew/opt/postgresql@17/bin');RESTORE=PG/'pg_restore';SOCKET_PARENT=pathlib.Path('/Users/liroymelamed/.codex/private')
class Stop(Exception):pass
def need(ok,code):
 if not ok:raise Stop(code)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def load_remote(expected):
 p=O/'retire05.remote.py';raw=p.read_bytes();need(H(raw)==expected,'FROZEN_REMOTE_FINGERPRINT_MODULE_CHANGED');m=types.ModuleType('idm_retirement_remote');m.__file__=str(p);exec(compile(raw,str(p),'exec'),m.__dict__);return m
def pg_tools():
 result={}
 for name in ['initdb','postgres','pg_ctl','pg_restore','psql','createdb']:
  p=PG/name;need(p.is_file(),'MATCHING_LOCAL_POSTGRES_TOOL_MISSING');x=subprocess.run([str(p),'--version'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10);version=re.search(rb'PostgreSQL\)?\s+(\d+)(?:\.|\s)',x.stdout);need(x.returncode==0 and version is not None and int(version[1])==17,'LOCAL_POSTGRES_TOOL_MAJOR_MISMATCH');result[name]=x.stdout.decode().strip()
 return result
def dump_source_major(listing):
 versions=re.findall(rb'^;\s*Dumped from database version:?\s+(\d+)(?:[.\s]|$)',listing,re.M);need(len(versions)==1 and int(versions[0])<=17,'MATCHING_LOCAL_DATABASE_SERVER_REQUIRED');return int(versions[0])
def owned_dir(path,marker,nonce):
 need(path.is_dir()and not path.is_symlink()and path.resolve()==path,'OWNED_RESTORE_DIRECTORY_IDENTITY_CHANGED');p=path/marker;need(p.is_file()and not p.is_symlink()and p.read_text()==nonce,'OWNED_RESTORE_MARKER_CHANGED')
def cleanup_owned(work,socket,nonce,cluster,started,call):
 owned_dir(work,'.owned-idm-restore',nonce);owned_dir(socket,'.owned-idm-socket',nonce);need(cluster==work/'cluster'and not cluster.is_symlink(),'OWNED_CLUSTER_PATH_CHANGED')
 if started or(cluster/'postmaster.pid').exists():
  need(cluster.is_dir()and cluster.resolve()==cluster,'OWNED_CLUSTER_DIRECTORY_CHANGED');call([PG/'pg_ctl','-D',cluster,'-m','fast','-w','stop']);need(not(cluster/'postmaster.pid').exists(),'OWNED_TEMP_CLUSTER_STILL_RUNNING')
 owned_dir(work,'.owned-idm-restore',nonce);owned_dir(socket,'.owned-idm-socket',nonce);shutil.rmtree(work);shutil.rmtree(socket)
def read_manifest(plain,receipt):
 with tarfile.open(plain,'r:gz')as tf:
  members=[x for x in tf if x.name=='archive-manifest.private.json'];need(len(members)==1 and members[0].isfile()and members[0].size<=67108864,'ARCHIVE_MANIFEST_INVALID');raw=tf.extractfile(members[0]).read();need(H(raw)==receipt['manifestSha256'],'ARCHIVE_MANIFEST_DIGEST_CHANGED');expected=json.loads(raw)
 expected['archive-manifest.private.json']={'type':'file','sha256':receipt['manifestSha256']};return expected
def main():
 p=argparse.ArgumentParser();p.add_argument('--contract',required=True);p.add_argument('--contract-sha',required=True);p.add_argument('--backup-receipt',required=True);p.add_argument('--execute-reviewed',action='store_true');a=p.parse_args();raw=pathlib.Path(a.contract).read_bytes();need(H(raw)==a.contract_sha,'CONTRACT_CHANGED');C=json.loads(raw);receipt=json.loads(pathlib.Path(a.backup_receipt).read_text());receipt=receipt.get('observation',receipt);need(receipt['result']=='PASS_QUIESCED_FINAL_COMPRESSED_ENCRYPTED_BACKUP'and receipt['contractSha256']==a.contract_sha,'EXACT_QUIESCED_BACKUP_REQUIRED');need(digest(pathlib.Path(__file__))==C['offsiteVerifierSha256']and digest(O/'retire05.remote.py')==C['remoteOperatorSha256'],'VERIFIER_OR_SHARED_FINGERPRINT_CHANGED')
 if not a.execute_reviewed:print(json.dumps({'result':'LOCAL_OWNER_MAC_RESTORE_PLAN_ONLY','noPrivateKeyContentsRead':True,'noRemoteOperation':True,'fullIsolatedDatabaseRestoreRequired':True}));return
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:(R/n).read_text()
 os.umask(0o077);private=pathlib.Path(C['localPrivateRoot'])/'offsite';private.mkdir(parents=True,exist_ok=True,mode=0o700);need(private.resolve()==private and not private.is_symlink(),'PRIVATE_RECOVERY_PATH_CHANGED');os.chmod(private,0o700);pin=private/'.mela-retention-pin'
 if not pin.exists():
  with pin.open('x')as f:f.write(json.dumps({'owner':'Codex/root','reason':'Idm authenticated offsite ciphertext and restore proof; no pruning authorized','reviewDate':'2026-11-25'})+'\n')
 at=datetime.datetime.now(datetime.timezone.utc).isoformat();nonce=uuid.uuid4().hex;work=private/('restore-'+nonce);work.mkdir(mode=0o700);(work/'.owned-idm-restore').write_text(nonce);logs=private/('restore-'+nonce+'.private.log');cluster=work/'cluster';socket=SOCKET_PARENT/('idmr-'+nonce[:12]);need(len(str(socket).encode())+20<104,'UNIX_SOCKET_PATH_TOO_LONG');socket.mkdir(mode=0o700);(socket/'.owned-idm-socket').write_text(nonce);started=False;proof=None;failure=None
 def call(args,input=None,timeout=120):
  with logs.open('ab')as err:
   x=subprocess.run([str(v)for v in args],input=input,stdout=subprocess.PIPE,stderr=err,timeout=timeout,env={'PATH':str(PG)+':/usr/bin:/bin','HOME':str(pathlib.Path.home()),'LANG':'C','LC_ALL':'C','TMPDIR':str(work)})
  need(x.returncode==0,'LOCAL_RESTORE_COMMAND_FAILED');return x.stdout
 try:
  tools=pg_tools();need(KEY.resolve()==KEY and stat.S_ISREG(KEY.lstat().st_mode)and stat.S_IMODE(KEY.stat().st_mode)==0o600,'OWNER_MAC_KEY_METADATA_CHANGED');need(digest(CERT)==C['publicRecipient']['sha256'],'OWNER_MAC_PUBLIC_RECIPIENT_CHANGED')
  partial=work/'download.partial.cms';target=private/('idm-backend-'+receipt['ciphertextSha256']+'.tar.gz.cms');need(not target.exists(),'OWNED_CIPHERTEXT_TARGET_ALREADY_EXISTS');remote=receipt['remoteCiphertext'];need(remote=='/root/idm-backend-retirement-20261025-v2/payload.tar.gz.cms','EXACT_CIPHERTEXT_PATH_REQUIRED')
  download="import os,sys,hashlib; p="+repr(remote)+"; fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW); s=os.fstat(fd); assert s.st_size=="+str(receipt['ciphertextBytes'])+"; h=hashlib.sha256()\nwhile True:\n b=os.read(fd,1048576)\n if not b:break\n h.update(b);sys.stdout.buffer.write(b)\nassert h.hexdigest()=="+repr(receipt['ciphertextSha256'])+"\nos.close(fd)\n"
  args=['flock','--shared','--nonblock','--conflict-exit-code','75','/run/lock/melamedia-release-maintenance.lock','flock','--shared','--nonblock','--conflict-exit-code','75','/run/lock/melamedia-legal-idm-release.lock','python3','-c',download]
  with partial.open('xb')as out,logs.open('ab')as err:x=subprocess.run(['ssh','-i',str(pathlib.Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@37.60.230.148',' '.join(shlex.quote(v)for v in args)],stdout=out,stderr=err,timeout=300)
  need(x.returncode==0 and partial.stat().st_size==receipt['ciphertextBytes']and digest(partial)==receipt['ciphertextSha256'],'INDEPENDENT_CIPHERTEXT_DOWNLOAD_FAILED');partial.rename(target);plain=work/'payload.tar.gz'
  call([SSL,'cms','-decrypt','-binary','-inform','DER','-in',target,'-inkey',KEY,'-out',plain]);need(digest(plain)==receipt['compressedPlaintextSha256'],'COMPRESSED_PLAINTEXT_HASH_CHANGED');m=load_remote(C['remoteOperatorSha256']);expected=read_manifest(plain,receipt);count=m.archive_verify(plain,expected);need(count==receipt['verifiedMemberCount'],'FULL_ARCHIVE_MEMBER_COUNT_CHANGED')
  with tarfile.open(plain,'r:gz')as tf:
   for name in ['database.dump','database-fingerprint.private.json']:
    member=tf.getmember(name);need(member.isfile(),'PRIVATE_DATABASE_MEMBER_INVALID')
    with (work/name).open('xb')as out:shutil.copyfileobj(tf.extractfile(member),out)
  fp=json.loads((work/'database-fingerprint.private.json').read_text());need(len(fp['roles'])==receipt['roleCount']and fp['databaseOwner']in fp['roles'],'EXACT_OWNER_AND_ROLE_SET_REQUIRED');need(digest(work/'database.dump')==receipt['databaseDumpSha256'],'RESTORED_DATABASE_DUMP_DIGEST_CHANGED');listing=call([RESTORE,'--list',work/'database.dump']);dump_source_major(listing)
  superuser='idm_restore_'+nonce[:16];need(superuser not in fp['roles'],'SYNTHETIC_RESTORE_OWNER_COLLISION');port=49152+secrets.randbelow(16000);call([PG/'initdb','-D',cluster,'--auth-local=trust','--auth-host=reject','--no-locale','-E','UTF8','-U',superuser]);call([PG/'pg_ctl','-D',cluster,'-l',work/'postgres.private.log','-o',"-c listen_addresses='' -k "+str(socket)+' -p '+str(port),'-w','start']);started=True
  base=[PG/'psql','-X','-q','-A','-t','-h',socket,'-p',port,'-U',superuser,'-v','ON_ERROR_STOP=1'];quote=lambda s:'"'+s.replace('"','""')+'"'
  existing=set(call([*base,'-d','postgres','-c','SELECT rolname FROM pg_roles']).decode().splitlines())
  for role in fp['roles']:
   need(isinstance(role,str)and role and '\x00'not in role,'INVALID_PRIVATE_ROLE_NAME')
   if role not in existing:call([*base,'-d','postgres'],('CREATE ROLE '+quote(role)+' NOLOGIN;').encode())
  call([PG/'createdb','-h',socket,'-p',port,'-U',superuser,'--maintenance-db=postgres','--owner='+fp['databaseOwner'],'idm']);call([RESTORE,'--host',socket,'--port',port,'--username',superuser,'--exit-on-error','--dbname=idm',work/'database.dump'],timeout=180)
  def q(query):return json.loads(call([*base,'-d','idm'],('BEGIN READ ONLY; '+query+'; COMMIT;').encode()))
  objects=q(m.OBJECT_SQL);tables=q(m.TABLES_SQL);counts=[]
  for schema,table in tables:counts.append([schema,table,q('SELECT count(*) FROM '+quote(schema)+'.'+quote(table))])
  need(H(canon(objects))==receipt['objectDigest']==fp['objectDigest'],'RESTORED_OBJECT_OWNER_ACL_DIGEST_MISMATCH');need(H(canon(counts))==receipt['rowCountDigest']==fp['rowCountDigest'],'RESTORED_TABLE_ROW_COUNT_DIGEST_MISMATCH')
  proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'VERIFIED_OFFSITE_IDM_BACKEND_FULL_ARCHIVE_AND_DATABASE_RESTORE','offsiteHost':'owner-mac','contractSha256':a.contract_sha,'manifestSha256':receipt['manifestSha256'],'ciphertextSha256':receipt['ciphertextSha256'],'ciphertextBytes':receipt['ciphertextBytes'],'compressedPlaintextSha256':receipt['compressedPlaintextSha256'],'verifiedMemberCount':count,'objectDigest':receipt['objectDigest'],'rowCountDigest':receipt['rowCountDigest'],'ownersAndAclRestoreSucceeded':True,'placeholderRoleCount':len(fp['roles']),'restoredTableCount':len(counts),'unixSocketOnlyIsolatedCluster':True,'existingDatabaseServicesUntouched':True,'matchingLocalPgMajor':17,'localPgTools':tools,'noApplicationOrProviderStarted':True,'privateKeyReadOnlyByOpenSSL':True,'retainedIndependentCiphertext':str(target)}
 except Exception as e:failure={'class':type(e).__name__,'code':str(e)if isinstance(e,Stop)else'OFFLINE_RESTORE_FAILED','detailsPrivate':True}
 finally:
  try:cleanup_owned(work,socket,nonce,cluster,started,call)
  except Exception as e:failure={'class':type(e).__name__,'code':str(e)if isinstance(e,Stop)else'OWNED_TEMP_CLUSTER_OR_PLAINTEXT_CLEANUP_FAILED','detailsPrivate':True,'ownedWorkPath':str(work),'ownedSocketPath':str(socket)}
 if failure:result={'at':at,'status':'OFFSITE_RESTORE_NOT_VERIFIED','contractSha256':a.contract_sha,'failure':failure,'noProductionDeletionApproved':True,'privateLog':str(logs)}
 else:proof['isolatedClusterStoppedAndOwnedPlaintextRemoved']=True;result=proof
 dest=O/('offsite-restore-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json');dest.write_text(json.dumps(result,indent=2)+'\n');entry=f"\n- {at} Root-reviewed Idm independent ownerMac fullarchive+isolatedPGrestore04 {result['status']}; evidence outputs/idm-retirement-20261025/backend/{dest.name} SHA{H(dest.read_bytes())}, contractSHA{a.contract_sha}. Authenticatedsharedleaseciphertextdownload/hash/CMSbyOpenSSLonly/fullmemberhashes+symlinktargets/noarbitraryextraction; freshprivateUnixsocket-onlyPG17/NOLOGINsource-roleplaceholders/ownerACLrestore/object+rowcountdigests; no existingPGservice/application/provider touched. Ownedtempcluster/cleartextremovedonlyaftersafestop, ciphertextretained. FailureblocksDROP/rootremoval; no blindretry.\n"
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:
  with (R/n).open('a')as f:f.write(entry)
 print(json.dumps({'status':result['status'],'receipt':str(dest),'sha256':H(dest.read_bytes()),'noRawRowsOrCredentialsExported':True}));raise SystemExit(1 if failure else 0)
if __name__=='__main__':main()
