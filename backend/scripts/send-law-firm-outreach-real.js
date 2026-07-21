#!/usr/bin/env node
'use strict';

/**
 * REAL law-firm outreach sender (direct Nodemailer — no simulation gate).
 *
 * Resumes from logs/outreach-state.json with --resume.
 * Default mode is DRY RUN. Use --send to actually deliver.
 *
 * SMTP:
 *   --smtp app       → MelamedLaw SMTP_* (mail.melamedlaw.co.il)
 *   --smtp outreach  → Brevo OUTREACH_SMTP_* (default historically)
 *
 * Example (resume remaining with MelamedLaw SMTP + sales deck):
 *   node scripts/send-law-firm-outreach-real.js \
 *     --file "./data/רשימת עורכי דין.xlsx" \
 *     --send --resume --smtp app \
 *     --sales-deck "./data/מצגת מכירות.pdf" \
 *     --platform-url "https://mela-media.co.il/platform/" \
 *     --delay-ms 5000
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

function resolveOptionalSalesDeckPath(inputPath) {
    const explicit = String(inputPath || '').trim();
    if (explicit) {
        const abs = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
        console.error(`Sales deck not found: ${abs}`);
        process.exit(1);
    }
    const dataDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) return null;
    const candidates = fs.readdirSync(dataDir)
        .filter(name => /מצגת|sales|pitch|deck/i.test(name))
        .filter(name => /\.(pdf|ppt|pptx)$/i.test(name));
    if (!candidates.length) return null;
    return path.resolve(dataDir, candidates[0]);
}

function inferContentTypeByFilename(filename) {
    const n = String(filename || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (n.endsWith('.pptx')) {
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    return 'application/octet-stream';
}

function resolveSmtpConfig(smtpMode) {
    if (smtpMode === 'app') {
        return {
            mode: 'app',
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            fromEmail: process.env.SMTP_FROM_EMAIL,
            label: 'MelamedLaw SMTP (SMTP_*)',
        };
    }
    return {
        mode: 'outreach',
        host: process.env.OUTREACH_SMTP_HOST,
        port: parseInt(process.env.OUTREACH_SMTP_PORT || '587', 10),
        user: process.env.OUTREACH_SMTP_USER,
        pass: process.env.OUTREACH_SMTP_PASS,
        fromEmail: process.env.OUTREACH_SMTP_FROM_EMAIL,
        label: 'Brevo outreach (OUTREACH_SMTP_*)',
    };
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

    [[platform_paragraph]]

    [[sales_deck_paragraph]]

    <p>
        אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.
    </p>

    <p>
        בתודה,<br/>
        <strong>[[signature_name]]</strong> · Melamedia
    </p>

    <p style="font-size: 0.75rem; color: #666;">
        קיבלת מייל זה כי אנחנו פונים למשרדי עו"ד בישראל. אם זה לא רלוונטי, השב/י "להסיר" ולא אטריד שוב.
    </p>
</div>
`.trim();

function buildText(data) {
    const lines = [
        `${data.greeting},`,
        '',
        'אני לירוי מלמד מחברת Melamedia. אנחנו מפעילים פלטפורמה שכבר עובדת בכמה משרדי עו"ד בישראל, עם מטרה אחת: שהלקוחות יראו בעצמם באיזה שלב התיק שלהם נמצא — בלי הטלפונים החוזרים של "מה קורה עם התיק שלי?".',
        '',
        `בפועל הלקוח מקבל אזור אישי / אפליקציה עם השם והלוגו של ${data.firm}, רואה את סטטוס התיק והמסמכים, ומקבל עדכון אוטומטי (SMS + מייל) בכל פעם שמתעדכן שלב. כחלק מהפלטפורמה אנחנו מציעים גם שירות של חתימות דיגיטליות — במקום לשלם מחיר מופקע לחברות אחרות.`,
        '',
        'זה לא מחליף את המערכת הקיימת אצלך — זו שכבה שמפחיתה את העומס האדמיניסטרטיבי.',
        '',
    ];
    if (data.platform_url) {
        lines.push(`לפרטים נוספים על הפלטפורמה: ${data.platform_url}`, '');
    }
    if (data.has_sales_deck) {
        lines.push('צירפתי מצגת קצרה שמראה את זה בתמונות — שווה מבט.', '');
    }
    lines.push(
        'אם רלוונטי, אשמח ל-10 דקות כדי להראות איך זה נראה. אפשר פשוט להשיב למייל הזה.',
        '',
        'בתודה,',
        `${data.signature_name} · Melamedia`,
    );
    return lines.join('\n');
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
    const delayMs = toPositiveInt(getArgValue('--delay-ms', '5000'), 5000);
    const limit = toPositiveInt(getArgValue('--limit', '0'), 0);
    const resume = hasFlag('--resume');
    const stateFile = path.resolve(__dirname, '../logs/outreach-state.json');
    const smtpMode = String(getArgValue('--smtp', 'app') || 'app').toLowerCase();
    if (!['app', 'outreach'].includes(smtpMode)) {
        console.error('--smtp must be "app" (MelamedLaw) or "outreach" (Brevo)');
        process.exit(1);
    }

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
    const platformUrl = getArgValue('--platform-url', 'https://mela-media.co.il/platform/');
    const salesDeckPath = resolveOptionalSalesDeckPath(getArgValue('--sales-deck', ''));
    const onlyEmail = String(getArgValue('--only-email', '') || '').trim().toLowerCase();

    const smtp = resolveSmtpConfig(smtpMode);
    const fromEmail = getArgValue('--from-email', '') || smtp.fromEmail || '';

    if (shouldSend && (!smtp.host || !smtp.user || !smtp.pass || !fromEmail)) {
        console.error(`Missing SMTP config for mode "${smtpMode}". Check backend/.env.`);
        process.exit(1);
    }

    const { parseExcelBuffer } = require('../utils/parseExcel');
    const buf = fs.readFileSync(absoluteFilePath);
    const { sheetName, rows } = await parseExcelBuffer(buf);
    if (!sheetName || !rows.length) { console.error('No rows found in Excel.'); process.exit(1); }

    const selectedRows = rows.slice(startAt - 1);

    let salesDeckAttachment = null;
    if (salesDeckPath) {
        salesDeckAttachment = {
            filename: path.basename(salesDeckPath),
            content: fs.readFileSync(salesDeckPath),
            contentType: inferContentTypeByFilename(salesDeckPath),
        };
    }

    let transporter = null;
    if (shouldSend) {
        transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.port === 465,
            auth: { user: smtp.user, pass: smtp.pass },
        });
        await transporter.verify();
    }

    console.log('---------------------------------------------');
    console.log('Law-firm outreach run (REAL sender)');
    console.log('Mode:        ', shouldSend ? 'SEND' : 'DRY RUN');
    console.log('SMTP:        ', smtp.label);
    console.log('Workbook:    ', absoluteFilePath);
    console.log('Sheet:       ', sheetName);
    console.log('Rows in file:', rows.length);
    console.log('Start at row:', startAt);
    console.log('Max sends:   ', limit > 0 ? limit : '(no cap)');
    console.log('Rows to scan:', selectedRows.length);
    console.log('Delay (ms):  ', delayMs);
    console.log('Sales deck:  ', salesDeckPath || '(none)');
    console.log('Platform URL:', platformUrl || '(none)');
    console.log('Reply-To:    ', replyTo);
    console.log('From:        ', `${fromName} <${fromEmail}>`);
    console.log('SMTP host:   ', shouldSend ? smtp.host : '(dry-run, no SMTP)');
    if (onlyEmail) console.log('Only email:  ', onlyEmail);
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
        if (onlyEmail && toEmail !== onlyEmail) {
            skipped++;
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
            platform_url: platformUrl,
            has_sales_deck: Boolean(salesDeckAttachment),
            platform_paragraph: platformUrl
                ? `<p>לפרטים נוספים על הפלטפורמה: <a href="${platformUrl}">${platformUrl}</a></p>`
                : '',
            sales_deck_paragraph: salesDeckAttachment
                ? '<p>צירפתי מצגת קצרה שמראה את זה בתמונות — שווה מבט.</p>'
                : '',
        };
        const subject = fillTemplate(subjectTemplate, placeholderData);
        const htmlBody = fillTemplate(HTML_TEMPLATE, placeholderData);
        const textBody = buildText(placeholderData);

        if (!shouldSend) {
            sent++;
            const deckLabel = salesDeckPath ? ` attachment=${path.basename(salesDeckPath)}` : '';
            console.log(`[DRY]  row=${excelRowNumber} to=${maskEmail(toEmail)} firm="${firmName}" subject="${subject}"${deckLabel}`);
            continue;
        }

        try {
            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: toEmail,
                replyTo,
                subject,
                text: textBody,
                html: htmlBody,
            };
            if (salesDeckAttachment) {
                mailOptions.attachments = [salesDeckAttachment];
            }
            const info = await transporter.sendMail(mailOptions);
            sent++;
            console.log(`[SENT] row=${excelRowNumber} to=${maskEmail(toEmail)} messageId=${info.messageId}`);
            try {
                fs.writeFileSync(stateFile, JSON.stringify({
                    file: absoluteFilePath,
                    lastSentRow: excelRowNumber,
                    nextRow: excelRowNumber + 1,
                    totalRowsInFile: rows.length,
                    updatedAt: new Date().toISOString(),
                    smtpMode,
                }, null, 2), 'utf8');
            } catch (e) {
                console.warn(`Could not update state file: ${e.message}`);
            }
        } catch (e) {
            failed++;
            failures.push({ row: excelRowNumber, email: toEmail, reason: 'EMAIL_SEND_FAILED', details: { error: e?.message } });
            console.log(`[FAIL] row=${excelRowNumber} to=${maskEmail(toEmail)} reason=${e?.message}`);
            // Stop on hard SMTP failures (auth / rate limit) so we don't burn the list.
            const msg = String(e?.message || '').toLowerCase();
            if (msg.includes('auth') || msg.includes('rate') || msg.includes('too many') || msg.includes('limit')) {
                console.error('Stopping early due to SMTP auth/rate-limit error.');
                break;
            }
        }

        if (i < selectedRows.length - 1) await sleep(delayMs);
    }

    const summary = {
        mode: shouldSend ? 'send' : 'dry-run',
        sender: smtp.mode === 'app' ? 'melamedlaw-smtp' : 'brevo-direct',
        smtpHost: smtp.host || null,
        file: absoluteFilePath,
        sheetName,
        totalRowsInFile: rows.length,
        startAt,
        attemptedRows: selectedRows.length,
        sent, skipped, failed, failures,
        salesDeck: salesDeckPath || null,
        platformUrl: platformUrl || null,
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
