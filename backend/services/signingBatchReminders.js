const crypto = require('node:crypto');
const pool = require('../config/db');
const { notifyRecipient } = require('./notifications/notificationOrchestrator');
const { getSetting } = require('./settingsService');
const { renderTemplate } = require('../utils/templateRenderer');
const { resolveFirmSigningPolicy } = require('../lib/firm/resolveFirmSigningPolicy');

async function scheduleBatchReminder(recipientId, invitedAt = new Date()) {
    const { enabled, offsetHours } = await require('../lib/signingFileReminders').getSignReminderSettings();
    if (!enabled) return 0;
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const recipient = await db.query("SELECT id FROM signing_batch_recipients WHERE id=$1 AND status='sent' FOR UPDATE", [recipientId]);
        if (!recipient.rowCount) { await db.query('COMMIT');return 0; }
        if ((await db.query('SELECT id FROM signing_batch_reminders WHERE recipient_id=$1 AND invited_at=$2', [recipientId, invitedAt])).rowCount) { await db.query('COMMIT');return 0; }
        await db.query("UPDATE signing_batch_reminders SET status='cancelled' WHERE recipient_id=$1 AND status='pending'", [recipientId]);
        await db.query(`INSERT INTO signing_batch_reminders(id,recipient_id,invited_at,scheduled_for,status)
            VALUES($1,$2,$3,$3::timestamptz+($4::integer*interval '1 hour'),'pending')`, [crypto.randomUUID(), recipientId, invitedAt, offsetHours]);
        await db.query('COMMIT');return 1;
    } catch (error) { await db.query('ROLLBACK');throw error; }
    finally { db.release(); }
}
async function processDueBatchReminders({ limit = 50 } = {}) {
    const { enabled } = await require('../lib/signingFileReminders').getSignReminderSettings();
    if (!enabled || !(await resolveFirmSigningPolicy()).signingEnabled) return { sent: 0, cancelled: 0, failed: 0 };
    await pool.query("UPDATE signing_batch_reminders SET status='uncertain' WHERE status='sending' AND attempted_at<now()-interval '10 minutes'");
    const due = (await pool.query(`SELECT m.id,r.batch_id,r.user_id,r.id AS recipient_id,r.delivery_method,u.name,u.email,u.phonenumber,b.name AS batch_name,b.status AS batch_status,owner.name AS owner_name
        FROM signing_batch_reminders m JOIN signing_batch_recipients r ON r.id=m.recipient_id JOIN users u ON u.userid=r.user_id
        JOIN signing_batches b ON b.id=r.batch_id JOIN users owner ON owner.userid=b.owner_userid
        WHERE m.status='pending' AND m.scheduled_for<=now() ORDER BY m.scheduled_for LIMIT $1`, [Math.min(200, Math.max(1, Number(limit) || 50))])).rows;
    const counts = { sent: 0, cancelled: 0, failed: 0 };
    const { readyFileIds, recipientUrl } = require('./signingBatchDelivery');
    for (const row of due) {
        const ready = row.batch_status === 'cancelled' ? [] : await readyFileIds(row);
        if (!ready.length) {
            const update = await pool.query("UPDATE signing_batch_reminders SET status='cancelled' WHERE id=$1 AND status='pending'", [row.id]);
            counts.cancelled += update.rowCount;continue;
        }
        const claim = await pool.query("UPDATE signing_batch_reminders SET status='sending',attempted_at=now() WHERE id=$1 AND status='pending' RETURNING id", [row.id]);
        if (!claim.rowCount) continue;
        let sent = false;
        try {
            const url = recipientUrl(row.recipient_id);const email = row.delivery_method !== 'phone';const sms = row.delivery_method !== 'email';
            const smsTemplate = await getSetting('templates', 'SIGN_REMINDER_SMS', 'שלום {{recipientName}}, תזכורת: המסמך "{{documentName}}" ממתין לחתימתך. {{websiteUrl}}');
            const result = await notifyRecipient({ recipientUserId: row.user_id, recipientEmail: row.email, recipientPhone: row.phonenumber,
                notificationType: 'SIGN_REMINDER', respectExplicitChannelChoice: true,
                email: email ? { campaignKey: 'SIGN_REMINDER', contactFields: { recipient_name: row.name, document_name: row.batch_name, lawyer_name: row.owner_name, action_url: url } } : null,
                sms: sms ? { messageBody: renderTemplate(smsTemplate, { recipientName: row.name, documentName: row.batch_name, websiteUrl: url }) } : null,
            });
            sent = (!email || result?.outcomes?.email?.ok === true) && (!sms || result?.outcomes?.sms?.ok === true);
        } catch { /* Preserve unknown provider outcome without automatic repeat. */ }
        await pool.query("UPDATE signing_batch_reminders SET status=$2,sent_at=CASE WHEN $2='sent' THEN now() END WHERE id=$1", [row.id, sent ? 'sent' : 'uncertain']);
        counts[sent ? 'sent' : 'failed'] += 1;
        await require('../controllers/signingFileController').insertAuditEvent({ eventType: 'SIGNING_BATCH_REMINDER', actorType: 'system', success: sent,
            metadata: { batchId: row.batch_id, recipientId: row.recipient_id, fileIds: ready, reminderId: row.id } });
    }
    return counts;
}
module.exports = { scheduleBatchReminder, processDueBatchReminders };
