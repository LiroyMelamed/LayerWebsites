import datetime,hashlib,json,os,subprocess,sys
from pathlib import Path
out=Path(__file__).resolve().parent
mode=sys.argv[1];assert mode in ['preflight','apply']
root=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs')
ledgers=[root/p/'TEST-LEDGER.md' for p in ['signing-implementation-20261007','office-whatsapp-20261023']]
reads={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in ledgers}
code='MODE='+repr(mode)+'\n'+(out/'backend-update.py').read_text()
p=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','-i',str(Path.home()/'.ssh/id_ed25519'),'root@37.60.230.148','python3 -'],input=code,text=True,capture_output=True,timeout=240)
now=datetime.datetime.now(datetime.timezone.utc);dest=out/('BACKEND-'+mode+'-'+now.strftime('%H%M%S')+'.json')
r={'utc':now.isoformat(),'mode':mode,'exit':p.returncode,'source':'87e8eaa58830ee9b42772c1619e01814143dc28e','ledgersRead':reads,'scriptSha256':hashlib.sha256(code.encode()).hexdigest(),'stdout':p.stdout,'stderr':p.stderr}
dest.write_text(json.dumps(r,indent=2));dest.chmod(0o600)
for ledger in ledgers:
 with ledger.open('a') as f:f.write('\n- '+r['utc']+' Ashraf authorized update '+mode+' exit'+str(p.returncode)+' candidate87e8eaa5. Evidence '+str(dest)+' SHA256 '+hashlib.sha256(dest.read_bytes()).hexdigest()+'. Exact source and named process only; outcome recorded, no whole-product claim.\n')
print(json.dumps(r,indent=2))
