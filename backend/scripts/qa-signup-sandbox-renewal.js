'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'55440');assert.equal(process.env.DB_NAME,'signup_legal_qa');
assert.equal(process.env.TAKBULL_MODE,'test');assert.equal(process.env.SIGNUP_SANDBOX_APPROVED,'1');
assert.ok(process.env.AUTHORIZED_TEST_API_KEY);assert.equal(process.env.TEST_TAKBULL_API_KEY,process.env.AUTHORIZED_TEST_API_KEY);
const pool=require('../config/db'),{createSignupRenewal}=require('../lib/billing/selfServiceRenewal');
const evidence=process.env.SIGNUP_QA_EVIDENCE_DIR;assert.ok(evidence.endsWith('/signup-implementation-20261011'));
const source=JSON.parse(fs.readFileSync(evidence+'/legal-sandbox-checkout.json')).intentId;
(async()=>{
const id=crypto.randomUUID(),slug='qa-renewal-'+id,service=createSignupRenewal();
try{
 const original=(await pool.query(`SELECT m.token_encrypted FROM signup_intents s JOIN firm_payment_methods m ON m.law_firm_tenant_id=s.law_firm_tenant_id
  WHERE s.id=$1 AND s.status='completed' AND s.slug LIKE 'qa-%' AND m.is_active`,[source])).rows[0];
 assert.ok(original?.token_encrypted?.startsWith('enc:v1:'));
 await pool.query("INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,'QA sandbox renewal')",[id,slug]);
 await pool.query(`INSERT INTO signup_intents(slug,firm_name,admin_name,admin_phone,law_firm_tenant_id,status,consent_version,consented_at,completed_at)
  VALUES($1,'QA renewal','QA owner','0500000013',$2,'completed','signup-1ils-3months-v1',now(),now())`,[slug,id]);
 await pool.query(`INSERT INTO firm_billing(law_firm_tenant_id,platform_id,resource_id,signing_id,price_monthly_ils,billing_interval,status,billing_enabled,complimentary_until,renews_at)
  VALUES($1,'site_app','pro','500',1,'monthly','complimentary',true,now()+interval '3 months',now()+interval '3 months')`,[id]);
 await pool.query("INSERT INTO firm_payment_methods(provider,token_encrypted,law_firm_tenant_id,is_active) VALUES('takbull',$1,$2,true)",[original.token_encrypted,id]);
 assert.equal((await service.renew(id)).skipped,true);
 assert.equal((await pool.query('SELECT count(*)::int n FROM firm_payment_intents WHERE law_firm_tenant_id=$1',[id])).rows[0].n,0);
 await pool.query("UPDATE firm_billing SET complimentary_until=now()-interval '1 minute',renews_at=now()-interval '1 minute' WHERE law_firm_tenant_id=$1",[id]);
 const results=await Promise.allSettled(Array.from({length:3},()=>service.renew(id)));
 const intents=(await pool.query('SELECT status,amount_ils,takbull_transaction_id IS NOT NULL verified_tx FROM firm_payment_intents WHERE law_firm_tenant_id=$1',[id])).rows;
 console.log(JSON.stringify({tenantId:id,results:results.map(r=>r.status==='fulfilled'?r.value:{error:r.reason.message}),intents}));
 assert.equal(intents.length,1);assert.equal(intents[0].status,'succeeded');assert.equal(Number(intents[0].amount_ils),1);assert.equal(intents[0].verified_tx,true);
 await pool.query('UPDATE firm_billing SET billing_enabled=false WHERE law_firm_tenant_id=$1',[id]);
 assert.equal((await service.renew(id)).skipped,true);
 console.log('PASS: early charge blocked, saved test token charged exactly 1 ILS once under concurrency, verified provider transaction, cancellation blocks renewal.');
}finally{await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
