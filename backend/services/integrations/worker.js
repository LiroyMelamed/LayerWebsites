'use strict';
const { inviteLink } = require('./validation');
const { deliveryAllowed } = require('./deliveryPolicy');

function createGroupWorker(service) {
    const { pool, tx, connection, provider, env } = service;
    function canDispatch(c, job) {
        return c?.enabled && c.settings.mode === job.mode && (job.mode === 'demo' ||
            (deliveryAllowed(env) && c.settings.connectionType !== 'business_app' && c.status === 'ready' && c.secret_ciphertext &&
             c.phone_number_id === job.phone_number_id && c.waba_id === job.waba_id &&
             (!c.token_expires_at || new Date(c.token_expires_at) > new Date())));
    }
    async function lockCaseJob(db, tenantId, candidate) {
        if (!candidate) return null;
        // Every delivery phase uses connection -> case -> job. A manual case-link
        // update then serializes with the final check and the external mutation.
        const record = (await db.query(`SELECT caseid,whatsappgrouplink FROM cases
            WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [candidate.case_id, tenantId])).rows[0];
        const job = (await db.query(`SELECT * FROM case_whatsapp_groups
            WHERE id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [candidate.id, tenantId])).rows[0];
        return job && job.case_id === candidate.case_id ? { job, record } : null;
    }
    function hasOtherLink(record, expectedLink) {
        if (!record) return true;
        const current = typeof record.whatsappgrouplink === 'string' ? record.whatsappgrouplink.trim() : '';
        return Boolean(current && (!expectedLink || inviteLink(current) !== expectedLink));
    }
    function wasManuallyReplaced(job) {
        return job.error_code === 'MANUAL_GROUP_LINKED' || job.recipients.some(r => r.groupLinkReplaced === true);
    }
    async function cancelForCaseLink(db, tenantId, job, claimedPhone = null, preserveCreation = false) {
        // A pending recipient is definitely unsent. Only this dispatch's own claim
        // can be cancelled as unsent; an older abandoned claim stays uncertain.
        // Persist revocation separately from error_code: unresolved creation must
        // retain RESULT_UNKNOWN, including after the manual case link is cleared.
        const recipients = job.recipients.map(r => ({ ...r, groupLinkReplaced: true,
            status: r.status === 'pending' ? 'cancelled' : r.status === 'sending' ?
                (r.phone === claimedPhone ? 'cancelled' : 'uncertain') : r.status }));
        const status = preserveCreation ? job.status : recipients.some(r => ['sent','uncertain'].includes(r.status)) ? 'needs_attention' : 'cancelled';
        const errorCode = preserveCreation && job.error_code ? job.error_code : 'MANUAL_GROUP_LINKED';
        await db.query(`UPDATE case_whatsapp_groups SET status=$3,recipients=$4,error_code=$5,updated_at=now()
            WHERE id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2`, [job.id, tenantId, status, JSON.stringify(recipients), errorCode]);
    }
    async function processOffice(tenantId, { demoOnly = false, caseId = null } = {}) {
        // A crashed/unknown remote mutation is never blindly retried.
        await pool.query(`UPDATE case_whatsapp_groups SET status='uncertain',error_code='RESULT_UNKNOWN',updated_at=now()
            WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND status IN ('creating','awaiting_webhook') AND updated_at<now()-interval '10 minutes'`, [tenantId]);
        // A manual link also revokes invitations while remote creation is still
        // unresolved. Keep that remote status/request observable for its callback.
        await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c) return;
            const candidate = (await db.query(`SELECT j.id,j.case_id FROM case_whatsapp_groups j JOIN cases c
                ON c.caseid=j.case_id AND c.law_firm_tenant_id IS NOT DISTINCT FROM j.law_firm_tenant_id
                WHERE j.law_firm_tenant_id IS NOT DISTINCT FROM $1 AND j.status IN ('creating','awaiting_webhook','uncertain')
                AND COALESCE(btrim(c.whatsappgrouplink),'')<>'' AND btrim(c.whatsappgrouplink)<>COALESCE(j.invite_link,'')
                AND EXISTS(SELECT 1 FROM jsonb_array_elements(j.recipients) r WHERE r->>'status'='pending')
                ORDER BY j.created_at LIMIT 1`, [tenantId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (locked && ['creating','awaiting_webhook','uncertain'].includes(locked.job.status) && hasOtherLink(locked.record, locked.job.invite_link))
                await cancelForCaseLink(db, tenantId, locked.job, null, true);
        });
        const claimed = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c?.enabled) return null;
            const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1
                AND status='queued' AND ($2=false OR mode='demo') AND ($3::integer IS NULL OR case_id=$3)
                ORDER BY created_at LIMIT 1`, [tenantId, demoOnly, caseId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (!locked || locked.job.status !== 'queued') return null;
            const { job, record } = locked;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return null; }
            if (!canDispatch(c, job) || !job.recipients.some(r => r.status === 'pending')) {
                await db.query(`UPDATE case_whatsapp_groups SET status='cancelled',error_code='CONNECTION_CHANGED',updated_at=now() WHERE id=$1`, [job.id]); return null;
            }
            await db.query(`UPDATE case_whatsapp_groups SET status='creating',updated_at=now() WHERE id=$1`, [job.id]);
            return job;
        });
        if (claimed) await tx(async db => {
            // Recheck after claiming; toggling off takes the conflicting connection lock.
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            const locked = await lockCaseJob(db, tenantId, claimed);
            if (!locked || locked.job.status !== 'creating') return;
            const { job, record } = locked;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return; }
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
            const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND mode='live' AND status='created' ORDER BY created_at LIMIT 1`, [tenantId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (!locked || locked.job.status !== 'created') return null;
            const { job, record } = locked;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return null; }
            if (!canDispatch(c, job)) return null;
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
            return { id: job.id, case_id: job.case_id, phone: recipient.phone };
        });
        if (invitation) await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            const locked = await lockCaseJob(db, tenantId, invitation);
            if (!locked || locked.job.status !== 'created') return;
            const { job, record } = locked;
            const recipient = job.recipients.find(r => r.phone === invitation.phone);
            if (recipient?.status !== 'sending') return;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job, invitation.phone); return; }
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
        // Commit each event separately: a webhook batch must never hold case A
        // while waiting for case B, in the reverse order of another callback.
        for (const event of events) {
            if (event.type !== 'group_create' || typeof event.subject !== 'string') continue;
            await tx(async db => {
                const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
                if (!c || c.id !== connectionId || c.phone_number_id !== phoneId || c.waba_id !== wabaId || !c.secret_ciphertext) return;
                const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE connection_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND subject=$3 AND mode='live' AND phone_number_id=$4 AND waba_id=$5`, [c.id, tenantId, event.subject, phoneId, wabaId])).rows[0];
                const locked = await lockCaseJob(db, tenantId, candidate);
                if (!locked || !['creating','awaiting_webhook','uncertain'].includes(locked.job.status)) return;
                const { job, record } = locked;
                if (job.request_id && event.request_id !== job.request_id) return;
                if (event.errors?.length) {
                    await db.query(`UPDATE case_whatsapp_groups SET status='failed',error_code='META_CREATE_FAILED',updated_at=now() WHERE id=$1`, [job.id]); return;
                }
                const link = inviteLink(event.invite_link);
                if (!link || typeof event.group_id !== 'string' || event.group_id.length > 256) return;
                // Preserve a known remote outcome even when a manually chosen group
                // superseded it while creation was in flight. Never delete/retry it.
                await db.query(`UPDATE case_whatsapp_groups SET group_id=$2,invite_link=$3,updated_at=now() WHERE id=$1`, [job.id, event.group_id, link]);
                if (wasManuallyReplaced(job) || hasOtherLink(record, link)) { await cancelForCaseLink(db, tenantId, job); return; }
                const status = canDispatch(c, job) && job.recipients.some(r => r.status === 'pending') ? 'created' : 'cancelled';
                await db.query(`UPDATE case_whatsapp_groups SET status=$2,error_code=NULL,updated_at=now() WHERE id=$1`, [job.id, status]);
                // Do not call the legacy linking handler: it also sends client notifications.
                await db.query(`UPDATE cases SET whatsappgrouplink=$2,updatedat=now() WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $3 AND integration_demo=false AND COALESCE(whatsappgrouplink,'')=''`, [job.case_id, link, tenantId]);
            });
        }
    }
    return { processOffice, receiveLifecycle };
}
module.exports = { createGroupWorker };
