'use strict';
const { fail, phones, positiveId } = require('./validation');

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'הסר', 'הפסק', 'הפסקה', 'وقف', 'توقف', 'إيقاف', 'ايقاف', 'إلغاء', 'الغاء']);
const SESSION = /^off_[a-f0-9]{32}_[a-f0-9]{16}$/;
function phone(value) { return phones([value])[0]; }
function phoneDigits(value) {
    const normalized = phone(value).slice(1);
    return normalized.startsWith('972') ? [normalized, '0' + normalized.slice(3)] : [normalized];
}
function optOutPhone(body) {
    if (body?.event !== 'message' || body.payload?.fromMe !== false || typeof body.payload?.body !== 'string') return null;
    const text = body.payload.body.normalize('NFKC').trim().toLowerCase();
    if (text.length > 30 || !STOP_WORDS.has(text)) return null;
    const from = body.payload.from;
    if (typeof from !== 'string' || !/^[1-9]\d{7,14}@(c\.us|s\.whatsapp\.net)$/.test(from)) return null;
    return '+' + from.split('@')[0];
}

async function claimLinkedEvent(db, tenantId, connectionId, body, metadata = {}) {
    if (!SESSION.test(body?.session || '') || !/^[A-Za-z0-9_-]{4,128}$/.test(body?.id || '') || !/^[a-f0-9]{64}$/.test(metadata.payloadHash || '')) return false;
    const eventAt = new Date(body.timestamp);
    if (!Number.isFinite(eventAt.getTime())) return false;
    // The database clock is the final replay boundary, inside the same transaction
    // as the connection lock and effects. Application-clock drift cannot extend it.
    const inserted = await db.query(`INSERT INTO whatsapp_linked_webhook_events(law_firm_tenant_id,connection_id,event_id,session_name,payload_hash,event_timestamp)
        SELECT $1,$2,$3,$4,$5,$6 WHERE $6::timestamptz >= clock_timestamp()-interval '10 minutes' AND $6::timestamptz <= clock_timestamp()+interval '1 minute'
        ON CONFLICT(connection_id,event_id) DO NOTHING RETURNING id`, [tenantId, connectionId, body.id, body.session, metadata.payloadHash, eventAt]);
    await db.query(`DELETE FROM whatsapp_linked_webhook_events WHERE id IN
        (SELECT id FROM whatsapp_linked_webhook_events WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND received_at<clock_timestamp()-interval '1 day' ORDER BY received_at LIMIT 100)`, [tenantId]);
    return inserted.rowCount === 1;
}

function createWhatsappContactPermissions({ pool, tx, connection, recheckQueued }) {
    async function permissionFor(db, tenantId, value, lock = '') {
        const suffix = lock === 'FOR SHARE' ? 'FOR SHARE' : lock === 'FOR UPDATE' ? 'FOR UPDATE' : '';
        const row = (await db.query(`SELECT allowed,version,updated_at FROM whatsapp_contact_permissions
            WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND phone=$2 ${suffix}`, [tenantId, phone(value)])).rows[0];
        return row || { allowed: false, version: null };
    }
    async function write(db, tenantId, normalized, allowed, evidence, actorId, source) {
        return (await db.query(`INSERT INTO whatsapp_contact_permissions(law_firm_tenant_id,phone,allowed,evidence,actor_user_id,source)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(law_firm_tenant_id,phone) DO UPDATE SET
            allowed=excluded.allowed,evidence=excluded.evidence,actor_user_id=excluded.actor_user_id,source=excluded.source,
            version=whatsapp_contact_permissions.version+1,updated_at=clock_timestamp() RETURNING phone,allowed,version,updated_at`,
        [tenantId, normalized, allowed, evidence, actorId, source])).rows[0];
    }
    async function cancelInvites(db, tenantId, normalized) {
        // The connection lock is held by callers before changing permissions. Any
        // existing in-flight request must finish before the opt-out commits; a
        // later worker must observe the opt-out before making another request.
        await db.query(`UPDATE case_whatsapp_groups SET recipients=(SELECT COALESCE(jsonb_agg(
            CASE WHEN r->>'phone'=$2 AND r->>'status'='pending' THEN r || '{"status":"cancelled","error":"CONTACT_PERMISSION_REVOKED"}'::jsonb ELSE r END),'[]'::jsonb)
            FROM jsonb_array_elements(recipients) r),updated_at=clock_timestamp()
            WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND gateway='waha'
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(recipients) r WHERE r->>'phone'=$2 AND r->>'status'='pending')`, [tenantId, normalized]);
        // Before any network request, keep the whole group visibly blocked. A
        // future explicit recheck is the only way to release permission blocks.
        await db.query(`UPDATE case_whatsapp_groups SET status='needs_attention',error_code='CONTACT_PERMISSION_REQUIRED',next_attempt_at=NULL,updated_at=clock_timestamp()
            WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND gateway='waha' AND status='queued' AND group_id IS NULL AND request_id IS NULL
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(recipients) r WHERE r->>'phone'=$2)`, [tenantId, normalized]);
    }
    async function setPermission(tenantId, input = {}, actorUserId) {
        const normalized = phone(input.phone), actorId = positiveId(actorUserId);
        if (typeof input.allowed !== 'boolean' || typeof input.evidence !== 'string') fail('INVALID_CONTACT_PERMISSION', 'יש לציין הרשאה ואת הבסיס לתיעוד שלה');
        const evidence = input.evidence.trim();
        if (evidence.length < 5 || evidence.length > 300 || /[\u0000-\u001f\u007f]/.test(evidence)) fail('INVALID_CONTACT_PERMISSION', 'יש לתעד את ההרשאה ב־5 עד 300 תווים');
        return tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!c || c.settings?.gateway !== 'waha') fail('LINKED_DEVICE_REQUIRED', 'יש להגדיר חיבור WhatsApp ב־QR תחילה', 409);
            const actor = await db.query('SELECT userid FROM users WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR SHARE', [actorId, tenantId]);
            if (!actor.rowCount) fail('CONTACT_PERMISSION_FORBIDDEN', 'אין הרשאה לעדכן איש קשר במשרד זה', 403);
            if (input.allowed) {
                const configured = phones(c.settings.recipients || []).includes(normalized);
                const registered = configured ? true : (await db.query(`SELECT userid FROM users WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1
                    AND regexp_replace(phonenumber,'[^0-9]','','g')=ANY($2::text[]) LIMIT 1 FOR SHARE`, [tenantId, phoneDigits(normalized)])).rowCount > 0;
                if (!registered) fail('CONTACT_NOT_IN_OFFICE', 'אפשר לאשר רק איש קשר של המשרד או מספר צוות מוגדר', 404);
            }
            const row = await write(db, tenantId, normalized, input.allowed, evidence, actorId, 'staff');
            if (!input.allowed) await cancelInvites(db, tenantId, normalized);
            return row;
        });
    }
    async function receiveOptOut(db, tenantId, body) {
        const normalized = optOutPhone(body);
        if (!normalized) return false;
        // Invoked only after locking and authenticating the current connection.
        await write(db, tenantId, normalized, false, 'WhatsApp opt-out request', null, 'inbound_optout');
        await cancelInvites(db, tenantId, normalized);
        return true;
    }
    async function recheckGroups(tenantId) {
        if (typeof recheckQueued !== 'function') fail('RECHECK_UNAVAILABLE', 'בדיקת ההרשאות אינה זמינה כרגע', 503);
        // Root service owns the current case-party and device-generation checks.
        // It must only requeue known-unsent CONTACT_PERMISSION_REQUIRED jobs.
        return recheckQueued(tenantId);
    }
    return { setPermission, permissionFor, recheckGroups, receiveOptOut };
}
module.exports = { createWhatsappContactPermissions, claimLinkedEvent, optOutPhone, phoneDigits };
