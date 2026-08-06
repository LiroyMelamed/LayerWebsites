/**
 * App deep-link payloads for Expo push / stored notifications.
 * All LawyerApp tenants register melamedia:// in linking.prefixes.
 */

const APP_SCHEME = 'melamedia';

function toPositiveId(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
}

function appointmentDeepLink(eventId) {
    const id = toPositiveId(eventId);
    return id ? `${APP_SCHEME}://appointment/${id}` : null;
}

function caseDeepLink(caseId) {
    const id = toPositiveId(caseId);
    return id ? `${APP_SCHEME}://case/${id}` : null;
}

function signingDeepLink(signingFileId = null) {
    const id = toPositiveId(signingFileId);
    if (id) return `${APP_SCHEME}://signing?signingFileId=${encodeURIComponent(id)}`;
    return `${APP_SCHEME}://signing`;
}

/**
 * Build a push/notification data object with deepLink (+ url mirror) and ids.
 *
 * @param {object} opts
 * @param {string} [opts.type]
 * @param {string|number} [opts.caseId]
 * @param {string|number} [opts.signingFileId]
 * @param {string|number} [opts.eventId]
 * @param {string} [opts.token] public signing JWT (invite only)
 * @param {string} [opts.publicUrl] https URL for SMS/email parity
 * @param {object} [opts.extra] merged into data as-is
 */
function buildAppDeepLinkData({
    type,
    caseId = null,
    signingFileId = null,
    eventId = null,
    token = null,
    publicUrl = null,
    extra = null,
} = {}) {
    const data = {
        ...(extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}),
    };

    if (type) data.type = String(type);

    const caseIdStr = toPositiveId(caseId);
    const signingFileIdStr = toPositiveId(signingFileId);
    const eventIdStr = toPositiveId(eventId);

    if (caseIdStr) data.caseId = caseIdStr;
    if (signingFileIdStr) data.signingFileId = signingFileIdStr;
    if (eventIdStr) data.eventId = eventIdStr;
    if (token) data.token = String(token);
    if (publicUrl) data.url = String(publicUrl);

    let deepLink = null;
    const t = String(type || '').toLowerCase();

    if (t === 'signing_pending' || t === 'file_reuploaded' || t === 'sign_invite') {
        if (token) {
            deepLink = `${APP_SCHEME}://PublicSigning?token=${encodeURIComponent(String(token))}`;
        } else if (publicUrl) {
            deepLink = publicUrl;
        }
    } else if (eventIdStr) {
        deepLink = appointmentDeepLink(eventIdStr);
    } else if (caseIdStr) {
        deepLink = caseDeepLink(caseIdStr);
    } else if (
        t === 'file_signed' ||
        t === 'file_rejected' ||
        t === 'signing' ||
        signingFileIdStr
    ) {
        deepLink = signingDeepLink(signingFileIdStr);
    }

    if (deepLink) {
        data.deepLink = deepLink;
        if (!data.url) data.url = deepLink;
    }

    return data;
}

/** Case-update / license / manager pushes that should open a case. */
function buildCasePushData({ caseId, type, extra = null } = {}) {
    return buildAppDeepLinkData({ type: type || 'case_update', caseId, extra });
}

/**
 * DOC_SIGNED / DOC_REJECTED: prefer case, else signing manager.
 */
function buildSignedDocPushData({
    type,
    caseId = null,
    signingFileId = null,
    publicUrl = null,
} = {}) {
    const caseIdStr = toPositiveId(caseId);
    if (caseIdStr) {
        return buildAppDeepLinkData({
            type,
            caseId: caseIdStr,
            signingFileId,
            publicUrl,
        });
    }
    return buildAppDeepLinkData({
        type,
        signingFileId,
        publicUrl,
    });
}

module.exports = {
    APP_SCHEME,
    appointmentDeepLink,
    caseDeepLink,
    signingDeepLink,
    buildAppDeepLinkData,
    buildCasePushData,
    buildSignedDocPushData,
};
