const pool = require('../../config/db');
const sendAndStoreNotification = require('../../utils/sendAndStoreNotification');
const { sendTransactionalCustomHtmlEmail } = require('../../utils/smooveEmailCampaignService');
const { getPlatformAdmins } = require('../../services/settingsService');
const { DEFAULTS } = require('./templates');
const { renderTemplate, maskEmailForLog } = require('./render');
const { parseDateOnly, toDateOnlyString, computeDueDate, timeLeftLabel } = require('./dateCalc');
const crypto = require('node:crypto');

const AUDIT_EVENT_TYPE_SENT = 'LICENSE_RENEWAL_REMINDER_SENT';

function isDryRunEnabled() {
    return ['1', 'true', 'yes'].includes(
        String(process.env.LICENSE_RENEWAL_REMINDERS_DRY_RUN || '').trim().toLowerCase()
    );
}

function isRemindersEnabled() {
    return String(process.env.LICENSE_RENEWAL_REMINDERS_ENABLED ?? 'true').toLowerCase() === 'true';
}

function getTodayDateKeyInTz(timeZone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: String(timeZone || 'Asia/Jerusalem'),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);

    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function formatDateHebrew(dateKey) {
    // dateKey is YYYY-MM-DD
    const d = parseDateOnly(dateKey);
    if (!d) return String(dateKey || '').trim();

    return new Intl.DateTimeFormat('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
    }).format(d);
}

function normalizeDateOnlyKey(rawValue) {
    if (!rawValue) return '';

    const tz = String(process.env.LICENSE_RENEWAL_REMINDERS_TZ || 'Asia/Jerusalem');

    // pg may return timestamps as JS Date objects
    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        return getTodayDateKeyInTz(tz, rawValue);
    }

    const s = String(rawValue).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];

    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) {
        return getTodayDateKeyInTz(tz, dt);
    }

    return '';
}

function uuidV4() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

    // Fallback v4
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;

    const hex = b.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function userHasValidExpoPush(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const res = await pool.query(
        'SELECT FcmToken FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL',
        [id]
    );

    const tokens = (res.rows || [])
        .map((r) => String(r.fcmtoken || r.FcmToken || '').trim())
        .filter(Boolean);

    return tokens.some((t) => /^ExponentPushToken\[[^\]]+\]$/.test(t) || /^ExpoPushToken\[[^\]]+\]$/.test(t));
}

function buildReminderDedupeKey({ caseId, recipientUserId, recipientKind, reminderKey, expiryDateKey }) {
    return [
        `case:${Number(caseId)}`,
        `recipient:${Number(recipientUserId)}`,
        `kind:${String(recipientKind)}`,
        `rem:${String(reminderKey)}`,
        `exp:${String(expiryDateKey)}`,
    ].join('|');
}

async function tryAcquireReminderAuditGate({
    caseId,
    recipientUserId,
    recipientKind,
    reminderKey,
    dueDateKey,
    expiryDateKey,
    extraMetadata,
}) {
    const dedupeKey = buildReminderDedupeKey({
        caseId,
        recipientUserId,
        recipientKind,
        reminderKey,
        expiryDateKey,
    });

    const eventId = uuidV4();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Prevent concurrent duplicates across processes.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dedupeKey]);

        const metadata = {
            dedupeKey,
            caseId: Number(caseId),
            recipientUserId: Number(recipientUserId),
            recipientKind: String(recipientKind),
            reminderKey: String(reminderKey),
            licenseExpiryDate: String(expiryDateKey),
            dueDate: String(dueDateKey),
            ...(extraMetadata || {}),
        };

        const r = await client.query(
            `WITH inserted AS (
                INSERT INTO audit_events(eventid, event_type, actor_userid, actor_type, success, metadata)
                SELECT $1::uuid, $2::text, NULL::int, 'system'::text, true, $3::jsonb
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM audit_events
                    WHERE event_type = $2
                      AND success = true
                      AND (metadata->>'dedupeKey') = $4
                )
                RETURNING eventid
            )
            SELECT (SELECT count(*) FROM inserted) AS inserted_count`,
            [eventId, AUDIT_EVENT_TYPE_SENT, JSON.stringify(metadata), dedupeKey]
        );

        await client.query('COMMIT');

        const insertedCount = Number(r.rows?.[0]?.inserted_count || 0);
        if (insertedCount > 0) return { ok: true, acquired: true, eventId, dedupeKey };
        return { ok: true, acquired: false, dedupeKey };
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore
        }
        throw e;
    } finally {
        client.release();
    }
}

async function findDueCasesForReminder({ todayKey, reminderKey }) {
    const key = String(reminderKey || '').trim().toUpperCase();
    const today = String(todayKey || '').trim();

    const months = key === 'M4' ? 4 : key === 'M2' ? 2 : key === 'M1' ? 1 : null;
    const days = key === 'D14' ? 14 : null;

    if (!months && !days) throw new Error(`Unsupported reminderKey: ${key}`);

    const intervalValue = months || days;

    const r = await pool.query(
        `select
            c.caseid as "CaseId",
            c.casename as "CaseName",
            c.userid as "ClientUserId",
            cu.name as "ClientName",
            cu.email as "ClientEmail",
            c.casemanagerid as "ManagerUserId",
            mu.name as "ManagerName",
            mu.email as "ManagerEmail",
            c.licenseexpirydate as "LicenseExpiryDate"
        from cases c
        join users cu on cu.userid = c.userid
        left join users mu on mu.userid = c.casemanagerid
        where c.licenseexpirydate is not null
          and (
            case
              when $1::text in ('M4','M2','M1') then (c.licenseexpirydate - make_interval(months => $2::int))::date = $3::date
              else (c.licenseexpirydate - make_interval(days => $2::int))::date = $3::date
            end
          )
        order by c.caseid asc`,
        [key, intervalValue, today]
    );

    return r.rows || [];
}

async function sendClientReminder({ reminderKey, row, todayKey }) {
    const clientUserId = Number(row.ClientUserId);
    const clientEmail = String(row.ClientEmail || '').trim();
    const clientName = String(row.ClientName || '').trim();
    const caseTitle = String(row.CaseName || '').trim();
    const expiryKey = normalizeDateOnlyKey(row.LicenseExpiryDate);

    if (!clientEmail) return { ok: true, skipped: true, reason: 'no_client_email' };

    const expiryDateUtc = parseDateOnly(expiryKey);
    if (!expiryDateUtc) return { ok: false, error: 'invalid_expiry_date' };

    // Defensive: ensure due matches today (primary filter is SQL).
    const due = computeDueDate({ expiryDateUtc, reminderKey });
    if (toDateOnlyString(due) !== String(todayKey)) {
        return { ok: false, error: 'due_date_mismatch' };
    }

    const timeLeft = timeLeftLabel(reminderKey);
    const actionUrl = `https://${String(process.env.WEBSITE_DOMAIN || '').trim() || 'client.melamedlaw.co.il'}`;

    const fields = {
        recipient_name: clientName,
        client_name: clientName,
        case_title: caseTitle,
        expiry_date: formatDateHebrew(expiryKey),
        time_left: timeLeft,
        action_url: actionUrl,
    };

    const subject = renderTemplate(DEFAULTS.client.emailSubject, fields);
    const bodyInner = renderTemplate(DEFAULTS.client.emailBody, fields);

    const htmlBody = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#EDF2F7;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
        <div style="background:#2A4365;padding:20px 24px;text-align:center;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#fff;font-size:18px;font-weight:700;">תזכורת לעדכון רישיון</div>
        <div style="padding:22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2D3748;line-height:1.8;font-size:15px;">${bodyInner}</div>
        <div style="padding:14px 24px 22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#718096;font-size:12px;">הודעה זו נשלחה אוטומטית.</div>
      </div>
    </body></html>`;

    const hasPush = await userHasValidExpoPush(clientUserId);

    const channels = { email: false, push: false, inApp: false };

    if (isDryRunEnabled()) {
        const dryChannels = {
            ...channels,
            dryRun: true,
            wouldSend: { email: Boolean(clientEmail), push: Boolean(hasPush), inApp: Boolean(hasPush) },
        };
        console.log(
            JSON.stringify({
                event: 'license_renewal_client_dry_run',
                caseId: Number(row.CaseId),
                reminderKey,
                recipientUserId: clientUserId,
                email: maskEmailForLog(clientEmail),
                hasPush,
                channels: dryChannels,
            })
        );

        return { ok: true, dryRun: true, channels: dryChannels };
    }

    const gate = await tryAcquireReminderAuditGate({
        caseId: row.CaseId,
        recipientUserId: clientUserId,
        recipientKind: 'client',
        reminderKey,
        dueDateKey: todayKey,
        expiryDateKey: expiryKey,
        extraMetadata: {
            hasPush,
            clientEmail: clientEmail ? maskEmailForLog(clientEmail) : null,
        },
    });

    if (!gate.ok) return { ok: false, error: 'audit_gate_error' };
    if (!gate.acquired) return { ok: true, skipped: true, reason: 'already_handled' };

    try {
        if (hasPush) {
            const pushTitle = renderTemplate(DEFAULTS.client.pushTitle, fields);
            const pushBody = renderTemplate(DEFAULTS.client.pushBody, fields);
            await sendAndStoreNotification(clientUserId, pushTitle, pushBody, {
                caseId: String(row.CaseId),
                type: 'LICENSE_RENEWAL',
                reminderKey,
            });
            channels.push = true;
            channels.inApp = true;
        }

        await sendTransactionalCustomHtmlEmail({
            toEmail: clientEmail,
            subject,
            htmlBody,
            logLabel: `LICENSE_RENEWAL_${reminderKey}`,
        });
        channels.email = true;

        console.log(
            JSON.stringify({
                event: 'license_renewal_client_sent',
                caseId: Number(row.CaseId),
                reminderKey,
                recipientUserId: clientUserId,
                email: clientEmail ? maskEmailForLog(clientEmail) : null,
                hasPush,
                channels,
            })
        );

        return { ok: true, channels };
    } catch (e) {
        return { ok: false, error: e?.message || 'send_failed' };
    }
}

async function sendManagerReminder14Days({ row, todayKey }) {
    const managerUserId = Number(row.ManagerUserId);
    const managerEmail = String(row.ManagerEmail || '').trim();
    const managerName = String(row.ManagerName || '').trim();

    if (!Number.isFinite(managerUserId) || managerUserId <= 0) return { ok: true, skipped: true, reason: 'no_manager' };
    if (!managerEmail) return { ok: true, skipped: true, reason: 'no_manager_email' };

    const clientName = String(row.ClientName || '').trim();
    const caseTitle = String(row.CaseName || '').trim();
    const expiryKey = normalizeDateOnlyKey(row.LicenseExpiryDate);

    const expiryDateUtc = parseDateOnly(expiryKey);
    if (!expiryDateUtc) return { ok: false, error: 'invalid_expiry_date' };

    const due = computeDueDate({ expiryDateUtc, reminderKey: 'D14' });
    if (toDateOnlyString(due) !== String(todayKey)) {
        return { ok: false, error: 'due_date_mismatch' };
    }

    const actionUrl = `https://${String(process.env.WEBSITE_DOMAIN || '').trim() || 'client.melamedlaw.co.il'}`;

    const fields = {
        recipient_name: managerName,
        client_name: clientName,
        case_title: caseTitle,
        expiry_date: formatDateHebrew(expiryKey),
        time_left: 'שבועיים',
        action_url: actionUrl,
    };

    const subject = renderTemplate(DEFAULTS.manager.emailSubject, fields);
    const bodyInner = renderTemplate(DEFAULTS.manager.emailBody, fields);

    const htmlBody = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#EDF2F7;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
        <div style="background:#2A4365;padding:20px 24px;text-align:center;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#fff;font-size:18px;font-weight:700;">תזכורת לעדכון רישיון (לקוח)</div>
        <div style="padding:22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2D3748;line-height:1.8;font-size:15px;">${bodyInner}</div>
        <div style="padding:14px 24px 22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#718096;font-size:12px;">הודעה זו נשלחה אוטומטית.</div>
      </div>
    </body></html>`;

    const channels = { email: false };

    if (isDryRunEnabled()) {
        const dryChannels = { ...channels, dryRun: true, wouldSend: { email: Boolean(managerEmail) } };
        console.log(
            JSON.stringify({
                event: 'license_renewal_manager_dry_run',
                caseId: Number(row.CaseId),
                recipientUserId: managerUserId,
                email: maskEmailForLog(managerEmail),
                channels: dryChannels,
            })
        );
        return { ok: true, dryRun: true, channels: dryChannels };
    }

    const gate = await tryAcquireReminderAuditGate({
        caseId: row.CaseId,
        recipientUserId: managerUserId,
        recipientKind: 'manager',
        reminderKey: 'D14',
        dueDateKey: todayKey,
        expiryDateKey: expiryKey,
        extraMetadata: {
            managerEmail: maskEmailForLog(managerEmail),
        },
    });

    if (!gate.ok) return { ok: false, error: 'audit_gate_error' };
    if (!gate.acquired) return { ok: true, skipped: true, reason: 'already_handled' };

    try {
        await sendTransactionalCustomHtmlEmail({
            toEmail: managerEmail,
            subject,
            htmlBody,
            logLabel: 'LICENSE_RENEWAL_MANAGER_D14',
        });
        channels.email = true;

        console.log(
            JSON.stringify({
                event: 'license_renewal_manager_sent',
                caseId: Number(row.CaseId),
                recipientUserId: managerUserId,
                email: maskEmailForLog(managerEmail),
                channels,
            })
        );

        return { ok: true, channels };
    } catch (e) {
        return { ok: false, error: e?.message || 'send_failed' };
    }
}

async function sendCeoReminder14Days({ row, todayKey }) {
    // Send license renewal reminder to all active platform admins
    let admins;
    try {
        admins = await getPlatformAdmins();
    } catch (e) {
        return { ok: false, error: 'platform_admins_lookup_failed' };
    }
    // Filter to admins with an email address
    const recipients = admins
        .filter(a => String(a.email || '').trim())
        .map(a => ({ email: String(a.email).trim(), name: String(a.user_name || '').trim(), userId: Number(a.user_id) }));

    if (recipients.length === 0) return { ok: true, skipped: true, reason: 'no_platform_admin_email' };

    const clientName = String(row.ClientName || '').trim();
    const caseTitle = String(row.CaseName || '').trim();
    const expiryKey = normalizeDateOnlyKey(row.LicenseExpiryDate);

    const expiryDateUtc = parseDateOnly(expiryKey);
    if (!expiryDateUtc) return { ok: false, error: 'invalid_expiry_date' };

    const due = computeDueDate({ expiryDateUtc, reminderKey: 'D14' });
    if (toDateOnlyString(due) !== String(todayKey)) {
        return { ok: false, error: 'due_date_mismatch' };
    }

    const actionUrl = `https://${String(process.env.WEBSITE_DOMAIN || '').trim() || 'client.melamedlaw.co.il'}`;

    const buildHtml = (recipientName) => {
        const fields = {
            recipient_name: recipientName || 'שלום',
            client_name: clientName,
            case_title: caseTitle,
            expiry_date: formatDateHebrew(expiryKey),
            time_left: 'שבועיים',
            action_url: actionUrl,
        };

        const subject = renderTemplate(DEFAULTS.manager.emailSubject, fields);
        const bodyInner = renderTemplate(DEFAULTS.manager.emailBody, fields);

        const htmlBody = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#EDF2F7;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
        <div style="background:#2A4365;padding:20px 24px;text-align:center;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#fff;font-size:18px;font-weight:700;">תזכורת לעדכון רישיון (לקוח)</div>
        <div style="padding:22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2D3748;line-height:1.8;font-size:15px;">${bodyInner}</div>
        <div style="padding:14px 24px 22px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#718096;font-size:12px;">הודעה זו נשלחה אוטומטית.</div>
      </div>
    </body></html>`;

        return { subject, htmlBody };
    };

    const channels = { email: false };

    if (isDryRunEnabled()) {
        const dryChannels = { ...channels, dryRun: true, wouldSend: { email: true }, adminCount: recipients.length };
        console.log(
            JSON.stringify({
                event: 'license_renewal_ceo_dry_run',
                caseId: Number(row.CaseId),
                recipients: recipients.map(r => ({ userId: r.userId, email: maskEmailForLog(r.email) })),
                channels: dryChannels,
            })
        );
        return { ok: true, dryRun: true, channels: dryChannels };
    }

    const gate = await tryAcquireReminderAuditGate({
        caseId: row.CaseId,
        recipientUserId: 0,
        recipientKind: 'platform_admin',
        reminderKey: 'D14',
        dueDateKey: todayKey,
        expiryDateKey: expiryKey,
        extraMetadata: {
            adminCount: recipients.length,
        },
    });

    if (!gate.ok) return { ok: false, error: 'audit_gate_error' };
    if (!gate.acquired) return { ok: true, skipped: true, reason: 'already_handled' };

    try {
        for (const recipient of recipients) {
            const { subject, htmlBody } = buildHtml(recipient.name);
            await sendTransactionalCustomHtmlEmail({
                toEmail: recipient.email,
                subject,
                htmlBody,
                logLabel: 'LICENSE_RENEWAL_ADMIN_D14',
            });

            console.log(
                JSON.stringify({
                    event: 'license_renewal_admin_sent',
                    caseId: Number(row.CaseId),
                    recipientUserId: recipient.userId,
                    email: maskEmailForLog(recipient.email),
                })
            );
        }
        channels.email = true;

        return { ok: true, channels, adminCount: recipients.length };
    } catch (e) {
        return { ok: false, error: e?.message || 'send_failed' };
    }
}

async function runLicenseRenewalRemindersOnce({ timeZone } = {}) {
    const tz = String(timeZone || process.env.LICENSE_RENEWAL_REMINDERS_TZ || 'Asia/Jerusalem');
    const todayKey = getTodayDateKeyInTz(tz);

    if (!isRemindersEnabled()) {
        return { ok: true, todayKey, totalCandidates: 0, skipped: 'disabled' };
    }

    let total = 0;
    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const reminderKey of ['M4', 'M2', 'M1', 'D14']) {
        const dueRows = await findDueCasesForReminder({ todayKey, reminderKey });

        for (const row of dueRows) {
            total += 1;
            const clientRes = await sendClientReminder({ reminderKey, row, todayKey });

            if (!clientRes?.ok) {
                errorCount += 1;
                console.log(
                    JSON.stringify({
                        event: 'license_renewal_client_error',
                        caseId: Number(row.CaseId),
                        reminderKey,
                        error: clientRes?.error || 'unknown',
                    })
                );
            } else if (clientRes?.skipped) {
                skippedCount += 1;
                console.log(
                    JSON.stringify({
                        event: 'license_renewal_client_skipped',
                        caseId: Number(row.CaseId),
                        reminderKey,
                        reason: clientRes?.reason || 'unknown',
                    })
                );
            } else {
                sentCount += 1;
            }

            if (reminderKey === 'D14') {
                const managerRes = await sendManagerReminder14Days({ row, todayKey });

                if (!managerRes?.ok) {
                    errorCount += 1;
                    console.log(
                        JSON.stringify({
                            event: 'license_renewal_manager_error',
                            caseId: Number(row.CaseId),
                            reminderKey: 'D14',
                            error: managerRes?.error || 'unknown',
                        })
                    );
                } else if (managerRes?.skipped) {
                    skippedCount += 1;
                    console.log(
                        JSON.stringify({
                            event: 'license_renewal_manager_skipped',
                            caseId: Number(row.CaseId),
                            reminderKey: 'D14',
                            reason: managerRes?.reason || 'unknown',
                        })
                    );
                } else {
                    sentCount += 1;
                }

                const ceoRes = await sendCeoReminder14Days({ row, todayKey });

                if (!ceoRes?.ok) {
                    errorCount += 1;
                    console.log(
                        JSON.stringify({
                            event: 'license_renewal_ceo_error',
                            caseId: Number(row.CaseId),
                            reminderKey: 'D14',
                            error: ceoRes?.error || 'unknown',
                        })
                    );
                } else if (ceoRes?.skipped) {
                    skippedCount += 1;
                    console.log(
                        JSON.stringify({
                            event: 'license_renewal_ceo_skipped',
                            caseId: Number(row.CaseId),
                            reminderKey: 'D14',
                            reason: ceoRes?.reason || 'unknown',
                        })
                    );
                } else {
                    sentCount += 1;
                }
            }
        }
    }

    return {
        ok: true,
        todayKey,
        totalCandidates: total,
        sentCount,
        skippedCount,
        errorCount,
    };
}

module.exports = {
    runLicenseRenewalRemindersOnce,
    getTodayDateKeyInTz,
};
