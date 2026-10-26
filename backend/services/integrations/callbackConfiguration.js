'use strict';

// Trusted deployment configuration only; never accept callback targets from signup input.
function webhookCallbackConfig(env) {
    const raw = env.WHATSAPP_WEBHOOK_CALLBACK_URL;
    const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (typeof raw !== 'string' || raw !== raw.trim() || raw.length > 200 ||
        typeof verifyToken !== 'string' || !verifyToken.trim() || /[\u0000-\u001f\u007f]/.test(verifyToken)) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || url.href.length > 200) return null;
        return { callbackUrl: url.href, verifyToken };
    } catch { return null; }
}

module.exports = { webhookCallbackConfig };
