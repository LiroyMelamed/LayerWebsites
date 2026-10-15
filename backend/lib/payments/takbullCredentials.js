/**
 * Takbull credential selection — never mix sandbox and production silently.
 *
 * Preferred .env layout:
 *   TAKBULL_MODE=prod|test
 *   PROD_TAKBULL_API_KEY=...
 *   PROD_TAKBULL_API_SECRET=...
 *   TEST_TAKBULL_API_KEY=...   (Takbull developer sandbox only)
 *   TEST_TAKBULL_API_SECRET=...
 *
 * Legacy (deprecated): TAKBULL_API_KEY + TAKBULL_API_SECRET
 */

function readKeySecret(prefix) {
    const apiKey = String(process.env[`${prefix}_API_KEY`] || '').trim();
    const apiSecret = String(process.env[`${prefix}_API_SECRET`] || '').trim();
    if (!apiKey || !apiSecret) return null;
    return { apiKey, apiSecret };
}

function normalizeTakbullMode(raw) {
    const v = String(raw || 'prod').trim().toLowerCase();
    if (v === 'test' || v === 'sandbox' || v === 'dev') return 'test';
    return 'prod';
}

function getTakbullMode() {
    return normalizeTakbullMode(process.env.TAKBULL_MODE);
}

function getTakbullCredentialsFromEnv() {
    const mode = getTakbullMode();
    const named = mode === 'test'
        ? readKeySecret('TEST_TAKBULL')
        : readKeySecret('PROD_TAKBULL');
    if (named) {
        return { ...named, mode };
    }

    const legacy = readKeySecret('TAKBULL');
    if (legacy) {
        if (!global.__takbullLegacyCredWarned) {
            global.__takbullLegacyCredWarned = true;
            console.warn(
                '[takbull] Using legacy TAKBULL_API_KEY/TAKBULL_API_SECRET. '
                + 'Set TAKBULL_MODE plus PROD_TAKBULL_* and TEST_TAKBULL_* to avoid confusion.'
            );
        }
        return { ...legacy, mode: 'legacy' };
    }

    return null;
}

/** One-time card verification charge (setup checkout), in ILS. */
function resolveSetupAmountIls() {
    const raw = process.env.BILLING_CARD_VERIFICATION_AMOUNT_ILS;
    if (raw !== undefined && String(raw).trim() !== '') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
}

module.exports = {
    getTakbullMode,
    getTakbullCredentialsFromEnv,
    resolveSetupAmountIls,
    normalizeTakbullMode,
};
