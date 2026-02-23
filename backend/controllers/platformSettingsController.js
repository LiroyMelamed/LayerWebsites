/**
 * Platform Settings Controller
 * Manages dynamic platform settings, notification channels, and admin users.
 */
const pool = require('../config/db');
const settingsService = require('../services/settingsService');
const { validateTemplate, TEMPLATE_REQUIRED_VARS } = require('../utils/templateRenderer');

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
        console.error('[platformSettings] updateSettings error:', err);
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

// ── Notification Channels ───────────────────────────────────────────

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
        const { pushEnabled, emailEnabled, smsEnabled, adminCc } = req.body;

        const result = await settingsService.updateNotificationChannel(type, {
            pushEnabled,
            emailEnabled,
            smsEnabled,
            adminCc,
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
        // Load built-in templates from the reminders template module
        let templates = [];
        try {
            const { getBuiltInTemplates } = require('../tasks/emailReminders/templates');
            if (typeof getBuiltInTemplates === 'function') {
                templates = getBuiltInTemplates();
            }
        } catch { /* templates module may not exist */ }

        return res.json({ templates });
    } catch (err) {
        console.error('[platformSettings] getEmailTemplates error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת תבניות' });
    }
};

// ── Public (non-admin) settings ─────────────────────────────────────

/** Whitelisted keys that any visitor / logged-in user may read. */
const PUBLIC_SETTINGS_KEYS = [
    'messaging:WHATSAPP_DEFAULT_PHONE',
    'firm:LAW_FIRM_NAME',
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

module.exports = {
    getAllSettings,
    updateSettings,
    updateSingleSetting,
    getNotificationChannels,
    updateNotificationChannel,
    listPlatformAdmins,
    addPlatformAdmin,
    removePlatformAdmin,
    getEmailTemplates,
    getPublicSettings,
};
