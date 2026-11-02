"""One read-only metadata SSH call per known host; no restore script or DB connection."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,subprocess
R=Path(__file__).parent
CODE=r'''
import datetime,fcntl,hashlib,json,os,pwd,re,stat,subprocess
from pathlib import Path
fds=[]
def lock(name):
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW)
 try:fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB)
 except Exception:os.close(fd);raise
 fds.append(fd)
try:
 lock('melamedia-release-maintenance')
 for name in ['melamedia','ashrafessa','morlevy','melamedlaw']:lock('melamedia-legal-'+name+'-release')
except(FileNotFoundError,BlockingIOError):print(json.dumps({'result':'DEFERRED_EXISTING_LOCK_NOT_AVAILABLE'}));raise SystemExit
out={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Only documented historical restore account/root/prefix/55489/listener and matching service metadata','dbConnections':0,'scriptsInvoked':0,'createdInstalledRestoredDecrypted':0,'newEnvironmentAnywhere':False,'environmentValuesRead':False,'mutations':0}
def meta(p):
 if not p.exists()and not p.is_symlink():return{'exists':False}
 s=p.lstat();return{'exists':True,'symlink':stat.S_ISLNK(s.st_mode),'directory':stat.S_ISDIR(s.st_mode),'regularFile':stat.S_ISREG(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'mode':oct(s.st_mode&0o777),'bytes':s.st_size}
def H(p):return hashlib.sha256(p.read_bytes()).hexdigest()
try:
 account=pwd.getpwnam('melabackupcheck');uid=account.pw_uid;out['account']={'exists':True,'name':account.pw_name,'uid':uid,'gid':account.pw_gid,'shell':account.pw_shell,'nonLogin':account.pw_shell=='/usr/sbin/nologin'}
except KeyError:uid=None;out['account']={'exists':False,'name':'melabackupcheck'}
root=Path('/var/lib');matches=sorted(p for p in root.iterdir()if p.name.startswith('melamedia-isolated-restore-'))
out['documentedRestorePrefix']='/var/lib/melamedia-isolated-restore-';out['matchingDirectEntries']=len(matches);out['restoreCandidates']=[]
for p in matches[:20]:
 row={'path':str(p),'metadata':meta(p)}
 if p.is_symlink()or not p.is_dir():out['restoreCandidates'].append(row);continue
 row['socketDirectory']=meta(p/'socket');row['pgdataDirectory']=meta(p/'pgdata');version=p/'pgdata/PG_VERSION';row['pgVersionFile']=meta(version)
 if version.is_file()and not version.is_symlink()and version.stat().st_size<32:
  value=version.read_text().strip();row['pgMajorVersion']=value if re.fullmatch(r'\d+(?:\.\d+)?',value)else'UNEXPECTED_VERSION_METADATA'
 row['configuration']={}
 for name in ['postgresql.conf','postgresql.auto.conf','pg_hba.conf']:
  f=p/'pgdata'/name;entry=meta(f)
  if f.is_file()and not f.is_symlink()and f.stat().st_size<1048576:
   raw=f.read_bytes();entry['sha256']=hashlib.sha256(raw).hexdigest()
   if name!='pg_hba.conf':entry['selectedRoutingSettings']={m.group(1):m.group(2).strip()for m in re.finditer(r'^\s*(listen_addresses|port|unix_socket_directories|shared_preload_libraries|data_directory)\s*=\s*([^#\n]*)',raw.decode(errors='replace'),re.M)}
   else:entry['nonCommentRecordTypes']=[x.split()[0]for x in raw.decode(errors='replace').splitlines()if x.strip()and not x.lstrip().startswith('#')]
  row['configuration'][name]=entry
 pid=p/'pgdata/postmaster.pid';row['pidFile']=meta(pid)
 if pid.is_file()and not pid.is_symlink()and pid.stat().st_size<4096:
  lines=pid.read_text().splitlines();row['pidMetadata']={'pid':int(lines[0])if lines and lines[0].isdigit()else None,'port':int(lines[3])if len(lines)>3 and lines[3].isdigit()else None,'socketDirectory':lines[4]if len(lines)>4 else None,'listenAddresses':lines[5]if len(lines)>5 else None}
 out['restoreCandidates'].append(row)
helper=Path('/root/audit-remediation-20261008/backup-coverage');out['documentedHelperRoot']={'path':str(helper),'metadata':meta(helper),'helpers':{}}
for name in ['receive-recovery-check.py','restore-in-isolation.py']:
 p=helper/name;row=meta(p)
 if row.get('regularFile')and not row.get('symlink')and row['bytes']<1048576:row['sha256']=H(p)
 out['documentedHelperRoot']['helpers'][name]=row
receiver=helper/'recovery-check';out['documentedReceiverRoot']={'path':str(receiver),'metadata':meta(receiver)}
if receiver.is_dir()and not receiver.is_symlink():
 entries=list(receiver.iterdir());out['documentedReceiverRoot']['directEntryCount']=len(entries);out['documentedReceiverRoot']['sessionDirectoryCount']=sum(x.is_dir()and not x.is_symlink()and bool(re.fullmatch('[a-f0-9]{16}',x.name))for x in entries)
for kind,args in [('tcp',['ss','-H','-ltn']),('unix',['ss','-H','-lx'])]:
 q=subprocess.run(args,capture_output=True,text=True,timeout=8);lines=[x for x in q.stdout.splitlines()if(':55489'in x if kind=='tcp'else'.s.PGSQL.55489'in x)];out[kind+'55489ListenerMetadata']={'collectorExit':q.returncode,'matchingLines':len(lines),'lineSha256':[hashlib.sha256(x.encode()).hexdigest()for x in lines]}
if uid is not None:
 q=subprocess.run(['ps','-eo','pid=,uid=,comm='],capture_output=True,text=True,timeout=8);rows=[]
 for line in q.stdout.splitlines():
  fields=line.split(None,2)
  if len(fields)==3 and fields[1].isdigit()and int(fields[1])==uid:rows.append({'pid':int(fields[0]),'comm':Path(fields[2]).name})
 out['verifierOwnedProcesses']={'collectorExit':q.returncode,'processes':rows}
units=Path('/etc/systemd/system');names=sorted(p.name for p in units.iterdir()if re.search(r'melabackupcheck|melamedia.*restore|postgresql.*55489',p.name));out['matchingDocumentedServiceNames']=names[:20];out['matchingServiceMetadata']=[]
for name in names[:20]:
 q=subprocess.run(['systemctl','show',name,'--no-pager','--property=Id,ActiveState,SubState,User,Group,WorkingDirectory,PrivateNetwork,PrivateTmp,ProtectSystem,FragmentPath'],capture_output=True,text=True,timeout=8);out['matchingServiceMetadata'].append({'name':name,'collectorExit':q.returncode,'properties':dict(line.split('=',1)for line in q.stdout.splitlines()if'='in line)})
out['pg16Tools']={name:meta(Path('/usr/lib/postgresql/16/bin')/name)for name in ['pg_ctl','pg_restore','initdb']};out['result']='READ_ONLY_DOCUMENTED_METADATA_DISCOVERY_COMPLETE';out['quarantineReuseCertified']=False;out['certificationBoundary']='Metadata alone cannot authenticate backups, prove current QA ownership/synthetic data/no financial egress, or authorize starting/reusing a target. No scripts, DB connects or restores were invoked.'
print(json.dumps(out))
'''
def remote(host):
 p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@'+host,'python3 -'],input=CODE,capture_output=True,text=True,timeout=55)
 try:d=json.loads(p.stdout)
 except ValueError:d={'result':'UNSTRUCTURED_METADATA_RESPONSE','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
 return{'sshExit':p.returncode,**d}
if __name__=='__main__':
 result={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sshCallsPerHost':1}
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  jobs={pool.submit(remote,h):label for label,h in[('backend','37.60.230.148'),('frontend','84.46.253.85')]}
  for job in concurrent.futures.as_completed(jobs):result[jobs[job]]=job.result()
 result['completedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();p=R/'private/existing-restore-target-metadata.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600);print(json.dumps({h:{k:v.get(k)for k in ['sshExit','result','account','matchingDirectEntries','tcp55489ListenerMetadata','unix55489ListenerMetadata','verifierOwnedProcesses','matchingDocumentedServiceNames','quarantineReuseCertified']}for h,v in result.items()if isinstance(v,dict)},indent=2))
