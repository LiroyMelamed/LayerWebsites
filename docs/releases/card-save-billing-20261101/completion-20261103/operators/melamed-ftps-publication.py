"""Named MelamedLaw FTPS publication, immutable chunks first, no mirror/delete."""
import argparse,base64,datetime,ftplib,hashlib,io,json,re,shlex,socket,ssl,subprocess,tarfile,urllib.parse,urllib.request,uuid
from pathlib import Path,PurePosixPath
D=Path(__file__).resolve().parent;R=D.parent;O=D/'MelamedLaw'/'frontend';H=lambda b:hashlib.sha256(b).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def safe(n):return isinstance(n,str)and n and not n.startswith('/')and '\\'not in n and all(x not in ['','.','..']for x in n.split('/'))and not any(ord(x)<32 for x in n)
READ_TRANSPORT_ERRORS=(EOFError,ssl.SSLEOFError,ConnectionResetError,TimeoutError)
def read(f,n,limit=20000000):
 assert safe(n)
 for attempt in range(3):
  buf=io.BytesIO()
  def add(b):assert buf.tell()+len(b)<=limit;buf.write(b)
  try:f.retrbinary('RETR '+n,add);return buf.getvalue()
  except READ_TRANSPORT_ERRORS:
   if attempt==2 or not hasattr(f,'reconnect'):raise
   f.reconnect()
def listing(f,path=''):
 for attempt in range(3):
  try:return {n:v for n,v in f.mlsd(path)if v.get('type')not in ['cdir','pdir']}
  except READ_TRANSPORT_ERRORS:
   if attempt==2 or not hasattr(f,'reconnect'):raise
   f.reconnect()
def connect_raw():
 p=Path('D:/Liroy/Websites/LayerWebsites-MelamedLaw/frontend/.env.ftp.local');b=p.read_bytes();assert H(b)=='183cf61c11d6532505652b53f32cdf3cc905200ecc4407ea01097becbd8fd7be'
 env={}
 for line in b.decode().splitlines():
  if re.match(r'^[A-Z_]+=',line):
   k,v=line.split('=',1);values=shlex.split(v,comments=True);assert len(values)==1;env[k]=values[0]
 url=urllib.parse.urlsplit(env['MELAMED_LAW_FTP_SERVER']if '://'in env['MELAMED_LAW_FTP_SERVER']else 'ftp://'+env['MELAMED_LAW_FTP_SERVER'])
 assert url.hostname=='62.90.102.115'and url.port in [None,21]and url.scheme in ['ftp','ftps']
 host='server01.funet.co.il';assert url.hostname in {x[4][0]for x in socket.getaddrinfo(host,21,type=socket.SOCK_STREAM)}
 f=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=30);f.connect(host,21);f.auth();f.login(env['MELAMED_LAW_FTP_USERNAME'],env['MELAMED_LAW_FTP_PASSWORD']);f.prot_p();f.cwd(env['MELAMED_LAW_FTP_REMOTE_PATH'])
 ob=json.loads((O/'ftp-observation.private.json').read_bytes());assert f.pwd()==ob['root'];return f
class ReadReconnectSession:
 def __init__(self):self.raw=connect_raw()
 def __getattr__(self,n):return getattr(self.raw,n)
 def reconnect(self):self.raw.close();self.raw=connect_raw()
 def quit(self):
  try:self.raw.quit()
  except (OSError,EOFError):self.raw.close()
def connect():return ReadReconnectSession()
def package():
 assets=R/'additional-materials/billing-deploy-static-074df752-20261102';manifest=json.loads((assets/'manifest.json').read_bytes());folder=assets/'melamedlaw';names=['melamedlaw-static-only.tar.gz','index.proposed.html','asset-manifest.proposed.json']
 for n in names:
  b=(folder/n).read_bytes();pin=manifest['files']['melamedlaw/'+n];assert H(b)==pin['sha256']and len(b)==pin['bytes']
 files={}
 with tarfile.open(folder/names[0],'r:gz')as t:
  for m in t.getmembers():
   assert m.isfile()and safe(m.name)and m.name.startswith('static/')and m.name not in files and m.size<20000000
   files[m.name]=t.extractfile(m).read()
 files.update({'index.html':(folder/names[1]).read_bytes(),'asset-manifest.json':(folder/names[2]).read_bytes()})
 old=(R/'additional-materials/frontend-dependencies/layer-billing-qa-frontend-adaptor-20261102/qa-static01.frozen.py').read_bytes();assert H(old)=='2a0d147f10579bdb755f81a989414609ead7332444ebd8e30bb9840f714523d8'
 ns={'__name__':'static_validation_only'};exec(compile(old,'qualified-static-checks','exec'),ns)
 before=(O/'baseline-asset-manifest.json').read_bytes();after=files['asset-manifest.json'];roles=lambda n:re.sub(r'\.[0-9a-f]{8,}(?=\.(?:js|css)$)','',n)
 target={roles(n):n for n in json.loads(after)['entrypoints']};mapping={n:target[roles(n)]for n in json.loads(before)['entrypoints']}
 ns['check_index']((O/'baseline-index.html').read_bytes(),files['index.html'],before,after,mapping)
 for n in json.loads(after)['files'].values():
  path=n.removeprefix('/');assert path in files,'MANIFEST_FILE_MISSING_FROM_PINNED_PAYLOAD'
 return files
def backend_ready():
 c=json.loads((D/'MelamedLaw/config.json').read_bytes());receipt=json.loads((D/'MelamedLaw/actual-v3/execute.stdout.json').read_bytes());assert receipt['status']=='PASS_NAMED_PRODUCTION_BACKEND_SOURCE_AND_HEALTH'
 code='''import datetime,hashlib,http.client,json,os,subprocess
from pathlib import Path
c=__C__;p=__P__
assert Path('/etc/machine-id').read_text().strip()==c['machineId']
assert subprocess.check_output(['git','-C',c['root'],'rev-parse','HEAD'],text=True).strip()==c['candidate']
assert not subprocess.check_output(['git','-C',c['root'],'status','--porcelain','--untracked-files=no'],text=True).strip()
proc=Path('/proc')/str(p['pid']);assert int(proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19])==p['startTicks']and os.readlink(proc/'cwd')==c['root']+'/backend'
for n,h in c['protectedFiles'].items():assert hashlib.sha256((Path(c['root'])/'backend'/n).read_bytes()).hexdigest()==h
h=http.client.HTTPConnection('127.0.0.1',c['port'],timeout=5);h.request('GET','/health',headers={'Connection':'close'});r=h.getresponse();assert r.status==200 and json.loads(r.read(4097))=={'ok':True};h.close()
print(json.dumps({'status':'PASS_CURRENT_NAMED_BACKEND_FOR_STATIC_PUBLICATION','source':c['candidate'],'process':p,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'healthStatus':200}))
'''.replace('__C__',repr(c)).replace('__P__',repr(receipt['process']))
 q=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8','melamedia-backend','python3 -I -S -'],input=code.encode(),capture_output=True,timeout=30)
 assert q.returncode==0,'BACKEND_READINESS_FAILED_BEFORE_ENTRYPOINT_WRITE';return json.loads(q.stdout)
def prepare():
 files=package();dest=O/'checkpoint';dest.mkdir(exist_ok=True);assert not(dest/'result.json').exists();cache=dest/'files';cache.mkdir(exist_ok=True);f=connect()
 try:
  root=listing(f);protected={};backup={};baseline=json.loads((O/'baseline-asset-manifest.json').read_bytes());absentMaps=[];parents={}
  paths={n for n,facts in root.items()if facts.get('type')=='file'}|{n.removeprefix('/')for n in baseline['files'].values()}
  assert all(safe(n)for n in paths)and len(paths)<1000
  for n in sorted(paths):
   assert n.startswith('static/')or n in root
   if n.endswith('.map'):
    parent=str(PurePosixPath(n).parent)
    if parent not in parents:parents[parent]=listing(f,parent)
    if PurePosixPath(n).name not in parents[parent]:absentMaps.append(n);continue
   local=cache.joinpath(*n.split('/'));local.parent.mkdir(parents=True,exist_ok=True)
   if local.exists():b=local.read_bytes()
   else:
    b=read(f,n)
    with local.open('xb')as saved:saved.write(b)
   assert sum(map(len,backup.values()))+len(b)<200000000;backup[n]=b;protected[n]=H(b)
  assert read(f,'index.html')==backup['index.html']and read(f,'asset-manifest.json')==backup['asset-manifest.json'],'BASELINE_CHANGED_DURING_CHECKPOINT'
  current=listing(f)
  assert {n:v for n,v in current.items()if v.get('type')=='file'}=={n:v for n,v in root.items()if v.get('type')=='file'},'ROOT_CHANGED_DURING_CHECKPOINT'
  assert backup['index.html']==(O/'baseline-index.html').read_bytes()and backup['asset-manifest.json']==(O/'baseline-asset-manifest.json').read_bytes(),'BASELINE_CHANGED'
  for n,b in files.items():
   if n in protected and n.startswith('static/'):assert protected[n]==H(b),'IMMUTABLE_COLLISION'
  archive=dest/'published-runtime-and-root.tar.gz'
  with tarfile.open(archive,'w:gz')as t:
   for n,b in sorted(backup.items()):
    m=tarfile.TarInfo(n);m.size=len(b);m.mode=0o600;t.addfile(m,io.BytesIO(b))
  with tarfile.open(archive,'r:gz')as t:assert {m.name:H(t.extractfile(m).read())for m in t.getmembers()}==protected
  result={'status':'PASS_FTPS_READONLY_CHECKPOINT_AND_PAYLOAD_VALIDATION','atUtc':now(),'rootListing':root,'protected':protected,'backupSha256':H(archive.read_bytes()),'backupFiles':len(backup),'backupBytes':sum(map(len,backup.values())),'newFiles':{n:H(b)for n,b in files.items()},'absentOptionalSourceMaps':absentMaps,'remoteWrites':0,'certificateValidation':True,'indexChange':'Only existing script/style entrypoints replaced; branding, CSP and bootstrap unchanged'}
  (dest/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k not in ['protected','rootListing','newFiles']}))
 finally:f.quit()
def publish():
 files=package();baseline=json.loads((O/'checkpoint/result.json').read_bytes());assert baseline['status']=='PASS_FTPS_READONLY_CHECKPOINT_AND_PAYLOAD_VALIDATION'
 assert {n:H(b)for n,b in files.items()}==baseline['newFiles']
 actual=O/'actual';actual.mkdir();events=[]
 def event(kind,**data):
  events.append({'atUtc':now(),'event':kind,**data});(actual/'journal.json').write_text(json.dumps(events,indent=2)+'\n')
 proof=backend_ready();(actual/'backend-readiness-before-upload.json').write_text(json.dumps(proof));f=connect();token=uuid.uuid4().hex;stage='static/.billing-release-'+token;lock='static/.billing-publication-lock'
 try:
  assert read(f,'index.html')==(O/'baseline-index.html').read_bytes()and read(f,'asset-manifest.json')==(O/'baseline-asset-manifest.json').read_bytes()
  f.mkd(lock);f.storbinary('STOR '+lock+'/owner',io.BytesIO(token.encode()));assert read(f,lock+'/owner')==token.encode();f.mkd(stage);event('EXCLUSIVE_OPERATOR_LOCK_AND_STAGE',stage=stage)
  cache={};uploaded=0;existing=0
  for n,b in sorted(files.items()):
   if not n.startswith('static/'):continue
   parent=str(PurePosixPath(n).parent);leaf=PurePosixPath(n).name
   if parent not in cache:cache[parent]=listing(f,parent)
   if leaf in cache[parent]:assert cache[parent][leaf]['type']=='file'and read(f,n)==b;existing+=1;continue
   temp=stage+'/'+str(uploaded)+'.tmp';f.storbinary('STOR '+temp,io.BytesIO(b));assert read(f,temp)==b
   current=listing(f,parent)
   if leaf in current:assert read(f,n)==b;f.delete(temp);existing+=1;continue
   event('IMMUTABLE_INSTALL_INTENT',path=n,sha256=H(b));f.rename(temp,n);assert read(f,n)==b;uploaded+=1
  event('STATIC_CHUNKS_VERIFIED',uploaded=uploaded,existing=existing)
  proof=backend_ready();(actual/'backend-readiness-before-publish.json').write_text(json.dumps(proof))
  current=listing(f);assert set(current)==set(baseline['rootListing']),'ROOT_MEMBERSHIP_CHANGED'
  # Protect existing configuration/branding and both entrypoints before writing.
  for n,facts in baseline['rootListing'].items():
   if facts.get('type')=='file':assert H(read(f,n))==baseline['protected'][n],'PROTECTED_ROOT_CHANGED'
  assert read(f,lock+'/owner')==token.encode()
  for n in ['asset-manifest.json','index.html']:
   temp=stage+'/'+n;f.storbinary('STOR '+temp,io.BytesIO(files[n]));assert read(f,temp)==files[n]
   assert H(read(f,n))==baseline['protected'][n],'ENTRYPOINT_CAS_CHANGED'
   event('ENTRYPOINT_RENAME_INTENT',path=n,expected=baseline['protected'][n],new=H(files[n]));f.rename(temp,n);assert read(f,n)==files[n];event('ENTRYPOINT_VERIFIED',path=n)
  for n,facts in baseline['rootListing'].items():
   if facts.get('type')=='file':assert H(read(f,n))==(H(files[n])if n in ['index.html','asset-manifest.json']else baseline['protected'][n])
  assert set(listing(f))==set(baseline['rootListing'])
  # Old assets remain; only exact owned marker and empty temporary directories removed.
  assert not listing(f,stage)and read(f,lock+'/owner')==token.encode();f.rmd(stage);f.delete(lock+'/owner');f.rmd(lock)
  event('FTP_PUBLICATION_VERIFIED',oldChunksDeleted=0,unrelatedRootWrites=0)
 finally:f.quit()
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()));checks=[]
 for n in ['index.html','asset-manifest.json',*json.loads(files['asset-manifest.json'])['entrypoints']]:
  url='https://client.melamedlaw.co.il/'+(''if n=='index.html'else n)
  req=urllib.request.Request(url,headers={'User-Agent':'MelaMedia-Release-Verification/1.0','Accept-Encoding':'identity','Cache-Control':'no-cache'})
  with opener.open(req,timeout=30)as r:b=r.read(20000001);assert r.status==200 and r.geturl()==url and b==files[n]
  checks.append({'path':n,'httpStatus':200,'sha256':H(b)})
 result={'status':'PASS_PRODUCTION_FRONTEND_VERIFIED','target':'MelamedLaw','sourceCommit':proof['source'],'finishedAtUtc':now(),'transport':'FTPS TLS with CA/hostname validation','httpsReadbacks':checks,'oldChunksDeleted':0,'rootEntrypointsReplaced':2,'unrelatedRootUploads':0,'dataWrites':0,'providerCalls':0,'checkpointSha256':baseline['backupSha256']}
 (actual/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','publish']);a=p.parse_args();prepare()if a.mode=='prepare'else publish()
