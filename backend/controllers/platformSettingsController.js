/**
 * Platform Settings Controller
 * Manages dynamic platform settings, notification channels, and admin users.
 */
const pool = require('../config/db');
const path = require('path');
const settingsService = require('../services/settingsService');
const { validateTemplate, TEMPLATE_REQUIRED_VARS } = require('../utils/templateRenderer');
const { sendTransactionalCustomHtmlEmail } = require('../utils/smooveEmailCampaignService');
const { getFirmDisplayName } = require('../lib/firmBranding');

// Fixed recipient for SMS-sender-change requests (technical owner who handles InforU verification).
const SMS_SENDER_CHANGE_NOTIFY_EMAIL = 'liroymelamed@icloud.com';

// ── Settings CRUD ───────────────────────────────────────────────────

/** GET /api/platform-settings */
const getAllSettings = async (req, res) => {
    try {
        const settings = await settingsService.getAllSettings();
        const channels = await settingsService.getNotificationChannels();
        return res.json({ settings, channels });
    } catch (err) {
        console.error('[platformSettings] getAllSettings error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת הגדרות' });
    }
};

/** PUT /api/platform-settings */
const updateSettings = async (req, res) => {
    try {
        const { settings } = req.body; // Array of { category, key, value }
        if (!Array.isArray(settings) || settings.length === 0) {
            return res.status(400).json({ message: 'נדרש מערך הגדרות' });
        }

        // Validate
        for (const s of settings) {
            if (!s.category || !s.key) {
                return res.status(400).json({ message: `הגדרה חסרה category או key` });
            }
            // Template validation — ensure required variables are present
            if (s.category === 'templates' && TEMPLATE_REQUIRED_VARS[s.key]) {
                const result = validateTemplate(s.key, s.value);
                if (!result.valid) {
                    return res.status(400).json({
                        message: `תבנית "${s.key}" חייבת לכלול את המשתנים: ${result.missingVars.map(v => `{{${v}}}`).join(', ')}`,
                        missingVars: result.missingVars,
                        templateKey: s.key,
                    });
                }
            }
        }

        const results = await settingsService.bulkUpsert(settings, req.user?.UserId);
        return res.json({ message: 'ההגדרות עודכנו בהצלחה', count: results.length });
    } catch (err) {
        console.error('[platformSettings] updateSettings error:', err?.message || err);
        if (err?.code === '23503') {
            return res.status(400).json({
                message: 'לא ניתן לשמור הגדרות — מזהה המשתמש לא קיים במערכת. נסה להתחבר מחדש.',
            });
        }
        return res.status(500).json({ message: 'שגיאה בעדכון הגדרות' });
    }
};

/** PUT /api/platform-settings/single */
const updateSingleSetting = async (req, res) => {
    try {
        const { category, key, value } = req.body;
        if (!category || !key) {
            return res.status(400).json({ message: 'נדרש category ו-key' });
        }

        // Template validation — ensure required variables are present
        if (category === 'templates' && TEMPLATE_REQUIRED_VARS[key]) {
            const result = validateTemplate(key, value);
            if (!result.valid) {
                return res.status(400).json({
                    message: `תבנית "${key}" חייבת לכלול את המשתנים: ${result.missingVars.map(v => `{{${v}}}`).join(', ')}`,
                    missingVars: result.missingVars,
                    templateKey: key,
                });
            }
        }

        const result = await settingsService.upsertSetting(category, key, value, {
            updatedBy: req.user?.UserId,
        });
        return res.json({ message: 'ההגדרה עודכנה', setting: result });
    } catch (err) {
        console.error('[platformSettings] updateSingleSetting error:', err);
        return res.status(500).json({ message: 'שגיאה בעדכון הגדרה' });
    }
};

// ── SMS sender change (InforU verification flow) ────────────────────

const ACTIVE_SENDER_KEY = 'INFORU_SENDER_PHONE';
const PENDING_SENDER_KEY = 'INFORU_SENDER_PHONE_PENDING';
const PENDING_AT_KEY = 'INFORU_SENDER_PHONE_PENDING_REQUESTED_AT';
const PENDING_BY_KEY = 'INFORU_SENDER_PHONE_PENDING_REQUESTED_BY';

/**
 * Validate a candidate InforU sender. Per InforU rules: either a numeric
 * sender of up to 14 digits, or an alphanumeric ID of up to 11 characters
 * (no spaces, optional leading "*").
 */
function isValidInforuSender(value) {
    const v = String(value || '').trim();
    if (!v) return false;
    if (/^\d{1,14}$/.test(v)) return true; // numeric sender / phone
    return /^\*?[A-Za-z0-9]{1,11}$/.test(v); // alphanumeric ID
}

/**
 * POST /api/platform-settings/sms-sender-request
 * Store the requested SMS sender as PENDING (live sender is untouched) and
 * email the technical owner the details needed to whitelist + verify it on InforU.
 */
const requestSmsSenderChange = async (req, res) => {
    try {
        const phone = String(req.body?.phone || '').trim();
        if (!isValidInforuSender(phone)) {
            return res.status(400).json({
                message: 'מספר/מזהה שולח לא תקין. יש להזין מספר (עד 14 ספרות) או שם שולח באנגלית/ספרות (עד 11 תווים, ללא רווחים).',
            });
        }

        const requestedBy = req.user?.UserId;
        const nowIso = new Date().toISOString();

        // Persist pending value + metadata (does NOT change the live sender)
        await settingsService.upsertSetting('messaging', PENDING_SENDER_KEY, phone, { updatedBy: requestedBy });
        await settingsService.upsertSetting('messaging', PENDING_AT_KEY, nowIso, { updatedBy: requestedBy });
        await settingsService.upsertSetting('messaging', PENDING_BY_KEY, String(requestedBy ?? ''), { updatedBy: requestedBy });

        // Gather context for the notification email (best-effort)
        let requester = { name: '', email: '', phonenumber: '' };
        try {
            if (requestedBy) {
                const { rows } = await pool.query(
                    `SELECT name, email, phonenumber FROM users WHERE userid = $1`,
                    [requestedBy]
                );
                if (rows[0]) requester = rows[0];
            }
        } catch (e) {
            console.warn('[platformSettings] requester lookup failed:', e?.message);
        }

        let firmName = '';
        try { firmName = await getFirmDisplayName(); } catch (_) { /* ignore */ }

        const currentSender = await settingsService.getSetting('messaging', ACTIVE_SENDER_KEY, process.env.INFORU_SENDER_PHONE);
        const requestedAtIl = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

        const htmlBody = `
            <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6;">
                <h2 style="margin: 0 0 12px;">בקשת שינוי מספר שולח SMS</h2>
                <p>מנהל פלטפורמה ביקש לשנות את מספר/מזהה השולח של הודעות ה-SMS.</p>
                <table cellpadding="6" style="border-collapse: collapse; margin: 12px 0;">
                    <tr><td style="font-weight:bold;">משרד:</td><td>${firmName || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">שולח מבוקש:</td><td><strong>${phone}</strong></td></tr>
                    <tr><td style="font-weight:bold;">שולח נוכחי (פעיל):</td><td>${currentSender || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">מבקש:</td><td>${requester.name || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">טלפון מבקש:</td><td>${requester.phonenumber || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">אימייל מבקש:</td><td>${requester.email || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">מועד הבקשה:</td><td>${requestedAtIl}</td></tr>
                </table>
                <h3 style="margin: 16px 0 8px;">מה צריך לעשות מול InforU:</h3>
                <ol style="margin: 0; padding-inline-start: 20px;">
                    <li>להוסיף את השולח <strong>${phone}</strong> לרשימת ההיתרים ב-InforU (Whitelist → Sender).</li>
                    <li>להשלים את תהליך האימות מול InforU (עד 24 שעות, כולל שיחת אימות מהצוות הטכני של InforU).</li>
                    <li>לאחר אישור InforU — להיכנס להגדרות הפלטפורמה וללחוץ על "הפעל מספר שולח" כדי להחיל את השינוי בפועל.</li>
                </ol>
                <p style="color:#666; font-size: 13px; margin-top: 16px;">השולח הנוכחי ימשיך לפעול עד להפעלת השולח החדש.</p>
            </div>`;

        try {
            await sendTransactionalCustomHtmlEmail({
                toEmail: SMS_SENDER_CHANGE_NOTIFY_EMAIL,
                subject: `בקשת שינוי מספר שולח SMS — ${firmName || 'Melamedia'}`,
                htmlBody,
                logLabel: 'SMS_SENDER_CHANGE_REQUEST',
            });
        } catch (emailErr) {
            // Email failure must not fail the request — the pending value is already saved.
            console.error('[platformSettings] sms-sender-request email failed:', emailErr?.message || emailErr);
        }

        return res.json({ message: 'הבקשה נשלחה. צוות טכני יצור איתך קשר.', pending: phone });
    } catch (err) {
        console.error('[platformSettings] requestSmsSenderChange error:', err?.message || err);
        return res.status(500).json({ message: 'שגיאה בשליחת בקשת שינוי מספר שולח' });
    }
};

/**
 * POST /api/platform-settings/sms-sender-activate
 * Promote the pending sender to the live sender (call this only after InforU confirms).
 */
const activateSmsSenderChange = async (req, res) => {
    try {
        const pending = await settingsService.getSetting('messaging', PENDING_SENDER_KEY, null);
        if (!pending) {
            return res.status(400).json({ message: 'אין מספר שולח ממתין להפעלה.' });
        }

        const updatedBy = req.user?.UserId;
        await settingsService.upsertSetting('messaging', ACTIVE_SENDER_KEY, pending, { updatedBy });
        // Clear pending metadata
        await settingsService.upsertSetting('messaging', PENDING_SENDER_KEY, '', { updatedBy });
        await settingsService.upsertSetting('messaging', PENDING_AT_KEY, '', { updatedBy });
        await settingsService.upsertSetting('messaging', PENDING_BY_KEY, '', { updatedBy });

        return res.json({ message: 'מספר השולח הופעל בהצלחה.', sender: pending });
    } catch (err) {
        console.error('[platformSettings] activateSmsSenderChange error:', err?.message || err);
        return res.status(500).json({ message: 'שגיאה בהפעלת מספר שולח' });
    }
};

// ── Notification Channels ───────────────────────────────────────────

/**
 * GET /api/platform-settings/channels-lite
 *
 * Lawyer-readable allowlist of which channels (push/email/sms) are enabled
 * per notification type. The per-action UIs (signing upload, calendar
 * event reminder picker) use this to show only the channels the platform
 * admin enabled. admin_cc / manager_cc are intentionally NOT exposed.
 */
const getNotificationChannelsLite = async (req, res) => {
    try {
        const channels = await settingsService.getNotificationChannels();
        const lite = (Array.isArray(channels) ? channels : []).map((c) => ({
            notification_type: c.notification_type,
            push_enabled: !!c.push_enabled,
            email_enabled: !!c.email_enabled,
            sms_enabled: !!c.sms_enabled,
        }));
        return res.json({ channels: lite });
    } catch (err) {
        console.error('[platformSettings] getChannelsLite error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת ערוצי התראות' });
    }
};

/** GET /api/platform-settings/channels */
const getNotificationChannels = async (req, res) => {
    try {
        const channels = await settingsService.getNotificationChannels();
        return res.json({ channels });
    } catch (err) {
        console.error('[platformSettings] getChannels error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת ערוצי התראות' });
    }
};

/** PUT /api/platform-settings/channels/:type */
const updateNotificationChannel = async (req, res) => {
    try {
        const { type } = req.params;
        const { pushEnabled, emailEnabled, smsEnabled, adminCc, managerCc } = req.body;

        const result = await settingsService.updateNotificationChannel(type, {
            pushEnabled,
            emailEnabled,
            smsEnabled,
            adminCc,
            managerCc,
            updatedBy: req.user?.UserId,
        });

        if (!result) {
            return res.status(404).json({ message: 'סוג התראה לא נמצא' });
        }
        return res.json({ message: 'ערוץ התראה עודכן', channel: result });
    } catch (err) {
        console.error('[platformSettings] updateChannel error:', err);
        return res.status(500).json({ message: 'שגיאה בעדכון ערוץ התראה' });
    }
};

// ── Platform Admins ─────────────────────────────────────────────────

/** GET /api/platform-settings/admins */
const listPlatformAdmins = async (req, res) => {
    try {
        let admins = await settingsService.getPlatformAdmins();

        // If no admins in DB yet, seed from env var
        if (admins.length === 0) {
            const seeded = await settingsService.seedPlatformAdminsFromEnv();
            if (seeded > 0) {
                admins = await settingsService.getPlatformAdmins();
            }
        }

        return res.json({ admins });
    } catch (err) {
        console.error('[platformSettings] listAdmins error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת רשימת מנהלים' });
    }
};

/** POST /api/platform-settings/admins */
const addPlatformAdmin = async (req, res) => {
    try {
        const { userId, phoneNumber } = req.body;

        let targetUserId = userId;

        // If phoneNumber provided instead of userId, look up the user
        if (!targetUserId && phoneNumber) {
            const { rows } = await pool.query(
                `SELECT userid FROM users WHERE phonenumber = $1`,
                [phoneNumber]
            );
            if (rows.length === 0) {
                return res.status(404).json({ message: 'משתמש לא נמצא עם מספר הטלפון הזה' });
            }
            targetUserId = rows[0].userid;
        }

        if (!targetUserId) {
            return res.status(400).json({ message: 'נדרש userId או phoneNumber' });
        }

        const result = await settingsService.addPlatformAdmin(targetUserId, req.user?.UserId);
        return res.json({ message: 'מנהל פלטפורמה נוסף', admin: result });
    } catch (err) {
        console.error('[platformSettings] addAdmin error:', err);
        return res.status(500).json({ message: 'שגיאה בהוספת מנהל' });
    }
};

/** DELETE /api/platform-settings/admins/:userId */
const removePlatformAdmin = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);
        if (isNaN(targetUserId)) {
            return res.status(400).json({ message: 'מזהה משתמש לא תקין' });
        }

        // Prevent removing yourself
        if (targetUserId === req.user?.UserId) {
            return res.status(400).json({ message: 'לא ניתן להסיר את עצמך מרשימת המנהלים' });
        }

        const result = await settingsService.removePlatformAdmin(targetUserId);
        if (!result) {
            return res.status(404).json({ message: 'מנהל לא נמצא' });
        }
        return res.json({ message: 'מנהל הוסר', admin: result });
    } catch (err) {
        console.error('[platformSettings] removeAdmin error:', err);
        return res.status(500).json({ message: 'שגיאה בהסרת מנהל' });
    }
};

// ── Template previews ───────────────────────────────────────────────

/** GET /api/platform-settings/email-templates */
const getEmailTemplates = async (req, res) => {
    try {
        const templates = await settingsService.getAllEmailTemplates();
        return res.json({ templates });
    } catch (err) {
        console.error('[platformSettings] getEmailTemplates error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת תבניות' });
    }
};

/** PUT /api/platform-settings/email-templates/:key */
const updateEmailTemplate = async (req, res) => {
    try {
        const { key } = req.params;
        const { subjectTemplate, htmlBody } = req.body;

        if (!key) {
            return res.status(400).json({ message: 'נדרש מפתח תבנית' });
        }

        const result = await settingsService.updateEmailTemplate(
            key,
            { subjectTemplate, htmlBody },
            req.user?.UserId
        );

        if (!result) {
            return res.status(404).json({ message: 'תבנית לא נמצאה' });
        }

        return res.json({ message: 'התבנית עודכנה', template: result });
    } catch (err) {
        console.error('[platformSettings] updateEmailTemplate error:', err);
        return res.status(500).json({ message: 'שגיאה בעדכון תבנית' });
    }
};

// ── Public (non-admin) settings ─────────────────────────────────────

/** Whitelisted keys that any visitor / logged-in user may read. */
const PUBLIC_SETTINGS_KEYS = [
    'messaging:WHATSAPP_DEFAULT_PHONE',
    'firm:LAW_FIRM_NAME',
    'firm:FIRM_LOGO_URL',
    'firm:COMPANY_NAME',
    'contact:OFFICE_PHONE',
    'contact:WHATSAPP_PHONE',
    'contact:SMS_PHONE',
];

/** GET /api/platform-settings/public — no admin required */
const getPublicSettings = async (_req, res) => {
    try {
        const all = await settingsService.getAllSettings();
        const result = {};
        for (const compoundKey of PUBLIC_SETTINGS_KEYS) {
            const [category, key] = compoundKey.split(':');
            const entry = all?.[category]?.[key];
            if (entry) result[key] = entry.effectiveValue ?? entry.value;
        }
        return res.json(result);
    } catch (err) {
        console.error('[platformSettings] getPublicSettings error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת הגדרות ציבוריות' });
    }
};

// ── Knowledge Documents ─────────────────────────────────────────────

const knowledgeDocService = require('../services/knowledgeDocService');

/** GET /api/platform-settings/knowledge-docs */
const listKnowledgeDocs = async (req, res) => {
    try {
        const docs = await knowledgeDocService.listDocuments();
        return res.json({ documents: docs });
    } catch (err) {
        console.error('[platformSettings] listKnowledgeDocs error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת מסמכי ידע' });
    }
};

/** POST /api/platform-settings/knowledge-docs (multipart file upload) */
const uploadKnowledgeDoc = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'לא צורף קובץ' });
        }

        const allowedExts = ['.txt', '.pdf'];
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!allowedExts.includes(ext)) {
            return res.status(400).json({ message: 'סוג קובץ לא נתמך. יש להעלות קובץ PDF או TXT' });
        }

        // Multer encodes originalname as latin1; decode to utf-8 to fix Hebrew filenames
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf-8');
        const title = req.body.title || undefined;
        const result = await knowledgeDocService.ingestDocument(
            req.file.buffer,
            originalName,
            title
        );

        return res.status(201).json({
            message: 'המסמך נוסף בהצלחה',
            documentId: result.documentId,
            chunkCount: result.chunkCount,
        });
    } catch (err) {
        console.error('[platformSettings] uploadKnowledgeDoc error:', err);
        return res.status(500).json({ message: 'שגיאה בהעלאת מסמך' });
    }
};

/** DELETE /api/platform-settings/knowledge-docs/:id */
const deleteKnowledgeDoc = async (req, res) => {
    try {
        const docId = parseInt(req.params.id, 10);
        if (!docId || isNaN(docId)) {
            return res.status(400).json({ message: 'מזהה מסמך לא תקין' });
        }
        await knowledgeDocService.deleteDocument(docId);
        return res.json({ message: 'המסמך נמחק בהצלחה' });
    } catch (err) {
        console.error('[platformSettings] deleteKnowledgeDoc error:', err);
        const isNotFound = err.message === 'המסמך לא נמצא';
        return res.status(isNotFound ? 404 : 500).json({ message: isNotFound ? 'המסמך לא נמצא' : 'שגיאה במחיקת מסמך' });
    }
};

module.exports = {
    getAllSettings,
    updateSettings,
    updateSingleSetting,
    requestSmsSenderChange,
    activateSmsSenderChange,
    getNotificationChannels,
    getNotificationChannelsLite,
    updateNotificationChannel,
    listPlatformAdmins,
    addPlatformAdmin,
    removePlatformAdmin,
    getEmailTemplates,
    updateEmailTemplate,
    getPublicSettings,
    listKnowledgeDocs,
    uploadKnowledgeDoc,
    deleteKnowledgeDoc,
};
