'use strict';
const { inviteLink } = require('./validation');

function createGroupWorker(service) {
    const { pool, tx, connection, provider, env } = service;
    function canDispatch(c, job) {
        return c?.enabled && c.settings.mode === job.mode && (job.mode === 'demo' ||
            (env.WHATSAPP_DEMO_ONLY !== 'true' && env.WHATSAPP_LIVE_ENABLED === 'true' && c.status === 'ready' && c.secret_ciphertext &&
             c.phone_number_id === job.phone_number_id && c.waba_id === job.waba_id &&
             (!c.token_expires_at || new Date(c.token_expires_at) > new Date())));
    }
    async function processOffice(tenantId, { demoOnly = false, caseId = null } = {}) {
        // A crashed/unknown remote mutation is never blindly retried.
        await pool.query(`UPDATE case_whatsapp_groups SET status='uncertain',error_code='RESULT_UNKNOWN',updated_at=now()
            WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND status IN ('creating','awaiting_webhook') AND updated_at<now()-interval '10 minutes'`, [tenantId]);
        const claimed = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c?.enabled) return null;
            const job = (await db.query(`SELECT * FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1
                AND status='queued' AND ($2=false OR mode='demo') AND ($3::integer IS NULL OR case_id=$3)
                ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [tenantId, demoOnly, caseId])).rows[0];
            if (!job) return null;
            if (!canDispatch(c, job) || !job.recipients.some(r => r.status === 'pending')) {
                await db.query(`UPDATE case_whatsapp_groups SET status='cancelled',error_code='CONNECTION_CHANGED',updated_at=now() WHERE id=$1`, [job.id]); return null;
            }
            await db.query(`UPDATE case_whatsapp_groups SET status='creating',updated_at=now() WHERE id=$1`, [job.id]);
            return job;
        });
        if (claimed) await tx(async db => {
            // Recheck after claiming; toggling off takes the conflicting connection lock.
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            const job = (await db.query('SELECT * FROM case_whatsapp_groups WHERE id=$1 FOR UPDATE', [claimed.id])).rows[0];
            if (!job || job.status !== 'creating') return;
            if (!canDispatch(c, job) || !job.recipients.some(r => r.status === 'pending')) {
                await db.query(`UPDATE case_whatsapp_groups SET status='cancelled',updated_at=now() WHERE id=$1`, [job.id]); return;
            }
            if (job.mode === 'demo') {
                await db.query(`UPDATE case_whatsapp_groups SET status='simulated',recipients=$2,updated_at=now() WHERE id=$1`, [job.id, JSON.stringify(job.recipients.map(r => ({ ...r, status: 'simulated' })))]);
                return; // No fake WhatsApp URL and no external call.
            }
            try {
                const result = await provider.createGroup(c, service.token(c), job);
                await db.query(`UPDATE case_whatsapp_groups SET status='awaiting_webhook',request_id=$2,updated_at=now() WHERE id=$1`, [job.id, result.request_id || null]);
            } catch (e) {
                await db.query(`UPDATE case_whatsapp_groups SET status=$2,error_code=$3,updated_at=now() WHERE id=$1`, [job.id, e.uncertain ? 'uncertain' : 'failed', e.uncertain ? 'RESULT_UNKNOWN' : 'META_CREATE_FAILED']);
            }
        });
        if (demoOnly) return;
        // One invitation at a time, persisted before the remote call. Failure is visible;
        // automatic retry could send duplicate invitations after an ambiguous timeout.
        const invitation = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c?.enabled) return null;
            const job = (await db.query(`SELECT * FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND mode='live' AND status='created' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [tenantId])).rows[0];
            if (!job || !canDispatch(c, job)) return null;
            // Another process may be delivering a claimed invitation. A crash is
            // reported as unknown after ten minutes, never retried automatically.
            if (job.recipients.some(r => r.status === 'sending')) {
                if (new Date(job.updated_at).getTime() > Date.now() - 600000) return null;
                for (const r of job.recipients) if (r.status === 'sending') r.status = 'uncertain';
            }
            const recipient = job.recipients.find(r => r.status === 'pending');
            if (!recipient) {
                const allSent = job.recipients.every(r => r.status === 'sent');
                await db.query(`UPDATE case_whatsapp_groups SET status=$2,recipients=$3,updated_at=now() WHERE id=$1`, [job.id, allSent ? 'invitations_sent' : 'needs_attention', JSON.stringify(job.recipients)]); return null;
            }
            recipient.status = 'sending';
            await db.query('UPDATE case_whatsapp_groups SET recipients=$2,updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.recipients)]);
            return { id: job.id, phone: recipient.phone };
        });
        if (invitation) await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            const job = (await db.query('SELECT * FROM case_whatsapp_groups WHERE id=$1 FOR UPDATE', [invitation.id])).rows[0];
            if (!job || job.status !== 'created') return;
            const recipient = job.recipients.find(r => r.phone === invitation.phone);
            if (recipient?.status !== 'sending') return;
            if (!canDispatch(c, job)) recipient.status = 'cancelled';
            else {
                try {
                    const result = await provider.invite(c, service.token(c), job, recipient.phone);
                    recipient.status = result.messages?.[0]?.id ? 'sent' : 'uncertain';
                } catch (e) { recipient.status = e.uncertain ? 'uncertain' : 'failed'; }
            }
            const finished = !job.recipients.some(r => r.status === 'pending');
            const status = finished ? (job.recipients.every(r => r.status === 'sent') ? 'invitations_sent' : 'needs_attention') : 'created';
            await db.query('UPDATE case_whatsapp_groups SET recipients=$2,status=$3,updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.recipients), status]);
        });
    }
    async function receiveLifecycle(tenantId, connectionId, wabaId, phoneId, events) {
        await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c || c.id !== connectionId || c.phone_number_id !== phoneId || c.waba_id !== wabaId || !c.secret_ciphertext) return;
            for (const event of events) {
                if (event.type !== 'group_create' || typeof event.subject !== 'string') continue;
                const job = (await db.query(`SELECT * FROM case_whatsapp_groups WHERE connection_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND subject=$3 AND mode='live' AND phone_number_id=$4 AND waba_id=$5 FOR UPDATE`, [c.id, tenantId, event.subject, phoneId, wabaId])).rows[0];
                if (!job || !['creating','awaiting_webhook','uncertain'].includes(job.status)) continue;
                if (job.request_id && event.request_id !== job.request_id) continue;
                if (event.errors?.length) {
                    await db.query(`UPDATE case_whatsapp_groups SET status='failed',error_code='META_CREATE_FAILED',updated_at=now() WHERE id=$1`, [job.id]); continue;
                }
                const link = inviteLink(event.invite_link);
                if (!link || typeof event.group_id !== 'string' || event.group_id.length > 256) continue;
                const status = canDispatch(c, job) && job.recipients.some(r => r.status === 'pending') ? 'created' : 'cancelled';
                await db.query(`UPDATE case_whatsapp_groups SET status=$4,group_id=$2,invite_link=$3,error_code=NULL,updated_at=now() WHERE id=$1`, [job.id, event.group_id, link, status]);
                // Do not call the legacy linking handler: it also sends client notifications.
                await db.query(`UPDATE cases SET whatsappgrouplink=$2,updatedat=now() WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $3 AND integration_demo=false AND COALESCE(whatsappgrouplink,'')=''`, [job.case_id, link, tenantId]);
            }
        });
    }
    return { processOffice, receiveLifecycle };
}
module.exports = { createGroupWorker };
