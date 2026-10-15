const express=require('express'),crypto=require('node:crypto'),pool=require('../config/db');
const router=express.Router();
router.use((req,res,next)=>{
 const key=process.env.BUSINESS_CONTROL_KEY;
 if(!key||key.length<32||key===process.env.CENTRAL_SERVICE_KEY||!crypto.timingSafeEqual(crypto.createHash('sha256').update(req.headers.authorization||'').digest(),crypto.createHash('sha256').update('Bearer '+key).digest()))return res.status(401).json({error:'UNAUTHORIZED'});
 res.set('Cache-Control','no-store');require('../lib/tenant/databaseScope').withSystem(next);
});
router.get('/',async(req,res)=>{try{
 const rows=(await pool.query(`SELECT t.id,t.slug,t.name,b.platform_id,b.resource_id,b.signing_id,b.price_monthly_ils,b.billing_interval,b.status,b.billing_enabled,b.auto_renew,b.renews_at,b.complimentary_until,
 EXISTS(SELECT 1 FROM firm_payment_methods m WHERE m.law_firm_tenant_id=t.id AND m.is_active AND m.token_encrypted IS NOT NULL) card_present,s.consent_version,s.recurring_amount_ils
 FROM law_firm_tenants t LEFT JOIN firm_billing b ON b.law_firm_tenant_id=t.id LEFT JOIN signup_intents s ON s.law_firm_tenant_id=t.id AND s.status='completed' ORDER BY t.id LIMIT 2000`)).rows;
 res.json({productId:'layerwebsites',environment:process.env.PLATFORM_DATA_ENV==='production'?'production':'qa',observedAt:new Date().toISOString(),subscriptions:rows.map(r=>({tenantId:r.id,slug:r.slug,name:r.name,plan:r.platform_id?[r.platform_id,r.resource_id,r.signing_id].join(' / '):null,amountCents:r.price_monthly_ils==null?null:Math.round(require('../lib/billing/signupQuote').renewalAmount(r,r)*100),currency:'ILS',cycle:r.billing_interval||null,status:r.status||'none',billingEnabled:r.billing_enabled===true,autoRenew:r.billing_enabled===true&&r.auto_renew!==false,dueAt:r.renews_at,trialUntil:r.complimentary_until,cardPresent:r.card_present===true,consentVersion:r.consent_version||null,adminUrl:`https://lawyer.mela-media.co.il/${encodeURIComponent(r.slug)}/admin`}))});
}catch{res.status(503).json({error:'BUSINESS_UNAVAILABLE'});}});
router.post('/',async(req,res)=>{try{
 const b=req.body||{};if(b.action!=='stop_renewal'||! /^[a-f0-9-]{36}$/i.test(b.tenantId||'')||! /^[a-f0-9-]{36}$/i.test(b.idempotencyKey||'')||typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.length>500)return res.status(400).json({error:'INVALID_INPUT'});
 const {runWithTenant}=require('../lib/tenant/tenantContext');
 await runWithTenant({id:b.tenantId},()=>require('../lib/billing/firmBillingService').cancelSubscription());
 res.json({ok:true,action:b.action,tenantId:b.tenantId});
}catch{res.status(503).json({error:'BUSINESS_UNAVAILABLE'});}});
module.exports=router;
