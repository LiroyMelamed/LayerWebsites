'use strict';
process.env.NODE_ENV='test';
process.env.JWT_SECRET='synthetic-billing-identity-test';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');
const pool=require('../config/db'),billing=require('../lib/billing/firmBillingService');
const {getCurrentTenantId}=require('../lib/tenant/tenantContext');
const auth=require('../middlewares/authMiddleware');
const errorHandler=require('../middlewares/errorHandler');

test('missing tenant header cannot bypass the current customer identity billing lock',async()=>{
 const oldQuery=pool.query,oldSnapshot=billing.getBillingSnapshot;
 const tenantId='11223344-1122-3344-5566-778899aabbcc';let checked;
 pool.query=async()=>({rows:[{userid:71,role:'Client',law_firm_tenant_id:tenantId}]});
 billing.getBillingSnapshot=async()=>{checked=getCurrentTenantId();return {locked:checked===tenantId,payUrl:'/owner/payment',graceUntil:new Date()};};
 try{
  const app=express();app.get('/api/Cases',auth,(_q,r)=>r.json({secret:'must not be reached'}));app.get('/api/billing/lock-status',auth,(_q,r)=>r.json({recovery:true,tenantId:getCurrentTenantId()}));app.use(errorHandler);
  const token=jwt.sign({userid:71,role:'Client'},process.env.JWT_SECRET);
  const blocked=await request(app).get('/api/Cases').set('Authorization','Bearer '+token);
  assert.equal(checked,tenantId);assert.equal(blocked.status,503);assert.equal(blocked.body.errorCode,'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(blocked.text,/תשלום|graceUntil|payUrl|secret/);
  const recovery=await request(app).get('/api/billing/lock-status').set('Authorization','Bearer '+token);
  assert.equal(recovery.status,200);assert.equal(recovery.body.tenantId,tenantId);
 }finally{pool.query=oldQuery;billing.getBillingSnapshot=oldSnapshot;}
});
