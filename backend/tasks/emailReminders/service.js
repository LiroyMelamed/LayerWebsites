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
const { sendTransactionalCustomHtmlEmail } = require('../../utils/smooveEmailCampaignService');
const { getAllTemplates, renderTemplate, wrapEmailHtml } = require('./templates');

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
            const fields = {
                client_name: reminder.client_name,
                date: new Date(reminder.scheduled_for).toLocaleDateString('he-IL'),
                firm_name: process.env.FIRM_NAME || 'MelamedLaw',
                ...data,
            };

            const subjectLine = reminder.subject || renderTemplate(tpl.subject, fields);
            const bodyHtml = renderTemplate(tpl.body, fields);
            const fullHtml = wrapEmailHtml(bodyHtml, { firmName: fields.firm_name });

            if (dryRun) {
                console.log(`[email-reminders] DRY-RUN would send to ${reminder.to_email}: "${subjectLine}"`);
                await client.query(
                    `UPDATE scheduled_email_reminders SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
                    [reminder.id],
                );
                await client.query('COMMIT');
                sent++;
                continue;
            }

            // Send via Smoove transactional
            const result = await sendTransactionalCustomHtmlEmail({
                toEmail: reminder.to_email,
                subject: subjectLine,
                htmlBody: fullHtml,
                logLabel: `reminder-${reminder.id}`,
            });

            if (result?.ok) {
                await client.query(
                    `UPDATE scheduled_email_reminders SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
                    [reminder.id],
                );
                sent++;
            } else {
                const errMsg = result?.error || result?.message || 'Unknown send error';
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
