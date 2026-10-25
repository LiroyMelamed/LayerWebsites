'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {waitForHealth,validate,healthMinUptimePrecondition,minUptimePolicy,stabilityMinAge}=require('./backend-off03.cjs');
const ABSENT=Object.freeze({present:false,type:'undefined',value:null});
const TEN=Object.freeze({present:true,type:'number',value:10000});
const FIVE=Object.freeze({present:true,type:'number',value:5000});
function fixture({policy=ABSENT,age=1000,readyAt=0,never=false,startOffset=null,secondPolicy=null,pidChange=false,startChange=false,readCost=0}={}){
 let ms=0,reads=0,probes=0;const epoch=Date.UTC(2026,9,25),budgets=[];
 const options={port:1,host:'fixture.invalid',expectedMinUptimePolicy:policy,now:()=>ms,wallNow:()=>epoch+ms,sleep:async n=>{ms+=n;},probe:async()=>{probes++;const ready=!never&&ms>=readyAt;return{ready,classification:ready?'READY':'CONNECTION_REFUSED',status:ready?200:null,bytes:ready?11:0};},readProcess:async budget=>{budgets.push(budget);assert(budget>0&&budget<=5000);reads++;ms+=readCost;return{identityVerified:true,pid:pidChange&&reads>1?13:12,status:'online',uptimeStartedAtMs:epoch+(startOffset??-age)+(startChange&&reads>1?1:0),minUptimePolicy:reads>1&&secondPolicy?secondPolicy:policy};}};
 return{options,budgets,get elapsed(){return ms;},get reads(){return reads;},get probes(){return probes;}};
}
test('policy projection distinguishes absent, present undefined/null/string and original number',()=>{
 assert.deepEqual(minUptimePolicy({}),ABSENT);assert.deepEqual(minUptimePolicy({min_uptime:10000}),TEN);
 for(const value of [undefined,null,'10000',5000])assert.notDeepEqual(minUptimePolicy({min_uptime:value}),ABSENT);
 assert.notDeepEqual(minUptimePolicy({min_uptime:'10000'}),TEN);
});
test('policy contract requires explicit exact presence/type/value with a stable-age floor',()=>{
 assert.equal(stabilityMinAge(ABSENT),5000);assert.equal(stabilityMinAge(TEN),10000);assert.equal(stabilityMinAge(FIVE),5000);
 for(const policy of [undefined,{}, {present:false,type:'undefined'}, {...ABSENT,value:undefined}, {...ABSENT,present:true}, {...ABSENT,extra:true}, {...TEN,type:'string'}, {...TEN,value:'10000'}, {...TEN,value:null}, {...TEN,value:-1}, {...TEN,value:NaN}, {...TEN,value:Infinity}])assert.throws(()=>stabilityMinAge(policy),{code:'INVALID_ORIGINAL_MIN_UPTIME_POLICY'});
});
test('missing original PM2 property accepts absence and rejects every present representation',()=>{
 assert.equal(healthMinUptimePrecondition({pm2Root:{}},ABSENT),5000);
 for(const min_uptime of [undefined,null,'5000',5000,10000])assert.throws(()=>healthMinUptimePrecondition({pm2Root:{min_uptime}},ABSENT),{code:'ORIGINAL_MIN_UPTIME_POLICY_CHANGED'});
});
test('original numeric10000 rejects disappearance, numeric drift and type changes',()=>{
 assert.equal(healthMinUptimePrecondition({pm2Root:{min_uptime:10000}},TEN),10000);
 for(const env of [{},{min_uptime:undefined},{min_uptime:null},{min_uptime:'10000'},{min_uptime:5000}])assert.throws(()=>healthMinUptimePrecondition({pm2Root:env},TEN),{code:'ORIGINAL_MIN_UPTIME_POLICY_CHANGED'});
});
test('actual state capture rejects policy drift before environment reads in all four phases',()=>{
 const source=fs.readFileSync(__dirname+'/backend-off03.cjs','utf8');
 for(const phase of ['checkpoint','activate','verify','rollback'])for(const [tenant,policy,actual] of [['melamedlaw',ABSENT,{min_uptime:5000}],['morlevy',TEN,{}]]){
  const identity=tenant==='melamedlaw'?{id:1,name:'melamed-backend',root:'/root/LayerWebsites',branch:'MelamedLaw'}:{id:4,name:'morlevy-api',root:'/root/MorLevi',branch:'MorLevi'};
  let reads=0;const module={exports:{}},context={module,exports:module.exports,process:{umask(){}},Buffer,URL,setTimeout,clearTimeout,require:n=>n==='fs'?{readFileSync(){reads++;throw new Error('UNEXPECTED_ENVIRONMENT_READ');}}:n==='child_process'?{execFileSync(program,args){assert.equal(program,'pm2');assert.deepEqual(Array.from(args),['jlist']);return JSON.stringify([{pm_id:identity.id,name:identity.name,pid:12,pm2_env:{pm_cwd:identity.root+'/backend',pm_exec_path:identity.root+'/backend/server.js',status:'online',...actual}}]);}}:require(n)};
  vm.runInNewContext(source+'\nmodule.exports.testState=state;',context);
  const contract={schemaVersion:1,scope:'PRODUCTION_LEGAL_PRODUCER_OFF_ONE_TENANT',tenant,phase,baseCommit:'1'.repeat(40),candidateCommit:'2'.repeat(40),rollbackCommit:'3'.repeat(40),branch:identity.branch,stage:'/root/legal-system-messages-off-20261025/'+tenant,environmentWrites:false,dependencyInstall:false,migrationsToApply:[],allowedChangedPaths:Array(38).fill('fixture'),originalMinUptimePolicy:policy};
  module.exports.bind(contract);assert.throws(()=>module.exports.testState(contract,phase==='rollback'),{code:'ORIGINAL_MIN_UPTIME_POLICY_CHANGED'});assert.equal(reads,0);
 }
});
test('absent policy uses explicit5000 age floor without inventing a PM2 setting',async()=>{
 const f=fixture(),p=await waitForHealth(f.options);assert.equal(p.elapsedMs,4000);assert.equal(p.requiredStabilityAgeMs,5000);assert.deepEqual(p.originalMinUptimePolicy,ABSENT);assert.equal(p.processStability.observedAgeMs,5000);assert.equal(f.reads,2);assert.equal(f.probes,2);assert.equal(p.attempts.at(-1).finalAfterStability,true);assert.equal(p.fullAsyncStartupCompletionClaimed,false);
});
test('numeric10000 requires10000 observed age while leaving policy unchanged',async()=>{
 const f=fixture({policy:TEN}),p=await waitForHealth(f.options);assert.equal(p.elapsedMs,9000);assert.equal(p.requiredStabilityAgeMs,10000);assert.equal(p.processStability.observedAgeMs,10000);assert.deepEqual(p.processStability.originalMinUptimePolicy,TEN);assert.equal(p.processStability.samePidAndUptimeAcrossSnapshots,true);assert.equal(f.probes,2);
});
test('original Ashraf numeric5000 still has its exact5000 stability requirement',async()=>{
 const f=fixture({policy:FIVE}),p=await waitForHealth(f.options);assert.equal(p.elapsedMs,4000);assert.deepEqual(p.originalMinUptimePolicy,FIVE);assert.equal(p.processStability.requiredMinUptimeMs,5000);
});
test('late healthy numeric10000 cannot extend the absolute25s deadline to finish stability',async()=>{
 const f=fixture({policy:TEN,readyAt:24000,startOffset:23000});await assert.rejects(waitForHealth(f.options),e=>e.code==='LOCAL_HEALTH_NOT_READY'&&e.healthProof.terminalClassification==='DEADLINE_EXCEEDED'&&e.healthProof.elapsedMs===25000&&e.healthProof.attempts.every(p=>p.finalAfterStability===false));assert.equal(f.elapsed,25000);
});
test('numeric10000 never-ready health still exhausts exactly25s with fast refusals',async()=>{
 const f=fixture({policy:TEN,never:true});await assert.rejects(waitForHealth(f.options),e=>e.healthProof.terminalClassification==='DEADLINE_EXCEEDED'&&e.healthProof.elapsedMs===25000&&e.healthProof.attempts.length===100);assert.equal(f.reads,0);
});
test('both snapshots reject missing-to-present, present-to-missing, numeric and type policy drift',async()=>{
 for(const [policy,secondPolicy]of [[ABSENT,FIVE],[TEN,ABSENT],[TEN,FIVE],[TEN,{present:true,type:'string',value:'10000'}]]){
  const f=fixture({policy,secondPolicy});await assert.rejects(waitForHealth(f.options),e=>e.healthProof.terminalClassification==='OWN_PROCESS_STABILITY_METADATA_INVALID');assert.equal(f.reads,2);assert.equal(f.probes,1);
 }
});
test('first health snapshot also rejects actual policy mismatch before waiting',async()=>{
 const f=fixture({policy:TEN});const original=f.options.readProcess;f.options.readProcess=async n=>({...await original(n),minUptimePolicy:ABSENT});await assert.rejects(waitForHealth(f.options),e=>e.healthProof.terminalClassification==='OWN_PROCESS_STABILITY_METADATA_INVALID');assert.equal(f.elapsed,0);
});
test('new policy waits retain PID/start pinning and expected-PID protection',async()=>{
 for(const options of [{policy:TEN,pidChange:true},{policy:ABSENT,startChange:true}]){const f=fixture(options);await assert.rejects(waitForHealth(f.options),e=>e.healthProof.terminalClassification==='OWN_PROCESS_CHANGED_DURING_STABILITY_WINDOW');}
 const f=fixture({policy:TEN});await assert.rejects(waitForHealth({...f.options,expectedPid:99}),e=>e.healthProof.terminalClassification==='OWN_PROCESS_STABILITY_METADATA_INVALID');
});
test('new policy cannot skip final successful HTTP probe after stable snapshots',async()=>{
 for(const policy of [ABSENT,TEN]){const f=fixture({policy});let n=0;f.options.probe=async()=>({ready:++n===1,classification:n===1?'READY':'INVALID_JSON',status:200,bytes:1});await assert.rejects(waitForHealth(f.options),e=>e.healthProof.terminalClassification==='FINAL_HEALTH_AFTER_STABILITY_NOT_READY');assert.equal(f.reads,2);}
});
test('numeric10000 snapshots and final probe still share the shrinking total deadline',async()=>{
 const f=fixture({policy:TEN,readyAt:24750,age:12000}),seen=[];const original=f.options.probe;f.options.probe=async o=>{seen.push(o.timeoutMs);return original(o);};const p=await waitForHealth(f.options);assert.deepEqual(f.budgets,[250,250]);assert.equal(seen.at(-1),250);assert.equal(p.elapsedMs,24750);
});
test('new contracts change only reviewed operator hashes and exact original policy',()=>{
 for(const [tenant,policy]of [['melamedlaw',ABSENT],['morlevy',TEN]]){
  const old=JSON.parse(fs.readFileSync(__dirname+'/'+tenant+'-backend-contract02.json')),next=JSON.parse(fs.readFileSync(__dirname+'/'+tenant+'-backend-contract03.json'));assert.deepEqual(next.originalMinUptimePolicy,policy);validate({...next,phase:'checkpoint'});delete next.originalMinUptimePolicy;next.scriptHashes=old.scriptHashes;assert.deepEqual(next,old);
 }
});
