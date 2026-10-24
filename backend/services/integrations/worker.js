'use strict';
const { createHash } = require('node:crypto');
const { inviteLink, phones } = require('./validation');
const { deliveryAllowed } = require('./deliveryPolicy');
const { SAFETY_POLICY, reserveSafety, markDispatchSafety, pauseSafety, publicSafety, normalizeFailure } = require('./whatsappSafety');

function createGroupWorker(service) {
    const { tx, connection, provider, env } = service;
    const ABANDONED_MS = 10 * 60 * 1000;
    const phoneHash = phone => createHash('sha256').update(phones([phone])[0], 'utf8').digest('hex');
    function readClaim(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 4 ||
            typeof value.jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.jobId) ||
            !['group', 'invite'].includes(value.kind) || typeof value.reservedAt !== 'string' ||
            !Number.isFinite(Date.parse(value.reservedAt))) return null;
        if (new Date(value.reservedAt).toISOString() !== value.reservedAt ||
            (value.kind === 'group' ? value.recipientHash !== null : typeof value.recipientHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.recipientHash))) return null;
        return value;
    }
    function matchingClaim(c, expected, kind, jobId, phone) {
        const current = readClaim(c?.dispatch_claim);
        if (!current || !readClaim(expected)) return false;
        return current.jobId === jobId && current.kind === kind && current.reservedAt === expected.reservedAt &&
            expected.jobId === jobId && expected.kind === kind && current.recipientHash === expected.recipientHash &&
            current.recipientHash === (kind === 'group' ? null : phoneHash(phone));
    }
    async function clearClaim(db, c, claim) {
        // A stale worker can never clear a replacement claim.
        await db.query('UPDATE office_integrations SET dispatch_claim=NULL WHERE id=$1 AND dispatch_claim=$2::jsonb', [c.id, claim]);
    }
    function canDispatch(c, job) {
        return c?.enabled && c.id === job.connection_id && c.settings.mode === job.mode && (job.mode === 'demo' ||
            (deliveryAllowed(env) && c.settings.connectionType !== 'business_app' && c.status === 'ready' && c.secret_ciphertext &&
             c.phone_number_id === job.phone_number_id && c.waba_id === job.waba_id &&
             (!c.token_expires_at || new Date(c.token_expires_at) > new Date())));
    }
    async function dbNow(db) {
        return (await db.query('SELECT clock_timestamp() AS safety_now')).rows[0].safety_now;
    }
    const paused = c => publicSafety(c?.safety_state).paused;
    async function pauseConnection(db, c, error) {
        const failure = normalizeFailure(error);
        await db.query('UPDATE office_integrations SET safety_state=$2,last_checked_at=NULL,updated_at=now() WHERE id=$1',
            [c.id, pauseSafety(c.safety_state, failure.reason, await dbNow(db))]);
        return failure;
    }
    async function reserve(db, c, job, kind, phone) {
        if (job.mode === 'demo') return {};
        const now = await dbNow(db);
        if (c.dispatch_claim != null) {
            if (!readClaim(c.dispatch_claim)) {
                await db.query('UPDATE office_integrations SET safety_state=$2 WHERE id=$1', [c.id, pauseSafety(c.safety_state, 'INVALID_SAFETY_STATE', now)]);
                await db.query('UPDATE case_whatsapp_groups SET next_attempt_at=NULL,error_code=$2 WHERE id=$1', [job.id, 'INVALID_SAFETY_STATE']);
            } else {
                await db.query('UPDATE case_whatsapp_groups SET next_attempt_at=$2,error_code=$3 WHERE id=$1',
                    [job.id, new Date(new Date(now).getTime() + SAFETY_POLICY.mutationIntervalMs), 'DISPATCH_IN_PROGRESS']);
            }
            return null;
        }
        const result = reserveSafety(c.safety_state, { kind, phone, now });
        // The claim transaction commits this reservation BEFORE the network call.
        // A crash consumes the allowance; it can never reset pacing or trigger retry.
        await db.query('UPDATE office_integrations SET safety_state=$2,updated_at=now() WHERE id=$1', [c.id, result.state]);
        if (!result.allowed) {
            await db.query('UPDATE case_whatsapp_groups SET next_attempt_at=$2,error_code=$3 WHERE id=$1', [job.id, result.retryAt, result.reason]);
            return null;
        }
        const claim = { jobId: job.id, kind, recipientHash: kind === 'group' ? null : phoneHash(phone), reservedAt: result.state.lastMutationAt };
        await db.query('UPDATE office_integrations SET dispatch_claim=$2 WHERE id=$1', [c.id, claim]);
        await db.query('UPDATE case_whatsapp_groups SET next_attempt_at=NULL,error_code=NULL WHERE id=$1', [job.id]);
        return claim;
    }
    async function markDispatch(db, c, claim, phone) {
        const result = markDispatchSafety(c.safety_state, { kind: claim.kind, phone, reservedAt: claim.reservedAt, now: await dbNow(db) });
        await db.query('UPDATE office_integrations SET safety_state=$2,updated_at=now() WHERE id=$1', [c.id, result.state]);
        c.safety_state = result.state;
        return result;
    }
    async function lockCaseJob(db, tenantId, candidate) {
        if (!candidate) return null;
        // Every delivery phase uses connection -> case -> job. A manual case-link
        // update then serializes with the final check and the external mutation.
        const record = (await db.query(`SELECT caseid,whatsappgrouplink,casemanagerid FROM cases
            WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [candidate.case_id, tenantId])).rows[0];
        const job = (await db.query(`SELECT * FROM case_whatsapp_groups
            WHERE id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [candidate.id, tenantId])).rows[0];
        return job && job.case_id === candidate.case_id ? { job, record } : null;
    }
    async function currentRecipient(db, c, record, recipient) {
        // Shrink the frozen recipient set when office settings or the assigned
        // manager change. A newly assigned person is never silently added.
        const { phone } = recipient;
        if (recipient.source !== 'case_manager') return (c.settings.recipients || []).includes(phone);
        if (!c.settings.includeCaseManager || !record?.casemanagerid || recipient.managerUserId !== record.casemanagerid) return false;
        const manager = (await db.query(`SELECT phonenumber FROM users
            WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR SHARE`, [record.casemanagerid, c.law_firm_tenant_id])).rows[0];
        try { return phones([manager?.phonenumber]).includes(phone); } catch { return false; }
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
    async function recoverAbandoned(tenantId) {
        // One case per transaction preserves connection -> case -> job ordering.
        await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!c) return;
            const now = await dbNow(db), cutoff = new Date(new Date(now).getTime() - ABANDONED_MS);
            const claim = readClaim(c.dispatch_claim);
            if (c.dispatch_claim != null && !claim) {
                await db.query('UPDATE office_integrations SET safety_state=$2 WHERE id=$1', [c.id, pauseSafety(c.safety_state, 'INVALID_SAFETY_STATE', now)]);
                return;
            }
            if (claim && Date.parse(claim.reservedAt) > cutoff.getTime()) return;
            const candidate = claim ? (await db.query(`SELECT id,case_id FROM case_whatsapp_groups
                WHERE id=$1 AND connection_id=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3`, [claim.jobId, c.id, tenantId])).rows[0] :
                (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE connection_id=$1
                AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND mode='live' AND updated_at<=$3
                AND (status IN ('creating','awaiting_webhook') OR (status IN ('created','needs_attention')
                    AND EXISTS(SELECT 1 FROM jsonb_array_elements(recipients) r WHERE r->>'status'='sending')))
                ORDER BY created_at LIMIT 1`, [c.id, tenantId, cutoff])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            let recovered = false;
            if (locked?.job.mode === 'live') {
                const { job } = locked;
                if (['creating', 'awaiting_webhook'].includes(job.status)) {
                    await db.query("UPDATE case_whatsapp_groups SET status='uncertain',error_code='RESULT_UNKNOWN',updated_at=now() WHERE id=$1", [job.id]);
                    recovered = true;
                } else if (job.recipients.some(r => r.status === 'sending')) {
                    const recipients = job.recipients.map(r => r.status === 'sending' ? { ...r, status: 'uncertain', errorCode: 'RESULT_UNKNOWN' } : r);
                    await db.query("UPDATE case_whatsapp_groups SET status='needs_attention',error_code='RESULT_UNKNOWN',recipients=$2,updated_at=now() WHERE id=$1", [job.id, JSON.stringify(recipients)]);
                    recovered = true;
                }
            }
            if (claim || recovered) await pauseConnection(db, c, { uncertain: true });
            if (claim) await clearClaim(db, c, claim);
        });
    }
    async function processOffice(tenantId, { demoOnly = false, caseId = null } = {}) {
        // A crashed/unknown remote mutation is never blindly retried.
        await recoverAbandoned(tenantId);
        // A manual link also revokes invitations while remote creation is still
        // unresolved. Keep that remote status/request observable for its callback.
        await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
            if (!c) return;
            const candidate = (await db.query(`SELECT j.id,j.case_id FROM case_whatsapp_groups j JOIN cases c
                ON c.caseid=j.case_id AND c.law_firm_tenant_id IS NOT DISTINCT FROM j.law_firm_tenant_id
                WHERE j.law_firm_tenant_id IS NOT DISTINCT FROM $1 AND j.status IN ('creating','awaiting_webhook','uncertain','created','needs_attention')
                AND COALESCE(btrim(c.whatsappgrouplink),'')<>'' AND btrim(c.whatsappgrouplink)<>COALESCE(j.invite_link,'')
                AND EXISTS(SELECT 1 FROM jsonb_array_elements(j.recipients) r WHERE r->>'status'='pending')
                ORDER BY j.created_at LIMIT 1`, [tenantId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (locked && ['creating','awaiting_webhook','uncertain','created','needs_attention'].includes(locked.job.status) && hasOtherLink(locked.record, locked.job.invite_link))
                await cancelForCaseLink(db, tenantId, locked.job, null, ['creating','awaiting_webhook','uncertain'].includes(locked.job.status));
        });
        const claimed = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!c?.enabled) return null;
            const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1
                AND status='queued' AND ($2=false OR mode='demo') AND ($3::integer IS NULL OR case_id=$3)
                AND (next_attempt_at IS NULL OR next_attempt_at<=now())
                ORDER BY created_at LIMIT 1`, [tenantId, demoOnly, caseId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (!locked || locked.job.status !== 'queued') return null;
            const { job, record } = locked;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return null; }
            if (job.mode === 'live' && paused(c)) return null;
            if (!canDispatch(c, job) || !job.recipients.some(r => r.status === 'pending')) {
                await db.query(`UPDATE case_whatsapp_groups SET status='cancelled',error_code='CONNECTION_CHANGED',updated_at=now() WHERE id=$1`, [job.id]); return null;
            }
            const dispatchClaim = await reserve(db, c, job, 'group');
            if (!dispatchClaim) return null;
            await db.query(`UPDATE case_whatsapp_groups SET status='creating',updated_at=now() WHERE id=$1`, [job.id]);
            return { ...job, dispatchClaim };
        });
        if (claimed) await tx(async db => {
            // Recheck after claiming; toggling off takes the conflicting connection lock.
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            const live = claimed.mode === 'live';
            if (live && !matchingClaim(c, claimed.dispatchClaim, 'group', claimed.id)) return;
            try {
                const locked = await lockCaseJob(db, tenantId, claimed);
                if (!locked || locked.job.status !== 'creating') return;
                const { job, record } = locked;
                if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return; }
                if (live && paused(c)) {
                    await db.query("UPDATE case_whatsapp_groups SET status='queued',updated_at=now() WHERE id=$1", [job.id]); return;
                }
                if (!canDispatch(c, job) || !job.recipients.some(r => r.status === 'pending')) {
                    await db.query(`UPDATE case_whatsapp_groups SET status='cancelled',updated_at=now() WHERE id=$1`, [job.id]); return;
                }
                if (!live) {
                    await db.query(`UPDATE case_whatsapp_groups SET status='simulated',recipients=$2,updated_at=now() WHERE id=$1`, [job.id, JSON.stringify(job.recipients.map(r => ({ ...r, status: 'simulated' })))]);
                    return; // No fake WhatsApp URL and no external call.
                }
                const dispatch = await markDispatch(db, c, claimed.dispatchClaim);
                if (!dispatch.allowed) {
                    await db.query("UPDATE case_whatsapp_groups SET status='queued',next_attempt_at=$2,error_code=$3,updated_at=now() WHERE id=$1", [job.id, dispatch.retryAt, dispatch.reason]); return;
                }
                try {
                    const result = await provider.createGroup(c, service.token(c), job);
                    if (typeof result?.request_id !== 'string' || !result.request_id || result.request_id.length > 256)
                        throw Object.assign(new Error('RESULT_UNKNOWN'), { uncertain: true });
                    await db.query(`UPDATE case_whatsapp_groups SET status='awaiting_webhook',request_id=$2,updated_at=now() WHERE id=$1`, [job.id, result.request_id]);
                } catch (e) {
                    const failure = await pauseConnection(db, c, e);
                    await db.query(`UPDATE case_whatsapp_groups SET status=$2,error_code=$3,updated_at=now() WHERE id=$1`, [job.id, failure.uncertain ? 'uncertain' : 'failed', failure.reason]);
                }
            } finally {
                // Commit clears known-unsent/success/failed/unknown outcomes. A
                // crash or transaction rollback retains the claim for recovery.
                if (live) await clearClaim(db, c, claimed.dispatchClaim);
            }
        });
        if (demoOnly) return;
        // One invitation at a time, persisted before the remote call. Failure is visible;
        // automatic retry could send duplicate invitations after an ambiguous timeout.
        const invitation = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!c?.enabled || paused(c)) return null;
            const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND mode='live' AND status='created'
                AND (next_attempt_at IS NULL OR next_attempt_at<=now()) ORDER BY created_at LIMIT 1`, [tenantId])).rows[0];
            const locked = await lockCaseJob(db, tenantId, candidate);
            if (!locked || locked.job.status !== 'created') return null;
            const { job, record } = locked;
            if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job); return null; }
            if (!canDispatch(c, job)) return null;
            // Another process may be delivering a claimed invitation. A crash is
            // reported as unknown after ten minutes, never retried automatically.
            if (job.recipients.some(r => r.status === 'sending')) {
                return null; // The recovery pass freezes abandoned claims; never overlap sends.
            }
            const recipient = job.recipients.find(r => r.status === 'pending');
            if (!recipient) {
                const allSent = job.recipients.every(r => r.status === 'sent');
                await db.query(`UPDATE case_whatsapp_groups SET status=$2,recipients=$3,updated_at=now() WHERE id=$1`, [job.id, allSent ? 'invitations_sent' : 'needs_attention', JSON.stringify(job.recipients)]); return null;
            }
            const dispatchClaim = await reserve(db, c, job, 'invite', recipient.phone);
            if (!dispatchClaim) return null;
            recipient.status = 'sending';
            await db.query('UPDATE case_whatsapp_groups SET recipients=$2,updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.recipients)]);
            return { id: job.id, case_id: job.case_id, phone: recipient.phone, dispatchClaim };
        });
        if (invitation) await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!matchingClaim(c, invitation.dispatchClaim, 'invite', invitation.id, invitation.phone)) return;
            try {
                const locked = await lockCaseJob(db, tenantId, invitation);
                if (!locked || locked.job.status !== 'created') return;
                const { job, record } = locked;
                const recipient = job.recipients.find(r => r.phone === invitation.phone);
                if (recipient?.status !== 'sending') return;
                if (hasOtherLink(record, job.invite_link)) { await cancelForCaseLink(db, tenantId, job, invitation.phone); return; }
                if (paused(c)) {
                    recipient.status = 'pending';
                    await db.query('UPDATE case_whatsapp_groups SET recipients=$2,updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.recipients)]); return;
                }
                if (!canDispatch(c, job)) recipient.status = 'cancelled';
                else if (!await currentRecipient(db, c, record, recipient)) {
                    recipient.status = 'cancelled'; recipient.errorCode = 'RECIPIENT_CHANGED';
                }
                else {
                    const dispatch = await markDispatch(db, c, invitation.dispatchClaim, recipient.phone);
                    if (!dispatch.allowed) {
                        recipient.status = 'pending';
                        await db.query('UPDATE case_whatsapp_groups SET recipients=$2,next_attempt_at=$3,error_code=$4,updated_at=now() WHERE id=$1',
                            [job.id, JSON.stringify(job.recipients), dispatch.retryAt, dispatch.reason]); return;
                    }
                    try {
                        const result = await provider.invite(c, service.token(c), job, recipient.phone);
                        const messageId = result?.messages?.[0]?.id;
                        if (typeof messageId !== 'string' || !messageId || messageId.length > 256)
                            throw Object.assign(new Error('RESULT_UNKNOWN'), { uncertain: true });
                        // Acceptance is observable, not a delivery receipt.
                        recipient.status = 'sent'; recipient.providerMessageId = messageId;
                    } catch (e) {
                        const failure = await pauseConnection(db, c, e);
                        recipient.status = failure.uncertain ? 'uncertain' : 'failed';
                        recipient.errorCode = failure.reason;
                    }
                }
                const finished = !job.recipients.some(r => r.status === 'pending');
                const status = finished ? (job.recipients.every(r => r.status === 'sent') ? 'invitations_sent' : 'needs_attention') : 'created';
                await db.query('UPDATE case_whatsapp_groups SET recipients=$2,status=$3,updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.recipients), status]);
            } finally {
                await clearClaim(db, c, invitation.dispatchClaim);
            }
        });
    }
    async function receiveLifecycle(tenantId, connectionId, wabaId, phoneId, events) {
        // Commit each event separately: a webhook batch must never hold case A
        // while waiting for case B, in the reverse order of another callback.
        for (const event of events) {
            if (event.type !== 'group_create' || typeof event.subject !== 'string') continue;
            await tx(async db => {
                const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
                if (!c || c.id !== connectionId || c.phone_number_id !== phoneId || c.waba_id !== wabaId || !c.secret_ciphertext) return;
                const candidate = (await db.query(`SELECT id,case_id FROM case_whatsapp_groups WHERE connection_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND subject=$3 AND mode='live' AND phone_number_id=$4 AND waba_id=$5`, [c.id, tenantId, event.subject, phoneId, wabaId])).rows[0];
                const locked = await lockCaseJob(db, tenantId, candidate);
                if (!locked || !['creating','awaiting_webhook','uncertain'].includes(locked.job.status)) return;
                const { job, record } = locked;
                if (job.request_id && event.request_id !== job.request_id) return;
                if (event.errors?.length) {
                    await pauseConnection(db, c, { providerStatus: 400, providerCode: Number(event.errors[0]?.code) || 0 });
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
