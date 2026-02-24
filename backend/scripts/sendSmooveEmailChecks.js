/*
  Send test emails for all supported Smoove email campaign keys.

  Usage (PowerShell):
    $env:FORCE_SEND_EMAIL_ALL='true'; node scripts/sendSmooveEmailChecks.js --to liroymelamed@icloud.com

  Notes:
  - Uses backend/utils/smooveEmailCampaignService.js
  - Prints a per-key result summary (no secrets).
*/

const { sendEmailCampaign } = require('../utils/smooveEmailCampaignService');

function getArgValue(flag) {
    const idx = process.argv.indexOf(flag);
    if (idx < 0) return null;
    const v = process.argv[idx + 1];
    return v == null ? null : String(v);
}

function pickToEmail() {
    return (
        getArgValue('--to') ||
        getArgValue('-t') ||
        process.env.TEST_TO_EMAIL ||
        ''
    ).trim();
}

async function main() {
    const toEmail = pickToEmail();
    if (!toEmail) {
        console.error('Missing --to <email> (or TEST_TO_EMAIL env var)');
        process.exitCode = 2;
        return;
    }

    const baseUrl = 'https://client.melamedlaw.co.il';

    const tests = [
        {
            key: 'SIGN_INVITE',
            fields: {
                recipient_name: 'לירוי',
                document_name: 'בדיקת הזמנה לחתימה',
                action_url: `${baseUrl}/sign/test?token=demo`,
                lawyer_name: 'עו"ד מלמד',
            },
        },
        {
            key: 'SIGN_REMINDER',
            fields: {
                recipient_name: 'לירוי',
                document_name: 'בדיקת תזכורת לחתימה',
                action_url: `${baseUrl}/sign/test?token=demo`,
                lawyer_name: 'עו"ד מלמד',
            },
        },
        {
            key: 'CASE_CREATED',
            fields: {
                recipient_name: 'לירוי',
                case_title: 'בדיקת יצירת תיק',
                case_number: '1001',
                case_stage: 'שלב ראשוני',
                manager_name: 'עו"ד מלמד',
                action_url: baseUrl,
            },
        },
        {
            key: 'DOC_SIGNED',
            fields: {
                recipient_name: 'לירוי',
                document_name: 'בדיקת מסמך נחתם',
                lawyer_name: 'עו"ד מלמד',
                action_url: baseUrl,
            },
        },
        {
            key: 'DOC_REJECTED',
            fields: {
                recipient_name: 'לירוי',
                document_name: 'בדיקת מסמך נדחה',
                lawyer_name: 'עו"ד מלמד',
                rejection_reason: 'בדיקת סיבת דחייה',
                action_url: baseUrl,
            },
        },
    ];

    console.log(JSON.stringify({ event: 'smoove_email_checks_start', toEmail, count: tests.length }, null, 2));

    for (const t of tests) {
        try {
            const r = await sendEmailCampaign({
                toEmail,
                campaignKey: t.key,
                contactFields: t.fields,
            });

            console.log(
                JSON.stringify(
                    {
                        campaignKey: t.key,
                        ok: Boolean(r?.ok),
                        simulated: Boolean(r?.simulated),
                        mode: r?.mode || null,
                        errorCode: r?.errorCode || null,
                        missing: r?.missing || null,
                        campaignId: r?.campaignId || null,
                        campaignSendId: r?.campaignSendId || null,
                        contactId: r?.contactId || null,
                    },
                    null,
                    2
                )
            );
        } catch (e) {
            console.log(JSON.stringify({ campaignKey: t.key, ok: false, error: String(e?.message || e) }, null, 2));
        }
    }

    console.log(JSON.stringify({ event: 'smoove_email_checks_done' }, null, 2));
}

main();
