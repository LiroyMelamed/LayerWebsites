/**
 * Email-reminder worker service.
 *
 * Called on a polling schedule (see scheduler.js).
 * Picks PENDING rows whose scheduled_for <= NOW, sends via Smoove
 * transactional email, and marks them SENT or FAILED.
 *
 * Idempotent: uses pg_advisory_xact_lock on the reminder row id
 * so concurrent workers cannot double-send.
 */

const pool = require('../../config/db');
const { sendTransactionalCustomHtmlEmail, sendEmailWithAttachments } = require('../../utils/smooveEmailCampaignService');
const { getAllTemplates, renderTemplate, wrapEmailHtml } = require('./templates');
const { getSetting } = require('../../services/settingsService');
const { getAttachmentBuffers } = require('../../controllers/templateAttachmentController');

// ---------- env toggles ----------
function isEnabled() {
    const v = (process.env.EMAIL_REMINDERS_ENABLED || 'true').toLowerCase();
    return v === 'true' || v === '1';
}
function isDryRun() {
    const v = (process.env.EMAIL_REMINDERS_DRY_RUN || 'false').toLowerCase();
    return v === 'true' || v === '1';
}

// ---------- core ----------

/**
 * Process all PENDING reminders whose scheduled_for <= NOW.
 * Returns { sent, failed, skipped }.
 */
async function processEmailReminders() {
    if (!isEnabled()) {
        console.log('[email-reminders] Disabled via EMAIL_REMINDERS_ENABLED.');
        return { sent: 0, failed: 0, skipped: 0, disabled: true };
    }

    const dryRun = isDryRun();
    const batchSize = Number.parseInt(process.env.EMAIL_REMINDERS_BATCH_SIZE || '50', 10);
    const templates = getAllTemplates();

    // Fetch due reminders (limit batch)
    const { rows: dueReminders } = await pool.query(
        `SELECT id, client_name, to_email, subject, template_key, template_data, scheduled_for
         FROM scheduled_email_reminders
         WHERE status = 'PENDING' AND scheduled_for <= NOW()
         ORDER BY scheduled_for ASC
         LIMIT $1`,
        [batchSize],
    );

    if (dueReminders.length === 0) {
        return { sent: 0, failed: 0, skipped: 0 };
    }

    console.log(`[email-reminders] Found ${dueReminders.length} due reminder(s). dryRun=${dryRun}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const reminder of dueReminders) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Advisory lock on the row id (prevents parallel workers sending same email)
            await client.query('SELECT pg_advisory_xact_lock($1)', [reminder.id]);

            // Re-check status inside the transaction
            const { rows: [current] } = await client.query(
                'SELECT status FROM scheduled_email_reminders WHERE id = $1',
                [reminder.id],
            );
            if (!current || current.status !== 'PENDING') {
                await client.query('COMMIT');
                skipped++;
                continue;
            }

            // Resolve template
            const tpl = templates[reminder.template_key] || templates.GENERAL;
            const data = typeof reminder.template_data === 'string'
                ? JSON.parse(reminder.template_data)
                : (reminder.template_data || {});

            // Merge common fields
            const firmName = await getSetting('firm', 'FIRM_NAME', null)
                || process.env.FIRM_NAME || 'MorLevy';
            const fields = {
                client_name: reminder.client_name,
                date: new Date(reminder.scheduled_for).toLocaleDateString('he-IL'),
                firm_name: firmName,
                ...data,
            };

            const subjectLine = reminder.subject || renderTemplate(tpl.subject, fields);
            const bodyHtml = renderTemplate(tpl.body, fields);
            const fullHtml = wrapEmailHtml(bodyHtml, { firmName: fields.firm_name, title: subjectLine });

            if (dryRun) {
                console.log(`[email-reminders] DRY-RUN would send to ${reminder.to_email}: "${subjectLine}"`);
                console.log(`  ├─ id=${reminder.id} client="${reminder.client_name}" template=${reminder.template_key}`);
                console.log(`  └─ scheduled_for=${reminder.scheduled_for}`);
                await client.query(
                    `UPDATE scheduled_email_reminders SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
                    [reminder.id],
                );
                await client.query('COMMIT');
                sent++;
                continue;
            }

            // Fetch template attachments from R2 (if any)
            const attachments = await getAttachmentBuffers('reminder', reminder.template_key);

            // Send via SMTP (with attachments) or transactional (no attachments)
            const result = attachments.length > 0
                ? await sendEmailWithAttachments({
                    toEmail: reminder.to_email,
                    subject: subjectLine,
                    htmlBody: fullHtml,
                    attachments,
                    logLabel: `reminder-${reminder.id}`,
                })
                : await sendTransactionalCustomHtmlEmail({
                    toEmail: reminder.to_email,
                    subject: subjectLine,
                    htmlBody: fullHtml,
                    logLabel: `reminder-${reminder.id}`,
                });

            if (result?.ok) {
                console.log(`[email-reminders] ✅ SENT id=${reminder.id} to=${reminder.to_email} subject="${subjectLine}"`);
                console.log(`  ├─ client="${reminder.client_name}" template=${reminder.template_key}`);
                console.log(`  └─ scheduled_for=${reminder.scheduled_for}`);
                await client.query(
                    `UPDATE scheduled_email_reminders SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
                    [reminder.id],
                );
                sent++;
            } else {
                const errMsg = result?.error || result?.message || 'Unknown send error';
                console.log(`[email-reminders] ❌ FAILED id=${reminder.id} to=${reminder.to_email} error="${errMsg}"`);
                await client.query(
                    `UPDATE scheduled_email_reminders SET status = 'FAILED', error = $2 WHERE id = $1`,
                    [reminder.id, errMsg.substring(0, 1000)],
                );
                failed++;
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => { });
            console.error(`[email-reminders] Error processing reminder ${reminder.id}:`, err.message);
            // Mark as FAILED
            try {
                await pool.query(
                    `UPDATE scheduled_email_reminders SET status = 'FAILED', error = $2 WHERE id = $1 AND status = 'PENDING'`,
                    [reminder.id, err.message?.substring(0, 1000)],
                );
            } catch (_) { /* best-effort */ }
            failed++;
        } finally {
            client.release();
        }
    }

    console.log(`[email-reminders] Batch done: sent=${sent} failed=${failed} skipped=${skipped}`);
    return { sent, failed, skipped };
}

module.exports = { processEmailReminders };
