
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
