#!/usr/bin/env python3
"""Idm-only preparation/retirement. Default is a local plan; remote phases require exact review."""
import argparse,base64,datetime,hashlib,json,os,pathlib,subprocess
R=pathlib.Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2');O=R/'outputs/idm-retirement-20261025/backend';H=lambda b:hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--contract',required=True);p.add_argument('--contract-sha',required=True);p.add_argument('--phase',choices=['quiesce','backup','delete'],required=True);p.add_argument('--deregistration-proof');p.add_argument('--offsite-proof');p.add_argument('--offsite-proof-sha');p.add_argument('--active-roots-proof');p.add_argument('--active-roots-proof-sha');p.add_argument('--execute-reviewed',action='store_true');a=p.parse_args();raw=pathlib.Path(a.contract).read_bytes();assert H(raw)==a.contract_sha,'CONTRACT_HASH_CHANGED';c=json.loads(raw);remote=(O/'retire05.remote.py').read_bytes();assert H(remote)==c['remoteOperatorSha256']and H(pathlib.Path(__file__).read_bytes())==c['operatorSha256'],'OPERATOR_BYTES_CHANGED';d=json.loads(pathlib.Path(a.deregistration_proof).read_text())if a.deregistration_proof else None;off=json.loads(pathlib.Path(a.offsite_proof).read_text())if a.offsite_proof else None;cons=json.loads(pathlib.Path(a.active_roots_proof).read_text())if a.active_roots_proof else None
 if d is not None:d=d.get('observation',d)
 if not a.execute_reviewed:print(json.dumps({'result':'LOCAL_IDM_RETIREMENT_PLAN_ONLY','phase':a.phase,'executionReady':c['executionReady'],'noRemoteOperation':True,'deregistrationProofProvided':d is not None,'actualOffsiteRestoreProofProvided':off is not None}));return
 assert a.deregistration_proof and H(pathlib.Path(a.deregistration_proof).read_bytes())==c['approvedDeregistrationFileSha256'],'EXACT_ACTUAL_DEREGISTRATION_RECEIPT_REQUIRED'
 if a.phase=='delete':
  assert a.active_roots_proof and a.active_roots_proof_sha and H(pathlib.Path(a.active_roots_proof).read_bytes())==a.active_roots_proof_sha,'REVIEWED_ACTIVE_ROOT_CLOSURE_REQUIRED'
  assert a.offsite_proof and a.offsite_proof_sha and H(pathlib.Path(a.offsite_proof).read_bytes())==a.offsite_proof_sha,'EXACT_ROOT_REVIEWED_OFFSITE_RECEIPT_REQUIRED'
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:(R/n).read_text()
 os.umask(0o077);private=pathlib.Path(c['localPrivateRoot']);private.mkdir(parents=True,exist_ok=True,mode=0o700);at=datetime.datetime.now(datetime.timezone.utc).isoformat();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');name=a.phase+'-'+stamp;out=private/(name+'.stdout');err=private/(name+'.stderr');payload=("import base64,json\nC=json.loads(base64.b64decode("+repr(base64.b64encode(raw).decode())+"));CONTRACT_SHA="+repr(a.contract_sha)+";DEREG="+repr(d)+";OFFSITE="+repr(off)+";CONSUMERS="+repr(cons)+"\n").encode()+remote+("\nr=main(C,"+repr(a.phase)+",DEREG,OFFSITE,CONSUMERS)\nprint(json.dumps(r))\nraise SystemExit(0 if r['result'].startswith('PASS_') else 1)\n").encode()
 with out.open('xb')as stdout,err.open('xb')as stderr:
  try:x=subprocess.run(['ssh','-i',str(pathlib.Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@37.60.230.148','python3 -'],input=payload,stdout=stdout,stderr=stderr,timeout=600);code=x.returncode
  except subprocess.TimeoutExpired:code=124
 try:observation=json.loads(out.read_bytes())
 except Exception:observation={'result':'IDM_PHASE_UNAVAILABLE','noBlindRetry':True,'partialMutationUnknown':True}
 v={'at':at,'phase':a.phase,'contractSha256':a.contract_sha,'exitCode':code,'stdoutSha256':H(out.read_bytes()),'stderrBytes':err.stat().st_size,'stderrSha256':H(err.read_bytes()),'observation':observation};dest=O/(name+'.json');dest.write_text(json.dumps(v,indent=2)+'\n');entry=f"\n- {at} Root-reviewed Idm-only lifecycle05 phase{a.phase} exit{code}; evidence outputs/idm-retirement-20261025/backend/{dest.name} SHA{H(dest.read_bytes())}, contractSHA{a.contract_sha}. Exclusiveglobalmaintenance+Idmmutex; finaldumpafterIdm410+id6stop+actualderegPASS; DROP/rootdeletegatedbyfullencryptedindependentMacarchive+PGownersACLrestoreproof. Sharedroles/R2/history/otherprocessesprotected; no providerjobs/SMTP/watch/nativeproducer invocation. Failuresretained/no blindretry; partialstateexplicit.\n"
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:
  with (R/n).open('a')as f:f.write(entry)
 print(json.dumps({'result':observation.get('result'),'exitCode':code,'receipt':str(dest)}));raise SystemExit(code)
if __name__=='__main__':main()
