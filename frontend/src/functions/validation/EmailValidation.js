import i18next from 'i18next';

export default function emailValidation(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple email regex
    if (!email) return null;
    if (!emailPattern.test(email)) return i18next.t('errors.invalidEmail');
    return null; // No error
}