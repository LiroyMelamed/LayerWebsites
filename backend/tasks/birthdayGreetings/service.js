/**
 * Birthday-greetings service.
 *
 * Called once per day by the scheduler. Finds all users whose dateofbirth
 * matches today's month/day, skips users that were already greeted today
 * (tracked in birthday_greetings_sent), and sends a birthday SMS/push
 * via the notification orchestrator.
 *
 * The message template and enabled flag are stored in platform_settings.
 */

const pool = require('../../config/db');
const { getSetting } = require('../../services/settingsService');
const { renderTemplate } = require('../../utils/templateRenderer');
const { notifyRecipient } = require('../../services/notifications/notificationOrchestrator');
const { getWebsiteDomain } = require('../../utils/sendMessage');

/**
 * Process birthday greetings for today.
 * @param {{ timeZone?: string }} options
 * @returns {{ sent: number, skipped: number, errors: number, disabled?: boolean }}
 */
async function processBirthdayGreetings({ timeZone = 'Asia/Jerusalem' } = {}) {
    // Check if birthday greetings are enabled in settings
    const enabled = await getSetting('notifications', 'BIRTHDAY_GREETINGS_ENABLED', 'true');
    if (String(enabled).toLowerCase() !== 'true' && enabled !== true) {
        console.log('[birthday-greetings] Disabled via BIRTHDAY_GREETINGS_ENABLED setting.');
        return { sent: 0, skipped: 0, errors: 0, disabled: true };
    }

    // Determine today's date in the configured timezone
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const todayMonth = Number(map.month);
    const todayDay = Number(map.day);
    const todayDate = `${map.year}-${map.month}-${map.day}`; // YYYY-MM-DD

    if (!todayMonth || !todayDay) {
        console.error('[birthday-greetings] Could not determine today\'s date.');
        return { sent: 0, skipped: 0, errors: 0 };
    }

    // Find users with birthday today who haven't been greeted yet
    const { rows: birthdayUsers } = await pool.query(
        `SELECT u.userid   AS "UserId",
                u.name      AS "Name",
                u.email     AS "Email",
                u.phonenumber AS "PhoneNumber"
         FROM users u
         WHERE u.dateofbirth IS NOT NULL
           AND EXTRACT(MONTH FROM u.dateofbirth) = $1
           AND EXTRACT(DAY   FROM u.dateofbirth) = $2
           AND u.role = 'User'
           AND NOT EXISTS (
               SELECT 1 FROM birthday_greetings_sent bg
               WHERE bg.user_id = u.userid AND bg.sent_date = $3::date
           )`,
        [todayMonth, todayDay, todayDate]
    );

    if (birthdayUsers.length === 0) {
        console.log(`[birthday-greetings] No birthdays today (${todayDate}).`);
        return { sent: 0, skipped: 0, errors: 0 };
    }

    console.log(`[birthday-greetings] Found ${birthdayUsers.length} birthday(s) on ${todayDate}.`);

    // Load message template and firm name
    const smsTemplate = await getSetting(
        'templates',
        'BIRTHDAY_SMS',
        '{{firmName}} מאחלת לך מזל טוב ליום הולדתך, {{recipientName}}! 🎂🎉'
    );
    const firmName = await getSetting('firm', 'LAW_FIRM_NAME', null)
        || await getSetting('firm', 'COMPANY_NAME', 'MelamedLaw');
    const domain = await getWebsiteDomain();
    const websiteUrl = `https://${domain}`;

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of birthdayUsers) {
        try {
            const recipientName = String(user.Name || '').trim() || 'לקוח/ה יקר/ה';
            const smsBody = renderTemplate(smsTemplate, {
                recipientName,
                firmName,
                websiteUrl,
            });

            const result = await notifyRecipient({
                recipientUserId: user.UserId,
                recipientEmail: user.Email,
                recipientPhone: user.PhoneNumber,
                notificationType: 'BIRTHDAY',
                push: {
                    title: '🎂 יום הולדת שמח!',
                    body: smsBody,
                    data: { type: 'birthday' },
                },
                sms: {
                    messageBody: smsBody,
                },
            });

            if (result?.ok) {
                // Record that we sent, so we don't re-send today
                await pool.query(
                    `INSERT INTO birthday_greetings_sent (user_id, sent_date)
                     VALUES ($1, $2::date)
                     ON CONFLICT (user_id, sent_date) DO NOTHING`,
                    [user.UserId, todayDate]
                );
                sent++;
                console.log(`[birthday-greetings] Sent to userId=${user.UserId}`);
            } else {
                skipped++;
                console.warn(`[birthday-greetings] Orchestrator returned not-ok for userId=${user.UserId}:`, result?.errorCode);
            }
        } catch (e) {
            errors++;
            console.error(`[birthday-greetings] Error sending to userId=${user.UserId}:`, e?.message);
        }
    }

    // Clean up old tracking rows (keep only last 7 days)
    try {
        await pool.query(`DELETE FROM birthday_greetings_sent WHERE sent_date < CURRENT_DATE - INTERVAL '7 days'`);
    } catch (e) {
        console.warn('[birthday-greetings] Cleanup failed:', e?.message);
    }

    return { sent, skipped, errors };
}

module.exports = { processBirthdayGreetings };
