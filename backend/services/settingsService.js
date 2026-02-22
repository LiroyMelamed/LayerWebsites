/**
 * Settings service — reads from platform_settings table with in-memory cache,
 * falls back to process.env when no DB override exists.
 *
 * Usage:
 *   const { getSetting, getAllSettings, upsertSetting } = require('./settingsService');
 *   const phone = await getSetting('messaging', 'SMOOVE_SENDER_PHONE', '0559199044');
 */

const pool = require('../config/db');

// ── Cache ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 1 minute
let _cache = new Map();
let _cacheLoadedAt = 0;

function _isCacheFresh() {
    return _cacheLoadedAt > 0 && Date.now() - _cacheLoadedAt < CACHE_TTL_MS;
}

/** Warm the full cache in one query (called lazily on first read). */
async function _warmCache() {
    try {
        const { rows } = await pool.query(
            `SELECT category, setting_key, setting_value, value_type FROM platform_settings`
        );
        const fresh = new Map();
        for (const r of rows) {
            fresh.set(`${r.category}:${r.setting_key}`, {
                value: r.setting_value,
                type: r.value_type,
            });
        }
        _cache = fresh;
        _cacheLoadedAt = Date.now();
    } catch (err) {
        // If the table doesn't exist yet (pre-migration), silently fall back to env
        if (err?.code === '42P01') {
            _cacheLoadedAt = Date.now(); // Prevent repeated failing queries
            return;
        }
        console.warn('[settingsService] cache warm failed:', err?.message);
    }
}

function _castValue(raw, valueType) {
    if (raw === null || raw === undefined) return null;
    switch (valueType) {
        case 'number': {
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
        }
        case 'boolean':
            return raw === 'true' || raw === '1' || raw === true;
        case 'json':
            try { return JSON.parse(raw); }
            catch { return null; }
        default:
            return String(raw);
    }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get a single setting. DB value wins over env var.
 * @param {string} category  - e.g. 'messaging', 'signing', 'firm'
 * @param {string} key       - e.g. 'SMOOVE_SENDER_PHONE'
 * @param {*}      fallback  - default if neither DB nor env has a value
 */
async function getSetting(category, key, fallback = undefined) {
    if (!_isCacheFresh()) await _warmCache();

    const cached = _cache.get(`${category}:${key}`);
    if (cached && cached.value !== null && cached.value !== undefined && cached.value !== '') {
        return _castValue(cached.value, cached.type);
    }

    // Fallback to env
    const envVal = process.env[key];
    if (envVal !== undefined && envVal !== '') return envVal;

    return fallback;
}

/**
 * Get ALL settings grouped by category.
 * Returns: { messaging: { SMOOVE_SENDER_PHONE: { value, label, description }, ... }, ... }
 */
async function getAllSettings() {
    try {
        const { rows } = await pool.query(
            `SELECT id, category, setting_key, setting_value, value_type, label, description, updated_at
             FROM platform_settings
             ORDER BY category, id`
        );

        const grouped = {};
        for (const row of rows) {
            if (!grouped[row.category]) grouped[row.category] = {};
            grouped[row.category][row.setting_key] = {
                id: row.id,
                value: row.setting_value,
                valueType: row.value_type,
                label: row.label,
                description: row.description,
                updatedAt: row.updated_at,
                // Also provide current effective value (DB || env)
                effectiveValue: (row.setting_value !== null && row.setting_value !== '')
                    ? _castValue(row.setting_value, row.value_type)
                    : (process.env[row.setting_key] || null),
            };
        }
        return grouped;
    } catch (err) {
        if (err?.code === '42P01') return {}; // table doesn't exist yet
        throw err;
    }
}

/**
 * Create or update a single setting.
 */
async function upsertSetting(category, key, value, { valueType, label, description, updatedBy } = {}) {
    const result = await pool.query(
        `INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description, updated_by, updated_at)
         VALUES ($1, $2, $3, COALESCE($4, 'string'), $5, $6, $7, NOW())
         ON CONFLICT (category, setting_key)
         DO UPDATE SET
             setting_value = EXCLUDED.setting_value,
             value_type    = COALESCE(EXCLUDED.value_type, platform_settings.value_type),
             label         = COALESCE(EXCLUDED.label, platform_settings.label),
             description   = COALESCE(EXCLUDED.description, platform_settings.description),
             updated_by    = EXCLUDED.updated_by,
             updated_at    = NOW()
         RETURNING *`,
        [category, key, value === undefined ? null : String(value), valueType || null, label || null, description || null, updatedBy || null]
    );

    // Invalidate cache
    invalidateCache();

    return result.rows[0];
}

/**
 * Bulk upsert settings (used by the admin UI "save all" action).
 * @param {Array<{ category, key, value }>} settings
 * @param {number} updatedBy - userId
 */
async function bulkUpsert(settings, updatedBy) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const results = [];
        for (const s of settings) {
            const r = await client.query(
                `INSERT INTO platform_settings (category, setting_key, setting_value, updated_by, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (category, setting_key)
                 DO UPDATE SET
                     setting_value = EXCLUDED.setting_value,
                     updated_by    = EXCLUDED.updated_by,
                     updated_at    = NOW()
                 RETURNING *`,
                [s.category, s.key, s.value === undefined ? null : String(s.value), updatedBy]
            );
            results.push(r.rows[0]);
        }
        await client.query('COMMIT');
        invalidateCache();
        return results;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/** Force cache refresh on next read. */
function invalidateCache() {
    _cacheLoadedAt = 0;
    _cache.clear();
}

// ── Notification channel config ─────────────────────────────────────

async function getNotificationChannels() {
    try {
        const { rows } = await pool.query(
            `SELECT id, notification_type, label, push_enabled, email_enabled, sms_enabled, updated_at
             FROM notification_channel_config
             ORDER BY notification_type`
        );
        return rows;
    } catch (err) {
        if (err?.code === '42P01') return [];
        throw err;
    }
}

async function updateNotificationChannel(notificationType, { pushEnabled, emailEnabled, smsEnabled, updatedBy }) {
    const { rows } = await pool.query(
        `UPDATE notification_channel_config
         SET push_enabled  = COALESCE($2, push_enabled),
             email_enabled = COALESCE($3, email_enabled),
             sms_enabled   = COALESCE($4, sms_enabled),
             updated_by    = $5,
             updated_at    = NOW()
         WHERE notification_type = $1
         RETURNING *`,
        [notificationType, pushEnabled, emailEnabled, smsEnabled, updatedBy]
    );
    return rows[0] || null;
}

// ── Platform admins ─────────────────────────────────────────────────

async function getPlatformAdmins() {
    try {
        const { rows } = await pool.query(
            `SELECT pa.id, pa.user_id, pa.is_active, pa.added_at,
                    u.name AS user_name, u.phonenumber AS phone, u.role
             FROM platform_admins pa
             JOIN users u ON u.userid = pa.user_id
             WHERE pa.is_active = TRUE
             ORDER BY pa.added_at`
        );
        return rows;
    } catch (err) {
        if (err?.code === '42P01') return [];
        throw err;
    }
}

/**
 * Seed platform_admins from PLATFORM_ADMIN_USER_IDS env var.
 * Only inserts users that don't already exist (active or inactive) in the table.
 */
async function seedPlatformAdminsFromEnv() {
    const raw = String(process.env.PLATFORM_ADMIN_USER_IDS || '').trim();
    if (!raw) return 0;

    const ids = raw.split(',').map(s => Number(String(s).trim())).filter(n => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return 0;

    let seeded = 0;
    for (const userId of ids) {
        try {
            await pool.query(
                `INSERT INTO platform_admins (user_id, added_by, added_at, is_active)
                 VALUES ($1, NULL, NOW(), TRUE)
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId]
            );
            seeded++;
        } catch (err) {
            console.warn(`[settingsService] seedPlatformAdminsFromEnv: failed for userId=${userId}:`, err?.message);
        }
    }
    return seeded;
}

async function addPlatformAdmin(userId, addedBy) {
    // Also ensure the user is an Admin role
    await pool.query(`UPDATE users SET role = 'Admin' WHERE userid = $1 AND role != 'Admin'`, [userId]);

    const { rows } = await pool.query(
        `INSERT INTO platform_admins (user_id, added_by, added_at, is_active)
         VALUES ($1, $2, NOW(), TRUE)
         ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE, added_by = EXCLUDED.added_by, added_at = NOW()
         RETURNING *`,
        [userId, addedBy]
    );
    return rows[0];
}

async function removePlatformAdmin(userId) {
    const { rows } = await pool.query(
        `UPDATE platform_admins SET is_active = FALSE WHERE user_id = $1 RETURNING *`,
        [userId]
    );
    return rows[0] || null;
}

/**
 * Check if a user is a platform admin (DB-based).
 * Falls back to the env var allowlist for backward compatibility.
 */
async function isPlatformAdmin(userId) {
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM platform_admins WHERE user_id = $1 AND is_active = TRUE`,
            [userId]
        );
        if (rows.length > 0) return true;
    } catch (err) {
        // Table might not exist yet (pre-migration)
        if (err?.code !== '42P01') console.warn('[settingsService] isPlatformAdmin check failed:', err?.message);
    }

    // Fallback: env-based allowlist
    const envList = String(process.env.PLATFORM_ADMIN_USER_IDS || '').trim();
    if (!envList) return false;
    const ids = envList.split(',').map(s => Number(String(s).trim())).filter(n => Number.isFinite(n) && n > 0);
    return ids.includes(Number(userId));
}

module.exports = {
    getSetting,
    getAllSettings,
    upsertSetting,
    bulkUpsert,
    invalidateCache,
    getNotificationChannels,
    updateNotificationChannel,
    getPlatformAdmins,
    seedPlatformAdminsFromEnv,
    addPlatformAdmin,
    removePlatformAdmin,
    isPlatformAdmin,
};
