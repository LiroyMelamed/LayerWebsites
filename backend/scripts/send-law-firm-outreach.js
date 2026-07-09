#!/usr/bin/env node
'use strict';

/**
 * Send law-firm outreach emails one by one from an Excel file.
 *
 * Default mode is DRY RUN (no real send).
 * Use --send to send real emails.
 *
 * Example:
 *   node scripts/send-law-firm-outreach.js --file ./data/law-firms.xlsx --send
 *
 * Optional flags:
 *   --subject "קיצור זמן ניהול תיקים למשרד שלך"
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);

function getArgValue(flag, fallback = '') {
    const idx = argv.indexOf(flag);
    if (idx === -1) return fallback;
    const next = argv[idx + 1];
    if (!next || next.startsWith('--')) return fallback;
    return String(next).trim();
}

function hasFlag(flag) {
    return argv.includes(flag);
}

function toPositiveInt(value, fallback) {
    const n = Number.parseInt(String(value || ''), 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveOptionalSalesDeckPath(inputPath) {
    const explicit = String(inputPath || '').trim();
    if (explicit) {
        const abs = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
        return null;
    }

    const dataDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
        return null;
    }

    const files = fs.readdirSync(dataDir, { withFileTypes: true })
        .filter(d => d.isFile())
        .map(d => d.name);

    const candidates = files
        .filter(name => /מצגת|sales|pitch|deck/i.test(name))
        .filter(name => /\.(pdf|ppt|pptx)$/i.test(name));

    if (!candidates.length) return null;
    return path.resolve(dataDir, candidates[0]);
}

function inferContentTypeByFilename(filename) {
    const n = String(filename || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (n.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/octet-stream';
}

function isValidEmail(email) {
    const s = String(email || '').trim();
    if (!s || s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function isAlreadySentStatus(statusValue) {
    const s = String(statusValue || '').trim().toLowerCase();
    if (!s) return false;

    // Explicit unsent markers.
    if (['לא', 'לא נשלח', 'no', 'not sent', 'false', '0'].includes(s)) return false;

    // Common sent markers used in this sheet.
    if (s === 'כן') return true;
    if (s.includes('נשלח')) return true;
    if (s === 'sent' || s === 'done' || s === 'yes' || s === 'בוצע') return true;

    // Any other non-empty value is treated as sent to avoid accidental duplicates.
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
    for (const key of Object.keys(row)) {
        byLower.set(String(key).trim().toLowerCase(), key);
    }

    for (const candidate of keys) {
        const realKey = byLower.get(String(candidate).trim().toLowerCase());
        if (!realKey) continue;
        const raw = row[realKey];
        const value = String(raw == null ? '' : raw).trim();
        if (value) return value;
    }

    return '';
}

async function main() {
    const fileArg = getArgValue('--file');
    if (!fileArg) {
        console.error('Missing required flag: --file /path/to/file.xlsx');
        process.exit(1);
    }

    const absoluteFilePath = path.isAbsolute(fileArg)
        ? fileArg
        : path.resolve(process.cwd(), fileArg);

    if (!fs.existsSync(absoluteFilePath)) {
        console.error(`File not found: ${absoluteFilePath}`);
        process.exit(1);
    }

    const ext = path.extname(absoluteFilePath).toLowerCase();
    if (ext !== '.xlsx') {
        console.error('Only .xlsx is supported by this script. Please convert your file to .xlsx.');
        process.exit(1);
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
    const websiteUrl = getArgValue('--website-url', 'https://client.melamedlaw.co.il');
    const signatureName = getArgValue('--signature-name', 'לירוי מלמד');
    const signatureTitle = getArgValue('--signature-title', 'מנהל חברת Melamedia');
    const referralPhrase = getArgValue('--referral-phrase', 'קיבלתי את האימייל שלך מאחי');
    const replyTo = getArgValue('--reply-to', 'liroymelamed@icloud.com');
    const fromName = getArgValue('--from-name', 'Melamedia | לירוי מלמד');
    const fromEmailArg = getArgValue('--from-email', '');
    const salesDeckPath = resolveOptionalSalesDeckPath(getArgValue('--sales-deck', ''));

    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

    // Outreach uses a dedicated SMTP transport (e.g. Brevo) so we don't depend on
    // the app's cPanel mailbox, which rate-limits and rewrites the sender domain.
    // OUTREACH_SMTP_* values, when present, override the default SMTP_* for this run only.
    if (process.env.OUTREACH_SMTP_HOST) process.env.SMTP_HOST = process.env.OUTREACH_SMTP_HOST;
    if (process.env.OUTREACH_SMTP_PORT) process.env.SMTP_PORT = process.env.OUTREACH_SMTP_PORT;
    if (process.env.OUTREACH_SMTP_USER) process.env.SMTP_USER = process.env.OUTREACH_SMTP_USER;
    if (process.env.OUTREACH_SMTP_PASS) process.env.SMTP_PASS = process.env.OUTREACH_SMTP_PASS;
    const fromEmail = fromEmailArg || process.env.OUTREACH_SMTP_FROM_EMAIL || '';

    if (shouldSend) {
        process.env.FORCE_SEND_EMAIL_ALL = 'true';
    }

    const { parseExcelBuffer } = require('../utils/parseExcel');
    const {
        sendTransactionalCustomHtmlEmail,
        sendEmailWithAttachments,
    } = require('../utils/smooveEmailCampaignService');

    const buf = fs.readFileSync(absoluteFilePath);
    const { sheetName, rows } = await parseExcelBuffer(buf);

    if (!sheetName || !rows.length) {
        console.error('No rows found in Excel.');
        process.exit(1);
    }

    const selectedRows = rows.slice(startAt - 1);

    console.log('---------------------------------------------');
    console.log('Law-firm outreach run');
    console.log('Mode:        ', shouldSend ? 'SEND' : 'DRY RUN');
    console.log('Workbook:    ', absoluteFilePath);
    console.log('Sheet:       ', sheetName);
    console.log('Rows in file:', rows.length);
    console.log('Start at row:', startAt);
    console.log('Max sends:   ', limit > 0 ? limit : '(no cap)');
    console.log('Rows to scan:', selectedRows.length);
    console.log('Delay (ms):  ', delayMs);
    console.log('Sales deck:  ', salesDeckPath || '(none)');
    console.log('Reply-To:    ', replyTo || '(none)');
    console.log('From name:   ', fromName || '(default)');
    console.log('From email:  ', fromEmail || '(default from env/DB)');
    console.log('SMTP host:   ', process.env.SMTP_HOST || '(unset)');
    console.log('---------------------------------------------');

    const emailKeys = ['email', 'e-mail', 'mail', 'אימייל', 'מייל', 'כתובת אימייל', 'דואר אלקטרוני'];
    const nameKeys = ['name', 'full name', 'contact name', 'איש קשר', 'שם', 'שם איש קשר'];
    const firmKeys = ['firm', 'firm name', 'law firm', 'company', 'company name', 'שם משרד', 'שם חברה'];
    const alreadySentKeys = ['נשלח מייל', 'נשלח', 'sent', 'status'];

    const seen = new Set();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
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
        const recipientName = firstNonEmpty(row, nameKeys) || 'שלום';
        const firmName = firstNonEmpty(row, firmKeys) || recipientName;

        if (!toEmail || !isValidEmail(toEmail)) {
            skipped++;
            failures.push({ row: excelRowNumber, email: toEmail || null, reason: 'invalid_email' });
            console.log(`[SKIP] row=${excelRowNumber} invalid email`);
            continue;
        }

        if (seen.has(toEmail)) {
            skipped++;
            console.log(`[SKIP] row=${excelRowNumber} duplicate email ${toEmail}`);
            continue;
        }
        seen.add(toEmail);

        const placeholderData = {
            recipient_name: recipientName,
            firm: firmName,
            website_url: websiteUrl,
            referral_phrase: referralPhrase,
            signature_name: signatureName,
            signature_title: signatureTitle,
        };

        const subject = fillTemplate(subjectTemplate, placeholderData);

        const salesDeckAttachment = salesDeckPath
            ? [{
                filename: path.basename(salesDeckPath),
                content: fs.readFileSync(salesDeckPath),
                contentType: inferContentTypeByFilename(salesDeckPath),
            }]
            : [];

        const htmlBody = fillTemplate(
            `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #222; font-size: 0.9375rem;">
    <p>שלום עו"ד [[recipient_name]],</p>

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
                        `.trim(),
            {
                ...placeholderData,
                sales_deck_paragraph: salesDeckAttachment.length > 0
                    ? '<p>צירפתי מצגת קצרה שמראה את זה בתמונות — שווה מבט.</p>'
                    : '',
            }
        );

        if (!shouldSend) {
            sent++;
            const deckLabel = salesDeckPath ? ` attachment=${path.basename(salesDeckPath)}` : '';
            console.log(`[DRY]  row=${excelRowNumber} to=${toEmail} subject="${subject}"${deckLabel}`);
            continue;
        }

        const result = salesDeckAttachment.length > 0
            ? await sendEmailWithAttachments({
                toEmail,
                subject,
                htmlBody,
                attachments: salesDeckAttachment,
                logLabel: 'LAW_FIRM_OUTREACH',
                replyTo,
                fromName,
                fromEmail,
            })
            : await sendTransactionalCustomHtmlEmail({
                toEmail,
                subject,
                htmlBody,
                logLabel: 'LAW_FIRM_OUTREACH',
                replyTo,
                fromName,
                fromEmail,
            });

        if (result?.ok) {
            sent++;
            console.log(`[SENT] row=${excelRowNumber} to=${toEmail}`);
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
        } else {
            failed++;
            failures.push({
                row: excelRowNumber,
                email: toEmail,
                reason: result?.errorCode || 'send_failed',
                details: result?.details || null,
            });
            console.log(`[FAIL] row=${excelRowNumber} to=${toEmail} reason=${result?.errorCode || 'send_failed'}`);
        }

        if (i < selectedRows.length - 1) {
            await sleep(delayMs);
        }
    }

    const summary = {
        mode: shouldSend ? 'send' : 'dry-run',
        file: absoluteFilePath,
        sheetName,
        totalRowsInFile: rows.length,
        attemptedRows: selectedRows.length,
        sent,
        skipped,
        failed,
        failures,
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

    if (shouldSend && failed > 0) {
        process.exitCode = 2;
    }
}

main().catch(err => {
    console.error('Outreach script failed:', err);
    process.exit(1);
});
