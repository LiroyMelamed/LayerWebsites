#!/usr/bin/env python3
"""One exact reviewed production backend OFF phase; never a batch rollout or enable action."""
import argparse,base64,datetime,hashlib,json,os,shlex,subprocess
from pathlib import Path
ROOT=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OPS=ROOT/'outputs/legal-system-messages-20261025/ops-prod-off'
PRIVATE=Path('/Users/liroymelamed/.codex/private/legal-system-messages-20261025/ops-prod-off')
H=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,code):
 if not ok:raise ValueError(code)
def main():
 p=argparse.ArgumentParser();p.add_argument('--contract',required=True);p.add_argument('--contract-sha',required=True);p.add_argument('--phase',choices=['checkpoint','activate','verify','rollback'],required=True);p.add_argument('--execute-reviewed',action='store_true');a=p.parse_args()
 raw=Path(a.contract).read_bytes();require(H(raw)==a.contract_sha,'REVIEWED_CONTRACT_BYTES_CHANGED');c=json.loads(raw);script=OPS/'backend-off03.cjs';code=script.read_bytes()
 require(c['schemaVersion']==1 and c['scope']=='PRODUCTION_LEGAL_PRODUCER_OFF_ONE_TENANT' and c['tenant'] in ['melamedlaw','morlevy'] and c['environmentWrites'] is False and c['migrationsToApply']==[] and c['dependencyInstall'] is False,'WRONG_SCOPE')
 require(H(code)==c['scriptHashes']['backend-off03.cjs'] and H(Path(__file__).read_bytes())==c['scriptHashes']['run-backend-off03.py'],'REVIEWED_EXECUTOR_BYTES_CHANGED');c['phase']=a.phase
 if not a.execute_reviewed:
  print(json.dumps({'result':'LOCAL_PRODUCTION_OFF_PLAN_ONLY_NO_SSH','tenant':c['tenant'],'phase':a.phase,'candidateCommit':c['candidateCommit'],'rollbackCommit':c['rollbackCommit'],'branch':c['branch'],'contractSha256':a.contract_sha}));return
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:(ROOT/n).read_text()
 os.umask(0o077);PRIVATE.mkdir(parents=True,exist_ok=True);os.chmod(PRIVATE,0o700)
 at=datetime.datetime.now(datetime.timezone.utc).isoformat();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');name=c['tenant']+'-'+a.phase+'-'+stamp
 encoded=base64.b64encode(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode()).decode();payload=("const REVIEWED_CONTRACT=JSON.parse(Buffer.from('"+encoded+"','base64'));const REVIEWED_CONTRACT_SHA='"+a.contract_sha+"';\n").encode()+code
 argv=['flock','--shared','--nonblock','/run/lock/melamedia-release-maintenance.lock','flock','--exclusive','--nonblock','/run/lock/melamedia-legal-'+c['tenant']+'-release.lock','node'];cmd=['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@37.60.230.148',' '.join(shlex.quote(x)for x in argv)]
 out=PRIVATE/(name+'.stdout');err=PRIVATE/(name+'.stderr')
 with out.open('xb')as stdout,err.open('xb')as stderr:
  try:x=subprocess.run(cmd,input=payload,stdout=stdout,stderr=stderr,timeout=240);exitcode=x.returncode
  except subprocess.TimeoutExpired:exitcode=124
 try:observed=json.loads(out.read_bytes());require(isinstance(observed,dict) and isinstance(observed.get('result'),str),'INVALID_REMOTE_RESULT')
 except Exception:observed={'result':'PRODUCTION_OFF_RESULT_UNAVAILABLE','doNotBlindlyRetry':True}
 receipt={'at':at,'tenant':c['tenant'],'phase':a.phase,'candidateCommit':c['candidateCommit'],'sourceCommit':observed.get('sourceCommit'),'branch':c['branch'],'contractSha256':a.contract_sha,'scriptSha256':H(code),'exitCode':exitcode,'stdoutSha256':H(out.read_bytes()),'stderrBytes':err.stat().st_size,'stderrSha256':H(err.read_bytes()),'private0600TransportLogs':True,'observation':observed,'captureDispatchEnableApproved':False,'frontendPublicationNotPerformedByThisScript':True};dest=OPS/(name+'.json');dest.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 entry=f"\n- {at} Legal producer ROOT-reviewed production OFF backend {c['tenant']}/{a.phase} exit{exitcode}, candidate{c['candidateCommit']}, contractSHA{a.contract_sha}. Evidence outputs/legal-system-messages-20261025/ops-prod-off/{dest.name} SHA{H(dest.read_bytes())}. Exactnamedbranch+source/launch/env/officeCAS+ownprocess only; ordinaryguardedforwardmerge/candidateorprecomputedbase-tree rollbackchild, no detach/reset/clean/unknowncommit. Privateonsite0600 preimages/fullDBdump/pins; noenvwrites/newmigrations/deps/producerenable/provider-testmessages authorized. Failure retained/noblindretry; actualsource/config/process/statechangesinvalidateproof.\n"
 for n in ['outputs/office-whatsapp-20261023/TEST-LEDGER.md','outputs/signing-implementation-20261007/TEST-LEDGER.md']:
  with (ROOT/n).open('a')as f:f.write(entry)
 print(json.dumps({'result':observed.get('result'),'exitCode':exitcode,'receipt':str(dest)}));raise SystemExit(exitcode)
if __name__=='__main__':main()
