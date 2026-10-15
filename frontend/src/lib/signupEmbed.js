import { tenantPath } from './tenantSlug';

export function isSignupEmbedded() {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') return true;
    try {
        return window.self !== window.top;
    } catch {
        return false;
    }
}

export function navigateAfterSignup(slug, navigate) {
    // A completed office is a new login context. An older office session must
    // not redirect the owner past its login screen or carry old permissions.
    ['token', 'refreshToken', 'role', 'isPlatformAdmin', 'lw-active-tenant-slug'].forEach(key => localStorage.removeItem(key));
    window.dispatchEvent(new Event('lw-auth-changed'));
    const path = tenantPath(slug, '/LoginStack/LoginScreen');
    if (isSignupEmbedded()) {
        window.top.location.href = `${window.location.origin}${path}`;
        return;
    }
    navigate(path, { replace: true });
}
