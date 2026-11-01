#!/usr/bin/env python3
"""Default local plan; preview is read-only remotely, append requires sealed preview/CAS."""
from pathlib import Path
import argparse,base64,datetime,fcntl,hashlib,json,os,shlex,subprocess
ROOT=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2');OPS=ROOT/'outputs/word-stage-candidate-20261026/ops';PRIVATE=Path('/Users/liroymelamed/.codex/private/legal-converter-retention-20261026')
LEDGERS=[ROOT/'outputs/office-whatsapp-20261023/TEST-LEDGER.md',ROOT/'outputs/signing-implementation-20261007/TEST-LEDGER.md'];H=lambda b:hashlib.sha256(b).hexdigest()
def need(ok,code):
 if not ok:raise ValueError(code)
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--mode',choices=['plan','preview','append'],default='plan');ap.add_argument('--contract');ap.add_argument('--contract-sha');ap.add_argument('--execute-reviewed',action='store_true');a=ap.parse_args()
 script=(OPS/'converter-retention01.py').read_bytes();driver=Path(__file__).read_bytes();manifest=json.loads((OPS/'CONVERTER-RETENTION-PACKET01.json').read_bytes());script_sha=H(script);driver_sha=H(driver);note_sha=manifest['noteSha256']
 if a.mode=='plan':
  need(not a.execute_reviewed,'PLAN_ONLY');print(json.dumps({'result':'LOCAL_RETENTION_PLAN_ONLY_NO_SSH','targets':manifest['targets'],'productionConsumerNote':manifest['note'],'scriptSha256':script_sha,'driverSha256':driver_sha,'requiresExistingSafeParents':True,'pinsMayBeExistingOrAbsent':True,'noMarkerWritten':True}));return
 need(a.mode=='append' or not a.execute_reviewed,'PREVIEW_CANNOT_EXECUTE_APPEND');packet={'mode':a.mode,'noteSha256':note_sha};contract_sha=None
 if a.mode=='append':
  need(a.execute_reviewed and a.contract and a.contract_sha,'REVIEWED_APPEND_CONTRACT_REQUIRED');raw=Path(a.contract).read_bytes();need(H(raw)==a.contract_sha,'CONTRACT_BYTES_CHANGED');c=json.loads(raw);contract_sha=H(raw)
  need(c.get('status')=='REVIEW_READY_APPEND_ONLY_RETENTION_PINS' and c.get('scriptSha256')==script_sha and c.get('driverSha256')==driver_sha and c.get('noteSha256')==note_sha,'REVIEWED_PACKET_CHANGED');need([r['path'] for r in c['expectedPins']]==manifest['targets'],'TARGET_SCOPE_CHANGED')
  need(len(c['privatePreimages'])==2 and [r['represents'] for r in c['privatePreimages']]==manifest['targets'],'PRIVATE_PREIMAGE_SCOPE_CHANGED')
  for row in c['privatePreimages']:
   p=Path(row['path']);need(not p.is_symlink() and p.is_file() and (p.stat().st_mode&0o777)==0o600 and H(p.read_bytes())==row['sha256'],'PRIVATE_PREIMAGE_CHANGED')
  preview=Path(c['privatePreviewRaw']['path']);need(not preview.is_symlink() and preview.is_file() and (preview.stat().st_mode&0o777)==0o600 and H(preview.read_bytes())==c['privatePreviewRaw']['sha256'],'PRIVATE_PREVIEW_CHANGED');old=json.loads(preview.read_bytes());need(old.get('result')=='READONLY_RETENTION_PIN_PREVIEW','PREVIEW_NOT_SUCCESSFUL');expected=[{k:v for k,v in r.items() if k not in ['noteAlreadyPresent','beforeBytesBase64']} for r in old['pins']];need(expected==c['expectedPins'],'PREVIEW_BINDING_CHANGED');packet.update({'status':c['status'],'expectedPins':c['expectedPins']})
 else:need(not a.contract and not a.contract_sha,'PREVIEW_HAS_NO_APPEND_CONTRACT')
 for ledger in LEDGERS:ledger.read_text()
 os.umask(0o077);PRIVATE.mkdir(parents=True,exist_ok=True);os.chmod(PRIVATE,0o700);stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');directory=PRIVATE/(a.mode+'-'+stamp);directory.mkdir(mode=0o700)
 payload=('import base64,json\nPACKET=json.loads(base64.b64decode('+repr(base64.b64encode(json.dumps(packet).encode()).decode())+'))\n').encode()+script
 remote=['flock','--shared','--nonblock','/run/lock/melamedia-release-maintenance.lock','flock','--exclusive','--nonblock','/run/lock/melamedia-converter-retention.lock','timeout','--signal=TERM','--kill-after=5s','30s','python3','-']
 command=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','root@37.60.230.148',' '.join(shlex.quote(x) for x in remote)]
 stdout=directory/'stdout.private.json';stderr=directory/'stderr.private.log';at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with stdout.open('xb') as out,stderr.open('xb') as err:
  os.chmod(stdout,0o600);os.chmod(stderr,0o600)
  try:code=subprocess.run(command,input=payload,stdout=out,stderr=err,timeout=50).returncode
  except subprocess.TimeoutExpired:code=124
  except OSError as e:err.write(('TRANSPORT_'+type(e).__name__).encode());code=125
 raw=stdout.read_bytes()
 try:
  need(len(raw)<=300000,'RECEIPT_TOO_LARGE');observed=json.loads(raw);need(isinstance(observed,dict),'INVALID_RECEIPT')
 except Exception:observed={'result':'RETENTION_RECEIPT_UNAVAILABLE','partialMutationPossible':a.mode=='append','noBlindRetry':True};code=code or 126
 prepared=None
 if code==0 and a.mode=='preview':
  try:
   need(observed.get('result')=='READONLY_RETENTION_PIN_PREVIEW' and observed.get('noteSha256')==note_sha and [r['path'] for r in observed['pins']]==manifest['targets'],'PREVIEW_RESPONSE_SCOPE_CHANGED');preimages=[]
   for i,row in enumerate(observed['pins']):
    dest=directory/('before-pin'+str(i)+('.bytes' if row['exists'] else '.absence.json'));data=base64.b64decode(row['beforeBytesBase64'],validate=True) if row['exists'] else json.dumps({'path':row['path'],'exists':False,'parent':row['parent']},sort_keys=True).encode()
    if row['exists']:need(H(data)==row['sha256'] and len(data)==row['bytes'],'PREIMAGE_BYTES_CHANGED')
    with dest.open('xb') as h:h.write(data)
    os.chmod(dest,0o600);preimages.append({'path':str(dest),'sha256':H(data),'represents':row['path'],'absence':not row['exists']})
   expected=[{k:v for k,v in r.items() if k not in ['noteAlreadyPresent','beforeBytesBase64']} for r in observed['pins']]
   prepared=directory/'review-ready-append-contract.json';doc={'status':'REVIEW_READY_APPEND_ONLY_RETENTION_PINS','scriptSha256':script_sha,'driverSha256':driver_sha,'noteSha256':note_sha,'expectedPins':expected,'privatePreimages':preimages,'privatePreviewRaw':{'path':str(stdout),'sha256':H(raw)},'noExecutionApprovedByPreparation':True}
   with prepared.open('x') as h:h.write(json.dumps(doc,indent=2)+'\n')
   os.chmod(prepared,0o600)
  except Exception as e:
   code=127;prepared=None;observed={'result':'LOCAL_PREVIEW_VALIDATION_STOPPED','code':str(e) if isinstance(e,ValueError) else type(e).__name__,'noBlindRetry':True,'noRemoteMutation':True,'privateOriginalReceiptRetained':True}
 if code==0 and a.mode=='append':
  try:
   need(observed.get('result') in ['RETENTION_NOTES_APPENDED_AND_READBACK_VERIFIED','NO_WRITE_UNIQUE_RETENTION_NOTES_ALREADY_PRESENT'] and observed.get('noteSha256')==note_sha and [r['path'] for r in observed.get('pins',[])]==manifest['targets'] and all(r.get('oldBytesPreserved') is True and r.get('notePresentExactlyOnce') is True for r in observed['pins']),'APPEND_RESPONSE_SCOPE_OR_PRESERVATION_CHANGED')
  except Exception as e:
   code=128;observed={'result':'LOCAL_APPEND_RECEIPT_VALIDATION_STOPPED','code':str(e) if isinstance(e,ValueError) else type(e).__name__,'noBlindRetry':True,'partialMutationPossible':True,'privateOriginalReceiptRetained':True}
 public={k:v for k,v in observed.items() if k!='pins'};public['pins']=[{k:v for k,v in r.items() if k!='beforeBytesBase64'} for r in observed.get('pins',[])]
 receipt={'at':at,'mode':a.mode,'exitCode':code,'scriptSha256':script_sha,'driverSha256':driver_sha,'contractSha256':contract_sha,'stdoutSha256':H(raw),'stderrSha256':H(stderr.read_bytes()),'private0600PreimagesAndTransportLogs':True,'observation':public,'preparedContractPath':str(prepared) if prepared else None,'preparedContractSha256':H(prepared.read_bytes()) if prepared else None,'noAutomaticRetry':True}
 dest=OPS/('converter-retention-'+a.mode+'-'+stamp+'.json');dest.write_text(json.dumps(receipt,indent=2)+'\n')
 entry='\n- '+at+' Converter retention metadata '+a.mode+' exit'+str(code)+' result'+str(public.get('result'))+'; evidence '+str(dest.relative_to(ROOT))+' SHA256 '+H(dest.read_bytes())+' scriptSHA256 '+script_sha+'. Only two exact retention pins under existing safe parents; original bytes/absence preserved privately, existing metadata retained, absent pin O_EXCL, no env/install/rootfs/jobs/service/cleanup change. No automatic retry; partial states retained. Not a product test or converter/runtime requalification.\n'
 for ledger in LEDGERS:
  with ledger.open('a') as h:fcntl.flock(h,fcntl.LOCK_EX);h.write(entry);h.flush();fcntl.flock(h,fcntl.LOCK_UN)
 print(json.dumps({'result':public.get('result'),'exitCode':code,'receipt':str(dest),'receiptSha256':H(dest.read_bytes()),'preparedContractPath':str(prepared) if prepared else None,'preparedContractSha256':H(prepared.read_bytes()) if prepared else None}));raise SystemExit(code)
if __name__=='__main__':main()
