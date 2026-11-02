
import os,re,fcntl,json,subprocess,datetime,time,hashlib,socket
from pathlib import Path
fds=[]
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def lock(name):
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(fd)
FLAGS=['BILLING_OPERATIONS_ENABLED','BACKGROUND_JOBS_ENABLED','BILLING_RENEWAL_SCHEDULER_ENABLED','SIGNING_V2_WORKER_ENABLED','WHATSAPP_WORKER_ENABLED','WHATSAPP_DEMO_WORKER_ENABLED','COURT_DEMO_SYNC_WORKER_ENABLED','CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED','GIT_SHA','MULTI_TENANT_MODE','TENANT_DB_ISOLATION_ENABLED','SELF_SERVICE_SIGNUP_ENABLED','TAKBULL_MODE','QA_OUTBOUND_MODE','CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED','WHATSAPP_DEMO_ONLY','WHATSAPP_CONNECT_ONLY']
META=['kill_timeout','autorestart','exec_mode','instances','pm_id','pm_uptime','status','PM2_KILL_TIMEOUT']
DBKEYS=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL','PORT']
SELECT=set(FLAGS+META+['PORT'])
def parse_value(v):
 v=v.strip()
 if v[:1] in ['"',"'",'`']:
  if len(v)<2 or v[-1:]!=v[:1]:raise Exception('UNSUPPORTED_MULTILINE_SELECTED_VALUE')
  return v[1:-1]
 return v.split('#',1)[0].strip()
def selected_file(p):
 out={}
 with p.open('rb')as f:
  for line in f:
   line=line.lstrip()
   if line.startswith(b'export '):line=line[7:].lstrip()
   k,sep,v=line.partition(b'=')
   if not sep:continue
   key=k.strip().decode('ascii',errors='ignore')
   if key not in SELECT:continue
   if key=='DATABASE_URL':out[key]=bool(v.strip());continue
   out[key]=parse_value(v.decode())
 return out
def selected_proc(pid,allowed=SELECT):
 out={};key=bytearray();value=bytearray();in_value=False;keep=False
 with Path('/proc/'+str(pid)+'/environ').open('rb')as f:
  while True:
   b=f.read(1)
   if not b:break
   if b==b'\0':
    if in_value and keep:
     k=key.decode();out[k]=bool(value) if k=='DATABASE_URL' else value.decode()
    key.clear();value.clear();in_value=False;keep=False;continue
   if not in_value:
    if b==b'=':
     in_value=True;keep=key.decode(errors='ignore')in allowed
    elif len(key)<256:key.extend(b)
   elif keep:
    if len(value)>32768:raise Exception('OVERSIZED_SELECTED_VALUE')
    value.extend(b)
 return out
def git(*a):
 p=subprocess.run(['git','-C','/root/Melamedia',*a],capture_output=True,text=True,timeout=15,env={**{k:os.environ[k]for k in ['PATH','HOME','LANG']if k in os.environ},'GIT_OPTIONAL_LOCKS':'0'});return {'exit':p.returncode,'stdout':p.stdout.strip(),'stderrBytes':len(p.stderr)}
def qa_pid():
 f=Path('/root/.pm2/pm2.pid')
 if not f.is_file():raise Exception('EXISTING_PM2_DAEMON_REQUIRED')
 os.kill(int(f.read_text().strip()),0)
 p=subprocess.run(['pm2','pid','melamedia-api'],capture_output=True,text=True,timeout=12)
 ids=[int(x)for x in p.stdout.splitlines()if re.fullmatch('[1-9][0-9]*',x)]
 if p.returncode or len(ids)!=1:raise Exception('QA_PID_NOT_UNIQUE')
 return ids[0]
def process_meta(pid):
 stat=Path('/proc/'+str(pid)+'/stat').read_text();rest=stat[stat.rfind(')')+2:].split()
 return {'pid':pid,'procCwd':os.readlink('/proc/'+str(pid)+'/cwd'),'procExe':os.readlink('/proc/'+str(pid)+'/exe'),'startTicks':int(rest[19]),'cmdlineContainsExpectedServerPath':b'/root/Melamedia/backend/server.js'in Path('/proc/'+str(pid)+'/cmdline').read_bytes()}
def socket_counts(pid):
 p=subprocess.run(['ss','-H','-t','-n','-p'],capture_output=True,text=True,timeout=10);r={'ssExit':p.returncode,'qaPortConnectionStates':{},'processOutgoingCategories':{}}
 if p.returncode:return r
 for line in p.stdout.splitlines():
  fields=line.split()
  if len(fields)<5:continue
  state,local,peer=fields[0],fields[3],fields[4]
  localport=local.rsplit(':',1)[-1];peerport=peer.rsplit(':',1)[-1]
  if localport=='3003':r['qaPortConnectionStates'][state]=r['qaPortConnectionStates'].get(state,0)+1
  if re.search(r'\bpid='+str(pid)+r'\b',line) and localport!='3003':
   host=peer.rsplit(':',1)[0].strip('[]')
   kind='loopback_db'if host in ['127.0.0.1','::1']and peerport=='5432'else'loopback_other'if host in ['127.0.0.1','::1']else'nonloopback_unknown_purpose'
   key=state+':'+kind;r['processOutgoingCategories'][key]=r['processOutgoingCategories'].get(key,0)+1
 return r
import ipaddress
SELECT=set(FLAGS+META+['PORT'])
def classify(a,p):
 h=a.rsplit(':',1)[0].strip('[]');mapped=False
 try:
  x=ipaddress.ip_address(h.split('%',1)[0])
  if isinstance(x,ipaddress.IPv6Address)and x.ipv4_mapped is not None:x=x.ipv4_mapped;mapped=True
  loop=x.is_loopback
  c='loopback_db'if loop and p==5432 else'loopback_other'if loop else'nonloopback_unknown_purpose'
  return c,mapped,loop
 except ValueError:return'unclassified_address',False,False

def sockets(pid):
 p=subprocess.run(['ss','-H','-t','-n','-p','-i','-e'],capture_output=True,text=True,timeout=10)
 fdmap={}
 for f in Path('/proc/'+str(pid)+'/fd').iterdir():
  try:
   m=re.fullmatch(r'socket:\[(\d+)\]',os.readlink(f))
   if m:fdmap.setdefault(m.group(1),[]).append(int(f.name))
  except OSError:pass
 rows=[];lines=p.stdout.splitlines();i=0
 while i<len(lines):
  line=lines[i];i+=1
  if not re.search(r'\bpid='+str(pid)+r'\b',line):continue
  fields=line.split()
  if len(fields)<5:continue
  state,local,peer=fields[0],fields[3],fields[4]
  try:lp=int(local.rsplit(':',1)[-1]);pp=int(peer.rsplit(':',1)[-1])
  except ValueError:continue
  extra=''
  while i<len(lines)and lines[i][:1].isspace():extra+=' '+lines[i].strip();i+=1
  cat,mapped,loop=classify(peer,pp);inode=re.search(r'\bino:(\d+)\b',line);inode=inode.group(1)if inode else None
  info={}
  for k in ['bytes_sent','bytes_acked','bytes_received','lastsnd','lastrcv','lastack','segs_out','segs_in','notsent','unacked']:
   m=re.search(r'\b'+k+r':(\d+)\b',extra)
   if m:info[k]=int(m.group(1))
  rows.append({'state':state,'direction':'inbound_qa_http'if lp==3003 else'outbound_or_other','localPort':lp,'peerPort':pp,'peerCategory':cat,'peerIsLoopbackAfterNormalization':loop,'peerUsesIpv4Mapping':mapped,'inode':inode,'qaFdNumbers':fdmap.get(inode,[]),'inodeBelongsToQaFd':bool(fdmap.get(inode)),'tcpInfo':info})
 return {'ssExit':p.returncode,'connections':rows,'rawAddressOrPacketOutput':False}


import shutil,platform
r={'startedAtUtc':now(),'scope':'ExistingQA source/process/config/OS metadata only; no database/provider/storage connection','mutations':0,'databaseConnections':0,'providerCalls':0,'storageCalls':0,'namespaceCommandsExecuted':False}
try:
 lock('melamedia-release-maintenance');lock('melamedia-legal-melamedia-release')
 pid=qa_pid();daemonpid=int(Path('/root/.pm2/pm2.pid').read_text().strip());r['processBefore']=process_meta(pid);r['daemonBefore']={k:v for k,v in process_meta(daemonpid).items()if k!='cmdlineContainsExpectedServerPath'}
 initial=selected_proc(pid);file=selected_file(Path('/root/Melamedia/backend/.env'));e={**file,**initial}
 if r['processBefore']['procCwd']!='/root/Melamedia/backend'or not r['processBefore']['cmdlineContainsExpectedServerPath']or e.get('PORT')!='3003':raise Exception('QA_PROCESS_MAPPING_MISMATCH')
 def safe(k,v):
  if v is None:return None
  if k=='GIT_SHA':return v if re.fullmatch('[0-9a-f]{7,40}',v)else'INVALID_REDACTED'
  if k in ['exec_mode','status']:return v if v in ['fork_mode','cluster_mode','online','stopped','launching','errored']else'OTHER_REDACTED'
  if k in ['kill_timeout','instances','pm_id','pm_uptime','PM2_KILL_TIMEOUT']:return int(v)if str(v).isdigit()else'INVALID_REDACTED'
  return v if str(v).lower()in ['true','false','1','0','prod','production','test','sandbox','noop','']else'OTHER_REDACTED'
 r['effectiveProjection']={k:safe(k,e.get(k))for k in FLAGS};r['initialProcessMetadata']={k:safe(k,initial.get(k))for k in META};r['daemonPM2_KILL_TIMEOUT']=safe('PM2_KILL_TIMEOUT',selected_proc(daemonpid,{'PM2_KILL_TIMEOUT'}).get('PM2_KILL_TIMEOUT'))
 r['hostBootIdBefore']=Path('/proc/sys/kernel/random/boot_id').read_text().strip();r['environmentFileSha256Before']=hashlib.sha256(Path('/root/Melamedia/backend/.env').read_bytes()).hexdigest();r['sourceBefore']={'head':git('rev-parse','HEAD'),'trackedStatus':git('status','--porcelain','--untracked-files=no'),'backendTree':git('rev-parse','HEAD:backend')}
 mf=Path('/root/Melamedia/docs/signing-v2/release-baseline.json');manifest=json.loads(mf.read_text());mismatches=[]
 for path,expected in manifest.get('files',{}).items():
  f=(Path('/root/Melamedia')/path).resolve();f.relative_to(Path('/root/Melamedia'))
  if not f.is_file()or hashlib.sha256(f.read_bytes()).hexdigest()!=expected:mismatches.append(path)
 r['protected']={'entries':len(manifest.get('files',{})),'mismatches':mismatches}
 nm=Path('/root/Melamedia/backend/node_modules')
 def deps():
  return{'symlink':nm.is_symlink(),'linkTarget':os.readlink(nm)if nm.is_symlink()else None,'resolvedTarget':str(nm.resolve()),'targetExists':nm.is_dir(),'sourceLockSha256':hashlib.sha256(Path('/root/Melamedia/backend/package-lock.json').read_bytes()).hexdigest(),'installedLockSha256':hashlib.sha256((nm/'.package-lock.json').read_bytes()).hexdigest()if(nm/'.package-lock.json').is_file()else None}
 r['dependenciesBefore']=deps();r['sockets']=sockets(pid)
 r['os']={'kernel':platform.release(),'machine':platform.machine()};osp=Path('/etc/os-release');r['os'].update({k:v.strip('"')for line in osp.read_text().splitlines()if '='in line for k,v in [line.split('=',1)]if k in ['ID','VERSION_ID','PRETTY_NAME']})
 r['namespacePrerequisites']={'selectedStatus':{k:v.strip()for line in Path('/proc/self/status').read_text().splitlines()if ':'in line for k,v in [line.split(':',1)]if k in ['CapEff','NoNewPrivs']},'existingNamespaceLinks':{p.name:os.readlink(p)for p in Path('/proc/self/ns').iterdir()if p.is_symlink()},'sysctls':{},'tools':{}}
 for name in ['/proc/sys/user/max_user_namespaces','/proc/sys/kernel/unprivileged_userns_clone']:
  p=Path(name);r['namespacePrerequisites']['sysctls'][name]=p.read_text().strip()if p.is_file()else None
 for name in ['unshare','bwrap','timeout','setpriv','prlimit']:
  path=shutil.which(name);row={'path':path,'exists':path is not None}
  if path:
   q=subprocess.run([path,'--version'],capture_output=True,text=True,timeout=5);row.update({'versionExit':q.returncode,'version':q.stdout.splitlines()[0]if q.stdout.splitlines()else None})
  r['namespacePrerequisites']['tools'][name]=row
 # Operational process names only; arbitrary argv/env are never exported.
 ops=[];helperCounts={}
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   comm=(p/'comm').read_text().strip()
   if comm in ['pg_dump','pg_restore','openssl','curl','tar']:helperCounts[comm]=helperCounts.get(comm,0)+1
   if comm not in ['python3','python','bash','sh','node']:continue
   args=(p/'cmdline').read_bytes().split(b'\0')
   matched=[n for n in ['melamedia-server-backup.py','melamedia-backup-retention.py','restore-in-isolation.py','receive-recovery-check.py','verify-completed-backups.py']if any(a.endswith(('/'+n).encode())or a==n.encode()for a in args)]
   if matched:ops.append({'pid':int(p.name),'comm':comm,'scripts':matched})
  except(FileNotFoundError,PermissionError):pass
 r['knownOperationalProcesses']=ops;r['helperProcessCounts']=helperCounts;r['uncertainOperationLimit']='No matching operational processes observed does not prove absence of an unrelated or orphan command. No mutation was submitted by this collector.'
 r['processAfter']=process_meta(qa_pid());r['sourceAfter']={'head':git('rev-parse','HEAD'),'trackedStatus':git('status','--porcelain','--untracked-files=no')};r['hostBootIdAfter']=Path('/proc/sys/kernel/random/boot_id').read_text().strip();r['environmentFileSha256After']=hashlib.sha256(Path('/root/Melamedia/backend/.env').read_bytes()).hexdigest();r['dependenciesAfter']=deps()
 r['stable']=r['processBefore']==r['processAfter']and r['sourceBefore']['head']==r['sourceAfter']['head']and r['sourceBefore']['trackedStatus']==r['sourceAfter']['trackedStatus']and r['hostBootIdBefore']==r['hostBootIdAfter']and r['environmentFileSha256Before']==r['environmentFileSha256After']and r['dependenciesBefore']==r['dependenciesAfter'];r['status']='READONLY_QA_PREFLIGHT_COMPLETED';r['locksReleasedAtRemoteExit']=True
except Exception as ex:r.update(status='BLOCKED',errorType=type(ex).__name__)
r['finishedAtUtc']=now();print(json.dumps(r))
