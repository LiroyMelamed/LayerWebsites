const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizePhoneDigits = (phone) => String(phone || '').replace(/\D/g, '');

export const hasSignerEmail = (value) => !!normalizeEmail(value);
export const hasSignerPhone = (value) => normalizePhoneDigits(value).length >= 9;

/** Allowed delivery methods based on which contacts the signer has. */
export function getAllowedSignerDeliveryMethods({ email, phone } = {}) {
    const emailOk = hasSignerEmail(email);
    const phoneOk = hasSignerPhone(phone);
    if (emailOk && phoneOk) return ['both', 'email', 'phone'];
    if (emailOk) return ['email'];
    if (phoneOk) return ['phone'];
    return [];
}

export function clampSignerDeliveryMethod({ email, phone } = {}, preferred) {
    const allowed = getAllowedSignerDeliveryMethods({ email, phone });
    const pref = String(preferred || '').trim().toLowerCase();
    if (!allowed.length) return pref || 'phone';
    if (pref && allowed.includes(pref)) return pref;
    return allowed[0];
}

export function deliveryMethodLabelKey(method) {
    const m = String(method || '').trim().toLowerCase();
    if (m === 'email') return 'signingManager.replaceSigner.deliveryEmail';
    if (m === 'both') return 'signingManager.replaceSigner.deliveryBoth';
    return 'signingManager.replaceSigner.deliveryPhone';
}
