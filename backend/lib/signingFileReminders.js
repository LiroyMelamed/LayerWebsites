/**
 * Signing-file auto reminders: create/cancel/reschedule/dispatch.
 *
 * Platform settings (category=signing):
 *   SIGN_REMINDER_AUTO_ENABLED  — "true" | "false"
 *   SIGN_REMINDER_OFFSET_HOURS  — hours after invite before reminder
 */
'use strict';

const pool = require('../config/db');
const { getSetting } = require('../services/settingsService');
const { notifyRecipient } = require('../services/notifications/notificationOrchestrator');
const { renderTemplate } = require('../utils/templateRenderer');

/** Clean https short-link for SMS (rich preview + tappable URL). */
function formatSmsSigningUrl(url) {
    return String(url || '').trim();
}

function _isEnabled(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
}

function _parseOffsetHours(raw) {
    const n = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return 72;
    return Math.min(n, 24 * 90); // cap at 90 days
}

async function getSignReminderSettings() {
    const enabledRaw = await getSetting('signing', 'SIGN_REMINDER_AUTO_ENABLED', 'false');
    const offsetRaw = await getSetting('signing', 'SIGN_REMINDER_OFFSET_HOURS', '72');
    return {
        enabled: _isEnabled(enabledRaw),
        offsetHours: _parseOffsetHours(offsetRaw),
    };
}

/**
 * Schedule auto reminders for the given signers after invites were issued.
 * No-op when auto-remind is disabled.
 *
 * @param {{ signingFileId: number, signerUserIds: number[], invitedAt?: Date }} args
 */
async function scheduleRemindersForSigners({ signingFileId, signerUserIds, invitedAt }) {
    const fileId = Number(signingFileId);
    if (!Number.isFinite(fileId) || fileId <= 0) return { created: 0 };

    const ids = [...new Set(
        (Array.isArray(signerUserIds) ? signerUserIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
    )];
    if (!ids.length) return { created: 0 };

    const { enabled, offsetHours } = await getSignReminderSettings();
    if (!enabled) return { created: 0, skipped: true };

    const base = invitedAt instanceof Date && !Number.isNaN(invitedAt.getTime())
        ? invitedAt
        : new Date();
    const scheduledFor = new Date(base.getTime() + offsetHours * 60 * 60 * 1000);

    let created = 0;
    for (const signerUserId of ids) {
        try {
            // Cancel any existing pending for this pair, then insert fresh.
            await pool.query(
                `UPDATE signing_file_reminders
                 SET status = 'CANCELLED', cancelled_at = NOW()
                 WHERE signing_file_id = $1
                   AND signer_user_id = $2
                   AND status = 'PENDING'`,
                [fileId, signerUserId]
            );
            await pool.query(
                `INSERT INTO signing_file_reminders
                    (signing_file_id, signer_user_id, scheduled_for, status, auto_managed, offset_hours, invited_at)
                 VALUES ($1, $2, $3, 'PENDING', TRUE, $4, $5)`,
                [fileId, signerUserId, scheduledFor.toISOString(), offsetHours, base.toISOString()]
            );
            created += 1;
        } catch (err) {
            console.error(
                `[sign-reminders] schedule failed file=${fileId} signer=${signerUserId}:`,
                err?.message || err
            );
        }
    }
    return { created, offsetHours };
}

/** Cancel all PENDING reminders for a signing file (signed / deleted / rejected). */
async function cancelRemindersForFile(signingFileId) {
    const fileId = Number(signingFileId);
    if (!Number.isFinite(fileId) || fileId <= 0) return 0;
    try {
        const { rowCount } = await pool.query(
            `UPDATE signing_file_reminders
             SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE signing_file_id = $1 AND status = 'PENDING'`,
            [fileId]
        );
        return rowCount || 0;
    } catch (err) {
        console.error(`[sign-reminders] cancelForFile failed file=${fileId}:`, err?.message || err);
        return 0;
    }
}

/** Cancel PENDING reminder for one signer who finished signing. */
async function cancelReminderForSigner(signingFileId, signerUserId) {
    const fileId = Number(signingFileId);
    const uid = Number(signerUserId);
    if (!Number.isFinite(fileId) || !Number.isFinite(uid)) return 0;
    try {
        const { rowCount } = await pool.query(
            `UPDATE signing_file_reminders
             SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE signing_file_id = $1
               AND signer_user_id = $2
               AND status = 'PENDING'`,
            [fileId, uid]
        );
        return rowCount || 0;
    } catch (err) {
        console.error(
            `[sign-reminders] cancelForSigner failed file=${fileId} signer=${uid}:`,
            err?.message || err
        );
        return 0;
    }
}

/**
 * When platform admin changes SIGN_REMINDER_OFFSET_HOURS, reschedule all
 * PENDING auto_managed reminders from their invited_at + new offset.
 */
async function rescheduleUnmodifiedReminders(newOffsetHours) {
    const hours = _parseOffsetHours(newOffsetHours);
    try {
        const { rowCount } = await pool.query(
            `UPDATE signing_file_reminders
             SET scheduled_for = invited_at + ($1::int * INTERVAL '1 hour'),
                 offset_hours = $1
             WHERE status = 'PENDING'
               AND auto_managed = TRUE`,
            [hours]
        );
        return rowCount || 0;
    } catch (err) {
        console.error('[sign-reminders] rescheduleUnmodified failed:', err?.message || err);
        return 0;
    }
}

/** When auto-remind is turned off, cancel all pending auto-managed rows. */
async function cancelAllAutoManagedPending() {
    try {
        const { rowCount } = await pool.query(
            `UPDATE signing_file_reminders
             SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE status = 'PENDING' AND auto_managed = TRUE`
        );
        return rowCount || 0;
    } catch (err) {
        console.error('[sign-reminders] cancelAllAutoManaged failed:', err?.message || err);
        return 0;
    }
}

async function _signerStillNeedsSignature(signingFileId, signerUserId) {
    const { rows } = await pool.query(
        `SELECT bool_and(issigned) FILTER (WHERE isrequired = TRUE) AS all_signed,
                COUNT(*) FILTER (
                    WHERE isrequired = TRUE
                      AND lower(coalesce(fieldtype, 'signature')) != 'lawyerstamp'
                ) AS required_count
         FROM signaturespots
         WHERE signingfileid = $1
           AND signeruserid = $2
           AND lower(coalesce(fieldtype, 'signature')) != 'lawyerstamp'`,
        [signingFileId, signerUserId]
    );
    const row = rows[0];
    if (!row || Number(row.required_count) <= 0) return false;
    return row.all_signed !== true;
}

async function _loadSigningContext(signingFileId, signerUserId) {
    const fileRes = await pool.query(
        `SELECT sf.signingfileid AS "SigningFileId",
                sf.filename AS "FileName",
                sf.status AS "Status",
                sf.caseid AS "CaseId",
                sf.lawyerid AS "LawyerId",
                sf.expiresat AS "ExpiresAt",
                u.name AS "SignerName",
                u.email AS "SignerEmail",
                u.phonenumber AS "SignerPhone",
                lu.name AS "LawyerName"
         FROM signingfiles sf
         LEFT JOIN users u ON u.userid = $2
         LEFT JOIN users lu ON lu.userid = sf.lawyerid
         WHERE sf.signingfileid = $1`,
        [signingFileId, signerUserId]
    );
    return fileRes.rows[0] || null;
}

async function _buildSigningUrl(ctx, signerUserId) {
    // Prefer short/public token helpers from signing controller if exported.
    let createToken;
    let buildUrl;
    try {
        const ctrl = require('../controllers/signingFileController');
        createToken = ctrl.createPublicSigningToken;
        buildUrl = ctrl.buildPublicSigningUrl;
    } catch {
        createToken = null;
        buildUrl = null;
    }

    if (typeof createToken === 'function' && typeof buildUrl === 'function') {
        const token = createToken({
            signingFileId: ctx.SigningFileId,
            signerUserId,
            fileExpiresAt: ctx.ExpiresAt || null,
        });
        return buildUrl(token);
    }

    // Fallback: website domain + public path (token generation required for real links)
    const domain = String(process.env.WEBSITE_DOMAIN || '').trim();
    if (!domain) return null;
    return `https://${domain}/Sign`;
}

/**
 * Claim and process due PENDING reminders.
 * @returns {{ sent: number, cancelled: number, failed: number }}
 */
async function processDueSignReminders({ limit = 50 } = {}) {
    const { enabled } = await getSignReminderSettings();
    if (!enabled) {
        return { sent: 0, cancelled: 0, failed: 0, skipped: true };
    }

    const client = await pool.connect();
    let due = [];
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT id, signing_file_id, signer_user_id
             FROM signing_file_reminders
             WHERE status = 'PENDING'
               AND scheduled_for <= NOW()
             ORDER BY scheduled_for ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED`,
            [limit]
        );
        due = rows;
        await client.query('COMMIT');
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        client.release();
        throw err;
    }
    client.release();

    let sent = 0;
    let cancelled = 0;
    let failed = 0;

    const smsTemplate = await getSetting(
        'templates',
        'SIGN_REMINDER_SMS',
        'שלום {{recipientName}}, תזכורת: המסמך "{{documentName}}" ממתין לחתימתך. {{websiteUrl}}'
    );

    for (const row of due) {
        const reminderId = row.id;
        const signingFileId = row.signing_file_id;
        const signerUserId = row.signer_user_id;

        try {
            const ctx = await _loadSigningContext(signingFileId, signerUserId);
            if (!ctx || String(ctx.Status || '').toLowerCase() !== 'pending') {
                await pool.query(
                    `UPDATE signing_file_reminders
                     SET status = 'CANCELLED', cancelled_at = NOW()
                     WHERE id = $1 AND status = 'PENDING'`,
                    [reminderId]
                );
                cancelled += 1;
                continue;
            }

            const stillNeeded = await _signerStillNeedsSignature(signingFileId, signerUserId);
            if (!stillNeeded) {
                await pool.query(
                    `UPDATE signing_file_reminders
                     SET status = 'CANCELLED', cancelled_at = NOW()
                     WHERE id = $1 AND status = 'PENDING'`,
                    [reminderId]
                );
                cancelled += 1;
                continue;
            }

            const publicUrl = await _buildSigningUrl(ctx, signerUserId);
            const recipientName = String(ctx.SignerName || '').trim() || 'לקוח';
            const documentName = String(ctx.FileName || '').trim();
            const lawyerName = String(ctx.LawyerName || '').trim() || 'מנהל תיק';

            const message = publicUrl
                ? `תזכורת: מסמך "${documentName}" ממתין לחתימה.\n${publicUrl}`
                : `תזכורת: מסמך "${documentName}" ממתין לחתימה.`;

            const notifyResult = await notifyRecipient({
                recipientUserId: signerUserId,
                recipientEmail: String(ctx.SignerEmail || '').trim() || undefined,
                recipientPhone: String(ctx.SignerPhone || '').trim() || undefined,
                caseId: ctx.CaseId || null,
                notificationType: 'SIGN_REMINDER',
                push: {
                    title: 'תזכורת לחתימה',
                    body: message,
                    data: {
                        screen: 'signing',
                        signingFileId: String(signingFileId),
                        url: publicUrl || undefined,
                    },
                },
                email: publicUrl
                    ? {
                        campaignKey: 'SIGN_REMINDER',
                        contactFields: {
                            recipient_name: recipientName,
                            document_name: documentName,
                            action_url: String(publicUrl),
                            lawyer_name: lawyerName,
                        },
                    }
                    : null,
                sms: publicUrl
                    ? {
                        messageBody: renderTemplate(smsTemplate, {
                            recipientName,
                            documentName,
                            websiteUrl: formatSmsSigningUrl(publicUrl),
                        }),
                    }
                    : null,
            });

            if (notifyResult?.ok) {
                await pool.query(
                    `UPDATE signing_file_reminders
                     SET status = 'SENT', sent_at = NOW()
                     WHERE id = $1 AND status = 'PENDING'`,
                    [reminderId]
                );
                sent += 1;
            } else {
                const errMsg = Array.isArray(notifyResult?.errors)
                    ? notifyResult.errors.join('; ')
                    : (notifyResult?.errorCode || 'notify_failed');
                await pool.query(
                    `UPDATE signing_file_reminders
                     SET status = 'FAILED', error = $2
                     WHERE id = $1 AND status = 'PENDING'`,
                    [reminderId, String(errMsg).slice(0, 500)]
                );
                failed += 1;
            }
        } catch (err) {
            console.error(`[sign-reminders] process id=${reminderId}:`, err?.message || err);
            try {
                await pool.query(
                    `UPDATE signing_file_reminders
                     SET status = 'FAILED', error = $2
                     WHERE id = $1 AND status = 'PENDING'`,
                    [reminderId, String(err?.message || err).slice(0, 500)]
                );
            } catch { /* ignore */ }
            failed += 1;
        }
    }

    return { sent, cancelled, failed };
}

module.exports = {
    getSignReminderSettings,
    scheduleRemindersForSigners,
    cancelRemindersForFile,
    cancelReminderForSigner,
    rescheduleUnmodifiedReminders,
    cancelAllAutoManagedPending,
    processDueSignReminders,
};
