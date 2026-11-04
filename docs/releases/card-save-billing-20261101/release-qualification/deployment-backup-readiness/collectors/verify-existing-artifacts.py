"""Read-only artifact digest/header checks; no extraction, decryption or SQL execution."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,importlib.util,json,subprocess
OUT=Path(__file__).parent;sp=importlib.util.spec_from_file_location('inv',OUT/'collect-inventory.py');inv=importlib.util.module_from_spec(sp);sp.loader.exec_module(inv);inventory=json.load((OUT/'private/inventory.json').open())
BODY=r'''
import ast,tarfile,re
INPUT=INPUT_PLACEHOLDER
for name in ['melamedlaw','morlevy','ashrafessa','melamedia']:
 try:lock('melamedia-legal-'+name+'-release')
 except(FileNotFoundError,BlockingIOError):print(json.dumps({'status':'DEFERRED_EXISTING_TENANT_LOCK'}));raise SystemExit
out={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mutations':0,'customerRowQueries':0,'providerCalls':0,'environmentValuesExtracted':False,'decrypted':False,'restored':False,'opaqueCiphertexts':[],'checkpointArchives':[],'frontendReferences':[],'additionalV14Metadata':[]}
def H(p):
 d=hashlib.sha256()
 with p.open('rb')as f:
  for chunk in iter(lambda:f.read(1048576),b''):d.update(chunk)
 return d.hexdigest()
def regular(p):return p.is_file()and not p.is_symlink()
def stable(p,s):
 q=p.stat();return(s.st_ino,s.st_size,s.st_mtime_ns)==(q.st_ino,q.st_size,q.st_mtime_ns)
def hashes_in(value):
 z=[]
 if isinstance(value,dict):
  for k,v in value.items():
   if isinstance(v,str)and re.fullmatch(r'[a-f0-9]{64}',v):z.append(v)
   elif isinstance(v,(dict,list)):z+=hashes_in(v)
 elif isinstance(value,list):
  for v in value:z+=hashes_in(v)
 return z
# Parse installed producer code only, never execute it or read its secret env files.
p=Path('/usr/local/sbin/melamedia-server-backup.py');raw=p.read_bytes();tree=ast.parse(raw)
policy=[]
for node in ast.walk(tree):
 if isinstance(node,(ast.Assign,ast.If,ast.AnnAssign)):
  value=node.test if isinstance(node,ast.If)else node.value
  text=ast.unparse(value)
  if 'backup_scope'in text and len(text)<250:policy.append(text)
out['installedProducer']={'sha256':hashlib.sha256(raw).hexdigest(),'policyExpressions':policy,'cliFlags':sorted({n.value for n in ast.walk(tree)if isinstance(n,ast.Constant)and isinstance(n.value,str)and re.fullmatch(r'--[a-z-]+',n.value)})}
for row in INPUT.get('backupGenerations',[]):
 p=Path(row['bundle']['path'])if row.get('bundle')else None;m=row['manifest']
 if not p or not regular(p)or not m.get('local_complete'):continue
 before=p.stat();observed=H(p);check=subprocess.run(['openssl','cms','-cmsout','-inform','DER','-in',str(p),'-noout'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
 out['opaqueCiphertexts'].append({'targets':row['targets'],'directoryId':hashlib.sha256(row['directory'].encode()).hexdigest(),'path':str(p),'createdAt':m.get('created_at'),'bytes':before.st_size,'manifestBytesMatch':before.st_size==m.get('bytes'),'sha256':observed,'manifestSha256Match':observed==m.get('sha256'),'cmsEnvelopeParses':check.returncode==0,'stableDuringRead':stable(p,before),'offsiteReported':m.get('offsite'),'innerPayloadVerified':False})
archives=[]
for directory in INPUT.get('checkpointDirectories',[]):
 p=Path(directory['path']);files=directory['files'];receipts=[]
 for rp in [p/'checkpoint.result.json',p.parent/'checkpoint.result.json',p/'result.json',p/'verification.json']:
  if regular(rp)and rp.stat().st_size<262144:
   try:receipts+=hashes_in(json.loads(rp.read_bytes()))
   except(ValueError,TypeError):pass
 source=None
 for hn in ['head-before.txt','head.txt']:
  hp=p/hn
  if regular(hp)and hp.stat().st_size<100:
   hv=hp.read_text().strip()
   if re.fullmatch('[0-9a-f]{40}',hv):source=hv
 for f in files:
  if f['name'].endswith(('.dump','.tar','.tar.gz','.tgz','.zip')):archives.append((directory['targets'],p/f['name'],receipts,source))
# This documented historical container can store tenant names on files rather than directories.
v14=Path('/root/customer-release-backups/legal-release-20261006-v14')
if v14.is_dir()and not v14.is_symlink():
 for p in sorted(v14.iterdir()):
  if regular(p):out['additionalV14Metadata'].append({'name':p.name,'bytes':p.stat().st_size,'sha256':H(p)if p.stat().st_size<2097152 else None})
seen=set()
for targets,p,expected,source in archives:
 if str(p)in seen or not regular(p):continue
 seen.add(str(p));before=p.stat()
 if before.st_size>268435456:continue
 digest=H(p);row={'targets':targets,'path':str(p),'archiveId':hashlib.sha256(str(p).encode()).hexdigest(),'bytes':before.st_size,'sha256':digest,'digestFoundInExistingCheckpointReceipt':digest in expected,'sourceCommitFromMetadata':source,'stableDuringRead':stable(p,before)}
 if p.name.endswith('.dump'):
  q=subprocess.run(['pg_restore','--list',str(p)],capture_output=True,text=True,timeout=20);text=q.stdout if q.returncode==0 else'';row.update({'type':'postgres-custom','tocListExit':q.returncode,'tocSha256':hashlib.sha256(text.encode()).hexdigest(),'tocEntries':sum(bool(x and not x.startswith(';'))for x in text.splitlines()),'tableDataEntries':sum(' TABLE DATA 'in x for x in text.splitlines()),'knownTablesPresent':{name:bool(re.search(r'\b'+name+r'\b',text))for name in ['users','firm_billing','firm_payment_intents']},'dataRowsReadOrRestored':False})
 elif p.name.endswith(('.tar','.tar.gz','.tgz')):
  flags={'backendServer':False,'packageJson':False,'packageLock':False,'frontendIndex':False,'frontendManifest':False,'nodeModules':False,'environmentHeader':False};count=unsafe=0
  try:
   with tarfile.open(p,'r|*')as archive:
    for member in archive:
     count+=1;name=member.name.lstrip('./');parts=Path(member.name).parts;unsafe+=int(member.name.startswith('/')or'..'in parts)
     flags['backendServer']|=name=='server.js'or name.endswith('/backend/server.js')or name=='backend/server.js';flags['packageJson']|=name=='package.json'or name.endswith('/package.json');flags['packageLock']|=name=='package-lock.json'or name.endswith('/package-lock.json');flags['frontendIndex']|=name=='index.html'or name.endswith('/build/index.html');flags['frontendManifest']|=name=='asset-manifest.json'or name.endswith('/build/asset-manifest.json');flags['nodeModules']|='node_modules'in parts;flags['environmentHeader']|=Path(name).name.startswith('.env')
     if count>50000:raise RuntimeError('HEADER_COUNT_BOUND')
   row.update({'type':'tar-headers-only','headersParsed':True,'memberCount':count,'unsafePathHeaders':unsafe,'componentHeaders':flags,'membersExtracted':0})
  except(Exception)as e:row.update({'type':'tar-headers-only','headersParsed':False,'errorType':type(e).__name__})
 row['stableDuringRead']=stable(p,before);out['checkpointArchives'].append(row)
# A before-manifest names public assets only; do not read private state or customer files.
cache={}
roots={'Melamedia':Path('/var/www/melamedia'),'MorLevi':Path('/var/www/morlevy'),'AshrafEssa':Path('/var/www/ashrafessa')}
for directory in INPUT.get('checkpointDirectories',[]):
 ts=[t for t in directory['targets']if t in roots]
 if len(ts)!=1:continue
 target=ts[0];cp=Path(directory['path']);mp=cp/'asset-manifest.before.json';index=cp/'index.before.html';root=roots[target]
 if not regular(mp)or not regular(index):continue
 raw=mp.read_bytes();d=json.loads(raw);refs=d.get('files',{});missing=unsafe=0;entryHashes={};referenced=0
 for key,value in refs.items():
  if not isinstance(value,str):unsafe+=1;continue
  relative=value.lstrip('/')
  if relative in['index.html','asset-manifest.json']:continue
  p=(root/relative).resolve()
  try:p.relative_to(root.resolve())
  except ValueError:unsafe+=1;continue
  referenced+=1
  if not regular(p):missing+=1;continue
  if str(p)not in cache:cache[str(p)]=H(p)
  entryHashes[relative]=cache[str(p)]
 oldIndexHash=H(index);activeIndex=root/'index.html'
 out['frontendReferences'].append({'target':target,'checkpointId':hashlib.sha256(str(cp).encode()).hexdigest(),'checkpointPath':str(cp),'manifestSha256':hashlib.sha256(raw).hexdigest(),'beforeIndexSha256':oldIndexHash,'differentFromActiveIndex':regular(activeIndex)and H(activeIndex)!=oldIndexHash,'referencedAssetCount':referenced,'existingReferencedAssets':len(entryHashes),'missingReferencedAssets':missing,'unsafeReferences':unsafe,'currentReferencedAssetDigestMapSha256':hashlib.sha256(json.dumps(entryHashes,sort_keys=True).encode()).hexdigest(),'fullArchivedPayloadPresent':False,'sourceVersionIdentityCertified':False})
print(json.dumps(out))
'''
def verify(label,host):
 code=inv.COMMON.split('ALIASES=')[0]+BODY.replace('INPUT_PLACEHOLDER',repr(inventory[label]),1)
 return inv.remote(host)if False else remote(host,code)
def remote(host,code):
 p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@'+host,'python3 -'],input=code,capture_output=True,text=True,timeout=125)
 try:d=json.loads(p.stdout)
 except ValueError:d={'status':'UNSTRUCTURED_RESPONSE','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
 return{'sshExit':p.returncode,**d}
if __name__=='__main__':
 result={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  jobs={pool.submit(verify,label,host):label for label,host in[('backend','37.60.230.148'),('frontend','84.46.253.85')]}
  for job in concurrent.futures.as_completed(jobs):result[jobs[job]]=job.result()
 result['completedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(OUT/'private/artifact-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({h:{'sshExit':v.get('sshExit'),'ciphertexts':len(v.get('opaqueCiphertexts',[])),'ciphertextChecksPass':all(x['manifestSha256Match']and x['manifestBytesMatch']and x['cmsEnvelopeParses']and x['stableDuringRead']for x in v.get('opaqueCiphertexts',[])),'checkpointArchives':len(v.get('checkpointArchives',[])),'tocPass':sum(x.get('tocListExit')==0 for x in v.get('checkpointArchives',[])),'tarHeaderPass':sum(x.get('headersParsed')is True for x in v.get('checkpointArchives',[])),'frontendRefs':len(v.get('frontendReferences',[])),'installedProducer':v.get('installedProducer'),'status':v.get('status')}for h,v in result.items()if isinstance(v,dict)},indent=2))
