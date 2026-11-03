"""Existing host inventory only; no backup, restore, payload extraction or writes."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,subprocess
OUT=Path(__file__).parent
COMMON=r'''
import os,fcntl,json,hashlib,datetime,subprocess,re
from pathlib import Path
fds=[]
def lock(name):
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW)
 try:fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB)
 except Exception:os.close(fd);raise
 fds.append(fd)
try:lock('melamedia-release-maintenance')
except(FileNotFoundError,BlockingIOError):print(json.dumps({'status':'DEFERRED_EXISTING_MAINTENANCE_LOCK'}));raise SystemExit
ALIASES={'MelamedLaw':('melamedlaw','melamed','layerwebsites'),'MorLevi':('morlevi','morlevy'),'AshrafEssa':('ashrafessa','ashraf'),'Melamedia':('melamedia',)}
LOCKS={'MelamedLaw':'melamedlaw','MorLevi':'morlevy','AshrafEssa':'ashrafessa','Melamedia':'melamedia'}
def targets(name):return[t for t,a in ALIASES.items()if any(re.search(r'(?:^|[^a-z0-9])'+re.escape(x)+r'(?:$|[^a-z0-9])',str(name).lower())for x in a)]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def regular(p):return p.is_file()and not p.is_symlink()
def stat(p):
 s=p.stat();return{'bytes':s.st_size,'mtimeUtc':datetime.datetime.fromtimestamp(s.st_mtime,datetime.timezone.utc).isoformat(),'mode':oct(s.st_mode&0o777)}
out={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mutations':0,'customerRowQueries':0,'providerCalls':0,'environmentValueExtraction':False,'archivePayloadExtraction':False,'scripts':[],'configurations':[],'checkpointDirectories':[],'checkpointRoots':[],'backupGenerations':[],'locks':{}}
for t,l in LOCKS.items():
 try:lock('melamedia-legal-'+l+'-release');out['locks'][t]='EXISTING_SHARED_LOCK'
 except(FileNotFoundError,BlockingIOError):out['locks'][t]='DEFERRED_EXISTING_TENANT_LOCK'
for base in[Path('/usr/local/sbin')]:
 for p in sorted(base.iterdir()):
  if regular(p)and p.name.startswith('melamedia')and any(x in p.name for x in['backup','recovery','release','checkpoint']):
   row={'path':str(p),**stat(p)}
   if p.stat().st_size<2097152:
    raw=p.read_bytes();row['sha256']=sha(raw);text=raw.decode(errors='replace');row['functionalMarkers']={x:x in text for x in['pg_dump','pg_restore','recovery_paths','object_snapshot','database_only','db_only','--project','prune(','shutil.rmtree','remote_transfer','sqlite_database']}
   out['scripts'].append(row)
configpath=Path('/etc/melamedia-backup.d/config.json')
backupRoots=[]
if regular(configpath):
 raw=configpath.read_bytes();d=json.loads(raw);root=Path(d.get('root','/nonexistent'));backupRoots.append(root)
 cr={'path':str(configpath),'sha256':sha(raw),'topLevelKeys':sorted(d),'backupRoot':str(root),'backupScope':d.get('backup_scope'),'hostIdentityMatches':d.get('host')==subprocess.check_output(['hostname'],text=True).strip(),'localGenerationOnly':d.get('local_generation_only')is True,'projectCount':len(d.get('projects',[])),'recipientExists':regular(Path(d['recipient']))if isinstance(d.get('recipient'),str)else False,'projects':[]}
 for project in d.get('projects',[]):
  tt=targets(project.get('name',''))
  if not tt:continue
  name=project['name'];cr['projects'].append({'name':name,'targets':tt,'database':project.get('database'),'sqliteConfigured':'sqlite_database'in project,'recoveryPathCount':len(project.get('recovery_paths',[])),'objectSnapshotConfigured':bool(project.get('object_snapshot')),'projectKeys':sorted(project),'hasStorage':bool(project.get('storage')),'sourceStatus':project.get('source_status'),'sharedRecoveryProject':project.get('shared_recovery_project')})
  pr=root/name
  if not pr.is_dir()or pr.is_symlink():continue
  generations=sorted([p for p in pr.iterdir()if p.is_dir()and not p.is_symlink()],key=lambda p:p.stat().st_mtime,reverse=True)[:4]
  for g in generations:
   m=g/'manifest.json'
   if not regular(m)or m.stat().st_size>1048576:continue
   mr=m.read_bytes();md=json.loads(mr);bundle=g/'bundle.cms'
   out['backupGenerations'].append({'targets':tt,'directory':str(g),'manifestSha256':sha(mr),'manifest':{k:md[k]for k in['project','host','created_at','local_complete','encrypted','sha256','bytes','offsite','organization_offsite']if k in md},'bundle':{'path':str(bundle),**stat(bundle)}if regular(bundle)else None})
 out['configurations'].append(cr)
for root in[Path('/var/lib/melamedia-releases'),Path('/root/customer-release-backups'),Path('/root/legal-word-stage-release-20261026')]:
 out['checkpointRoots'].append({'path':str(root),'exists':root.is_dir()and not root.is_symlink(),'directDirectories':[x.name for x in root.iterdir()if x.is_dir()and not x.is_symlink()]if root.is_dir()and not root.is_symlink()else[]})
 if not root.is_dir()or root.is_symlink():continue
 todo=[(root,0)];seen=0
 while todo and seen<1500:
  p,depth=todo.pop();seen+=1
  entries=sorted(p.iterdir(),key=lambda x:x.name)
  tt=targets(str(p.relative_to(root)))
  if tt and all(out['locks'][t]=='EXISTING_SHARED_LOCK'for t in tt):
   files=[x for x in entries if regular(x)]
   out['checkpointDirectories'].append({'path':str(p),'targets':tt,'root':str(root),**stat(p),'files':[{'name':x.name,**stat(x)}for x in files][:150],'fileCount':len(files),'childDirectoryCount':sum(x.is_dir()and not x.is_symlink()for x in entries)})
  if depth<3:
   todo.extend((x,depth+1)for x in entries if x.is_dir()and not x.is_symlink())
# Existing PM2 process metadata only; no environment fields are selected or emitted.
pgrep=subprocess.run(['pgrep','-f','PM2.*God Daemon'],capture_output=True,text=True)
if pgrep.returncode==0:
 proc=subprocess.run(['pm2','jlist'],capture_output=True,text=True,timeout=20)
 if proc.returncode==0:
  allp=json.loads(proc.stdout);out['activeApplicationPaths']=[{'name':p.get('name'),'cwd':p.get('pm2_env',{}).get('pm_cwd'),'script':p.get('pm2_env',{}).get('pm_exec_path'),'status':p.get('pm2_env',{}).get('status')}for p in allp if p.get('name')in['melamed-backend','morlevy-api','ashrafessa-api','melamedia-api']]
health=Path('/var/lib/melamedia-backup-watch/latest-health.json')
if regular(health):
 raw=health.read_bytes();d=json.loads(raw);out['backupHealth']={'sha256':sha(raw),'utc':d.get('utc'),'healthy':d.get('healthy')is True,'failureCount':len(d.get('failures',[])),'allChecksVerifiedReadback':bool(d.get('checks'))and all(x.get('offsite')=='verified_readback'for x in d.get('checks',[])),'targetChecks':[{k:x[k]for k in['project','offsite','age_hours','ageHours','bytes','sha256','status']if k in x}for x in d.get('checks',[])if targets(x.get('project',''))]}
print(json.dumps(out))
'''
def remote(host):
 p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@'+host,'python3 -'],input=COMMON,capture_output=True,text=True,timeout=125)
 try:d=json.loads(p.stdout)
 except ValueError:d={'status':'UNSTRUCTURED_RESPONSE','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
 return{'sshExit':p.returncode,**d}
if __name__=='__main__':
 result={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  jobs={pool.submit(remote,h):label for label,h in[('backend','37.60.230.148'),('frontend','84.46.253.85')]}
  for job in concurrent.futures.as_completed(jobs):result[jobs[job]]=job.result()
 result['completedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(OUT/'private/inventory.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:{'sshExit':v.get('sshExit'),'scripts':len(v.get('scripts',[])),'configs':len(v.get('configurations',[])),'checkpoints':len(v.get('checkpointDirectories',[])),'generations':len(v.get('backupGenerations',[])),'locks':v.get('locks'),'health':v.get('backupHealth')}for k,v in result.items()if isinstance(v,dict)},indent=2))
