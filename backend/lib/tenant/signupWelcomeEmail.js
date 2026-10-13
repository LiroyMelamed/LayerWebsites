'use strict';
const { renderWelcome, validEmail } = require('./signupWelcomeTemplate');
const { withSystem } = require('./databaseScope');

async function deliverWelcome(payload, id) {
    const suppressed = require('../qaOutboundNoop').qaOutboundNoop('email');
    if (suppressed || (process.env.IS_PRODUCTION !== 'true' && process.env.FORCE_SEND_EMAIL_ALL !== 'true')) return { status:'simulated' };
    const { SMTP_HOST:host, SMTP_USER:user, SMTP_PASS:pass, SMTP_FROM_EMAIL:from } = process.env;
    if (!host || !user || !pass || !validEmail(from) || !/@(?:mela-media|melamedia)\.co\.il$/i.test(from)) return { status:'retry', code:'SMTP_NOT_CONFIGURED' };
    if (!validEmail(payload.toEmail)) return { status:'failed', code:'INVALID_EMAIL' };
    const mail = renderWelcome(payload);
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = require('nodemailer').createTransport({host, port, secure:port === 465, auth:{user,pass}, connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    try {
        const result = await transport.sendMail({ from:{name:'MelaMedia | מלמדיה',address:from}, to:payload.toEmail,
            messageId:`<legal-welcome-${id}@mela-media.co.il>`, ...mail });
        if (!result.accepted?.length) return {status:'failed',code:'SMTP_REJECTED'};
        return {status:'sent'};
    } catch (error) {
        // A positive rejection or pre-envelope failure is safe to retry. A timeout
        // after DATA may already be accepted: keep it for review, never resend blindly.
        const rejected = Number(error.responseCode) >= 400;
        const preEnvelope = ['CONN','AUTH','EHLO','HELO','STARTTLS','MAIL FROM','RCPT TO'].includes(error.command);
        return {status:rejected || preEnvelope ? 'retry':'uncertain',code:rejected?'SMTP_REJECTED':preEnvelope?'SMTP_CONNECTION_FAILED':'SMTP_OUTCOME_UNKNOWN'};
    } finally { transport.close(); }
}

function createWelcomeDispatcher({ database = require('../../config/db'), deliver = deliverWelcome } = {}) {
    async function flush(id = null) {
        return withSystem(async () => {
            // A process can die after SMTP acceptance. Such reservations require
            // inspection of provider logs before an explicit manual retry.
            const stale = await database.query(`UPDATE signup_intents SET welcome_email_status='uncertain',welcome_email_error='DISPATCH_INTERRUPTED',welcome_email_updated_at=now()
                WHERE welcome_email_status='sending' AND welcome_email_updated_at < now()-interval '5 minutes' RETURNING id`);
            if (stale.rowCount) console.error('[signup-welcome] delivery requires review', {count:stale.rowCount});
            let processed = 0;
            for (let i=0;i<(id ? 1 : 20);i++) {
                const claim = await database.query(`UPDATE signup_intents SET welcome_email_status='sending',welcome_email_attempts=welcome_email_attempts+1,welcome_email_updated_at=now()
                    WHERE id=(SELECT id FROM signup_intents WHERE status='completed' AND welcome_email_status='pending'
                      AND welcome_email IS NOT NULL AND (welcome_email_next_at IS NULL OR welcome_email_next_at<=now())
                      AND ($1::uuid IS NULL OR id=$1) ORDER BY completed_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                    RETURNING id,welcome_email,welcome_email_attempts`,[id]);
                const row = claim.rows[0]; if (!row) break;
                let result;
                try { result=await deliver(row.welcome_email,row.id); }
                catch (_) { result={status:'uncertain',code:'UNEXPECTED_DELIVERY_ERROR'}; }
                const retry = result.status==='retry' || result.status==='simulated';
                const status = result.status==='sent' ? 'sent' : result.status==='uncertain' ? 'uncertain' : retry && row.welcome_email_attempts<5 ? 'pending':'failed';
                await database.query(`UPDATE signup_intents SET welcome_email_status=$2,welcome_email_error=$3,welcome_email_updated_at=now(),
                    welcome_email_next_at=now()+interval '15 minutes',welcome_email_sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END
                    WHERE id=$1 AND welcome_email_status='sending'`,[row.id,status,result.code || (result.status==='simulated'?'DELIVERY_SUPPRESSED':null)]);
                console[status==='failed'||status==='uncertain'?'error':'info']('[signup-welcome]',{id:row.id,status});
                processed++;
            }
            return {processed};
        });
    }
    return {flush};
}
let dispatcher;
function flushWelcome(id) { dispatcher ||= createWelcomeDispatcher(); return dispatcher.flush(id); }
function startWelcomeWorker() {
    if (!require('./tenantContext').isMultiTenantMode() || !require('./signupAvailability').signupAvailable()) return;
    let running=false;
    const tick=async()=>{if(running)return;running=true;try{await flushWelcome();}catch(_){console.error('[signup-welcome] worker failed');}finally{running=false;}};
    const timer=setInterval(tick,60000); timer.unref?.();
    setTimeout(tick,5000).unref?.();
}
module.exports = {createWelcomeDispatcher,deliverWelcome,flushWelcome,startWelcomeWorker};
