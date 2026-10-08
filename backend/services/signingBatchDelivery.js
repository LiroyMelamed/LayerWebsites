const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { notifyRecipient } = require('./notifications/notificationOrchestrator');
const { WEBSITE_DOMAIN } = require('../utils/sendMessage');
const { getSetting } = require('./settingsService');
const { renderTemplate } = require('../utils/templateRenderer');
const { loadBatch, batchDetails } = require('./signingBatchService');
const { createAppError } = require('../utils/appError');

function recipientToken(id) {
    if (!process.env.JWT_SECRET) throw createAppError('INTERNAL_ERROR', 500);
    return jwt.sign({ typ: 'signing_batch', recipientId: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}
function recipientUrl(id) {
    const raw = String(WEBSITE_DOMAIN || '').trim().replace(/\/+$/, '');
    const origin = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    // Existing native clients already route this public path family to a browser sheet.
    // A PublicSignScreen batch query would be swallowed by their single-document parser.
    origin.pathname = '/ViewSignedDocument/Package';origin.search = '';origin.searchParams.set('batch', recipientToken(id));
    return origin.toString();
}

async function readyFileIds(recipient) {
    return (await pool.query(`SELECT DISTINCT sf.signingfileid FROM signing_batch_files bf JOIN signingfiles sf USING(signingfileid)
        JOIN signaturespots s ON s.signingfileid=sf.signingfileid AND s.signeruserid=$2
        WHERE bf.batch_id=$1 AND sf.status='pending' AND (sf.expiresat IS NULL OR sf.expiresat>now()) AND s.isrequired AND NOT s.issigned
        AND (sf.signingorder<>'sequential' OR s.signerindex <= (SELECT min(n.signerindex) FROM signaturespots n
            WHERE n.signingfileid=sf.signingfileid AND n.isrequired AND NOT n.issigned)) ORDER BY sf.signingfileid`, [recipient.batch_id, recipient.user_id])).rows.map(row => row.signingfileid);
}
async function updateBatchStatus(id) {
    await pool.query(`UPDATE signing_batches b SET status=CASE
        WHEN EXISTS(SELECT 1 FROM signing_batch_recipients r WHERE r.batch_id=b.id AND status='sending') THEN 'sending'
        WHEN EXISTS(SELECT 1 FROM signing_batch_recipients r WHERE r.batch_id=b.id AND status IN ('uncertain','failed')) THEN 'partial'
        WHEN EXISTS(SELECT 1 FROM signing_batch_recipients r WHERE r.batch_id=b.id AND status='pending') THEN 'ready'
        ELSE 'sent' END WHERE b.id=$1 AND b.status<>'cancelled'`, [id]);
}
async function deliverRecipient(recipientId) {
    const smsTemplate = await getSetting('templates', 'SIGN_INVITE_SMS', 'שלום {{recipientName}}, המסמך "{{documentName}}" מחכה לחתימתך. {{websiteUrl}}');
    // A new turn can become available while a provider is being called. Drain only unseen ready documents.
    for (let round = 0; round < 200; round++) {
        const recipient = (await pool.query(`SELECT r.*,b.name AS batch_name,b.owner_userid,u.name,u.email,u.phonenumber,owner.name AS owner_name
            FROM signing_batch_recipients r JOIN signing_batches b ON b.id=r.batch_id
            JOIN users u ON u.userid=r.user_id JOIN users owner ON owner.userid=b.owner_userid
            WHERE r.id=$1 AND b.status<>'cancelled' AND r.status IN ('pending','sent')`, [recipientId])).rows[0];
        if (!recipient) return;
        const ready = await readyFileIds(recipient);
        if (!ready.some(id => !recipient.invited_file_ids.includes(id))) {
            if (ready.length && recipient.status === 'sent') await require('./signingBatchReminders').scheduleBatchReminder(recipient.id, recipient.sent_at);
            return;
        }
        const covered = [...new Set([...recipient.invited_file_ids, ...ready])].sort((a, b) => a - b);
        // Persist covered documents before provider I/O; an uncertain result is never auto-retried.
        const claim = await pool.query(`UPDATE signing_batch_recipients SET status='sending',attempted_at=now(),invited_file_ids=$4::integer[]
            WHERE id=$1 AND status=$2 AND invited_file_ids=$3::integer[] RETURNING id`, [recipient.id, recipient.status, recipient.invited_file_ids, covered]);
        if (!claim.rowCount) return;
        let status = 'uncertain';let errorCode = 'DELIVERY_UNCONFIRMED';
        try {
            const url = recipientUrl(recipient.id);
            const email = recipient.delivery_method !== 'phone';const sms = recipient.delivery_method !== 'email';
            const result = await notifyRecipient({
                recipientUserId: recipient.user_id, notificationType: 'SIGN_INVITE', respectExplicitChannelChoice: true,
                recipientEmail: recipient.email, recipientPhone: recipient.phonenumber,
                email: email ? { campaignKey: 'SIGN_INVITE', contactFields: { recipient_name: recipient.name, document_name: recipient.batch_name, lawyer_name: recipient.owner_name, action_url: url } } : null,
                sms: sms ? { messageBody: renderTemplate(smsTemplate, { recipientName: recipient.name, documentName: recipient.batch_name, websiteUrl: url }) } : null,
            });
            if ((!email || result?.outcomes?.email?.ok === true) && (!sms || result?.outcomes?.sms?.ok === true)) { status = 'sent';errorCode = null; }
        } catch { /* Transport exceptions may occur after a provider accepts a message. */ }
        const delivered = await pool.query("UPDATE signing_batch_recipients SET status=$2,error_code=$3,sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END WHERE id=$1 RETURNING sent_at", [recipient.id, status, errorCode]);
        await require('../controllers/signingFileController').insertAuditEvent({ eventType: 'BATCH_INVITE_ATTEMPTED', actorUserId: recipient.owner_userid, actorType: 'system', success: status === 'sent',
            metadata: { batchId: recipient.batch_id, recipientId: recipient.id, fileIds: ready, status } });
        if (status !== 'sent') return;
        await require('./signingBatchReminders').scheduleBatchReminder(recipient.id, delivered.rows[0].sent_at);
    }
}
async function notifyBatchTurn(signingFileId, signerUserId) {
    const found = await pool.query(`SELECT r.id,r.batch_id FROM signing_batch_files bf JOIN signing_batch_recipients r ON r.batch_id=bf.batch_id
        WHERE bf.signingfileid=$1 AND r.user_id=$2`, [signingFileId, signerUserId]);
    if (!found.rows.length) return false;
    await deliverRecipient(found.rows[0].id);
    await updateBatchStatus(found.rows[0].batch_id);
    return true;
}
async function sendBatch(req, id) {
    const { batch } = await loadBatch(req, id);
    if (batch.status === 'cancelled') throw createAppError('CONFLICT', 409, 'השליחה בוטלה');
    const count = await pool.query('SELECT count(*)::integer AS count FROM signing_batch_files WHERE batch_id=$1', [id]);
    if (count.rows[0].count !== batch.snapshot.packages.length * batch.snapshot.definition.documents.length) throw createAppError('CONFLICT', 409, 'מסמך הוסר מהשליחה. יש ליצור חבילה חדשה ומלאה');
    await pool.query("UPDATE signingfiles sf SET status='pending' FROM signing_batch_files bf WHERE bf.batch_id=$1 AND bf.signingfileid=sf.signingfileid AND sf.status='draft'", [id]);
    await pool.query("UPDATE signing_batch_recipients SET status='uncertain',error_code='DELIVERY_UNCONFIRMED' WHERE batch_id=$1 AND status='sending' AND attempted_at < now()-interval '10 minutes'", [id]);
    const candidates = await pool.query("SELECT id FROM signing_batch_recipients WHERE batch_id=$1 AND status IN ('pending','sent') ORDER BY id", [id]);
    for (const candidate of candidates.rows) await deliverRecipient(candidate.id);
    await updateBatchStatus(id);
    return batchDetails(req, id);
}

module.exports = { recipientToken, recipientUrl, sendBatch, notifyBatchTurn, readyFileIds };
