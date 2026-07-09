'use strict';

/**
 * One-off deliverability + copy test for the law-firm outreach campaign.
 *
 * Sends ONE email with the *new* (rewritten) Hebrew copy through the same Brevo
 * SMTP transport the real campaign uses, so the test reflects real deliverability.
 *
 * It does NOT read the Excel list and does NOT touch logs/outreach-state.json,
 * so the campaign resume position (nextRow) is left untouched.
 *
 * Usage:
 *   node scripts/send-test-outreach.js                 # -> zaqwedsxc2@gmail.com
 *   node scripts/send-test-outreach.js other@mail.com  # -> custom recipient
 */

const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TO = process.argv[2] || 'zaqwedsxc2@gmail.com';

// Sample placeholder values (what a real recipient row would fill in).
const RECIPIENT_NAME = 'ישראל';
const FIRM = 'משרד עו״ד ישראלי';

// --- Subject (option A from the approved plan) ---
const SUBJECT = 'שאלה קצרה לגבי עדכון לקוחות במשרד שלך';

// --- New body copy ---
const HTML = `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #222; font-size: 0.9375rem;">
  <p>שלום עו"ד ${RECIPIENT_NAME},</p>

  <p>
    אני לירוי מלמד מחברת <strong>Melamedia</strong>. אנחנו מפעילים פלטפורמה שכבר עובדת בכמה
    משרדי עו"ד בישראל, עם מטרה אחת: שהלקוחות יראו בעצמם באיזה שלב התיק שלהם נמצא —
    בלי הטלפונים החוזרים של "מה קורה עם התיק שלי?".
  </p>

  <p>
    בפועל הלקוח מקבל אזור אישי / אפליקציה עם השם והלוגו של <strong>${FIRM}</strong>, רואה את
    סטטוס התיק והמסמכים, ומקבל עדכון אוטומטי (SMS + מייל) בכל פעם שמתעדכן שלב.
    כחלק מהפלטפורמה אנחנו מציעים גם שירות של חתימות דיגיטליות — במקום לשלם מחיר מופקע לחברות אחרות.
  </p>

  <p>זה לא מחליף את המערכת הקיימת אצלך — זו שכבה שמפחיתה את העומס האדמיניסטרטיבי.</p>

  <p>
    אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.
  </p>

  <p>
    בתודה,<br/>
    <strong>לירוי מלמד</strong> · Melamedia
  </p>

  <p style="font-size: 0.75rem; color: #666;">
    קיבלת מייל זה כי אנחנו פונים למשרדי עו"ד בישראל. אם זה לא רלוונטי, השב/י "להסיר" ולא אטריד שוב.
  </p>
</div>
`.trim();

const TEXT = [
  `שלום עו"ד ${RECIPIENT_NAME},`,
  '',
  'אני לירוי מלמד מחברת Melamedia. אנחנו מפעילים פלטפורמה שכבר עובדת בכמה משרדי עו"ד בישראל, עם מטרה אחת: שהלקוחות יראו בעצמם באיזה שלב התיק שלהם נמצא — בלי הטלפונים החוזרים של "מה קורה עם התיק שלי?".',
  '',
  `בפועל הלקוח מקבל אזור אישי / אפליקציה עם השם והלוגו של ${FIRM}, רואה את סטטוס התיק והמסמכים, ומקבל עדכון אוטומטי (SMS + מייל) בכל פעם שמתעדכן שלב. כחלק מהפלטפורמה אנחנו מציעים גם שירות של חתימות דיגיטליות — במקום לשלם מחיר מופקע לחברות אחרות.`,
  '',
  'זה לא מחליף את המערכת הקיימת אצלך — זו שכבה שמפחיתה את העומס האדמיניסטרטיבי.',
  '',
  'אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.',
  '',
  'בתודה,',
  'לירוי מלמד · Melamedia',
  '',
  'קיבלת מייל זה כי אנחנו פונים למשרדי עו"ד בישראל. אם זה לא רלוונטי, השב "להסיר" ולא אטריד שוב.',
].join('\n');

async function main() {
  const host = process.env.OUTREACH_SMTP_HOST;
  const port = parseInt(process.env.OUTREACH_SMTP_PORT || '587', 10);
  const user = process.env.OUTREACH_SMTP_USER;
  const pass = process.env.OUTREACH_SMTP_PASS;
  const fromEmail = process.env.OUTREACH_SMTP_FROM_EMAIL;

  if (!host || !user || !pass || !fromEmail) {
    console.error('Missing OUTREACH_SMTP_* env vars. Check backend/.env.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587 -> STARTTLS
    auth: { user, pass },
  });

  console.log('--------------------------------------------');
  console.log('Outreach TEST send (new copy, no state write)');
  console.log('SMTP host: ', host, 'port:', port);
  console.log('From:      ', `לירוי מלמד · Melamedia <${fromEmail}>`);
  console.log('Reply-To:  ', 'liroymelamed@icloud.com');
  console.log('To:        ', TO);
  console.log('Subject:   ', SUBJECT);
  console.log('--------------------------------------------');

  await transporter.verify();
  console.log('SMTP connection verified.');

  const info = await transporter.sendMail({
    from: `"לירוי מלמד · Melamedia" <${fromEmail}>`,
    to: TO,
    replyTo: 'liroymelamed@icloud.com',
    subject: SUBJECT,
    text: TEXT,
    html: HTML,
  });

  console.log('SENT ✓');
  console.log('messageId:', info.messageId);
  console.log('response: ', info.response);
  if (info.accepted) console.log('accepted: ', info.accepted.join(', '));
  if (info.rejected && info.rejected.length) console.log('rejected: ', info.rejected.join(', '));
}

main().catch((err) => {
  console.error('TEST SEND FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
