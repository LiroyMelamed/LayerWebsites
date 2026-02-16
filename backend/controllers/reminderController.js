/**
 * Reminder controller — handles:
 *   GET  /api/reminders/templates   – list available email templates
 *   POST /api/reminders/import      – import reminders from Excel/CSV
 *   GET  /api/reminders             – list reminders (with filters)
 *   PUT  /api/reminders/:id/cancel  – cancel a PENDING reminder
 */

const XLSX = require('xlsx');
const pool = require('../config/db');
const { getAllTemplates } = require('../tasks/emailReminders/templates');

// ─── Templates ───────────────────────────────────────────────────────

const getTemplates = async (req, res, next) => {
    try {
        const templates = getAllTemplates();

        // Human-readable placeholder replacements for preview
        const placeholderMap = {
            'client_name': '"שם הלקוח"',
            'firm_name': String(process.env.LAW_FIRM_NAME || 'שם המשרד'),
            'date': '"תאריך"',
            'subject': '"נושא"',
            'body': '"תוכן ההודעה"',
            'case_title': '"שם התיק"',
            'document_name': '"שם המסמך"',
            'amount': '"סכום"',
        };

        const humanizeBody = (raw) => {
            let text = (raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            text = text.replace(/\[\[([^\]]+)\]\]/g, (_m, key) => placeholderMap[key] || `"${key}"`);
            return text.slice(0, 200);
        };

        const list = Object.values(templates).map(t => ({
            key: t.key,
            label: t.label,
            labelEn: t.labelEn || t.label,
            description: t.description || '',
            subject: t.subject,
            bodyPreview: humanizeBody(t.body),
        }));
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
            return res.status(400).json({ ok: false, error: 'No file uploaded.' });
        }

        const templateKey = req.body.templateKey || 'GENERAL';
        const sendHour = Number.parseInt(req.body.sendHour || '9', 10);
        const sendMinute = Number.parseInt(req.body.sendMinute || '0', 10);
        const createdBy = req.user?.userid || null;

        // Parse workbook
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ ok: false, error: 'Empty workbook.' });
        }
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (rows.length === 0) {
            return res.status(400).json({ ok: false, error: 'No data rows found.' });
        }

        // Column name mappings (Hebrew + English variants)
        const colMap = {
            clientName: ['clientname', 'שם לקוח', 'שם', 'name', 'client_name', 'client'],
            email: ['email', 'אימייל', 'דוא"ל', 'mail', 'to_email', 'דואל'],
            date: ['date', 'תאריך', 'scheduled_for', 'scheduledfor', 'send_date', 'senddate'],
            subject: ['subject', 'נושא'],
            notes: ['notes', 'הערות', 'note'],
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

            // Validate required fields
            if (!clientName) {
                details.push({ row: rowNum, clientName: clientName || '—', status: 'failed', reason: 'Missing client name' });
                failedCount++;
                continue;
            }
            if (!email) {
                details.push({ row: rowNum, clientName, status: 'failed', reason: 'Missing email' });
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
                    details.push({ row: rowNum, clientName, status: 'failed', reason: `Invalid date: ${rawDate}` });
                    failedCount++;
                    continue;
                }
                scheduledFor = parsed;
            }

            // Set scheduled time to the configured sendHour (in local tz, approximated as UTC offset)
            scheduledFor.setHours(sendHour, sendMinute, 0, 0);

            // Skip if date is in the past
            if (scheduledFor < new Date()) {
                details.push({ row: rowNum, clientName, status: 'skipped', reason: 'Date is in the past' });
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
        if (to_email !== undefined)    { fields.push(`to_email = $${idx++}`);    values.push(to_email); }
        if (subject !== undefined)     { fields.push(`subject = $${idx++}`);     values.push(subject); }
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

module.exports = { getTemplates, importReminders, listReminders, cancelReminder, deleteReminder, updateReminder };
