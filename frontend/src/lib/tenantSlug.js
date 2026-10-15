const MULTI_TENANT = String(process.env.REACT_APP_MULTI_TENANT || '').toLowerCase() === 'true';
const STORAGE_KEY = 'lw-active-tenant-slug';

export function isMultiTenantApp() {
    return MULTI_TENANT;
}

export function getActiveTenantSlug() {
    if (!MULTI_TENANT) return null;
    return localStorage.getItem(STORAGE_KEY) || null;
}

export function setActiveTenantSlug(slug) {
    if (!slug) {
        localStorage.removeItem(STORAGE_KEY);
        return;
    }
    localStorage.setItem(STORAGE_KEY, String(slug).trim().toLowerCase());
}

export function tenantPath(slug, path = '') {
    const base = `/${String(slug || '').trim().toLowerCase()}`;
    if (!path) return base;
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function extractTenantSlugFromPath(pathname) {
    if (!MULTI_TENANT) return null;
    const parts = String(pathname || '').split('/').filter(Boolean);
    const first = parts[0];
    if (!first) return null;
    const reserved = new Set([
        'signup', 'admin', 'api', 'Pricing', 'PublicSignScreen', 'LoginStack',
        'AdminStack', 'ClientStack', 'SecurityScreen', 'Privacy', 'ChatBot',
    ]);
    if (reserved.has(first)) return null;
    return first.toLowerCase();
}
