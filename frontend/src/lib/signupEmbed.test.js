import { navigateAfterSignup } from './signupEmbed';

test('completed signup starts a fresh office login instead of reusing another office session', () => {
    const keys = ['token', 'refreshToken', 'role', 'isPlatformAdmin', 'lw-active-tenant-slug'];
    keys.forEach(key => localStorage.setItem(key, 'previous-office'));
    localStorage.setItem('languagePreference', 'he');
    const changed = jest.fn(), navigate = jest.fn();
    window.addEventListener('lw-auth-changed', changed);
    try {
        navigateAfterSignup('synthetic-new-office', navigate);
        keys.forEach(key => expect(localStorage.getItem(key)).toBeNull());
        expect(localStorage.getItem('languagePreference')).toBe('he');
        expect(changed).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/synthetic-new-office/LoginStack/LoginScreen', { replace: true });
    } finally { window.removeEventListener('lw-auth-changed', changed); localStorage.clear(); }
});
