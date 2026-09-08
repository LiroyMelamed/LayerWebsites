const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

const RESERVED_SLUGS = new Set([
    'admin',
    'api',
    'signup',
    'login',
    'health',
    'melamedia',
    'master',
    'platform',
    'publicsign',
    'pricing',
    'static',
    'www',
]);

function isMultiTenantMode() {
    return String(process.env.MULTI_TENANT_MODE || '').trim().toLowerCase() === 'true';
}

function normalizeSlug(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
}

function isValidSlug(slug) {
    const s = normalizeSlug(slug);
    if (!s || s.length < 2 || s.length > 48) return false;
    if (RESERVED_SLUGS.has(s)) return false;
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s);
}

function runWithTenant(tenant, fn) {
    return storage.run(tenant || null, fn);
}

function getCurrentTenant() {
    return storage.getStore() || null;
}

function getCurrentTenantId() {
    return getCurrentTenant()?.id || null;
}

module.exports = {
    RESERVED_SLUGS,
    isMultiTenantMode,
    normalizeSlug,
    isValidSlug,
    runWithTenant,
    getCurrentTenant,
    getCurrentTenantId,
};
