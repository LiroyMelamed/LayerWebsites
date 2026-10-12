'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const servicePath=require.resolve('../lib/tenant/signupService');let calls=0;
require.cache[servicePath]={id:servicePath,filename:servicePath,loaded:true,exports:{
 createSignupIntent:async()=>{calls++;return {id:'synthetic'};},
 createSignupCheckout:async()=>{calls++;return {};},
 completeSignupWithoutPayment:async()=>{calls++;return {};},
 syncSignup:async()=>{calls++;return {};},
 getSignupIntent:async()=>({id:'synthetic',slug:'qa',status:'pending_payment',adminEmail:'private@example.invalid',adminPhone:'private',firmName:'private'}),
}};
const router=require('../routes/publicSignupRoutes');
test('closed shared signup cannot create an order or office; status exposes no contact data',async()=>{
 const before=process.env.SELF_SERVICE_SIGNUP_ENABLED;delete process.env.SELF_SERVICE_SIGNUP_ENABLED;
 const app=express();app.use(express.json());app.use('/api/public/signup',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api/public/signup`;
 try{
  // Service-level protection also covers callbacks and direct background callers.
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),mod={exports:{}};
  const filename=path.resolve(__dirname,'../lib/tenant/signupService.js');
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:mod,process:{env:{}},require(id){
   if(id==='./signupAvailability')return require('../lib/tenant/signupAvailability');
   if(id==='node:crypto')return require(id);
   return {};
  }});
  for(const [name,arg] of [['createSignupIntent',{}],['createSignupCheckout','synthetic'],['provisionTenantFromSignup','synthetic']])await assert.rejects(mod.exports[name](arg),{code:'SIGNUP_NOT_AVAILABLE'});
  const config=await fetch(base+'/config');assert.equal(config.status,200);assert.match(config.headers.get('cache-control'),/no-store/);assert.deepEqual(await config.json(),{available:false,setupAmountIls:1,trialMonths:3,consentVersion:'signup-1ils-3months-v2'});
  for(const path of ['/start','/synthetic/checkout','/synthetic/complete']){const r=await fetch(base+path,{method:'POST'});assert.equal(r.status,503);assert.equal((await r.json()).error,'SIGNUP_NOT_AVAILABLE');}
  const sync=await fetch(base+'/synthetic/sync',{method:'POST'});assert.equal(sync.status,503);assert.equal((await sync.json()).error,'SIGNUP_NOT_AVAILABLE');assert.equal(calls,0);
  const status=await (await fetch(base+'/synthetic/status')).json();assert.deepEqual(Object.keys(status).sort(),['id','loginUrl','slug','status','trialMonths'].sort());
 }finally{await new Promise(resolve=>server.close(resolve));if(before===undefined)delete process.env.SELF_SERVICE_SIGNUP_ENABLED;else process.env.SELF_SERVICE_SIGNUP_ENABLED=before;}
});
