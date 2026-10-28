'use strict';
// Read-only final observation. No SQL, application imports, remote writes or old C.others replay.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),path=require('path'),http=require('http');
const {performance}=require('perf_hooks');
const H=b=>crypto.createHash('sha256').update(b).digest('hex');
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const canonical=x=>H(JSON.stringify(sort(x))??'__undefined__');
const stop=code=>{throw Object.assign(new Error(code),{code});};
const requireTrue=(ok,code)=>{if(!ok)stop(code);};
const HEX=/^[a-f0-9]{64}$/;
const TARGETS=[
 {tenant:'ashrafessa',root:'/root/AshrafEssa',id:3,name:'ashrafessa-api',port:3002,host:'api-ashrafessa.mela-media.co.il',branch:'AshrafEssa',head:'596aa5b7eb9b40f8cd5f6927132955ff6caf2175'},
 {tenant:'melamedlaw',root:'/root/LayerWebsites',id:1,name:'melamed-backend',port:3000,host:'api.calls.melamedlaw.co.il',branch:'MelamedLaw',head:'0631caf7b1c829673887e12c1d2e3ffc36c1715b'},
 {tenant:'morlevy',root:'/root/MorLevi',id:4,name:'morlevy-api',port:3001,host:'api-morlevy.mela-media.co.il',branch:'MorLevi',head:'a50afb3fccaaee17633328ef62b5695336d73090'},
 {tenant:'melamediaQA',root:'/root/Melamedia',id:5,name:'melamedia-api',port:3003,host:'api-melamedia.mela-media.co.il',head:'1161fd687db381833552db78a70723573792ab97'},
 {tenant:'lawyerShared',root:'/root/LawyerPlatform',id:7,name:'lawyer-api',port:3005,host:'api-lawyer.mela-media.co.il',head:'ce3cb6a9058a2a3ec2dc1495796079cde90f6f51'}
];
const OFF_KEYS=['CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED','CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED','WHATSAPP_LIVE_ENABLED','WHATSAPP_WAHA_DELIVERY_ENABLED','WHATSAPP_WAHA_QA_PILOT_ENABLED','WHATSAPP_WORKER_ENABLED'];
const WORD_CONFIG={WORD_TEMPLATE_SOFFICE_PATH:'/opt/melamedia-qa-word-converter-20261023/managed-soffice.py',WORD_TEMPLATE_MAX_CONCURRENT:'1'};
const POLICIES={ashrafessa:{present:true,type:'number',value:5000},melamedlaw:{present:false,type:'undefined',value:null},morlevy:{present:true,type:'number',value:10000}};
function run(args,cwd='/root',timeout=5000){return cp.execFileSync(args[0],args.slice(1),{cwd,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},stdio:['pipe','pipe','pipe'],timeout,maxBuffer:16777216});}
function git(t,...args){return run(['git',...args],t.root);}
function fileHash(p){return H(fs.readFileSync(p));}
function source(t,c){
 for(const key of ['core.hooksPath','core.fsmonitor']){let value='';try{value=git(t,'config','--get',key).trim();}catch(e){if(e.status!==1)throw e;}requireTrue(!value||key==='core.fsmonitor'&&value==='false','GIT_CUSTOM_HOOK_OR_FSMONITOR');}
 const hooks=path.resolve(t.root,git(t,'rev-parse','--git-path','hooks').trim());
 for(const name of ['post-checkout','pre-merge-commit','post-merge','post-index-change']){try{fs.accessSync(hooks+'/'+name,fs.constants.X_OK);stop('EXECUTABLE_GIT_HOOK');}catch(e){if(!['ENOENT','EACCES'].includes(e.code))throw e;}}
 const head=git(t,'rev-parse','HEAD').trim();requireTrue(head===t.head,'EXPECTED_FINAL_SOURCE_CHANGED');
 if(!c)return{head,headMatchesExpected:true,minimumUptimePolicyAsserted:false};
 const branch=git(t,'symbolic-ref','--quiet','--short','HEAD').trim();requireTrue(branch===t.branch&&!git(t,'status','--porcelain','--untracked-files=no').trim(),'NAMED_BRANCH_OR_TRACKED_SOURCE_CHANGED');
 const files=git(t,'ls-files','-z','backend').split('\0').filter(Boolean),hashes=c.candidateBackendHashes;
 requireTrue(files.length===Object.keys(hashes).length&&files.every(p=>Object.hasOwn(hashes,p)&&fileHash(t.root+'/'+p)===hashes[p]),'FULL_BACKEND_DISK_MAP_CHANGED');
 for(const[p,h]of Object.entries(c.reviewedDependencyFiles))requireTrue(fileHash(t.root+'/'+p)===h,'PHYSICAL_DEPENDENCY_PACKAGE_JSON_CHANGED');
 return{head,branch,headMatchesExpected:true,trackedClean:true,backendFiles:files.length,backendMapSha256:canonical(hashes),dependencyFiles:190,dependencyMapSha256:canonical(c.reviewedDependencyFiles)};
}
function identity(t,list){const rows=list.filter(p=>p.pm_id===t.id);requireTrue(rows.length===1,'PM2_ID_SET_CHANGED');const p=rows[0],e=p.pm2_env||{};requireTrue(p.name===t.name&&e.status==='online'&&e.pm_cwd===t.root+'/backend'&&e.pm_exec_path===t.root+'/backend/server.js'&&Number.isSafeInteger(p.pid)&&p.pid>0,'API_PROCESS_IDENTITY_CHANGED');return p;}
function allProcesses(list){return list.map(p=>{requireTrue(Number.isSafeInteger(p.pid)&&p.pid>0,'KNOWN_PM2_PROCESS_NOT_RUNNING');const e=p.pm2_env||{},text=fs.readFileSync('/proc/'+p.pid+'/stat','utf8'),tail=text.slice(text.lastIndexOf(') ')+2).trim().split(/\s+/);return{id:p.pm_id,pid:p.pid,status:e.status,start:e.pm_uptime,restarts:e.restart_time,procStart:tail[19],procEnvSha256:fileHash('/proc/'+p.pid+'/environ')};}).sort((a,b)=>a.id-b.id);}
function compareKnownOthers(B,rows){requireTrue(canonical(rows.map(p=>p.id))===canonical(B.expectedAllProcessIds),'PM2_PROCESS_SET_CHANGED');const other=rows.filter(p=>![1,3,4].includes(p.id));requireTrue(canonical(other)===canonical(B.unchangedNonCustomerProcesses),'NON_CUSTOMER_PROCESS_CHANGED_FROM_LINUX_BASELINE');}
function environment(t,c,p){
 const e=p.pm2_env,raw=fs.readFileSync(t.root+'/backend/.env');requireTrue(raw.length<=1024*1024,'ENV_FILE_BOUND');
 const parsed=require(t.root+'/backend/node_modules/dotenv').parse(raw),nested=e.env||{},effective={...parsed,...nested},rootLaunch={};
 for(const k of new Set([...Object.keys(parsed),...Object.keys(nested),'GIT_BRANCH','CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED','CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED']))if(Object.hasOwn(e,k)){rootLaunch[k]=e[k];effective[k]=e[k];}
 const hashes={envSha256:H(raw),nestedCanonicalSha256:canonical(nested),effectiveCanonicalSha256:canonical(effective),selectedRootCanonicalSha256:canonical(rootLaunch),controlSignatureSha256:canonical(Object.fromEntries(Object.entries(effective).filter(([k])=>/(?:WHATSAPP|WAHA|SIGNING|COURT|BACKGROUND|QA_OUTBOUND|TENANT.*ISOLATION|BRANCH_TENANT_GUARD)/.test(k))))};
 for(const[k,h]of Object.entries(hashes))requireTrue(h===c.expectedActivation[k],'ACTIVATED_ENVIRONMENT_BINDING_CHANGED');
 const explicitEffective={...effective};for(const k of [...OFF_KEYS,...Object.keys(WORD_CONFIG)])if(Object.hasOwn(e,k))explicitEffective[k]=e[k];
 const layers={dotenvFixedKeys:parsed,nestedFixedKeys:nested,pm2RootFixedKeys:e,effectiveFixedKeys:explicitEffective},off={};
 for(const[name,layer]of Object.entries(layers)){off[name]={};for(const k of OFF_KEYS){const enabled=['true','1'].includes(String(layer[k]??'').trim().toLowerCase());requireTrue(!enabled,'PROVIDER_OR_PRODUCER_FLAG_ENABLED');off[name][k]={present:Object.hasOwn(layer,k),enabled:false};}}
 for(const[k,value]of Object.entries(WORD_CONFIG)){requireTrue(String(parsed[k])===value&&String(explicitEffective[k])===value,'WORD_CONFIG_NOT_EFFECTIVE');for(const layer of [nested,e])requireTrue(!Object.hasOwn(layer,k)||String(layer[k])===value,'WORD_LAUNCH_OVERRIDE_CHANGED');}
 requireTrue(String(explicitEffective.PORT)===String(t.port),'DOCUMENTED_PORT_CHANGED');
 requireTrue(canonical(minUptimePolicy(e))===canonical(POLICIES[t.tenant])&&canonical(c.originalMinUptimePolicy)===canonical(POLICIES[t.tenant]),'ORIGINAL_MIN_UPTIME_POLICY_CHANGED');
 requireTrue(p.pid===c.expectedActivation.pid&&e.pm_uptime===c.expectedActivation.start&&e.restart_time===c.expectedActivation.restarts,'ACTIVATED_PID_START_OR_RESTART_CHANGED');
 requireTrue(Date.now()-e.pm_uptime>=stabilityMinAge(POLICIES[t.tenant]),'ACTIVATED_PROCESS_NOT_OLD_ENOUGH');
 return{...hashes,activationCanonicalBindingsMatch:true,offFixedKeys:off,wordConfig:{...WORD_CONFIG},wordConfigEffective:true,originalMinUptimePolicy:minUptimePolicy(e)};
}
// BEGIN EXACT 25 OCT HEALTH HELPERS
function minUptimePolicy(env){const present=Object.hasOwn(env,'min_uptime');return{present,type:present?typeof env.min_uptime:'undefined',value:present?env.min_uptime:null};}
function stabilityMinAge(policy){if(!policy||canonical(Object.keys(policy).sort())!==canonical(['present','type','value'])||typeof policy.present!=='boolean'||(policy.present?(policy.type!=='number'||!Number.isSafeInteger(policy.value)||policy.value<0):(policy.type!=='undefined'||policy.value!==null)))stop('INVALID_ORIGINAL_MIN_UPTIME_POLICY');return policy.present?Math.max(5000,policy.value):5000;}
function httpHealthProbe({port,host,timeoutMs=1000}){return new Promise(resolve=>{
 let request,response,timer,settled=false,bytes=0;const chunks=[];let status=null;
 const finish=(classification,ready=false)=>{if(settled)return;settled=true;clearTimeout(timer);const result={ready,classification,status,bytes};if(bytes<=1024)result.bodySha256=H(Buffer.concat(chunks));response?.destroy();request?.destroy();resolve(result);};
 timer=setTimeout(()=>finish('ABSOLUTE_PROBE_TIMEOUT'),Math.max(1,Math.floor(timeoutMs)));
 try{request=http.get({hostname:'127.0.0.1',port,path:'/health',headers:{Host:host},agent:false},r=>{response=r;status=r.statusCode;if(status!==200){finish('NON_200');return;}r.on('data',b=>{bytes+=b.length;if(bytes>1024)finish('OVERSIZED_BODY');else chunks.push(b);});r.once('aborted',()=>finish('RESPONSE_ABORTED'));r.once('error',()=>finish('RESPONSE_ERROR'));r.once('close',()=>{if(!r.complete)finish('RESPONSE_ABORTED');});r.once('end',()=>{if(settled)return;let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){finish('INVALID_JSON');return;}finish(parsed?.ok===true?'READY':'OK_NOT_TRUE',parsed?.ok===true);});});request.once('error',e=>finish(({ECONNREFUSED:'CONNECTION_REFUSED',ECONNRESET:'CONNECTION_RESET',ETIMEDOUT:'NETWORK_TIMEOUT'})[e.code]||'NETWORK_ERROR'));}catch(_){finish('NETWORK_ERROR');}
});}
async function waitForHealth({port,host,probe=httpHealthProbe,readProcess,expectedMinUptimePolicy={present:true,type:'number',value:5000},expectedPid=null,deadlineMs=25000,perProbeMs=1000,pollMs=250,now=()=>performance.now(),wallNow=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),onEvent=()=>{}}){
 const requiredStabilityAgeMs=stabilityMinAge(expectedMinUptimePolicy),started=now(),deadline=started+deadlineMs,proof={startedAt:new Date(wallNow()).toISOString(),deadlineMs,perProbeTimeoutMs:perProbeMs,pollMs,originalMinUptimePolicy:expectedMinUptimePolicy,requiredStabilityAgeMs,attempts:[],ready:false,fullAsyncStartupCompletionClaimed:false};
 const elapsed=()=>Math.max(0,now()-started),remaining=()=>Math.max(0,deadline-now());
 const fail=classification=>{proof.elapsedMs=elapsed();proof.terminalClassification=classification;onEvent({kind:'health_end',...proof});throw Object.assign(new Error('LOCAL_HEALTH_NOT_READY'),{code:'LOCAL_HEALTH_NOT_READY',healthProof:proof});};
 const runProbe=async final=>{const left=remaining();if(left<=0)fail('DEADLINE_EXCEEDED');const at=elapsed(),result=await probe({port,host,timeoutMs:Math.min(perProbeMs,left)}),attempt={number:proof.attempts.length+1,startedElapsedMs:at,durationMs:elapsed()-at,finalAfterStability:final,...result};proof.attempts.push(attempt);onEvent({kind:'health_attempt',...attempt});if(remaining()<=0)fail('DEADLINE_EXCEEDED');return result.ready===true;};
 const snapshot=async()=>{const left=remaining();if(left<=0)fail('DEADLINE_EXCEEDED');let p;try{p=await readProcess(Math.max(1,Math.floor(Math.min(5000,left))));}catch(_){fail('OWN_PROCESS_SNAPSHOT_FAILED');}if(remaining()<=0)fail('DEADLINE_EXCEEDED');if(!p||p.identityVerified!==true||p.status!=='online'||!Number.isSafeInteger(p.pid)||p.pid<=0||!Number.isSafeInteger(p.uptimeStartedAtMs)||p.uptimeStartedAtMs<=0||canonical(p.minUptimePolicy)!==canonical(expectedMinUptimePolicy)||wallNow()<p.uptimeStartedAtMs||expectedPid!==null&&p.pid!==expectedPid)fail('OWN_PROCESS_STABILITY_METADATA_INVALID');onEvent({kind:'health_process_snapshot',elapsedMs:elapsed(),pid:p.pid,status:p.status,uptimeStartedAtMs:p.uptimeStartedAtMs,originalMinUptimePolicy:p.minUptimePolicy});return p;};
 onEvent({kind:'health_start',deadlineMs,perProbeTimeoutMs:perProbeMs,pollMs});
 while(remaining()>0){if(await runProbe(false)){
   proof.firstReadyElapsedMs=elapsed();const first=await snapshot(),waitMs=Math.max(0,requiredStabilityAgeMs-(wallNow()-first.uptimeStartedAtMs));
   if(waitMs>0){onEvent({kind:'health_process_window_wait',elapsedMs:elapsed(),waitMs});await sleep(Math.min(waitMs,remaining()));if(remaining()<=0)fail('DEADLINE_EXCEEDED');}
   const last=await snapshot();if(last.pid!==first.pid||last.uptimeStartedAtMs!==first.uptimeStartedAtMs||wallNow()-last.uptimeStartedAtMs<requiredStabilityAgeMs)fail('OWN_PROCESS_CHANGED_DURING_STABILITY_WINDOW');
   proof.processStability={pid:last.pid,uptimeStartedAtMs:last.uptimeStartedAtMs,observedAgeMs:wallNow()-last.uptimeStartedAtMs,requiredMinUptimeMs:requiredStabilityAgeMs,originalMinUptimePolicy:expectedMinUptimePolicy,samePidAndUptimeAcrossSnapshots:true,stableProcessWindowOnly:true};
   if(!await runProbe(true))fail('FINAL_HEALTH_AFTER_STABILITY_NOT_READY');proof.ready=true;proof.elapsedMs=elapsed();proof.terminalClassification='READY_AFTER_STABLE_PROCESS_WINDOW';onEvent({kind:'health_end',...proof});return proof;
  }await sleep(Math.min(pollMs,remaining()));}
 fail('DEADLINE_EXCEEDED');
}
// END EXACT 25 OCT HEALTH HELPERS
function validate(B){
 requireTrue(B&&B.scope==='FINAL_FIVE_LEGAL_API_READONLY_INVENTORY'&&B.status==='SEALED_FROM_THREE_ACTUAL_ACTIVATIONS','UNFILLED_FINAL_BINDING');
 requireTrue(canonical(Object.keys(B.clients).sort())===canonical(['ashrafessa','melamedlaw','morlevy']),'FINAL_CUSTOMER_SET_CHANGED');
 for(const t of TARGETS.slice(0,3)){const c=B.clients[t.tenant];requireTrue(c?.candidateCommit===t.head&&c.branch===t.branch&&c.activationReceipt?.sha256&&c.sealedContract?.sha256&&Number.isSafeInteger(c.expectedActivation?.pid)&&Number.isSafeInteger(c.expectedActivation?.start),'ACTUAL_ACTIVATION_PLACEHOLDER_UNFILLED');requireTrue(canonical(c.originalMinUptimePolicy)===canonical(POLICIES[t.tenant]),'FINAL_POLICY_CHANGED');requireTrue(Object.keys(c.reviewedDependencyFiles||{}).length===190,'EXACT_190_DEPENDENCY_BINDING_REQUIRED');for(const[p,h]of Object.entries(c.candidateBackendHashes||{}))requireTrue(p.startsWith('backend/')&&!p.split('/').some(x=>x==='..'||x==='.')&&p!=='backend/.env'&&!p.includes('\0')&&HEX.test(h),'UNSAFE_BACKEND_HASH_PATH');for(const[p,h]of Object.entries(c.reviewedDependencyFiles))requireTrue(/^backend\/node_modules\/[A-Za-z0-9_@./-]+\/package\.json$/.test(p)&&!p.includes('..')&&HEX.test(h),'UNSAFE_DEPENDENCY_HASH_PATH');}
}
async function main(B){
 validate(B);const at=new Date().toISOString(),firstList=JSON.parse(run(['pm2','jlist'])),first=allProcesses(firstList);compareKnownOthers(B,first);
 const rows=[];
 for(const t of TARGETS){const c=B.clients[t.tenant]||null,p=identity(t,firstList);rows.push({tenant:t.tenant,sourceBefore:source(t,c),processBefore:first.find(x=>x.id===t.id),...(c?{environmentBefore:environment(t,c,p)}:{minimumUptimePolicyAsserted:false})});}
 for(let i=0;i<TARGETS.length;i++){const t=TARGETS[i],c=B.clients[t.tenant];if(c){rows[i].health=await waitForHealth({port:t.port,host:t.host,expectedMinUptimePolicy:c.originalMinUptimePolicy,expectedPid:c.expectedActivation.pid,readProcess:timeoutMs=>{const p=identity(t,JSON.parse(run(['pm2','jlist'],'/root',timeoutMs)));return{identityVerified:true,pid:p.pid,status:p.pm2_env.status,uptimeStartedAtMs:p.pm2_env.pm_uptime,minUptimePolicy:minUptimePolicy(p.pm2_env)};}});}else{rows[i].health=await httpHealthProbe({port:t.port,host:t.host,timeoutMs:1000});requireTrue(rows[i].health.ready===true,'QA_OR_SHARED_LOCAL_HEALTH_NOT_READY');}}
 const lastList=JSON.parse(run(['pm2','jlist'])),last=allProcesses(lastList);compareKnownOthers(B,last);requireTrue(canonical(first)===canonical(last),'PROCESS_CHANGED_DURING_FINAL_INVENTORY');
 for(let i=0;i<TARGETS.length;i++){const t=TARGETS[i],c=B.clients[t.tenant]||null,p=identity(t,lastList);rows[i].sourceAfter=source(t,c);rows[i].processAfter=last.find(x=>x.id===t.id);requireTrue(canonical(rows[i].sourceBefore)===canonical(rows[i].sourceAfter),'SOURCE_CHANGED_DURING_FINAL_INVENTORY');if(c){rows[i].environmentAfter=environment(t,c,p);requireTrue(canonical(rows[i].environmentBefore)===canonical(rows[i].environmentAfter),'ENV_CHANGED_DURING_FINAL_INVENTORY');}rows[i].samePidAndStartAcrossGlobalSnapshots=true;rows[i].finalHealthAfterGlobalStability=await httpHealthProbe({port:t.port,host:t.host,timeoutMs:1000});requireTrue(rows[i].finalHealthAfterGlobalStability.ready===true,'FINAL_LOCAL_HEALTH_NOT_READY');}
 const finalProcesses=allProcesses(JSON.parse(run(['pm2','jlist'])));compareKnownOthers(B,finalProcesses);requireTrue(canonical(first)===canonical(finalProcesses),'PROCESS_CHANGED_AFTER_FINAL_HEALTH');
 return{at,completedAt:new Date().toISOString(),result:'PASS_FINAL_FIVE_LEGAL_API_SOURCE_CONFIG_HEALTH_INVENTORY',observations:rows,allProcessesBefore:first,allProcessesAfter:finalProcesses,allNineProcessesStableDuringInventory:true,globalProcessSnapshots:3,nonCustomerProcessesMatchKnownLinuxBaseline:true,onlyThreeAuthorizedCustomerProcessTransitionsExcludedFromOldBaseline:true,oldPerClientOtherPidBaselineReplayed:false,qaAndSharedMinimumUptimePolicyAsserted:false,noSqlCustomerRowsLogsApplicationBootProvidersOrRuntimeMutation:true,noRemoteWritesCachesOrCleanup:true,scopeDoesNotProveAuthenticatedFeatureCorrectnessFrontendOrNativeVersions:true};
}
module.exports={main,httpHealthProbe,waitForHealth};
if(typeof FINAL_FIVE_BINDINGS!=='undefined')main(FINAL_FIVE_BINDINGS).then(value=>process.stdout.write(JSON.stringify(value))).catch(error=>{const code=/^[A-Z0-9_:.-]{1,140}$/.test(error.code||'')?error.code:'FINAL_INVENTORY_FAILED';process.stdout.write(JSON.stringify({result:'FAIL_FINAL_FIVE_READONLY_INVENTORY',code,detailsPrivate:true,noAutomaticRetry:true}));process.exitCode=1;});
