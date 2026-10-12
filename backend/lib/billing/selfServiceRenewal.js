'use strict';
const crypto=require('node:crypto');
const pool=require('../../config/db');
const {decryptSecret}=require('./secrets');
const {getTakbullCredentialsFromEnv,chargeTakbullToken}=require('../payments/takbullClient');
const {getPublicApiBaseUrl}=require('./tenantBillingDefaults');
const {verifyChargedTransaction}=require('../payments/verifySignupPayment');
const {addIsraelCalendarMonths}=require('./calendarMonths');
const {renewalAmount}=require('./signupQuote');

function createSignupRenewal({database=pool,charge=chargeTakbullToken,verify=verifyChargedTransaction,credentials=getTakbullCredentialsFromEnv,now=()=>new Date()}={}) {
    async function markPastDue(tenantId) {
        const failedAt=now();
        // A retry or provider uncertainty must not reset the first grace window.
        await database.query(`UPDATE firm_billing SET
            status=CASE WHEN status='suspended' THEN 'suspended' ELSE 'past_due' END,
            grace_until=coalesce(grace_until,$2::timestamptz+interval '72 hours'),
            last_failed_at=coalesce(last_failed_at,$2),last_payment_error='התשלום לא הושלם. יש לבדוק את אמצעי התשלום',updated_at=now()
            WHERE law_firm_tenant_id=$1 AND billing_enabled AND renews_at<=$2
            AND (complimentary_until IS NULL OR complimentary_until<=$2)`,[tenantId,failedAt]);
    }
    async function renew(tenantId) {
        const c=await database.connect();let intent,account,card;
        try {
            await c.query('BEGIN');
            account=(await c.query(`SELECT b.* FROM firm_billing b WHERE law_firm_tenant_id=$1 FOR UPDATE`,[tenantId])).rows[0];
            const consent=(await c.query("SELECT id,consent_version,recurring_amount_ils FROM signup_intents WHERE law_firm_tenant_id=$1 AND status='completed' AND consent_version IN ('signup-1ils-3months-v1','signup-1ils-3months-v2')",[tenantId])).rows[0];
            if(!consent){await c.query('COMMIT');return {handled:false};}
            if(!account?.billing_enabled||account.auto_renew===false||!account.renews_at||new Date(account.renews_at)>now()||new Date(account.complimentary_until||0)>now()) {
                await c.query('COMMIT');return {handled:true,skipped:true,reason:'not_due_or_cancelled'};
            }
            const prior=(await c.query('SELECT status FROM firm_payment_intents WHERE law_firm_tenant_id=$1 AND signup_cycle_at=$2',[tenantId,account.renews_at])).rows[0];
            if(prior){await c.query('COMMIT');return {handled:true,skipped:true,status:prior.status};}
            card=(await c.query('SELECT token_encrypted FROM firm_payment_methods WHERE law_firm_tenant_id=$1 AND is_active',[tenantId])).rows[0];
            if(!card||!credentials())throw Error('SIGNUP_BILLING_NOT_CONFIGURED');
            const amount=renewalAmount(account,consent);
            if(!Number.isFinite(amount)||amount<=0)throw Error('SIGNUP_BILLING_AMOUNT_REQUIRED');
            intent=(await c.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,order_reference,signup_cycle_at,purpose)
                VALUES($1,$2,'renewal','pending',$3,$4,$5,'חידוש מנוי משפטית') RETURNING *`,[crypto.randomUUID(),tenantId,amount,'signup-renewal-'+crypto.randomUUID(),account.renews_at])).rows[0];
            await c.query('COMMIT');
        } catch(e){await c.query('ROLLBACK');if(account)await markPastDue(tenantId);throw e;} finally {c.release();}
        try {
            // Cancellation and final dispatch share the account lock. A committed
            // intent survives a crash even if the provider result remains unknown.
            const dispatch=await database.connect();let result;
            try{
                await dispatch.query('BEGIN');
                const current=(await dispatch.query('SELECT billing_enabled,auto_renew FROM firm_billing WHERE law_firm_tenant_id=$1 FOR UPDATE',[tenantId])).rows[0];
                if(!current?.billing_enabled||current.auto_renew===false){
                    await dispatch.query("UPDATE firm_payment_intents SET status='cancelled',updated_at=now() WHERE id=$1",[intent.id]);
                    await dispatch.query('COMMIT');return {handled:true,skipped:true,reason:'cancelled_before_dispatch'};
                }
                result=await charge({credentials:credentials(),orderReference:intent.order_reference,amount:Number(intent.amount_ils),currency:'ILS',
                    cardExternalToken:decryptSecret(card.token_encrypted),ipnAddress:getPublicApiBaseUrl()+'/api/webhooks/payments/takbull',purpose:'חידוש מנוי MelaMedia משפטית'});
                if(result.transactionInternalNumber)await dispatch.query('UPDATE firm_payment_intents SET takbull_transaction_id=$2,updated_at=now() WHERE id=$1',[intent.id,result.transactionInternalNumber]);
                await dispatch.query('COMMIT');
            }catch(e){await dispatch.query('ROLLBACK');throw e;}finally{dispatch.release();}
            if(!result.ok){
                await database.query("UPDATE firm_payment_intents SET status='failed',error_message='החיוב נדחה. נדרש טיפול לפני ניסיון נוסף',updated_at=now() WHERE id=$1",[intent.id]);
                await markPastDue(tenantId);
                return {handled:true,status:'failed'};
            }
            if(!result.transactionInternalNumber)throw Error('SIGNUP_RENEWAL_OUTCOME_UNKNOWN');
            await verify(credentials(),result.transactionInternalNumber,Number(intent.amount_ils));
            const client=await database.connect();
            try {
                await client.query('BEGIN');
                await client.query("UPDATE firm_payment_intents SET status='succeeded',takbull_transaction_id=$2,settled_at=now(),updated_at=now(),error_message=null WHERE id=$1",[intent.id,result.transactionInternalNumber]);
                const from=new Date(Math.max(now().getTime(),new Date(account.renews_at).getTime()));
                const end=addIsraelCalendarMonths(from,account.billing_interval==='yearly'?12:1);
                await client.query("UPDATE firm_billing SET status='active',last_paid_at=now(),renews_at=$2,last_payment_error=null,last_failed_at=null,grace_until=null,updated_at=now() WHERE law_firm_tenant_id=$1",[tenantId,end]);
                await client.query('COMMIT');
            } catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
            return {handled:true,status:'succeeded'};
        } catch(e){
            await markPastDue(tenantId);
            // The committed cycle remains reserved after a timeout or crash.
            await database.query("UPDATE firm_payment_intents SET error_message='תוצאת החיוב דורשת בירור; אין לחייב שוב',updated_at=now() WHERE id=$1 AND status='pending'",[intent.id]);
            throw e;
        }
    }
    async function due(){
        const rows=(await require('../tenant/databaseScope').withSystem(()=>database.query(`SELECT b.law_firm_tenant_id id FROM firm_billing b JOIN signup_intents s ON s.law_firm_tenant_id=b.law_firm_tenant_id
          WHERE s.status='completed' AND s.consent_version IN ('signup-1ils-3months-v1','signup-1ils-3months-v2') AND b.billing_enabled AND b.auto_renew AND b.renews_at<=$1
          AND (b.complimentary_until IS NULL OR b.complimentary_until<=$1) ORDER BY b.renews_at LIMIT 100`,[now()]))).rows;
        const result=[];for(const r of rows){try{result.push({id:r.id,...await require('../tenant/tenantContext').runWithTenant({id:r.id},()=>renew(r.id))});}catch{result.push({id:r.id,handled:true,status:'needs_review'});}}return result;
    }
    return {renew,due};
}
module.exports={createSignupRenewal,signupRenewal:createSignupRenewal()};
