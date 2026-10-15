const pool = require('../../config/db');
const { normalizeSlug, isValidSlug } = require('./tenantContext');

function mapTenantRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        isActive: row.is_active !== false,
        branding: row.branding || {},
        adminPhone: row.admin_phone,
        adminEmail: row.admin_email,
        practiceAreas: row.practice_areas || [],
        lawyerCount: row.lawyer_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function getTenantBySlug(slug) {
    const normalized = normalizeSlug(slug);
    if (!normalized) return null;
    const res = await pool.query(
        `SELECT * FROM law_firm_tenants WHERE lower(slug) = $1 LIMIT 1`,
        [normalized]
    );
    return mapTenantRow(res.rows?.[0] || null);
}

async function getTenantById(id) {
    const res = await pool.query(`SELECT * FROM law_firm_tenants WHERE id = $1 LIMIT 1`, [id]);
    return mapTenantRow(res.rows?.[0] || null);
}

async function slugAvailable(slug) {
    if (!isValidSlug(slug)) return false;
    const existing = await getTenantBySlug(slug);
    if (existing) return false;
    const pending = await pool.query(
        `SELECT 1 FROM signup_intents
         WHERE lower(slug) = $1 AND status IN ('pending_payment', 'provisioning')
         LIMIT 1`,
        [normalizeSlug(slug)]
    );
    return (pending.rows || []).length === 0;
}

async function listTenantsWithStats() {
    const res = await pool.query(
        `SELECT t.*,
                (SELECT COUNT(*)::int FROM users u WHERE u.law_firm_tenant_id = t.id) AS user_count
         FROM law_firm_tenants t
         ORDER BY t.created_at DESC`
    );
    return (res.rows || []).map((row) => ({
        ...mapTenantRow(row),
        userCount: Number(row.user_count || 0),
    }));
}

async function createTenant({ slug, name, adminPhone, adminEmail, practiceAreas, lawyerCount, branding }) {
    const normalized = normalizeSlug(slug);
    if (!isValidSlug(normalized)) {
        const err = new Error('INVALID_SLUG');
        err.code = 'INVALID_SLUG';
        throw err;
    }
    const res = await pool.query(
        `INSERT INTO law_firm_tenants (slug, name, admin_phone, admin_email, practice_areas, lawyer_count, branding)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            normalized,
            String(name || '').trim(),
            adminPhone || null,
            adminEmail || null,
            Array.isArray(practiceAreas) ? practiceAreas : [],
            lawyerCount != null ? Number(lawyerCount) : null,
            branding || {},
        ]
    );
    return mapTenantRow(res.rows[0]);
}

async function setTenantActive(tenantId, isActive) {
    const res = await pool.query(
        `UPDATE law_firm_tenants SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [tenantId, Boolean(isActive)]
    );
    return mapTenantRow(res.rows?.[0] || null);
}

module.exports = {
    mapTenantRow,
    getTenantBySlug,
    getTenantById,
    slugAvailable,
    listTenantsWithStats,
    createTenant,
    setTenantActive,
};
