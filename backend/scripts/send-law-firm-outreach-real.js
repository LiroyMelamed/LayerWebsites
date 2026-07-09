#!/usr/bin/env node
'use strict';

/**
 * REAL law-firm outreach sender.
 *
 * Why this exists: the original send-law-firm-outreach.js routes through
 * smooveEmailCampaignService, whose send is gated by
 *   shouldSendRealEmail = isProduction || FORCE_SEND_EMAIL_ALL
 * Both are false in this environment (NODE_ENV=development, IS_PRODUCTION unset,
 * FORCE_SEND_EMAIL_ALL=false, and the runtime override is defeated by module
 * load order), so every "send" silently SIMULATED and nothing was delivered.
 *
 * This script sends for real through the dedicated Brevo SMTP relay
 * (OUTREACH_SMTP_*), exactly like scripts/send-test-outreach.js which we
 * verified delivers. No simulation gate, no app SMTP, no PDF attachment.
 *
 * It reuses the same state file + row indexing as the original script, so
 * --resume continues from logs/outreach-state.json (nextRow).
 *
 * Default mode is DRY RUN. Use --send to actually deliver.
 *
 * Example (resume real send, 300 max, 800ms apart):
 *   node scripts/send-law-firm-outreach-real.js \
 *     --file "./data/רשימת עורכי דין.xlsx" --send --limit 300 --resume --delay-ms 800
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const argv = process.argv.slice(2);

function getArgValue(flag, fallback = '') {
    const idx = argv.indexOf(flag);
    if (idx === -1) return fallback;
    const next = argv[idx + 1];
    if (!next || next.startsWith('--')) return fallback;
    return String(next).trim();
}
function hasFlag(flag) { return argv.includes(flag); }
function toPositiveInt(value, fallback) {
    const n = Number.parseInt(String(value || ''), 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isValidEmail(email) {
    const s = String(email || '').trim();
    if (!s || s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
function isAlreadySentStatus(statusValue) {
    const s = String(statusValue || '').trim().toLowerCase();
    if (!s) return false;
    if (['לא', 'לא נשלח', 'no', 'not sent', 'false', '0'].includes(s)) return false;
    if (s === 'כן') return true;
    if (s.includes('נשלח')) return true;
    if (s === 'sent' || s === 'done' || s === 'yes' || s === 'בוצע') return true;
    return true;
}
function fillTemplate(input, data) {
    let out = String(input || '');
    for (const [k, v] of Object.entries(data || {})) {
        out = out.split(`[[${k}]]`).join(String(v ?? ''));
    }
    return out;
}
function firstNonEmpty(row, keys) {
    if (!row || typeof row !== 'object') return '';
    const byLower = new Map();
    for (const key of Object.keys(row)) byLower.set(String(key).trim().toLowerCase(), key);
    for (const candidate of keys) {
        const realKey = byLower.get(String(candidate).trim().toLowerCase());
        if (!realKey) continue;
        const raw = row[realKey];
        const value = String(raw == null ? '' : raw).trim();
        if (value) return value;
    }
    return '';
}
// Names in the sheet often already carry the "עו"ד" honorific (e.g. עו"ד יאיר יעקב).
// Strip a leading advocate title so the greeting doesn't read "שלום עו"ד עו"ד ...".
function stripAdvocateTitle(name) {
    return String(name || '')
        .trim()
        .replace(/^(?:עו["'״]ד|עוה["'״]ד)\s*[-–:.]?\s*/u, '')
        .trim();
}
function maskEmail(email) {
    const s = String(email || '');
    const at = s.indexOf('@');
    if (at <= 0) return s;
    return `${s.slice(0, Math.min(3, at))}***${s.slice(at)}`;
}

const HTML_TEMPLATE = `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #222; font-size: 0.9375rem;">
    <p>[[greeting]],</p>

    <p>
        אני לירוי מלמד מחברת <strong>Melamedia</strong>. אנחנו מפעילים פלטפורמה שכבר עובדת בכמה
        משרדי עו"ד בישראל, עם מטרה אחת: שהלקוחות יראו בעצמם באיזה שלב התיק שלהם נמצא —
        בלי הטלפונים החוזרים של "מה קורה עם התיק שלי?".
    </p>

    <p>
        בפועל הלקוח מקבל אזור אישי / אפליקציה עם השם והלוגו של <strong>[[firm]]</strong>, רואה את
        סטטוס התיק והמסמכים, ומקבל עדכון אוטומטי (SMS + מייל) בכל פעם שמתעדכן שלב.
        כחלק מהפלטפורמה אנחנו מציעים גם שירות של חתימות דיגיטליות — במקום לשלם מחיר מופקע לחברות אחרות.
    </p>

    <p>זה לא מחליף את המערכת הקיימת אצלך — זו שכבה שמפחיתה את העומס האדמיניסטרטיבי.</p>

    <p>
        אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.
    </p>

    <p>
        בתודה,<br/>
        <strong>[[signature_name]]</strong> · Melamedia
    </p>
</div>
`.trim();

function buildText(data) {
    return [
        `${data.greeting},`,
        '',
        'אני לירוי מלמד מחברת Melamedia. אנחנו מפעילים פלטפורמה שכבר עובדת בכמה משרדי עו"ד בישראל, עם מטרה אחת: שהלקוחות יראו בעצמם באיזה שלב התיק שלהם נמצא — בלי הטלפונים החוזרים של "מה קורה עם התיק שלי?".',
        '',
        `בפועל הלקוח מקבל אזור אישי / אפליקציה עם השם והלוגו של ${data.firm}, רואה את סטטוס התיק והמסמכים, ומקבל עדכון אוטומטי (SMS + מייל) בכל פעם שמתעדכן שלב. כחלק מהפלטפורמה אנחנו מציעים גם שירות של חתימות דיגיטליות — במקום לשלם מחיר מופקע לחברות אחרות.`,
        '',
        'זה לא מחליף את המערכת הקיימת אצלך — זו שכבה שמפחיתה את העומס האדמיניסטרטיבי.',
        '',
        'אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.',
        '',
        'בתודה,',
        `${data.signature_name} · Melamedia`,
    ].join('\n');
}

async function main() {
    const fileArg = getArgValue('--file');
    if (!fileArg) { console.error('Missing required flag: --file /path/to/file.xlsx'); process.exit(1); }

    const absoluteFilePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(absoluteFilePath)) { console.error(`File not found: ${absoluteFilePath}`); process.exit(1); }
    if (path.extname(absoluteFilePath).toLowerCase() !== '.xlsx') {
        console.error('Only .xlsx is supported.'); process.exit(1);
    }

    const shouldSend = hasFlag('--send');
    const delayMs = toPositiveInt(getArgValue('--delay-ms', '4000'), 4000);
    const limit = toPositiveInt(getArgValue('--limit', '0'), 0);
    const resume = hasFlag('--resume');
    const stateFile = path.resolve(__dirname, '../logs/outreach-state.json');

    let startAt = toPositiveInt(getArgValue('--start-at', '1'), 1);
    if (resume) {
        try {
            if (fs.existsSync(stateFile)) {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                if (state && typeof state.nextRow === 'number' && state.nextRow > 0) {
                    startAt = state.nextRow;
                    console.log(`Resuming from row ${startAt} (state file: ${stateFile})`);
                }
            }
        } catch (e) {
            console.warn(`Could not read state file (${e.message}); starting from row ${startAt}`);
        }
    }

    const subjectTemplate = getArgValue('--subject', 'שאלה קצרה לגבי עדכון לקוחות במשרד שלך');
    const signatureName = getArgValue('--signature-name', 'לירוי מלמד');
    const replyTo = getArgValue('--reply-to', 'liroymelamed@icloud.com');
    const fromName = getArgValue('--from-name', 'לירוי מלמד · Melamedia');

    // Dedicated Brevo relay (same as the verified test sender).
    const smtpHost = process.env.OUTREACH_SMTP_HOST;
    const smtpPort = parseInt(process.env.OUTREACH_SMTP_PORT || '587', 10);
    const smtpUser = process.env.OUTREACH_SMTP_USER;
    const smtpPass = process.env.OUTREACH_SMTP_PASS;
    const fromEmail = getArgValue('--from-email', '') || process.env.OUTREACH_SMTP_FROM_EMAIL || '';

    if (shouldSend && (!smtpHost || !smtpUser || !smtpPass || !fromEmail)) {
        console.error('Missing OUTREACH_SMTP_* env vars. Cannot send. Check backend/.env.');
        process.exit(1);
    }

    const { parseExcelBuffer } = require('../utils/parseExcel');
    const buf = fs.readFileSync(absoluteFilePath);
    const { sheetName, rows } = await parseExcelBuffer(buf);
    if (!sheetName || !rows.length) { console.error('No rows found in Excel.'); process.exit(1); }

    const selectedRows = rows.slice(startAt - 1);

    let transporter = null;
    if (shouldSend) {
        transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.verify();
    }

    console.log('---------------------------------------------');
    console.log('Law-firm outreach run (REAL sender / Brevo)');
    console.log('Mode:        ', shouldSend ? 'SEND' : 'DRY RUN');
    console.log('Workbook:    ', absoluteFilePath);
    console.log('Sheet:       ', sheetName);
    console.log('Rows in file:', rows.length);
    console.log('Start at row:', startAt);
    console.log('Max sends:   ', limit > 0 ? limit : '(no cap)');
    console.log('Rows to scan:', selectedRows.length);
    console.log('Delay (ms):  ', delayMs);
    console.log('Reply-To:    ', replyTo);
    console.log('From:        ', `${fromName} <${fromEmail}>`);
    console.log('SMTP host:   ', shouldSend ? smtpHost : '(dry-run, no SMTP)');
    console.log('---------------------------------------------');

    const emailKeys = ['email', 'e-mail', 'mail', 'אימייל', 'מייל', 'כתובת אימייל', 'דואר אלקטרוני'];
    const nameKeys = ['name', 'full name', 'contact name', 'איש קשר', 'שם', 'שם איש קשר'];
    const firmKeys = ['firm', 'firm name', 'law firm', 'company', 'company name', 'שם משרד', 'שם חברה'];
    const alreadySentKeys = ['נשלח מייל', 'נשלח', 'sent', 'status'];

    const seen = new Set();
    let sent = 0, skipped = 0, failed = 0;
    const failures = [];

    for (let i = 0; i < selectedRows.length; i++) {
        if (limit > 0 && sent >= limit) {
            console.log(`Reached max sends (${limit}). Stopping.`);
            break;
        }
        const row = selectedRows[i];
        const excelRowNumber = startAt + i + 1;

        const alreadySent = firstNonEmpty(row, alreadySentKeys);
        if (isAlreadySentStatus(alreadySent)) {
            skipped++;
            console.log(`[SKIP] row=${excelRowNumber} already sent ("${alreadySent}")`);
            continue;
        }

        const toEmail = firstNonEmpty(row, emailKeys).toLowerCase();
        const rawName = firstNonEmpty(row, nameKeys);
        const cleanName = stripAdvocateTitle(rawName);
        const greeting = cleanName ? `שלום עו"ד ${cleanName}` : 'שלום';
        const firmName = firstNonEmpty(row, firmKeys) || rawName || cleanName || '';

        if (!toEmail || !isValidEmail(toEmail)) {
            skipped++;
            failures.push({ row: excelRowNumber, email: toEmail || null, reason: 'invalid_email' });
            console.log(`[SKIP] row=${excelRowNumber} invalid email`);
            continue;
        }
        if (seen.has(toEmail)) {
            skipped++;
            console.log(`[SKIP] row=${excelRowNumber} duplicate email ${maskEmail(toEmail)}`);
            continue;
        }
        seen.add(toEmail);

        const placeholderData = {
            greeting,
            firm: firmName,
            signature_name: signatureName,
        };
        const subject = fillTemplate(subjectTemplate, placeholderData);
        const htmlBody = fillTemplate(HTML_TEMPLATE, placeholderData);
        const textBody = buildText(placeholderData);

        if (!shouldSend) {
            sent++;
            console.log(`[DRY]  row=${excelRowNumber} to=${maskEmail(toEmail)} firm="${firmName}" subject="${subject}"`);
            continue;
        }

        try {
            const info = await transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to: toEmail,
                replyTo,
                subject,
                text: textBody,
                html: htmlBody,
            });
            sent++;
            console.log(`[SENT] row=${excelRowNumber} to=${maskEmail(toEmail)} messageId=${info.messageId}`);
            try {
                fs.writeFileSync(stateFile, JSON.stringify({
                    file: absoluteFilePath,
                    lastSentRow: excelRowNumber,
                    nextRow: excelRowNumber + 1,
                    totalRowsInFile: rows.length,
                    updatedAt: new Date().toISOString(),
                }, null, 2), 'utf8');
            } catch (e) {
                console.warn(`Could not update state file: ${e.message}`);
            }
        } catch (e) {
            failed++;
            failures.push({ row: excelRowNumber, email: toEmail, reason: 'EMAIL_SEND_FAILED', details: { error: e?.message } });
            console.log(`[FAIL] row=${excelRowNumber} to=${maskEmail(toEmail)} reason=${e?.message}`);
        }

        if (i < selectedRows.length - 1) await sleep(delayMs);
    }

    const summary = {
        mode: shouldSend ? 'send' : 'dry-run',
        sender: 'brevo-direct',
        file: absoluteFilePath,
        sheetName,
        totalRowsInFile: rows.length,
        attemptedRows: selectedRows.length,
        sent, skipped, failed, failures,
        finishedAt: new Date().toISOString(),
    };
    const ts = new Date().toISOString().replace(/[.:]/g, '-');
    const outputPath = path.resolve(__dirname, `../logs/law-firm-outreach-${ts}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log('---------------------------------------------');
    console.log('Completed outreach run');
    console.log('Sent:   ', sent);
    console.log('Skipped:', skipped);
    console.log('Failed: ', failed);
    console.log('Report: ', outputPath);
    console.log('---------------------------------------------');

    if (shouldSend && failed > 0) process.exitCode = 2;
}

main().catch((err) => {
    console.error('OUTREACH RUN FAILED:', err && err.message ? err.message : err);
    process.exit(1);
});
