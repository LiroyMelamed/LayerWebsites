import { extractTenantSlugFromPath } from './tenantSlug';
export function useNaturalLogoColors() {
    const appName = String(process.env.REACT_APP_APP_NAME || '').toLowerCase();
    const multiTenant = String(process.env.REACT_APP_MULTI_TENANT || '').toLowerCase() === 'true';
    return appName === 'melamedia' || appName === 'idm' || multiTenant;
}

export function getTenantLogoUrl() {
    if (!isMultiTenantPlatform() || typeof window === 'undefined') return null;
    const slug = extractTenantSlugFromPath(window.location.pathname);
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return null;
    const api = String(process.env.REACT_APP_API_BASE_URL || '/api').replace(/\/$/, '');
    return `${api}/public/signup/branding/${encodeURIComponent(slug)}/logo`;
}
export function getPublicFirmLogoUrl() {
    const tenantLogo = getTenantLogoUrl();
    if (tenantLogo) return tenantLogo;

    return `${process.env.PUBLIC_URL || ''}/firm-logo.png`;
}

export function getMelaMediaMarkUrl() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}/melamedia-mark.png`;
}

export function isMultiTenantPlatform() {
    return String(process.env.REACT_APP_MULTI_TENANT || '').toLowerCase() === 'true';
}
