import ast,copy,hashlib,json,subprocess
from pathlib import Path
D=Path(__file__).resolve().parent;R=D.parent;E=R.parents[1]/'outputs/billing-resume-20261103';H=lambda b:hashlib.sha256(b).hexdigest()
operator=(R/'production-backend.py').read_bytes();tree=ast.parse(operator)
# New production guard predicates are exercised using the actual read-only aggregate
# shapes, with explicit synthetic adverse deltas. No application tests are rerun.
env={}
for name in ['need','rows','idle']:
 node=next(n for n in ast.walk(tree)if isinstance(n,ast.FunctionDef)and n.name==name)
 exec(compile(ast.Module(body=[node],type_ignores=[]),'actual-operator-guards','exec'),env)
tests=[];fin=json.loads((E/'prod-financial-granted.json').read_bytes())
for target in ['AshrafEssa','MelamedLaw','MorLevi']:
 actual=fin['targets'][target];env['idle'](actual);tests.append(target+' existing financial state accepted')
 for case in ['transaction','unresolved','due','claim']:
  d=copy.deepcopy(actual);x=d['aggregates']
  if case=='transaction':x['roleSessions'][0]['activeTransactions']=1
  if case=='unresolved':x['paymentIntents']=[{'status':'pending'}]
  if case=='due':x['billingCandidates'][0]['activeDueCandidates']=1
  if case=='claim':x['signingJobs']=[{'liveLeases':1,'staleRunning':0,'duePendingOrRetry':0}]
  try:env['idle'](d)
  except RuntimeError:tests.append(target+' rejects '+case)
  else:raise AssertionError(case)
 d=copy.deepcopy(actual);d['aggregates']['billingMarkers'][0]['selectedFieldFingerprint']='synthetic-change'
 assert env['rows'](d)!=env['rows'](actual);tests.append(target+' detects billing field drift')
 d=D/target;c=json.loads((d/'config.json').read_bytes());c['backupProject']={'AshrafEssa':'ashrafessa-recovery','MelamedLaw':'melamedlaw-recovery','MorLevi':'morlevi-recovery'}[target]
 (d/'operator.py').write_bytes(operator);c['operatorSha256']=H(operator);(d/'config.json').write_text(json.dumps(c,sort_keys=True,indent=2)+'\n')
 pins={p.name:{'sha256':H(p.read_bytes()),'bytes':p.stat().st_size}for p in d.iterdir()if p.name!='manifest.json'}
 (d/'manifest.json').write_text(json.dumps({'target':target,'files':pins},sort_keys=True,indent=2)+'\n')
for n in ['AshrafEssa','MelamedLaw','MorLevi']:
 ast.parse((D/n/'snapshot.py').read_bytes());ast.parse((D/n/'operator.py').read_bytes())
 # Execute the full guarded JS in a VM with fake OS/PM2 objects. Only named calls
 # to the fixture are possible; no real package, socket, filesystem or process API.
js=r'''
const vm=require('node:vm'),fs=require('node:fs');
const path=process.argv[2],config=JSON.parse(fs.readFileSync(path+'/config.json'));
const source=fs.readFileSync(path+'/pm2.cjs','utf8');let count=0;
function run(action,mutate){
 let calls=[],output='';let e={pm_id:config.pm2Id,name:config.pm2Name,pm_cwd:config.root+'/backend',pm_exec_path:config.root+'/backend/server.js',exec_mode:'fork_mode',watch:false,status:action==='restart-current'?'stopped':'online',exit_code:0};let row={pid:action==='restart-current'?0:config.pid,pm2_env:e};if(mutate)mutate(row);
 const mods={};const fakefs={existsSync:()=>true,statSync:()=>({isDirectory:()=>true}),mkdirSync(){},openSync(){}};
 function Socket(){}Socket.prototype.connect=function(){};function Server(){}Server.prototype.listen=function(){};
 function Client(){}Client.prototype.launchRPC=function(cb){this.client={call:(method,arg,done)=>{
  if(method==='getMonitorData')return done(null,[row]);calls.push({method,arg});
  if(method==='stopProcessId'){row.pid=0;e.status='stopped';}
  else if(method==='restartProcessId'){row.pid=config.pid+10000;e.status='online';Object.assign(e,arg.env);}
  else throw Error('unexpected RPC');done(null);
 }};cb(null)};
 const req=id=>id.endsWith('/lib/Client.js')?Client:id==='node:fs'?fakefs:id==='node:net'?{Socket,Server}:mods[id]||(mods[id]={});
 const p={argv:['node','/usr/lib/node_modules/pm2',action,JSON.stringify({GIT_SHA:config.candidate})],stdout:{write:s=>output+=s}};
 vm.runInNewContext(source,{require:req,process:p,console:{},setTimeout:()=>1,clearTimeout(){},Error,Object,Array,JSON,String,global:{}});
 return {result:JSON.parse(output),calls};
}
for(const action of ['inspect','stop','restart-current']){
 const r=run(action);if(r.result.status!=='READONLY_NAMED_METADATA_PASS')throw Error(action+JSON.stringify(r));
 if(action==='inspect'&&r.calls.length)throw Error('inspect wrote');
 if(action==='stop'&&(r.calls.length!==1||r.calls[0].arg!==config.pm2Id))throw Error('stop scope');
 if(action==='restart-current'&&(r.calls.length!==1||r.calls[0].arg.id!==config.pm2Id||JSON.stringify(r.calls[0].arg.env)!==JSON.stringify({GIT_SHA:config.candidate})))throw Error('restart modified behavior');count++;
}
for(const [name,mut]of [['wrong-pid',r=>r.pid++],['wrong-id',r=>r.pm2_env.pm_id++],['wrong-name',r=>r.pm2_env.name='foreign'],['wrong-cwd',r=>r.pm2_env.pm_cwd='/foreign'],['watch',r=>r.pm2_env.watch=true],['mode',r=>r.pm2_env.exec_mode='cluster_mode'],['flags',r=>r.pm2_env.BILLING_OPERATIONS_ENABLED='false']]){
 const r=run('stop',mut);if(r.calls.length||r.result.status==='READONLY_NAMED_METADATA_PASS')throw Error('accepted '+name);count++;
}
console.log(JSON.stringify({target:config.target,checks:count,status:'PASS_FAKE_OS_NAMED_PM2_CONTRACT'}));
'''
(D/'rpc-vm-tests.cjs').write_text(js,encoding='utf-8',newline='\n')
for target in ['AshrafEssa','MelamedLaw','MorLevi']:
 q=subprocess.run(['node',str(D/'rpc-vm-tests.cjs'),str(D/target)],capture_output=True,text=True)
 assert q.returncode==0,q.stderr
 result=json.loads(q.stdout);assert result['checks']==10;tests.append(result)
result={'status':'PASS_NEW_PRODUCTION_OPERATION_GUARDS','financialGuardCases':18,'namedPm2VmCases':30,'applicationTestsRerun':0,'operatorSha256':H(operator),'tests':tests}
(D/'qualification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='tests'}))
