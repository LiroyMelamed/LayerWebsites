const pool = require('../config/db');
const { formatPhoneNumber } = require('../utils/phoneUtils');
const {
    listTenantsWithStats,
    createTenant,
    setTenantActive,
    slugAvailable,
} = require('../lib/tenant/tenantService');
const { isValidSlug, normalizeSlug } = require('../lib/tenant/tenantContext');
const { resolvePricingLineItems } = require('../lib/billing/pricingPackage');

function addDays(from, days) {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

async function getStats(req, res) {
    const tenants = await listTenantsWithStats();
    const pending = await pool.query(
        `SELECT COUNT(*)::int AS c FROM signup_intents WHERE status = 'pending_payment'`
    );
    return res.json({
        tenantCount: tenants.length,
        activeTenants: tenants.filter((t) => t.isActive).length,
        pendingSignups: pending.rows?.[0]?.c || 0,
    });
}

async function listTenants(req, res) {
    const tenants = await listTenantsWithStats();
    return res.json({ tenants });
}

async function createTenantManual(req, res) {
    const slug = normalizeSlug(req.body?.slug);
    const name = String(req.body?.name || '').trim();
    const adminPhone = formatPhoneNumber(req.body?.adminPhone) || String(req.body?.adminPhone || '').trim();
    const adminName = String(req.body?.adminName || name).trim();
    const adminEmail = String(req.body?.adminEmail || '').trim() || null;

    if (!isValidSlug(slug) || !name || !adminPhone) {
        return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (!(await slugAvailable(slug))) {
        return res.status(409).json({ error: 'SLUG_TAKEN' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tenant = await createTenant({ slug, name, adminPhone, adminEmail });
        const pkg = resolvePricingLineItems({
            platformId: req.body?.platformId || 'site_app',
            resourceId: req.body?.resourceId || 'pro',
            signingId: req.body?.signingId || '500',
        });
        const trialDays = Number(process.env.SIGNUP_TRIAL_DAYS || 90);
        const complimentaryUntil = addDays(new Date(), trialDays);

        await client.query(
            `INSERT INTO firm_billing (
                platform_id, resource_id, signing_id, price_monthly_ils,
                status, billing_enabled, complimentary_until, renews_at, law_firm_tenant_id
             ) VALUES ($1,$2,$3,$4,'complimentary',true,$5,$5,$6)`,
            [
                pkg.platformId,
                pkg.resourceId,
                pkg.signingId,
                pkg.total,
                complimentaryUntil,
                tenant.id,
            ]
        );

        const userRes = await client.query(
            `INSERT INTO users (name, phonenumber, email, role, law_firm_tenant_id)
             VALUES ($1,$2,$3,'Admin',$4) RETURNING userid`,
            [adminName, adminPhone, adminEmail, tenant.id]
        );
        await client.query(
            `INSERT INTO platform_admins (user_id, is_active) VALUES ($1, true)
             ON CONFLICT (user_id) DO UPDATE SET is_active = true`,
            [userRes.rows[0].userid]
        );
        await client.query('COMMIT');
        return res.status(201).json({ tenant, adminUserId: userRes.rows[0].userid });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('[masterAdmin createTenant]', e?.message);
        return res.status(500).json({ error: 'CREATE_FAILED', message: e?.message });
    } finally {
        client.release();
    }
}

async function patchTenant(req, res) {
    const tenantId = req.params.tenantId;
    if (req.body?.isActive != null) {
        const updated = await setTenantActive(tenantId, req.body.isActive);
        if (!updated) return res.status(404).json({ error: 'TENANT_NOT_FOUND' });
        return res.json({ tenant: updated });
    }
    return res.status(400).json({ error: 'NO_CHANGES' });
}

async function checkSlug(req, res) {
    const slug = normalizeSlug(req.query.slug);
    if (!slug) return res.json({ available: false, reason: 'empty' });
    if (!isValidSlug(slug)) return res.json({ available: false, reason: 'invalid' });
    const available = await slugAvailable(slug);
    return res.json({ available, slug });
}

module.exports = {
    getStats,
    listTenants,
    createTenantManual,
    patchTenant,
    checkSlug,
};
