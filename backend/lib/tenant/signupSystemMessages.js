'use strict';
const messages = require('../systemMessages');

function signupSystemMessageConfiguration() {
    try {
        const config = messages.getConfig();
        return { available: config.captureEnabled && config.configured && config.mode === 'sharedsignup',
            consentVersion: messages.CONSENT_VERSION };
    } catch (_) {
        // A disabled or incomplete optional messaging setup must not hide signup.
        return { available: false, consentVersion: messages.CONSENT_VERSION };
    }
}

function captureSignupSystemConsent(payload, now = () => new Date()) {
    if (payload.systemMessagesConsent !== undefined && typeof payload.systemMessagesConsent !== 'boolean') {
        throw Object.assign(new Error('INVALID_SYSTEM_MESSAGE_CONSENT'), { code: 'INVALID_SYSTEM_MESSAGE_CONSENT' });
    }
    if (payload.systemMessagesConsent !== true) return null;
    if (!signupSystemMessageConfiguration().available) {
        throw Object.assign(new Error('SYSTEM_MESSAGES_UNAVAILABLE'), { code: 'SYSTEM_MESSAGES_UNAVAILABLE' });
    }
    if (payload.systemMessagesConsentVersion !== messages.CONSENT_VERSION) {
        throw Object.assign(new Error('INVALID_SYSTEM_MESSAGE_CONSENT'), { code: 'INVALID_SYSTEM_MESSAGE_CONSENT' });
    }
    return { optedIn: true, version: messages.CONSENT_VERSION, capturedAt: now() };
}

async function provisionSignupSystemMessages(client, { signup, tenant, adminUserId, complimentaryUntil }) {
    if (!signup.system_whatsapp_opted_in || signup.system_whatsapp_consent_version !== messages.CONSENT_VERSION ||
        !signup.system_whatsapp_captured_at || !signupSystemMessageConfiguration().available) return;
    await messages.setConsent(client, { officeId: tenant.id, ownerUserId: adminUserId,
        recipient: messages.normalizeRecipient(signup.admin_phone), recipientName: signup.admin_name,
        optedIn: true, version: signup.system_whatsapp_consent_version,
        sourceRef: 'signup:' + signup.id, capturedAt: signup.system_whatsapp_captured_at });
    // An activated trial is a subscription update. The ₪1 card check is never
    // represented as subscription revenue or a payment_received event.
    const date = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(complimentaryUntil).map(part => [part.type, part.value]));
    await messages.enqueueSubscriptionUpdate(client, { officeId: tenant.id, ownerUserId: adminUserId,
        sourceId: signup.id, status: 'active', planLabel: 'משפטית',
        periodEndsOn: `${date.year}-${date.month}-${date.day}` });
}

module.exports = { signupSystemMessageConfiguration, captureSignupSystemConsent, provisionSignupSystemMessages };
