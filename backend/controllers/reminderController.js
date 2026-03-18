/**
 * Reminder controller — handles:
 *   GET  /api/reminders/templates   – list available email templates
 *   POST /api/reminders/import      – import reminders from Excel/CSV
 *   GET  /api/reminders             – list reminders (with filters)
 *   PUT  /api/reminders/:id/cancel  – cancel a PENDING reminder
 */

const { parseExcelBuffer } = require('../utils/parseExcel');
const pool = require('../config/db');
const { getAllTemplates } = require('../tasks/emailReminders/templates');

// ─── Templates ───────────────────────────────────────────────────────

// Human-readable placeholder replacements for preview
const _placeholderMap = {
    'client_name': '"שם הלקוח"',
    'firm_name': String(process.env.LAW_FIRM_NAME || 'שם המשרד'),
    'date': '"תאריך"',
    'subject': '"נושא"',
    'body': '"תוכן ההודעה"',
    'case_title': '"שם התיק"',
    'document_name': '"שם המסמך"',
    'amount': '"סכום"',
};

function _humanizeBody(raw) {
    let text = (raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/\[\[([^\]]+)\]\]/g, (_m, key) => _placeholderMap[key] || `"${key}"`);
    return text.slice(0, 200);
}

const getTemplates = async (req, res, next) => {
    try {
        const templates = getAllTemplates();

        // Load DB-stored templates (overrides + custom)
        let dbRows = [];
        try {
            const { rows } = await pool.query(
                'SELECT id, template_key, label, description, subject_template, body_html FROM reminder_templates ORDER BY created_at'
            );
            dbRows = rows;
        } catch (_) { /* table may not exist yet */ }

        const dbByKey = new Map(dbRows.map(r => [r.template_key, r]));

        // Build list: built-in templates (with DB overrides merged)
        const list = Object.values(templates).map(t => {
            const dbOverride = dbByKey.get(t.key);
            if (dbOverride) {
                return {
                    key: t.key,
                    label: dbOverride.label || t.label,
                    labelEn: t.labelEn || t.label,
                    description: dbOverride.description || t.description || '',
                    subject: dbOverride.subject_template || t.subject,
                    bodyPreview: _humanizeBody(dbOverride.body_html || t.body),
                    bodyHtml: dbOverride.body_html || t.body,
                    isBuiltin: true,
                    id: dbOverride.id,
                };
            }
            return {
                key: t.key,
                label: t.label,
                labelEn: t.labelEn || t.label,
                description: t.description || '',
                subject: t.subject,
                bodyPreview: _humanizeBody(t.body),
                bodyHtml: t.body,
                isBuiltin: true,
            };
        });

        // Add purely custom templates (keys not matching any built-in)
        for (const row of dbRows) {
            if (!templates[row.template_key]) {
                list.push({
                    key: row.template_key,
                    label: row.label,
                    description: row.description || '',
                    subject: row.subject_template,
                    bodyPreview: _humanizeBody(row.body_html),
                    bodyHtml: row.body_html,
                    isBuiltin: false,
                    id: row.id,
                });
            }
        }

        return res.json({ ok: true, templates: list });
    } catch (e) {
        return next(e);
    }
};

// ─── Import from Excel ───────────────────────────────────────────────

/**
 * Expected columns:
 *   ClientName / שם לקוח    (required)
 *   Email / אימייל          (required)
 *   Date / תאריך            (required – the scheduled_for date)
 *   Subject / נושא          (optional – custom subject override)
 *   Notes / הערות           (optional – merged into template_data)
 *
 * Body params (multipart):
 *   file         – the uploaded Excel/CSV
 *   templateKey  – which template to use (default GENERAL)
 *   sendHour     – hour of day to send (default 9)
 */
const importReminders = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'לא הועלה קובץ.' });
        }

        const templateKey = req.body.templateKey || 'GENERAL';
        const sendHour = Number.parseInt(req.body.sendHour || '9', 10);
        const sendMinute = Number.parseInt(req.body.sendMinute || '0', 10);
        const createdBy = req.user?.userid || null;

        // Parse workbook
        const { sheetName, rows } = await parseExcelBuffer(req.file.buffer);
        if (!sheetName) {
            return res.status(400).json({ ok: false, error: 'קובץ ריק.' });
        }
        if (rows.length === 0) {
            return res.status(400).json({ ok: false, error: 'לא נמצאו שורות נתונים.' });
        }

        // Column name mappings (Hebrew + English variants)
        const colMap = {
            clientName: ['clientname', 'שם לקוח', 'שם', 'name', 'client_name', 'client'],
            email: ['email', 'אימייל', 'דוא"ל', 'mail', 'to_email', 'דואל'],
            date: ['date', 'תאריך', 'scheduled_for', 'scheduledfor', 'send_date', 'senddate'],
            subject: ['subject', 'נושא'],
            notes: ['notes', 'הערות', 'note'],
            body: ['body', 'תוכן', 'content'],
            case_title: ['case_title', 'שם תיק', 'casetitle'],
            document_name: ['document_name', 'שם מסמך', 'documentname', 'document'],
            amount: ['amount', 'סכום', 'sum'],
        };

        function findCol(row, aliases) {
            for (const alias of aliases) {
                for (const key of Object.keys(row)) {
                    if (key.trim().toLowerCase() === alias.toLowerCase()) {
                        return row[key];
                    }
                }
            }
            return undefined;
        }

        // Try to match client names to existing users
        let existingUsers = [];
        try {
            const { rows: users } = await pool.query(
                'SELECT userid, name, email FROM users'
            );
            existingUsers = users;
        } catch (_) { /* ignore */ }

        const userByEmail = {};
        const userByName = {};
        for (const u of existingUsers) {
            if (u.email) userByEmail[u.email.toLowerCase().trim()] = u;
            if (u.name) userByName[u.name.toLowerCase().trim()] = u;
        }

        const details = [];
        let created = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row (1-indexed header + data)

            const clientName = String(findCol(row, colMap.clientName) || '').trim();
            const email = String(findCol(row, colMap.email) || '').trim();
            const rawDate = findCol(row, colMap.date);
            const subject = String(findCol(row, colMap.subject) || '').trim() || null;
            const notes = String(findCol(row, colMap.notes) || '').trim() || null;
            const body = String(findCol(row, colMap.body) || '').trim() || null;
            const caseTitle = String(findCol(row, colMap.case_title) || '').trim() || null;
            const documentName = String(findCol(row, colMap.document_name) || '').trim() || null;
            const amount = String(findCol(row, colMap.amount) || '').trim() || null;

            // Validate required fields
            if (!clientName) {
                details.push({ row: rowNum, clientName: clientName || '—', status: 'failed', reason: 'חסר שם לקוח' });
                failedCount++;
                continue;
            }
            if (!email) {
                details.push({ row: rowNum, clientName, status: 'failed', reason: 'חסר אימייל' });
                failedCount++;
                continue;
            }

            // Parse date
            let scheduledFor;
            if (rawDate instanceof Date) {
                scheduledFor = rawDate;
            } else {
                const parsed = new Date(rawDate);
                if (isNaN(parsed.getTime())) {
                    details.push({ row: rowNum, clientName, status: 'failed', reason: `תאריך לא תקין: ${rawDate}` });
                    failedCount++;
                    continue;
                }
                scheduledFor = parsed;
            }

            // Set scheduled time to the configured sendHour (in local tz, approximated as UTC offset)
            scheduledFor.setHours(sendHour, sendMinute, 0, 0);

            // Skip if date is in the past
            if (scheduledFor < new Date()) {
                details.push({ row: rowNum, clientName, status: 'skipped', reason: 'התאריך עבר' });
                skippedCount++;
                continue;
            }

            // Match to existing user (by email, then name)
            const matchedUser =
                userByEmail[email.toLowerCase()] ||
                userByName[clientName.toLowerCase()] ||
                null;

            const templateData = {};
            if (notes) templateData.notes = notes;
            if (subject) templateData.subject = subject;
            if (body) templateData.body = body;
            if (caseTitle) templateData.case_title = caseTitle;
            if (documentName) templateData.document_name = documentName;
            if (amount) templateData.amount = amount;

            try {
                await pool.query(
                    `INSERT INTO scheduled_email_reminders
                        (user_id, client_name, to_email, subject, template_key, template_data, scheduled_for, created_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        matchedUser?.userid || null,
                        clientName,
                        email,
                        subject,
                        templateKey,
                        JSON.stringify(templateData),
                        scheduledFor.toISOString(),
                        createdBy,
                    ],
                );
                details.push({ row: rowNum, clientName, email, date: scheduledFor.toISOString(), status: 'created' });
                created++;
            } catch (err) {
                details.push({ row: rowNum, clientName, status: 'failed', reason: err.message });
                failedCount++;
            }
        }

        return res.json({
            ok: true,
            created,
            skipped: skippedCount,
            failed: failedCount,
            total: rows.length,
            details,
        });
    } catch (e) {
        return next(e);
    }
};

// ─── List reminders ──────────────────────────────────────────────────

const listReminders = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

        let where = 'WHERE 1=1';
        const params = [];
        let idx = 1;

        if (status) {
            where += ` AND status = $${idx++}`;
            params.push(status.toUpperCase());
        }

        const countQ = `SELECT COUNT(*) FROM scheduled_email_reminders ${where}`;
        const dataQ = `SELECT id, user_id, client_name, to_email, subject, template_key,
                               scheduled_for, status, error, created_at, sent_at, cancelled_at
                        FROM scheduled_email_reminders ${where}
                        ORDER BY scheduled_for DESC
                        LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(Number(limit), offset);

        const [{ rows: [{ count }] }, { rows: reminders }] = await Promise.all([
            pool.query(countQ, params.slice(0, idx - 3)),
            pool.query(dataQ, params),
        ]);

        return res.json({
            ok: true,
            total: Number(count),
            page: Number(page),
            limit: Number(limit),
            reminders,
        });
    } catch (e) {
        return next(e);
    }
};

// ─── Cancel a reminder ───────────────────────────────────────────────

const cancelReminder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query(
            `UPDATE scheduled_email_reminders
             SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE id = $1 AND status = 'PENDING'`,
            [id],
        );
        if (rowCount === 0) {
            return res.status(404).json({ ok: false, error: 'Reminder not found or already processed.' });
        }
        return res.json({ ok: true });
    } catch (e) {
        return next(e);
    }
};

// ─── Permanently delete a reminder ─────────────────────────────────

const deleteReminder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query(
            `DELETE FROM scheduled_email_reminders WHERE id = $1`,
            [id],
        );
        if (rowCount === 0) {
            return res.status(404).json({ ok: false, error: 'Reminder not found.' });
        }
        return res.json({ ok: true });
    } catch (e) {
        return next(e);
    }
};

// ─── Update a PENDING reminder ──────────────────────────────────────

const updateReminder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { client_name, to_email, subject, scheduled_for } = req.body;

        // Build dynamic SET clause from supplied fields
        const fields = [];
        const values = [];
        let idx = 1;

        if (client_name !== undefined) { fields.push(`client_name = $${idx++}`); values.push(client_name); }
        if (to_email !== undefined) { fields.push(`to_email = $${idx++}`); values.push(to_email); }
        if (subject !== undefined) { fields.push(`subject = $${idx++}`); values.push(subject); }
        if (scheduled_for !== undefined) { fields.push(`scheduled_for = $${idx++}`); values.push(scheduled_for); }

        if (fields.length === 0) {
            return res.status(400).json({ ok: false, error: 'No fields to update.' });
        }

        values.push(id);
        const { rowCount, rows } = await pool.query(
            `UPDATE scheduled_email_reminders
             SET ${fields.join(', ')}
             WHERE id = $${idx} AND status = 'PENDING'
             RETURNING *`,
            values,
        );

        if (rowCount === 0) {
            return res.status(404).json({ ok: false, error: 'Reminder not found or not in PENDING status.' });
        }

        return res.json({ ok: true, reminder: rows[0] });
    } catch (e) {
        return next(e);
    }
};

// ─── Custom reminder template CRUD ──────────────────────────────────

const listCustomTemplates = async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, template_key, label, description, subject_template, body_html, created_at, updated_at FROM reminder_templates ORDER BY created_at DESC'
        );
        return res.json({ ok: true, templates: rows });
    } catch (e) { return next(e); }
};

const createCustomTemplate = async (req, res, next) => {
    try {
        const { label, description } = req.body;
        const subjectTemplate = req.body.subjectTemplate || req.body.subject_template;
        const bodyHtml = req.body.bodyHtml || req.body.body_html;
        const templateKey = req.body.template_key || req.body.templateKey;
        if (!label || !String(label).trim()) {
            return res.status(400).json({ ok: false, error: 'Label is required' });
        }
        const key = templateKey || ('CUSTOM_' + Date.now());

        // Upsert: if a record with this key already exists, update it
        const { rows } = await pool.query(
            `INSERT INTO reminder_templates (template_key, label, description, subject_template, body_html, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (template_key) DO UPDATE SET
                label = EXCLUDED.label,
                description = EXCLUDED.description,
                subject_template = EXCLUDED.subject_template,
                body_html = EXCLUDED.body_html,
                updated_at = NOW()
             RETURNING *`,
            [
                key,
                label.trim(),
                (description || '').trim(),
                subjectTemplate || 'תזכורת: [[subject]]',
                bodyHtml || 'שלום [[client_name]],<br><br>[[body]]<br><br>בברכה,<br>[[firm_name]]',
                req.user?.UserId || null,
            ]
        );
        return res.status(201).json({ ok: true, template: rows[0] });
    } catch (e) { return next(e); }
};

const updateCustomTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { label, description } = req.body;
        const subjectTemplate = req.body.subjectTemplate || req.body.subject_template;
        const bodyHtml = req.body.bodyHtml || req.body.body_html;
        const { rows, rowCount } = await pool.query(
            `UPDATE reminder_templates SET
                label = COALESCE($2, label),
                description = COALESCE($3, description),
                subject_template = COALESCE($4, subject_template),
                body_html = COALESCE($5, body_html),
                updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id, label, description, subjectTemplate, bodyHtml]
        );
        if (rowCount === 0) return res.status(404).json({ ok: false, error: 'Template not found' });
        return res.json({ ok: true, template: rows[0] });
    } catch (e) { return next(e); }
};

const deleteCustomTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query('DELETE FROM reminder_templates WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ ok: false, error: 'Template not found' });
        return res.json({ ok: true });
    } catch (e) { return next(e); }
};

// ─── Download example Excel for a template ──────────────────────────

// Map from placeholder name → Hebrew column header
const _varToHeader = {
    client_name: 'שם לקוח',
    firm_name: 'שם המשרד',
    date: 'תאריך',
    subject: 'נושא',
    body: 'תוכן',
    case_title: 'שם תיק',
    document_name: 'שם מסמך',
    amount: 'סכום',
};

// Extract [[placeholder]] names from template text
function _extractPlaceholders(text) {
    const matches = (text || '').matchAll(/\[\[([^\]]+)\]\]/g);
    const vars = new Set();
    for (const m of matches) vars.add(m[1]);
    return vars;
}

const downloadTemplateExcel = async (req, res, next) => {
    try {
        const { key } = req.params;

        // Resolve template — DB override takes priority, then built-in, then pure custom
        const builtIn = getAllTemplates();
        let templateLabel = key;
        let subjectTpl = '';
        let bodyHtml = '';

        // Always check DB first (may be a built-in override or a custom template)
        try {
            const { rows } = await pool.query(
                'SELECT label, subject_template, body_html FROM reminder_templates WHERE template_key = $1',
                [key]
            );
            if (rows[0]) {
                templateLabel = rows[0].label;
                subjectTpl = rows[0].subject_template || '';
                bodyHtml = rows[0].body_html || '';
            }
        } catch (_) { /* table may not exist */ }

        // Fall back to built-in if no DB record found
        if (!subjectTpl && !bodyHtml && builtIn[key]) {
            templateLabel = builtIn[key].label;
            subjectTpl = builtIn[key].subject || '';
            bodyHtml = builtIn[key].body || '';
        }

        // Extract placeholders used in the template
        const usedVars = _extractPlaceholders(subjectTpl + ' ' + bodyHtml);

        // Always include these base columns first; email + date are always required
        const headers = ['שם לקוח', 'אימייל', 'תאריך'];
        const exampleValues = { 'שם לקוח': 'ישראל ישראלי', 'אימייל': 'israel@example.com', 'תאריך': '2026-04-01' };
        const exampleValues2 = { 'שם לקוח': 'שרה כהן', 'אימייל': 'sara@example.com', 'תאריך': '2026-04-15' };

        // Remove vars that are auto-filled or already in base columns
        usedVars.delete('client_name');
        usedVars.delete('firm_name');
        usedVars.delete('date');

        // Add columns for each used placeholder
        const varExamples = {
            date: ['2026-04-01', '2026-04-15'],
            subject: ['נושא לדוגמה', ''],
            body: ['תוכן ההודעה', ''],
            case_title: ['תיק לדוגמה', ''],
            document_name: ['מסמך לדוגמה', ''],
            amount: ['5,000 ₪', ''],
        };

        for (const v of usedVars) {
            const header = _varToHeader[v] || v;
            if (!headers.includes(header)) {
                headers.push(header);
                const examples = varExamples[v] || ['', ''];
                exampleValues[header] = examples[0];
                exampleValues2[header] = examples[1];
            }
        }

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(templateLabel.slice(0, 31));
        ws.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
        ws.addRow(headers.map(h => exampleValues[h] || ''));
        ws.addRow(headers.map(h => exampleValues2[h] || ''));

        const buf = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="reminder-example-${key}.xlsx"`);
        return res.send(Buffer.from(buf));
    } catch (e) { return next(e); }
};

module.exports = {
    getTemplates, importReminders, listReminders, cancelReminder, deleteReminder, updateReminder,
    listCustomTemplates, createCustomTemplate, updateCustomTemplate, deleteCustomTemplate,
    downloadTemplateExcel,
};
