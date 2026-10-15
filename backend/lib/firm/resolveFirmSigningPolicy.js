const { resolveFirmPlan } = require('../plan/resolveFirmPlan');

function toBool(v) {
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function readEnvBool(key, fallback) {
    const raw = process.env[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') return Boolean(fallback);
    return toBool(raw);
}

function pickFlag(featureFlags, keys) {
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(featureFlags || {}, k)) return toBool(featureFlags[k]);
    }
    return null;
}

/**
 * Resolve signing policy for the current single-tenant DB.
 *
 * Priority:
 *   1. Environment variables (SIGNING_ENABLED, SIGNING_CLIENT_OTP_REQUIRED)
 *   2. Plan feature_flags from tenant subscription
 *   3. Defaults (signing on, OTP off)
 *
 * The `_firmId` parameter is kept for backward-compat but ignored.
 */
async function resolveFirmSigningPolicy(_firmId) {
    // 1. Env overrides take precedence
    const envSigning = process.env.SIGNING_ENABLED;
    const envOtp = process.env.SIGNING_CLIENT_OTP_REQUIRED;

    // If env explicitly sets values, use them directly
    if (envSigning !== undefined && envSigning !== null && String(envSigning).trim() !== '') {
        return {
            signingEnabled: toBool(envSigning),
            signingClientOtpRequired: readEnvBool('SIGNING_CLIENT_OTP_REQUIRED', false),
            source: 'env',
        };
    }

    // 2. Fall back to plan feature flags
    const plan = await resolveFirmPlan(null);
    const flags = plan?.featureFlags || {};

    const signingEnabled = pickFlag(flags, ['signing_enabled', 'signingEnabled', 'signing']);
    const signingClientOtpRequired = pickFlag(flags, ['signing_client_otp_required', 'signingClientOtpRequired']);

    return {
        signingEnabled: signingEnabled === null ? true : signingEnabled,
        signingClientOtpRequired: signingClientOtpRequired === null
            ? readEnvBool('SIGNING_CLIENT_OTP_REQUIRED', false)
            : signingClientOtpRequired,
        source: signingEnabled !== null ? 'plan_feature_flags' : 'defaults',
    };
}

module.exports = { resolveFirmSigningPolicy };
