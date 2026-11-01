import base64,datetime,hashlib,json,os,subprocess,sys,tarfile
from pathlib import Path
out=Path(__file__).resolve().parent;mode=sys.argv[1];assert mode in ['preflight','apply']
cache=Path('/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/ashraf-word-latest-20261028')
root=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs')
ledgers=[root/p/'TEST-LEDGER.md' for p in ['signing-implementation-20261007','office-whatsapp-20261023']]
reads={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in ledgers}
files={str(p.relative_to(cache/'full')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (cache/'full/static').rglob('*') if p.is_file() and not p.name.endswith('.map')}
archive=cache/'static-publication-20261028.tar.gz'
if not archive.exists():
 with tarfile.open(archive,'w:gz') as tar:
  for path in sorted(files):tar.add(cache/'full'/path,arcname=path)
hash=hashlib.sha256(archive.read_bytes()).hexdigest()
merge=root/'legal-system-messages-20261025/customer-rollout/frontend/merge-index01.py'
assert hashlib.sha256(merge.read_bytes()).hexdigest()=='f14e06dc848c00e2780a2af1a9a6536aa04f71978d6e1b754121fe0f2d7f5fd1'
if mode=='apply':subprocess.run(['scp','-q','-i',str(Path.home()/'.ssh/id_ed25519'),str(archive),'root@84.46.253.85:/tmp/ashraf-update-static-20261028.tar.gz'],check=True,timeout=120)
code='MODE='+repr(mode)+'\nMANIFEST='+repr(base64.b64encode((cache/'full/asset-manifest.json').read_bytes()).decode())+'\nARCHIVE_SHA='+repr(hash)+'\nFILES='+repr(files)+'\n'+merge.read_text()+'\n'+(out/'frontend-update.py').read_text()
p=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','-i',str(Path.home()/'.ssh/id_ed25519'),'root@84.46.253.85','python3 -'],input=code,text=True,capture_output=True,timeout=180)
now=datetime.datetime.now(datetime.timezone.utc);dest=out/('FRONTEND-'+mode+'-'+now.strftime('%H%M%S')+'.json')
r={'utc':now.isoformat(),'mode':mode,'exit':p.returncode,'ledgersRead':reads,'scriptSha256':hashlib.sha256(code.encode()).hexdigest(),'stdout':p.stdout,'stderr':p.stderr}
dest.write_text(json.dumps(r,indent=2));dest.chmod(0o600)
for ledger in ledgers:
 with ledger.open('a') as f:f.write('\n- '+r['utc']+' Ashraf authorized frontend '+mode+' exit'+str(p.returncode)+' candidate87e8eaa5. Evidence '+str(dest)+' SHA256 '+hashlib.sha256(dest.read_bytes()).hexdigest()+'. Fresh incumbent HTML byte-preserving entrypoint merge; no old chunk deletion, exact outcome in receipt.\n')
print(json.dumps(r,indent=2))
