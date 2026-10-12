process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const billing=require('../lib/billing/firmBillingService');
const settings=require('../services/settingsService');
const controller=require('../controllers/billingController');
function response(){return{code:200,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){}};}
test('client lock status contains no payment reason, deadline, amount or pay link',async()=>{
 const old=billing.getBillingSnapshot,admin=settings.isPlatformAdmin;
 billing.getBillingSnapshot=async()=>({locked:true,status:'past_due',graceUntil:'2026-10-15',payUrl:'/private/pay',complimentaryUntil:'2026-10-12'});
 settings.isPlatformAdmin=async()=>true;
 try{const res=response();await controller.getLockStatus({user:{UserId:17,Role:'Client'}},res);assert.deepEqual(res.body,{locked:true,canManageBilling:false});}
 finally{billing.getBillingSnapshot=old;settings.isPlatformAdmin=admin;}
});
test('verified authorized business owner receives recovery details',async()=>{
 const old=billing.getBillingSnapshot,admin=settings.isPlatformAdmin;
 billing.getBillingSnapshot=async()=>({locked:true,status:'past_due',graceUntil:'2026-10-15',payUrl:'/private/pay'});settings.isPlatformAdmin=async()=>true;
 try{const res=response();await controller.getLockStatus({user:{UserId:18,Role:'Admin'}},res);assert.equal(res.body.canManageBilling,true);assert.equal(res.body.graceUntil,'2026-10-15');assert.equal(res.body.payUrl,'/private/pay');}
 finally{billing.getBillingSnapshot=old;settings.isPlatformAdmin=admin;}
});
