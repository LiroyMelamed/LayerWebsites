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

    const fromHeader = normalizeSlug(req.headers['x-tenant-slug']);
    const fromBody = normalizeSlug(req.body?.tenantSlug);
    const fromQuery = normalizeSlug(req.query?.tenantSlug);
    const slug = fromHeader || fromBody || fromQuery;

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
