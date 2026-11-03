import argparse,hashlib,io,json,shlex,subprocess,tarfile
from pathlib import Path
D=Path(__file__).resolve().parent;H=lambda b:hashlib.sha256(b).hexdigest()
a=argparse.ArgumentParser();a.add_argument('target',choices=['AshrafEssa','MelamedLaw','MorLevi']);a.add_argument('mode',choices=['stage','inspect','execute']);args=a.parse_args()
d=D/args.target;mf=json.loads((d/'manifest.json').read_bytes());c=json.loads((d/'config.json').read_bytes());version=c.get('packageVersion','v2');root='/root/billing-release-20261103-'+args.target.lower()+'-'+version
qualification=json.loads(((d/'qualification.json')if(d/'qualification.json').exists()else(D/'qualification.json')).read_bytes());assert qualification['status']=='PASS_NEW_PRODUCTION_OPERATION_GUARDS'and qualification['operatorSha256']==c['operatorSha256']
for n,pin in mf['files'].items():assert H((d/n).read_bytes())==pin['sha256']and (d/n).stat().st_size==pin['bytes']
logs=d/('actual-'+version);logs.mkdir(exist_ok=True)
prefix=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8','melamedia-backend']
if args.mode=='stage':
 stream=io.BytesIO()
 with tarfile.open(fileobj=stream,mode='w')as t:
  for n in mf['files']:
   b=(d/n).read_bytes();m=tarfile.TarInfo(n);m.size=len(b);m.mode=0o600;t.addfile(m,io.BytesIO(b))
 payload=stream.getvalue()
 code='''import hashlib,io,json,os,stat,sys,tarfile
from pathlib import Path
assert os.geteuid()==0 and Path('/etc/machine-id').read_text().strip()=='78df8b32994442b08d315ed2021c0701'
root=Path(__ROOT__);pins=__PINS__;raw=sys.stdin.buffer.read(20000000)
assert hashlib.sha256(raw).hexdigest()==__SHA__ and not os.path.lexists(root)
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:')as t:
 members=t.getmembers();assert len(members)==len(pins)and {m.name for m in members}==set(pins)
 files={}
 for m in members:
  assert m.isfile()and not m.issym()and not m.islnk()and '/'not in m.name and m.name in pins and m.mode==0o600
  b=t.extractfile(m).read();assert len(b)==pins[m.name]['bytes']and hashlib.sha256(b).hexdigest()==pins[m.name]['sha256'];files[m.name]=b
os.umask(0o077);root.mkdir(mode=0o700)
for n,b in files.items():
 fd=os.open(root/n,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(b);f.flush();os.fsync(f.fileno())
 assert hashlib.sha256((root/n).read_bytes()).hexdigest()==pins[n]['sha256']
print(json.dumps({'status':'PASS_PRIVATE_PRODUCTION_PACKAGE_STAGED','root':str(root),'files':len(files),'serviceChanges':0,'sourceChanges':0}))
'''.replace('__ROOT__',repr(root)).replace('__PINS__',repr(mf['files'])).replace('__SHA__',repr(H(payload)))
 command=shlex.join(['/usr/bin/python3','-I','-S','-c',code]);timeout=90
else:
 if args.mode=='execute':
  inspection=json.loads((logs/'inspect.stdout.json').read_bytes());assert inspection['status']=='PASS_PRIVATE_PACKAGE_AND_LIVE_BASELINE_INSPECTION_ONLY'
  if args.target!='AshrafEssa':
   previous='AshrafEssa'if args.target=='MelamedLaw'else'MelamedLaw'
   assert json.loads((D/previous/'frontend/actual/result.json').read_bytes())['status']=='PASS_PRODUCTION_FRONTEND_VERIFIED'
  else:
   qa=json.loads((D.parent/'cycle5/frontend/actual/execution.stdout.private').read_bytes());assert qa['status']=='PASS_QA_FRONTEND_STATIC_AND_HTTPS_NORMAL_BACKEND_ALREADY_VERIFIED_BROWSER_QA_PENDING'
 command=shlex.join(['/usr/bin/python3','-I','-S',root+'/operator.py','--config',root+'/config.json','--config-sha',mf['files']['config.json']['sha256']]+(['--execute']if args.mode=='execute'else[]));payload=None;timeout=360
out=logs/(args.mode+'.stdout.json');err=logs/(args.mode+'.stderr.private.log');assert not out.exists()and not err.exists()
with out.open('xb')as stdout,err.open('xb')as stderr:
 q=subprocess.run(prefix+[command],input=payload,stdout=stdout,stderr=stderr,timeout=timeout)
print(json.dumps({'target':args.target,'mode':args.mode,'exitCode':q.returncode,'result':out.read_text()[:3000],'stderrBytes':err.stat().st_size}))
raise SystemExit(q.returncode)
