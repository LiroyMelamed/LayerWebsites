"""Local plan by default. Root executes once after all three actual activations."""
from pathlib import Path
import argparse,base64,datetime,fcntl,hashlib,importlib.util,json,os,re,shlex,subprocess,sys
sys.dont_write_bytecode=True
ROOT=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2');OPS=ROOT/'outputs/word-stage-candidate-20261026/ops';PRIVATE=Path('/Users/liroymelamed/.codex/private/word-stage-candidate-20261026/final-five')
LEDGERS=[ROOT/'outputs/signing-implementation-20261007/TEST-LEDGER.md',ROOT/'outputs/office-whatsapp-20261023/TEST-LEDGER.md'];H=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,code):
 if not ok:raise ValueError(code)
def sanitize(raw):
 require(0<len(raw)<=512*1024,'FINAL_RECEIPT_SIZE_BOUND');d=json.loads(raw)
 require(isinstance(d,dict)and d.get('result')in['PASS_FINAL_FIVE_LEGAL_API_SOURCE_CONFIG_HEALTH_INVENTORY','FAIL_FINAL_FIVE_READONLY_INVENTORY'],'UNEXPECTED_FINAL_RECEIPT')
 def scan(x):
  if isinstance(x,dict):
   for k,v in x.items():
    require(not re.fullmatch(r'password|token|secret|dotenvBase64|pm2Root|nested|effective|rootLaunch|fullRows',k,re.I),'UNSAFE_RECEIPT_FIELD');scan(v)
  elif isinstance(x,list):
   for v in x:scan(v)
 scan(d)
 if d['result'].startswith('PASS_'):
  require([r.get('tenant')for r in d.get('observations',[])]==['ashrafessa','melamedlaw','morlevy','melamediaQA','lawyerShared'],'FINAL_TARGET_SET_CHANGED')
  require(d.get('allNineProcessesStableDuringInventory')is True and d.get('nonCustomerProcessesMatchKnownLinuxBaseline')is True and d.get('qaAndSharedMinimumUptimePolicyAsserted')is False and d.get('oldPerClientOtherPidBaselineReplayed')is False,'FINAL_STABILITY_SCOPE_CHANGED')
 return d
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bindings',required=True);p.add_argument('--bindings-sha',required=True);p.add_argument('--execute-reviewed',action='store_true');a=p.parse_args()
 raw=Path(a.bindings).read_bytes();require(len(raw)<=4*1024*1024 and H(raw)==a.bindings_sha,'REVIEWED_BINDINGS_BYTES_CHANGED');b=json.loads(raw);code=(OPS/'final-five-inventory01.cjs').read_bytes();actual={n:H((OPS/n).read_bytes())for n in ['final-five-inventory01.cjs','final_five_bindings01.py','run-final-five-inventory01.py']};require(b.get('scriptHashes')==actual,'REVIEWED_FINAL_SCRIPT_BYTES_CHANGED')
 if not a.execute_reviewed:
  missing=[name for name in ['ashrafessa','melamedlaw','morlevy']if not b.get('clients',{}).get(name,{}).get('expectedActivation')]
  print(json.dumps({'result':'LOCAL_READONLY_FINAL_FIVE_PLAN_ONLY_NO_SSH','status':b.get('status'),'missingActualActivationBindings':missing,'executionAllowed':b.get('executionAllowed')is True and not missing,'scriptHashes':actual,'bindingsSha256':H(raw),'expectedSources':b.get('expectedSources'),'noRemoteExecution':True}));return
 require(b.get('status')=='SEALED_FROM_THREE_ACTUAL_ACTIVATIONS'and b.get('executionAllowed')is True,'MORLEVY_ACTUAL_ACTIVATION_PLACEHOLDER_UNFILLED')
 spec=importlib.util.spec_from_file_location('reviewed_final_five_bindings',OPS/'final_five_bindings01.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.validate_sealed(b)
 reads={str(ledger):H(ledger.read_bytes())for ledger in LEDGERS};prefix=("const FINAL_FIVE_BINDINGS=JSON.parse(Buffer.from('"+base64.b64encode(json.dumps(b,separators=(',',':')).encode()).decode()+"','base64'));\n").encode();payload=prefix+code
 require(len(payload)<=4*1024*1024,'FINAL_REMOTE_PAYLOAD_BOUND');argv=['flock','--shared','--nonblock','/run/lock/melamedia-release-maintenance.lock','timeout','--signal=TERM','--kill-after=5s','210s','node']
 command=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','StrictHostKeyChecking=yes','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','root@37.60.230.148',' '.join(shlex.quote(x)for x in argv)]
 os.umask(0o077);PRIVATE.mkdir(parents=True,exist_ok=True);os.chmod(PRIVATE,0o700);at=datetime.datetime.now(datetime.timezone.utc).isoformat();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');name='final-five-inventory-'+stamp;out=PRIVATE/(name+'.stdout');err=PRIVATE/(name+'.stderr')
 with out.open('xb')as stdout,err.open('xb')as stderr:
  os.chmod(out,0o600);os.chmod(err,0o600)
  try:exitcode=subprocess.run(command,input=payload,stdout=stdout,stderr=stderr,timeout=240).returncode
  except subprocess.TimeoutExpired:exitcode=124
  except OSError as exc:stderr.write(('LOCAL_TRANSPORT_ERROR:'+type(exc).__name__).encode());exitcode=125
 response=out.read_bytes()
 try:observation=sanitize(response)
 except Exception:observation={'result':'FAIL_FINAL_FIVE_RECEIPT_UNAVAILABLE','detailsPrivate':True,'noAutomaticRetry':True}
 if exitcode==0 and not observation['result'].startswith('PASS_'):exitcode=126
 receipt={'schemaVersion':1,'at':at,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'FINAL_FIVE_LEGAL_API_READONLY_SOURCE_CONFIG_DEPENDENCY_STABLE_HEALTH_ONLY','exitCode':exitcode,'bindingsSha256':H(raw),'scriptHashes':actual,'payloadSha256':H(payload),'ledgerReadHashes':reads,'stdoutSha256':H(response),'stderrBytes':err.stat().st_size,'stderrSha256':H(err.read_bytes()),'private0600TransportLogs':True,'observation':observation,'noOldPerClientOtherPidReplay':True,'noSqlCustomerRowsLogsProviderAppBootSourceEnvPm2OrRemoteCacheWrites':True,'noFullProductFrontendNativeOrProviderApprovalClaim':True,'noBlindRetry':True}
 dest=OPS/(name+'.json');dest.write_text(json.dumps(receipt,indent=2)+'\n');entry=f'\n- {at} ROOT-reviewed finalglobalfivelegalAPI readonlyinventory {observation["result"]} exit{exitcode}; evidence outputs/word-stage-candidate-20261026/ops/{dest.name} SHA{H(dest.read_bytes())}. Exact3activatedsource/branch/PID/start/env/config/minpolicy/fullbackend+physical190 percustomer, boundedloopbackJSONokhealth+globalstableprocesssnapshots; QA/sharedexpectedHEAD/online/stableidentity only/no sharedminpolicy. Sixotherprocesses comparedwhereactualLinuxbaseline schema available; old perclientC.others intentionallyNOTreplayed afterauthorizednextclientrollouts. No SQL/customer/log/provider/appboot/import exceptdotenv.parse/source/env/PM2/remote-cache writes. Private0600transportlogs; failurepreserved/noautomaticretry. Source/runtime/config/dependency/identity changes invalidate thispoint-in-time observation; no fullfeature/frontend/native/providerapproval.\n'
 for ledger in LEDGERS:
  with ledger.open('a')as handle:fcntl.flock(handle,fcntl.LOCK_EX);handle.write(entry);handle.flush();fcntl.flock(handle,fcntl.LOCK_UN)
 print(json.dumps({'result':observation['result'],'exitCode':exitcode,'receipt':str(dest),'sha256':H(dest.read_bytes())}));raise SystemExit(exitcode)
if __name__=='__main__':main()
