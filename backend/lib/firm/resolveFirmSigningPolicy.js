const pool = require('../../config/db');
const { isFirmScopeEnabled } = require('./firmScope');
const { resolveFirmPlan } = require('../plan/resolveFirmPlan');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist') || (msg.includes('relation') && msg.includes('does not exist'));
}

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

async function resolveFirmSigningPolicy(firmId) {
    if (!isFirmScopeEnabled()) {
        // Legacy mode: firm scope disabled (single-tenant / pre-firm-scope deployments).
        // Keep signing available unless explicitly disabled via env.
        return {
            signingEnabled: readEnvBool('SIGNING_ENABLED', true),
            signingClientOtpRequired: readEnvBool('SIGNING_CLIENT_OTP_REQUIRED', false),
            source: 'legacy_env',
        };
    }

    const fid = Number(firmId);
    if (!Number.isFinite(fid) || fid <= 0) {
        return {
            signingEnabled: false,
            signingClientOtpRequired: false,
            source: 'missing_firm',
        };
    }

    try {
        const r = await pool.query(
            `select
                signing_enabled as "SigningEnabled",
                signing_client_otp_required as "SigningClientOtpRequired"
             from firm_signing_policy
             where firmid = $1
             limit 1`,
            [fid]
        );

        if (r.rowCount > 0) {
            return {
                signingEnabled: Boolean(r.rows[0].SigningEnabled),
                signingClientOtpRequired: Boolean(r.rows[0].SigningClientOtpRequired),
                source: 'firm_signing_policy',
            };
        }
    } catch (e) {
        if (!isRelationMissingError(e)) throw e;
        // If the table isn't deployed yet (older env), fall back to plan flags.
    }

    // Fallback: use plan feature flags if no explicit row exists.
    const plan = await resolveFirmPlan(fid);
    const flags = plan?.featureFlags || {};

    const signingEnabled = pickFlag(flags, ['signing_enabled', 'signingEnabled', 'signing']);
    const signingClientOtpRequired = pickFlag(flags, ['signing_client_otp_required', 'signingClientOtpRequired']);

    return {
        // If plans don't specify the flag yet, keep signing on by default.
        signingEnabled: signingEnabled === null ? true : signingEnabled,
        signingClientOtpRequired: signingClientOtpRequired === null ? false : signingClientOtpRequired,
        source: 'plan_feature_flags',
    };
}

module.exports = { resolveFirmSigningPolicy };
