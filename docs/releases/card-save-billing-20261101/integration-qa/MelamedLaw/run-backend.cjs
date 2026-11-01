'use strict';
// Offline only: all providers are synthetic, application DB sockets blocked.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../../..');
const node='/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pattern=/^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$/;
const billing=fs.readdirSync(path.join(root,'backend/tests')).filter(name=>pattern.test(name)).sort();
const common=['clientDocumentProfile.test.js','clientDocumentProfile.readScope.test.js','clientDocumentProfile.postgres.test.js','customerIdentity.recovery.test.js','clientPortal.mainScope.test.js','clientPortal.unit.test.js','authMiddleware.shape.test.js','signingV2.featureEntryRoutes.test.js','signingV2.wordOriginBoundary.test.js','signingWordRoutes.test.js'];
const word=fs.readdirSync(path.join(root,'backend/tests')).filter(name=>/^word(?:Templates|Template|Signing).*\.test\.js$/.test(name)).sort();
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR||'/tmp',NODE_PATH:'/tmp/layer-billing-lock-deps/node_modules',NODE_ENV:'test',DB_DISABLE_CONNECT_TEST:'true'};
const tracked=git('ls-files','backend').split('\n').filter(Boolean);
const pins=()=>Object.fromEntries(tracked.filter(p=>fs.existsSync(path.join(root,p))&&fs.statSync(path.join(root,p)).isFile()).map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
const before=pins(),candidate=git('rev-parse','HEAD');
const portableWord=process.argv.includes('--word-portable');
const groups=portableWord ? [['word-portable',word.filter(f=>f!=='wordTemplates.http.integration.test.js')]] : [['billing',billing],['common',common],['word',word]];
const report={candidate,nodeVersion:execFileSync(node,['--version'],{encoding:'utf8'}).trim(),startedAtUtc:new Date().toISOString(),network:'native external fetch/TCP and application database ports blocked before socket; only ephemeral loopback HTTP',groups:[],sourceHashes:before,backendLockSha256:hash(fs.readFileSync(path.join(root,'backend/package-lock.json'))),installedDependencyLockSha256:hash(fs.readFileSync(path.join(root,'backend/node_modules/.package-lock.json')))};
for(const [name,list]of groups){
 const files=list.map(p=>'backend/tests/'+p);const args=['--require',path.join(root,'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs'),'--test',portableWord?'--test-concurrency=1':'--test-concurrency=2',...files];
 const r=spawnSync(node,args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});
 const text=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(__dirname,name+'-tests.tap'),text);
 const stats=Object.fromEntries(['tests','suites','pass','fail','cancelled','skipped','todo'].map(k=>[k,Number((text.match(new RegExp('(?:^|\\n)(?:#|ℹ) '+k+' (\\d+)'))||[])[1]||0)]));
 const group={name,files,exitCode:r.status,signal:r.signal,summary:stats,logSha256:hash(text)};report.groups.push(group);console.log(JSON.stringify(group));
}
report.sourceStable=JSON.stringify(before)===JSON.stringify(pins())&&candidate===git('rev-parse','HEAD');report.finishedAtUtc=new Date().toISOString();report.result=report.sourceStable&&report.groups.every(g=>g.exitCode===0)?'PASS_SCOPED':'FAIL_OR_DRIFT';
fs.writeFileSync(path.join(__dirname,portableWord?'backend-portable-word-summary.json':'backend-summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,sourceStable:report.sourceStable}));process.exitCode=report.result==='PASS_SCOPED'?0:1;
