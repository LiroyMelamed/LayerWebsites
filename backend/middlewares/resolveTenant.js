const {
    isMultiTenantMode,
    runWithTenant,
    normalizeSlug,
} = require('../lib/tenant/tenantContext');
const { getTenantBySlug } = require('../lib/tenant/tenantService');

async function resolveTenantMiddleware(req, res, next) {
    if (!isMultiTenantMode()) {
        return next();
    }

    const aliases = [req.headers['x-tenant-slug'], req.body?.tenantSlug, req.query?.tenantSlug]
        .filter(value => value !== undefined && value !== null && value !== '');
    if (aliases.some(value => typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/i.test(value.trim())) ||
        new Set(aliases.map(normalizeSlug)).size > 1) {
        return res.status(400).json({ error: 'INVALID_TENANT_CONTEXT' });
    }
    const slug = normalizeSlug(aliases[0]);

    if (!slug) {
        return next();
    }

    try {
        const tenant = await getTenantBySlug(slug);
        if (!tenant) {
            return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'משרד לא נמצא' });
        }
        if (!tenant.isActive) {
            return res.status(403).json({ error: 'TENANT_INACTIVE', message: 'משרד מושבת' });
        }
        req.tenant = tenant;
        req.tenantSlug = tenant.slug;
        return runWithTenant(tenant, () => next());
    } catch (e) {
        console.error('[resolveTenant]', e?.message);
        return res.status(500).json({ error: 'TENANT_LOOKUP_FAILED' });
    }
}

module.exports = resolveTenantMiddleware;
