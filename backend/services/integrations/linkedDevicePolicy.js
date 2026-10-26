'use strict';

function normalizedPhone(value) {
    if (typeof value !== 'string') return null;
    let phone = value.normalize('NFKC').trim().replace(/[\s()-]/g, '');
    if (/^0[2-9]\d{7,8}$/.test(phone)) phone = '+972' + phone.slice(1);
    if (/^972[2-9]\d{7,8}$/.test(phone)) phone = '+' + phone;
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
function pilotAllowlist(env) {
    const value = env.WHATSAPP_WAHA_PILOT_ALLOWLIST;
    if (typeof value !== 'string' || value.length > 2048) return null;
    const entries = value.split(',');
    if (!entries.length || entries.length > 32) return null;
    const phones = entries.map(normalizedPhone);
    return phones.some(phone => !phone) ? null : new Set(phones);
}
function isLinkedDevice(connection) {
    return connection?.settings?.gateway === 'waha';
}
function linkedLiveEnabled(env = process.env) {
    if (env.WHATSAPP_WAHA_ENABLED !== 'true' || env.WHATSAPP_WAHA_DELIVERY_ENABLED !== 'true' ||
        env.WHATSAPP_DEMO_ONLY === 'true' || env.WHATSAPP_WAHA_CONNECT_ONLY === 'true') return false;
    return env.QA_OUTBOUND_MODE !== 'noop' || env.WHATSAPP_WAHA_QA_PILOT_ENABLED === 'true' && Boolean(pilotAllowlist(env)?.size);
}
function linkedDeliveryAllowed(env = process.env, job, connection) {
    if (!linkedLiveEnabled(env) || !isLinkedDevice(connection)) return false;
    if (env.QA_OUTBOUND_MODE !== 'noop' && job?.is_pilot !== true) return true;
    const allowlist = pilotAllowlist(env);
    if (env.WHATSAPP_WAHA_QA_PILOT_ENABLED !== 'true' || job?.is_pilot !== true || !allowlist?.size ||
        !Array.isArray(job.recipients) || !job.recipients.length || job.recipients.length > 7) return false;
    const phone = normalizedPhone(connection.display_phone);
    return Boolean(phone && allowlist.has(phone) && job.recipients.every(recipient => {
        const phone = normalizedPhone(recipient?.phone);
        return phone && allowlist.has(phone);
    }));
}

module.exports = { isLinkedDevice, linkedLiveEnabled, linkedDeliveryAllowed, normalizedPhone, pilotAllowlist };
