/**
 * Quick one-off test: send a real email through the SMTP path
 * to verify Hebrew subject, CC to CEO, no replyTo.
 *
 * Usage:  node scripts/test-email.js
 * Requires .env to be loaded (dotenv).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Force real sending even in dev
process.env.FORCE_SEND_EMAIL_ALL = 'true';

const { sendTransactionalCustomHtmlEmail, sendEmailWithAttachments } = require('../utils/smooveEmailCampaignService');

async function main() {
    const testRecipient = process.env.LICENSE_RENEWAL_REMINDERS_CEO_EMAIL || 'Liav@MelamedLaw.co.il';

    console.log('\n=== Test 1: sendTransactionalEmail (SMTP path) ===');
    console.log('To:', testRecipient);
    console.log('CC should be:', process.env.LICENSE_RENEWAL_REMINDERS_CEO_EMAIL);
    console.log('(CC skipped when To === CC)\n');

    const result1 = await sendTransactionalCustomHtmlEmail({
        toEmail: testRecipient,
        subject: 'בדיקת מערכת אימייל - עדכון תיק',
        htmlBody: `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>בדיקת מערכת אימייל</h2>
                <p>זוהי הודעת בדיקה מהמערכת.</p>
                <p>אם אתה רואה את ההודעה הזו בצורה תקינה, ללא תווים מוזרים - המערכת עובדת!</p>
                <hr/>
                <p style="color: #888;">Test timestamp: ${new Date().toISOString()}</p>
            </div>
        `,
        logLabel: 'TEST_EMAIL',
    });

    console.log('Result 1:', JSON.stringify(result1, null, 2));

    // Test 2: sendEmailWithAttachments (no actual attachment, just tests the path)
    console.log('\n=== Test 2: sendEmailWithAttachments (SMTP + CC) ===');

    const result2 = await sendEmailWithAttachments({
        toEmail: testRecipient,
        subject: 'בדיקה #2 - מסמך נחתם בהצלחה',
        htmlBody: `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>בדיקת שליחה עם קבצים מצורפים</h2>
                <p>זהו אימייל בדיקה שנשלח דרך sendEmailWithAttachments.</p>
                <p>אם הנושא בעברית תקין - הכול עובד!</p>
                <hr/>
                <p style="color: #888;">Test timestamp: ${new Date().toISOString()}</p>
            </div>
        `,
        attachments: [],
        logLabel: 'TEST_ATTACHMENT_EMAIL',
    });

    console.log('Result 2:', JSON.stringify(result2, null, 2));

    console.log('\n=== Done! Check inbox for both emails ===\n');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
