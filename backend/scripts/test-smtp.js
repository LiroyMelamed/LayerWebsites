#!/usr/bin/env node
/**
 * Quick SMTP connectivity test (no email content stored).
 * Usage:
 *   node scripts/test-smtp.js recipient@example.com
 * Or set SMTP_* in backend/.env and run from backend/.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const nodemailer = require('nodemailer');

const to = process.argv[2];
if (!to) {
    console.error('Usage: node scripts/test-smtp.js <recipient@email.com>');
    process.exit(1);
}

const host = String(process.env.SMTP_HOST || '').trim();
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const user = String(process.env.SMTP_USER || '').trim();
const pass = String(process.env.SMTP_PASS || '').trim();
const fromEmail = String(process.env.SMTP_FROM_EMAIL || user).trim();
const fromName = String(process.env.SMTP_FROM_NAME || 'SMTP Test').trim();

if (!host || !user || !pass) {
    console.error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASS in environment.');
    process.exit(1);
}

async function main() {
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    await transporter.verify();
    console.log('SMTP verify OK:', host, port, user);

    const info = await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject: `[test] ${fromEmail} via ${host}`,
        text: `SMTP test from ${fromEmail} at ${new Date().toISOString()}`,
    });

    console.log('Sent:', info.messageId);
}

main().catch((e) => {
    console.error('SMTP test failed:', e.message);
    process.exit(1);
});
