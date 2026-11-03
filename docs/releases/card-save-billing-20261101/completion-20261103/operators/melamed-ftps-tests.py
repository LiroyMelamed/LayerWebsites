import contextlib,hashlib,importlib.util,io,json,tempfile
from pathlib import Path
D=Path(__file__).resolve().parent;p=D/'melamed-frontend.py';spec=importlib.util.spec_from_file_location('ftp_operator',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
H=lambda b:hashlib.sha256(b).hexdigest();results=[]
class FakeFTP:
 def __init__(self,files,fault):self.files=dict(files);self.dirs={'static','static/js'};self.fault=fault;self.renames=[];self.writes=[]
 def mlsd(self,path=''):
  prefix=path+'/'if path else'';out=[]
  for n,b in self.files.items():
   if n.startswith(prefix)and'/'not in n[len(prefix):]:out.append((n[len(prefix):],{'type':'file','size':str(len(b))}))
  for n in self.dirs:
   if n.startswith(prefix)and'/'not in n[len(prefix):]:out.append((n[len(prefix):],{'type':'dir'}))
  return out
 def retrbinary(self,cmd,add):add(self.files[cmd.removeprefix('RETR ')])
 def mkd(self,n):assert n not in self.dirs;self.dirs.add(n);self.writes.append(('mkdir',n))
 def storbinary(self,cmd,source):
  if self.fault=='upload-fails'and cmd.endswith('.tmp'):raise OSError('SIMULATED_UPLOAD_FAILURE')
  n=cmd.removeprefix('STOR ');self.files[n]=source.read();self.writes.append(('write',n))
 def rename(self,a,b):
  if self.fault=='second-rename-fails'and b=='index.html':raise OSError('SIMULATED_SECOND_RENAME_FAILURE')
  self.files[b]=self.files.pop(a);self.renames.append(b)
 def delete(self,n):self.files.pop(n)
 def rmd(self,n):assert not list(self.mlsd(n));self.dirs.remove(n)
 def quit(self):pass
class Response:
 status=200
 def __init__(self,url,data):self.url=url;self.data=data
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def geturl(self):return self.url
 def read(self,n):return self.data[:n]
for fault in ['success','stale-index','collision','upload-fails','concurrent-config','concurrent-root','second-rename-fails','https-mismatch']:
 with tempfile.TemporaryDirectory(prefix='billing-ftps-operator-test-')as tmp:
  o=Path(tmp);(o/'checkpoint').mkdir();m.O=o
  old={'index.html':b'old-index','asset-manifest.json':b'old-manifest','.htaccess':b'config','brand.png':b'brand','static/js/old.js':b'old-code'}
  new={'index.html':b'new-index','asset-manifest.json':json.dumps({'entrypoints':['static/js/new.js']}).encode(),'static/js/new.js':b'new-code'}
  f=FakeFTP(old,fault);root=m.listing(f);baseline={'status':'PASS_FTPS_READONLY_CHECKPOINT_AND_PAYLOAD_VALIDATION','newFiles':{n:H(b)for n,b in new.items()},'protected':{n:H(b)for n,b in old.items()},'rootListing':root,'backupSha256':'0'*64}
  (o/'checkpoint/result.json').write_text(json.dumps(baseline));(o/'baseline-index.html').write_bytes(old['index.html']);(o/'baseline-asset-manifest.json').write_bytes(old['asset-manifest.json'])
  if fault=='stale-index':f.files['index.html']=b'some-other-version'
  if fault=='collision':f.files['static/js/new.js']=b'unexpected-other-content'
  calls=[0]
  def backend():
   calls[0]+=1
   if calls[0]==2:
    if fault=='concurrent-config':f.files['.htaccess']=b'changed-by-another-operator'
    if fault=='concurrent-root':f.files['new-root-file']=b'concurrent'
   return {'source':'candidate','atUtc':m.now(),'healthStatus':200}
  class Opener:
   def open(self,req,timeout):
    path=req.full_url.removeprefix('https://client.melamedlaw.co.il/')or'index.html'
    return Response(req.full_url,b'bad-cache'if fault=='https-mismatch'else f.files[path])
  m.package=lambda:new;m.connect=lambda:f;m.backend_ready=backend;m.urllib.request.build_opener=lambda *a:Opener()
  error=None
  try:
   with contextlib.redirect_stdout(io.StringIO()):m.publish()
  except (AssertionError,OSError)as e:error=type(e).__name__
  if fault=='success':
   assert error is None and json.loads((o/'actual/result.json').read_bytes())['status']=='PASS_PRODUCTION_FRONTEND_VERIFIED'
   assert f.renames==['static/js/new.js','asset-manifest.json','index.html']and all(f.files[n]==b for n,b in new.items())and f.files['.htaccess']==old['.htaccess']and f.files['static/js/old.js']==old['static/js/old.js']
  else:
   assert error and not(o/'actual/result.json').exists()
   if fault not in ['stale-index','https-mismatch']:assert f.files['index.html']==old['index.html']
   if fault=='stale-index':assert not f.writes
   if fault=='collision':assert f.files['static/js/new.js']==b'unexpected-other-content'
   if fault=='second-rename-fails':assert f.files['asset-manifest.json']==new['asset-manifest.json']and (o/'actual/journal.json').exists()
  results.append({'case':fault,'status':'PASS','realNetworkCalls':0})
for unsafe in ['/absolute','../escape','static/../escape','static\\escape','static/a\r\nDELE index.html','static//x']:
 assert not m.safe(unsafe);results.append({'case':'reject-path-'+str(len(results)),'status':'PASS','realNetworkCalls':0})
report={'status':'PASS_NEW_FTPS_OPERATOR_TESTS','operatorSha256':H(p.read_bytes()),'cases':results,'total':len(results),'realNetworkCalls':0,'applicationTestsRerun':0}
(D/'melamed-ftp-qualification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='cases'}))
