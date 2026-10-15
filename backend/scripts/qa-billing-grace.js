'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'55440');assert.equal(process.env.DB_NAME,'signup_legal_qa');
process.env.NODE_ENV='test';process.env.PROVIDER_SECRETS_KEY='synthetic-grace-test-only';
const pool=require('../config/db'),{encryptSecret}=require('../lib/billing/secrets');
const {createSignupRenewal}=require('../lib/billing/selfServiceRenewal');
const {computeFlags}=require('../lib/billing/tenantBillingDefaults');
let clock=new Date('2026-10-12T10:00:00Z'),calls=0,passed=0;
const credentials=()=>({apiKey:'synthetic',apiSecret:'synthetic'}),now=()=>clock;
const service=(mode)=>createSignupRenewal({database:pool,credentials,now,charge:async()=>{calls++;if(mode==='unknown')throw Error('synthetic timeout');return {ok:mode==='success',transactionInternalNumber:mode==='success'?'synthetic-verified-tx':null};},verify:async()=>{}});
async function check(label,fn){await fn();passed++;console.log(JSON.stringify({label,status:'PASS'}));}
async function fixture(card=true){
 const id=crypto.randomUUID(),slug='qa-grace-'+id;
 await pool.query("INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,'Synthetic grace QA')",[id,slug]);
 await pool.query("INSERT INTO signup_intents(slug,firm_name,admin_name,admin_phone,law_firm_tenant_id,status,consent_version,recurring_amount_ils) VALUES($1,'Synthetic grace QA','QA owner','0500000091',$2,'completed','signup-1ils-3months-v2',532)",[slug,id]);
 await pool.query("INSERT INTO firm_billing(law_firm_tenant_id,price_monthly_ils,status,billing_enabled,renews_at) VALUES($1,532,'active',true,$2)",[id,new Date(clock.getTime()-60000)]);
 if(card)await pool.query("INSERT INTO firm_payment_methods(provider,token_encrypted,law_firm_tenant_id,is_active) VALUES('takbull',$1,$2,true)",[encryptSecret('synthetic-token'),id]);
 return id;
}
async function row(id){return (await pool.query('SELECT * FROM firm_billing WHERE law_firm_tenant_id=$1',[id])).rows[0];}
const flags=(r,at=clock)=>computeFlags({billingEnabled:r.billing_enabled,status:r.status,complimentaryUntil:r.complimentary_until,graceUntil:r.grace_until,autoRenew:r.auto_renew,priceMonthlyIls:r.price_monthly_ils,renewsAt:r.renews_at},at);
(async()=>{try{
 const id=await fixture(),decline=service('decline');let first;
 await check('decline starts exactly72h grace without blocking or disabling tenant',async()=>{assert.equal((await decline.renew(id)).status,'failed');first=await row(id);assert.equal(first.status,'past_due');assert.equal(+first.grace_until,+clock+72*3600000);assert.equal(flags(first).locked,false);assert.equal((await pool.query('SELECT is_active FROM law_firm_tenants WHERE id=$1',[id])).rows[0].is_active,true);});
 await check('retries keep the same grace deadline and cannot charge twice',async()=>{const n=calls;clock=new Date(+clock+24*3600000);await Promise.all([decline.renew(id),decline.renew(id)]);assert.equal(calls,n);assert.equal(+(await row(id)).grace_until,+first.grace_until);});
 await check('grace locks exactly at expiry and preserves all billing and tenant rows',async()=>{assert.equal(flags(await row(id),new Date(+first.grace_until-1)).locked,false);assert.equal(flags(await row(id),first.grace_until).locked,true);assert.equal((await pool.query('SELECT count(*)::int n FROM signup_intents WHERE law_firm_tenant_id=$1',[id])).rows[0].n,1);assert.equal((await pool.query('SELECT count(*)::int n FROM firm_payment_methods WHERE law_firm_tenant_id=$1',[id])).rows[0].n,1);});
 await check('missing card starts grace but never sends a provider request',async()=>{const tid=await fixture(false),n=calls;await assert.rejects(service('success').renew(tid),/NOT_CONFIGURED/);const deadline=+(await row(tid)).grace_until;clock=new Date(+clock+3600000);await assert.rejects(service('success').renew(tid));assert.equal(+(await row(tid)).grace_until,deadline);assert.equal(calls,n);});
 await check('uncertain provider outcome reserves cycle and starts grace without duplicate retry',async()=>{const tid=await fixture(),s=service('unknown');await assert.rejects(s.renew(tid));const n=calls;assert.equal((await row(tid)).status,'past_due');assert.equal((await s.renew(tid)).status,'pending');assert.equal(calls,n);});
 await check('verified success clears failure and reopens suspended access without deleting records',async()=>{const tid=await fixture();await pool.query("UPDATE firm_billing SET status='suspended',grace_until=$2,last_payment_error='synthetic',last_failed_at=$2 WHERE law_firm_tenant_id=$1",[tid,new Date(+clock-1000)]);assert.equal(flags(await row(tid)).locked,true);assert.equal((await service('success').renew(tid)).status,'succeeded');const r=await row(tid);assert.equal(r.status,'active');assert.equal(r.grace_until,null);assert.equal(r.last_failed_at,null);assert.equal(flags(r).locked,false);assert.ok(r.renews_at>clock);});
 await check('stopped renewal preserves paid access and card, then locks after grace without a charge',async()=>{
  const tid=await fixture(),n=calls;const paidUntil=new Date(+clock+24*3600000);
  await pool.query("UPDATE firm_billing SET auto_renew=false,renews_at=$2 WHERE law_firm_tenant_id=$1",[tid,paidUntil]);
  assert.equal(flags(await row(tid)).locked,false);
  clock=new Date(+paidUntil+72*3600000);assert.equal(flags(await row(tid)).locked,true);
  assert.equal((await service('success').renew(tid)).skipped,true);assert.equal(calls,n);
  assert.equal((await row(tid)).billing_enabled,true);
  assert.equal((await pool.query('SELECT is_active FROM firm_payment_methods WHERE law_firm_tenant_id=$1',[tid])).rows[0].is_active,true);
 });
 console.log(JSON.stringify({passed,provider:'mock only',productionWrites:0,retainedFixtures:'Synthetic grace QA in owned local QA only'}));
}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
