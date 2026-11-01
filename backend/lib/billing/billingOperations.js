'use strict';

// A local application maintenance gate, not a replacement for draining old
// instances/in-flight provider requests before a financial release is paused.
// Missing configuration preserves incumbent behavior. An explicitly configured
// but invalid value must never enable money movement accidentally.
function billingOperationsEnabled(env = process.env) {
    if (env.BILLING_OPERATIONS_ENABLED === undefined) return true;
    return ['true', '1'].includes(String(env.BILLING_OPERATIONS_ENABLED).trim().toLowerCase());
}

function assertBillingOperationsEnabled(env = process.env) {
    if (billingOperationsEnabled(env)) return;
    throw Object.assign(new Error('שירות התשלום מושהה כרגע. נסו שוב מאוחר יותר.'), {
        code: 'BILLING_OPERATIONS_PAUSED', httpStatus: 503, status: 503, retryAfter: 60,
    });
}

function isBillingOperationsPausedError(error) {
    return error?.code === 'BILLING_OPERATIONS_PAUSED';
}

function respondIfBillingPaused(res, error) {
    if (!isBillingOperationsPausedError(error)) return false;
    res.setHeader('Retry-After', String(error.retryAfter || 60));
    res.status(503).json({ error: error.code, errorCode: error.code, message: error.message });
    return true;
}

module.exports = { billingOperationsEnabled, assertBillingOperationsEnabled, isBillingOperationsPausedError, respondIfBillingPaused };
