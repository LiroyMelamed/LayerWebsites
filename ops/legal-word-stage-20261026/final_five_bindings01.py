"""Local-only binding assembler. Actual MorLevi activation is mandatory to seal."""
from pathlib import Path
import argparse,datetime,hashlib,json,re
ROOT=Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OPS=ROOT/'outputs/word-stage-candidate-20261026/ops'
SCRIPTS=['final-five-inventory01.cjs','final_five_bindings01.py','run-final-five-inventory01.py']
SHA=lambda b:hashlib.sha256(b).hexdigest()
EXPECTED={
 'ashrafessa':{'candidate':'596aa5b7eb9b40f8cd5f6927132955ff6caf2175','branch':'AshrafEssa','id':3,'name':'ashrafessa-api','policy':{'present':True,'type':'number','value':5000}},
 'melamedlaw':{'candidate':'0631caf7b1c829673887e12c1d2e3ffc36c1715b','branch':'MelamedLaw','id':1,'name':'melamed-backend','policy':{'present':False,'type':'undefined','value':None}},
 'morlevy':{'candidate':'a50afb3fccaaee17633328ef62b5695336d73090','branch':'MorLevi','id':4,'name':'morlevy-api','policy':{'present':True,'type':'number','value':10000}}}
ACTUAL={
 'ashrafessa':('ashrafessa-sealed-release-contract01.json','ashrafessa-activate-20261026T130556942619Z.json'),
 'melamedlaw':('melamedlaw-sealed-release-contract02.json','melamedlaw-activate-20261026T134121793270Z.json')}
HASH_KEYS=['envSha256','nestedCanonicalSha256','effectiveCanonicalSha256','selectedRootCanonicalSha256','controlSignatureSha256']
def require(ok,code):
 if not ok:raise ValueError(code)
def read(path):
 p=Path(path).resolve();require(p.is_relative_to(ROOT/'outputs'),'EVIDENCE_MUST_BE_PROTECTED_LOCAL_OUTPUT');b=p.read_bytes();require(0<len(b)<=4*1024*1024,'EVIDENCE_SIZE_BOUND');return p,b,json.loads(b)
def ref(path):
 p,b,_=read(path);return{'path':str(p),'sha256':SHA(b)}
def load_client(name,contract_path,activation_path):
 e=EXPECTED[name];cp,cb,c=read(contract_path);ap,ab,a=read(activation_path);o=a.get('observation',{});s=o.get('state',{});process=s.get('process',{});health=o.get('healthProof',{});stable=health.get('processStability',{})
 require(c.get('status')=='SEALED_AFTER_CRITICAL_QA'and c.get('tenant')==name and c.get('candidateCommit')==e['candidate']and c.get('branch')==e['branch']and c.get('originalMinUptimePolicy')==e['policy'],'SEALED_CUSTOMER_SOURCE_OR_POLICY_CHANGED')
 require(a.get('tenant')==name and a.get('phase')=='activate'and a.get('exitCode')==0 and a.get('candidateCommit')==e['candidate']and a.get('sourceCommit')==e['candidate']and a.get('contractSha256')==SHA(cb),'ACTUAL_ACTIVATION_BINDING_REQUIRED')
 require(o.get('result')=='PASS_NAMED_BRANCH_WORD_STAGE_CODE_ACTIVE_PROVIDERS_OFF'and o.get('sourceCommit')==e['candidate']and s.get('branch')==e['branch'],'SUCCESSFUL_ACTUAL_ACTIVATION_REQUIRED')
 require(health.get('ready')is True and stable.get('samePidAndUptimeAcrossSnapshots')is True and health.get('originalMinUptimePolicy')==e['policy'],'ACTUAL_HEALTH_AND_EXACT_POLICY_REQUIRED')
 require(process.get('id')==e['id']and process.get('name')==e['name']and process.get('status')=='online'and type(process.get('pid'))is int and process['pid']>0 and process['pid']==stable.get('pid')and type(stable.get('uptimeStartedAtMs'))is int and stable['uptimeStartedAtMs']>0,'ACTUAL_PID_START_REQUIRED')
 require(all(re.fullmatch('[a-f0-9]{64}',s.get(k,''))for k in HASH_KEYS)and o.get('configuredEnvSha256')==s['envSha256'],'ACTUAL_ENVIRONMENT_HASH_BINDING_REQUIRED')
 require(len(c.get('candidateBackendHashes',{}))>500 and len(c.get('reviewedDependencyFiles',{}))==190,'FULL_SOURCE_AND_190_PHYSICAL_DEPENDENCIES_REQUIRED')
 return{'candidateCommit':e['candidate'],'branch':e['branch'],'originalMinUptimePolicy':e['policy'],'candidateBackendHashes':c['candidateBackendHashes'],'reviewedDependencyFiles':c['reviewedDependencyFiles'],
        'sealedContract':{'path':str(cp),'sha256':SHA(cb)},'activationReceipt':{'path':str(ap),'sha256':SHA(ab)},
        'expectedActivation':{'pid':process['pid'],'start':stable['uptimeStartedAtMs'],'restarts':process.get('restartCount'),**{k:s[k]for k in HASH_KEYS}}}
def common():
 p=ROOT/'outputs/word-stage-candidate-20261026/qa/word-concurrency-linux01.json';_,b,d=read(p);rows=d['observation']['before']['processes']
 require(d['result']=='PASS_AFFECTED_LINUX_CAP1_REAL_CONVERSION_BRIDGE'and d['observation']['sourceEnvProcessesStable']is True,'QUALIFIED_KNOWN_OTHER_PROCESS_BASELINE_REQUIRED')
 return{'schemaVersion':1,'scope':'FINAL_FIVE_LEGAL_API_READONLY_INVENTORY','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'baselineReceipt':{'path':str(p),'sha256':SHA(b)},'expectedAllProcessIds':sorted(r['id']for r in rows),
        'unchangedNonCustomerProcesses':[r for r in rows if r['id']not in[1,3,4]],
        'expectedSources':{**{k:v['candidate']for k,v in EXPECTED.items()},'melamediaQA':'1161fd687db381833552db78a70723573792ab97','lawyerShared':'ce3cb6a9058a2a3ec2dc1495796079cde90f6f51'},
        'scriptHashes':{n:SHA((OPS/n).read_bytes())for n in SCRIPTS},
        'noOldPerClientOtherPidReplay':True,'noRemoteMutationSqlOrProviderAction':True}
def draft():
 b=common();b['status']='DRAFT_AWAITING_MORLEVY_ACTUAL_ACTIVATION';b['clients']={k:load_client(k,OPS/v[0],OPS/v[1])for k,v in ACTUAL.items()};b['clients']['morlevy']={'candidateCommit':EXPECTED['morlevy']['candidate'],'branch':EXPECTED['morlevy']['branch'],'originalMinUptimePolicy':EXPECTED['morlevy']['policy'],'sealedContract':None,'activationReceipt':None,'expectedActivation':None};b['executionAllowed']=False;return b
def seal(mor_contract,mor_activation):
 b=common();b['status']='SEALED_FROM_THREE_ACTUAL_ACTIVATIONS';b['clients']={k:load_client(k,OPS/v[0],OPS/v[1])for k,v in ACTUAL.items()};b['clients']['morlevy']=load_client('morlevy',mor_contract,mor_activation);b['executionAllowed']=True;return b
def validate_sealed(b):
 require(b.get('status')=='SEALED_FROM_THREE_ACTUAL_ACTIVATIONS'and b.get('executionAllowed')is True,'MORLEVY_ACTUAL_ACTIVATION_PLACEHOLDER_UNFILLED')
 base=common()
 for key in ['schemaVersion','scope','baselineReceipt','expectedAllProcessIds','unchangedNonCustomerProcesses','expectedSources','scriptHashes','noOldPerClientOtherPidReplay','noRemoteMutationSqlOrProviderAction']:require(b.get(key)==base[key],'FINAL_BINDING_OR_REVIEWED_SCRIPT_CHANGED')
 require(set(b.get('clients',{}))==set(EXPECTED),'FINAL_CUSTOMER_SET_CHANGED')
 for name,c in b['clients'].items():
  require(isinstance(c.get('sealedContract'),dict)and isinstance(c.get('activationReceipt'),dict),'ACTUAL_ACTIVATION_REFERENCE_REQUIRED')
  actual=load_client(name,c['sealedContract']['path'],c['activationReceipt']['path']);require(c==actual,'ACTUAL_ACTIVATION_RECEIPT_BYTES_CHANGED')
 return b
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--draft',action='store_true');p.add_argument('--morlevy-contract');p.add_argument('--morlevy-activation');p.add_argument('--output',required=True);a=p.parse_args()
 require(a.draft or a.morlevy_contract and a.morlevy_activation,'BOTH_ACTUAL_MORLEVY_RECEIPTS_REQUIRED')
 b=draft()if a.draft else seal(a.morlevy_contract,a.morlevy_activation);out=Path(a.output).resolve();require(out.parent==OPS and not out.exists(),'NEW_OPS_OUTPUT_ONLY');out.write_text(json.dumps(b,indent=2)+'\n');print(json.dumps({'result':'LOCAL_BINDING_ASSEMBLY_ONLY_NO_SSH','status':b['status'],'path':str(out),'sha256':SHA(out.read_bytes()),'executionAllowed':b['executionAllowed']}))
if __name__=='__main__':main()
