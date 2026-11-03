"""Source-bound, static-only client publication using the qualified QA engine."""
import argparse,ast,base64,datetime,hashlib,io,json,re,shlex,subprocess,tarfile
from pathlib import Path
D=Path(__file__).resolve().parent;R=D.parent;H=lambda b:hashlib.sha256(b).hexdigest();CANON=lambda d:json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
parser=argparse.ArgumentParser();parser.add_argument('target',choices=['AshrafEssa','MorLevi']);parser.add_argument('mode',choices=['observe','publish']);a=parser.parse_args()
name={'AshrafEssa':'ashrafessa','MorLevi':'morlevy'}[a.target];root='/var/www/'+name;origin='https://'+name+'.mela-media.co.il'
c=json.loads((D/a.target/'config.json').read_bytes());out=D/a.target/'frontend';out.mkdir(exist_ok=True)
old=(R/'additional-materials/frontend-dependencies/layer-billing-qa-frontend-adaptor-20261102/qa-static01.frozen.py').read_bytes();assert H(old)=='2a0d147f10579bdb755f81a989414609ead7332444ebd8e30bb9840f714523d8'
operator=old.decode().replace('/var/www/melamedia',root).replace("'melamedia'",repr(name)).replace('WORD_UX_QA_FRONTEND_ONLY','BILLING_NAMED_CLIENT_STATIC_ONLY').replace('/root/word-ux-qa-20261026-','/root/billing-static-20261103-'+name+'-')
# Only target/scope/private-checkpoint literals differ from the exercised engine.
assert ast.dump(ast.parse(operator.replace(root,'/var/www/melamedia').replace(repr(name),"'melamedia'").replace('BILLING_NAMED_CLIENT_STATIC_ONLY','WORD_UX_QA_FRONTEND_ONLY').replace('/root/billing-static-20261103-'+name+'-','/root/word-ux-qa-20261026-')),include_attributes=False)==ast.dump(ast.parse(old),include_attributes=False)
ns={'__name__':'local_static_validation'};exec(compile(operator,'client-static.py','exec'),ns)
def ssh(host,code,payload=None,timeout=60,relay=False):
 argv=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8']
 loader="import sys; n=int(sys.stdin.buffer.readline()); assert 0<n<4000000; code=sys.stdin.buffer.read(n); assert len(code)==n; exec(compile(code,'reviewed-static-publication','exec'))"
 codebytes=code.encode('utf-8'); packet=str(len(codebytes)).encode()+b'\n'+codebytes+(payload or b'')
 argv +=[host,shlex.join(['/usr/bin/python3','-I','-S','-c',loader])]
 q=subprocess.run(argv,input=packet,capture_output=True,timeout=timeout)
 if q.returncode:
  stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
  (out/(a.mode+'-failed-'+stamp+'.stdout.private')).write_bytes(q.stdout);(out/(a.mode+'-failed-'+stamp+'.stderr.private')).write_bytes(q.stderr)
  raise RuntimeError('REMOTE_OPERATION_FAILED_INSPECT_PRIVATE_LOGS_NO_RETRY')
 return q.stdout
prefix='''import base64,contextlib,datetime,fcntl,hashlib,http.client,io,json,os,pathlib,re,ssl,stat,sys,urllib.request,uuid
assert os.geteuid()==0 and pathlib.Path('/etc/machine-id').read_text().strip()=='3dc57f2763bf42e0ae75581e95867b09'
fds=[]
for name,kind in [('/run/lock/melamedia-release-maintenance.lock',fcntl.LOCK_SH),(__LOCK__,fcntl.LOCK_EX)]:
 fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW);assert stat.S_ISREG(os.fstat(fd).st_mode);fcntl.flock(fd,kind|fcntl.LOCK_NB);fds.append(fd)
code=base64.b64decode(__OPERATOR__);assert hashlib.sha256(code).hexdigest()==__OPERATOR_SHA__
ns={'__name__':'reviewed_client_static_helpers'};exec(compile(code,'client-static.py','exec'),ns)
'''.replace('__LOCK__',repr('/run/lock/'+c['tenantLock']+'.lock')).replace('__OPERATOR__',repr(base64.b64encode(operator.encode()).decode())).replace('__OPERATOR_SHA__',repr(H(operator.encode())))
if a.mode=='observe':
 config={'scope':ns['SCOPE'],'tenant':name,'rootOrHost':root,'observationNonce':'0'*32,'contractSha256':H(operator.encode()),'operatorSha256':H(operator.encode())}
 code=prefix+'\nc='+repr(config)+"\nc['observationNonce']=uuid.uuid4().hex\nns['remote_main'](c,'observe')\n"
 raw=ssh('melamedia-frontend',code);d=json.loads(raw);assert d['result']=='PASS_READ_ONLY_QA_STATIC_OBSERVATION'and d['target']==root
 with (out/'observation.json').open('xb')as f:f.write(raw)
 print(json.dumps({'target':a.target,'status':'PASS_CURRENT_FRONTEND_OBSERVATION','files':len(d['files']),'operatorByteEquivalence':'Only fixed target/scope literals changed'}));raise SystemExit

obraw=(out/'observation.json').read_bytes();obs=json.loads(obraw)
assert 0<=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(obs['at'])).total_seconds()<1800
assets=R/'additional-materials/billing-deploy-static-074df752-20261102';manifest=json.loads((assets/'manifest.json').read_bytes());local=assets/name
for filename in [name+'-static-only.tar.gz','index.proposed.html','asset-manifest.proposed.json']:
 b=(local/filename).read_bytes();pin=manifest['files'][name+'/'+filename];assert H(b)==pin['sha256']and len(b)==pin['bytes']
oldindex=base64.b64decode(obs['indexBase64']);oldmanifest=base64.b64decode(obs['manifestBase64']);newindex=(local/'index.proposed.html').read_bytes();newmanifest=(local/'asset-manifest.proposed.json').read_bytes()
oldentries=json.loads(oldmanifest)['entrypoints'];newentries=json.loads(newmanifest)['entrypoints']
def role(n):return re.sub(r'\.[0-9a-f]{8,}(?=\.(?:js|css)$)','',n)
newroles={role(n):n for n in newentries};assert len(newroles)==len(newentries)
mapping={n:newroles[role(n)]for n in oldentries};ns['check_index'](oldindex,newindex,oldmanifest,newmanifest,mapping)
files={}
with tarfile.open(local/(name+'-static-only.tar.gz'),'r:gz')as t:
 for m in t.getmembers():
  assert m.isfile()and ns['safe_path'](m.name,True)and m.name.startswith('static/')and m.name not in files
  files[m.name]=t.extractfile(m).read()
files.update({'index.html':newindex,'asset-manifest.json':newmanifest});hashes={n:H(b)for n,b in files.items()}
stream=io.BytesIO()
with tarfile.open(fileobj=stream,mode='w:gz')as t:
 for n,b in sorted(files.items()):
  m=tarfile.TarInfo(n);m.size=len(b);m.mode=0o600;t.addfile(m,io.BytesIO(b))
archive=stream.getvalue();ns['check_archive'](archive,hashes)
for n,pin in hashes.items():assert n in ['index.html','asset-manifest.json']or n not in obs['files']or obs['files'][n]==pin,'IMMUTABLE_COLLISION'

# Fresh authenticated backend identity, read-only, after successful normal return.
deploymentReceipt=D/a.target/('actual-'+c.get('packageVersion','v2'))/'execute.stdout.json'
receipt=json.loads(deploymentReceipt.read_bytes());assert receipt['status']=='PASS_NAMED_PRODUCTION_BACKEND_SOURCE_AND_HEALTH'
backend_code='''import datetime,hashlib,http.client,json,os,subprocess
from pathlib import Path
c=__CONFIG__;expected=__PROCESS__
assert Path('/etc/machine-id').read_text().strip()==c['machineId']
assert subprocess.check_output(['git','-C',c['root'],'rev-parse','HEAD'],text=True).strip()==c['candidate']
assert not subprocess.check_output(['git','-C',c['root'],'status','--porcelain','--untracked-files=no'],text=True).strip()
p=Path('/proc')/str(expected['pid']);assert int(p.joinpath('stat').read_text().rsplit(')',1)[1].split()[19])==expected['startTicks']and os.readlink(p/'cwd')==c['root']+'/backend'
env=dict(x.split(b'=',1)for x in p.joinpath('environ').read_bytes().split(b'\\0')if b'='in x);assert env.get(b'GIT_SHA',b'').decode()==c['candidate']
for name,pin in c['protectedFiles'].items():assert hashlib.sha256((Path(c['root'])/'backend'/name).read_bytes()).hexdigest()==pin
h=http.client.HTTPConnection('127.0.0.1',c['port'],timeout=5);h.request('GET','/health',headers={'Connection':'close'});r=h.getresponse();assert r.status==200 and json.loads(r.read(4097))=={'ok':True};h.close()
print(json.dumps({'status':'PASS_CURRENT_NAMED_BACKEND_FOR_STATIC_PUBLICATION','target':c['target'],'sourceCommit':c['candidate'],'process':expected,'healthStatus':200,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dataWrites':0,'providerCalls':0,'processActions':0}))
'''.replace('__CONFIG__',repr(c)).replace('__PROCESS__',repr(receipt['process']))
proofraw=ssh('melamedia-backend',backend_code,relay=True);proof=json.loads(proofraw);assert proof['status']=='PASS_CURRENT_NAMED_BACKEND_FOR_STATIC_PUBLICATION'
accepted=datetime.datetime.fromisoformat(proof['atUtc']);expires=(accepted+datetime.timedelta(seconds=300)).isoformat()
binding={'backendReadinessSha256':H(proofraw),'backendDeploymentReceiptSha256':H(deploymentReceipt.read_bytes()),'observationSha256':H(obraw),'candidate':c['candidate'],'target':a.target,'publicationSha256':H(archive)}
config={'scope':ns['SCOPE'],'tenant':name,'rootOrHost':root,'operatorSha256':H(operator.encode()),'mainCommit':'074df7520497a0cd6bd95ad70353201c905f0aa6','sourceCommit':c['candidate'],'backendChanges':False,'rootPublicUploads':0,'oldChunksDeleted':0,'protected':obs['files'],'baselineMetadata':obs['metadata'],'baselineObservedAt':datetime.datetime.fromisoformat(obs['at']).timestamp(),'files':hashes,'optionalAbsentOrUnavailable':[],'archiveBytes':len(archive),'archiveSha256':H(archive),'entrypointMap':mapping,'releaseBindingSha256':H(CANON(binding)),'backendAcceptance':{'status':'PASS','candidateCommit':c['candidate'],'acceptedAtUtc':proof['atUtc'],'validUntilUtc':expires,'receiptSha256':H(proofraw)}}
config['contractSha256']=H(CANON(config));configraw=CANON(config)+b'\n';actual=out/'actual';actual.mkdir(exist_ok=False)
for n,b in [('config.json',configraw),('backend-readiness.json',proofraw),('publication.tar.gz',archive),('operator.py',operator.encode())]:(actual/n).write_bytes(b)
code=prefix+'''
c=json.loads(base64.b64decode(__CONFIG__));assert c['contractSha256']==__CONTRACT__
raw=sys.stdin.buffer.read(c['archiveBytes']+1);assert len(raw)==c['archiveBytes']and hashlib.sha256(raw).hexdigest()==c['archiveSha256']
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(c['backendAcceptance']['acceptedAtUtc'])).total_seconds()<120
stage=pathlib.Path('/root/billing-static-packet-20261103-'+c['tenant']);os.umask(0o077);stage.mkdir(mode=0o700)
for n,b in [('operator.py',code),('config.json',json.dumps(c,sort_keys=True,indent=2).encode()),('publication.tar.gz',raw)]:
 with (stage/n).open('xb')as f:f.write(b);f.flush();os.fsync(f.fileno())
phases=[]
for phase in ['checkpoint','upload','publish','verify']:
 assert datetime.datetime.now(datetime.timezone.utc)<datetime.datetime.fromisoformat(c['backendAcceptance']['validUntilUtc'])
 sys.stdin=io.TextIOWrapper(io.BytesIO(raw if phase=='upload'else b''))
 text=io.StringIO()
 with contextlib.redirect_stdout(text):ns['remote_main'](c,phase)
 result=json.loads(text.getvalue());assert result.get('target')==c['rootOrHost']and result.get('sourceCommit')==c['sourceCommit']and result.get('oldChunksDeleted')==0
 with (stage/(phase+'.json')).open('x')as f:json.dump(result,f,sort_keys=True)
 phases.append({'phase':phase,'status':result['result']})
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
reads=[]
for filename in ['index.html','asset-manifest.json']:
 url=__ORIGIN__+('/'if filename=='index.html'else'/'+filename)
 req=urllib.request.Request(url,headers={'User-Agent':'MelaMedia-Release-Verification/1.0','Accept-Encoding':'identity','Cache-Control':'no-cache','Connection':'close'})
 with opener.open(req,timeout=10)as response:
  b=response.read(65537);assert response.status==200 and response.geturl()==url and hashlib.sha256(b).hexdigest()==c['files'][filename]
  reads.append({'url':url,'sha256':hashlib.sha256(b).hexdigest(),'httpStatus':200})
result={'status':'PASS_PRODUCTION_FRONTEND_VERIFIED','target':__TARGET__,'sourceCommit':c['sourceCommit'],'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'publicationSha256':c['archiveSha256'],'releaseBindingSha256':c['releaseBindingSha256'],'phases':phases,'httpsReadbacks':reads,'oldChunksDeleted':0,'rootPublicUploads':0,'dataWrites':0,'providerCalls':0,'privateCheckpoint':result['privateCheckpoint']}
with (stage/'result.json').open('x')as f:json.dump(result,f,sort_keys=True)
print(json.dumps(result))
'''.replace('__CONFIG__',repr(base64.b64encode(configraw).decode())).replace('__CONTRACT__',repr(config['contractSha256'])).replace('__ORIGIN__',repr(origin)).replace('__TARGET__',repr(a.target))
result=ssh('melamedia-frontend',code,archive,timeout=180);(actual/'result.json').write_bytes(result);print(result.decode())
