const crypto = require('crypto');

const STATE_TTL_MS = 15 * 60 * 1000;

function _getSecret() {
    const secret = process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('CALENDAR_OAUTH_STATE_SECRET or JWT_SECRET must be set for OAuth state signing');
    }
    return secret;
}

/**
 * Build a signed OAuth `state` value: base64url(payload).base64url(hmac-sha256).
 * @param {{ userId: number }} params
 */
function signOAuthState({ userId }) {
    const id = parseInt(userId, 10);
    if (!Number.isFinite(id)) {
        throw new Error('invalid userId for OAuth state');
    }
    const payload = Buffer.from(JSON.stringify({ userId: id, ts: Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', _getSecret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

/**
 * Verify signature and decode OAuth state. Throws on tampering, expiry, or malformed input.
 * @param {string} state
 * @returns {{ userId: number, ts: number }}
 */
function verifyOAuthState(state) {
    if (!state || typeof state !== 'string') {
        throw new Error('missing state');
    }
    const dot = state.lastIndexOf('.');
    if (dot <= 0) {
        throw new Error('invalid state format');
    }
    const payload = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    if (!payload || !sig) {
        throw new Error('invalid state format');
    }

    const expected = crypto.createHmac('sha256', _getSecret()).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        throw new Error('invalid state signature');
    }

    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        throw new Error('invalid state payload');
    }

    const userId = parseInt(data.userId, 10);
    if (!Number.isFinite(userId)) {
        throw new Error('invalid userId in state');
    }
    const ts = Number(data.ts);
    if (!Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
        throw new Error('state expired');
    }

    return { userId, ts };
}

module.exports = {
    signOAuthState,
    verifyOAuthState,
    STATE_TTL_MS,
};
