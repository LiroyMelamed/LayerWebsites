/**
 * Quick test: invoke the license-renewal reminder pipeline for today.
 * Sends REAL emails (FORCE_SEND_EMAIL_ALL=true, DRY_RUN=0).
 *
 * Usage: node tests/test-license-renewal-reminder.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Override env for real sending
process.env.FORCE_SEND_EMAIL_ALL = 'true';
process.env.LICENSE_RENEWAL_REMINDERS_DRY_RUN = '0';
process.env.LICENSE_RENEWAL_REMINDERS_ENABLED = 'true';

const { runLicenseRenewalRemindersOnce, getTodayDateKeyInTz } = require('../tasks/licenseRenewal/service');

async function main() {
    const tz = process.env.LICENSE_RENEWAL_REMINDERS_TZ || 'Asia/Jerusalem';
    const todayKey = getTodayDateKeyInTz(tz);
    console.log(`\n=== License Renewal Reminder Test ===`);
    console.log(`Today (${tz}): ${todayKey}`);
    console.log(`Looking for cases with LicenseExpiryDate = ${todayKey} + 14 days = 2026-03-09\n`);

    const result = await runLicenseRenewalRemindersOnce({ timeZone: tz });
    console.log('\nResult:', JSON.stringify(result, null, 2));

    if (result.sentCount > 0) {
        console.log(`\n✅ ${result.sentCount} reminder(s) sent! Check liroymelamed@icloud.com inbox.`);
    } else if (result.skippedCount > 0) {
        console.log(`\n⚠️ ${result.skippedCount} reminder(s) skipped (already sent or audit gate blocked).`);
    } else {
        console.log(`\n❌ No reminders sent. totalCandidates=${result.totalCandidates}`);
    }

    // Give SMTP time to flush
    await new Promise(r => setTimeout(r, 3000));
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
