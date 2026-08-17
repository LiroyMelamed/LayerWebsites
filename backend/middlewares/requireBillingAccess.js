const { getHebrewMessage } = require('../utils/errors.he');
const { sendError } = require('../utils/appError');

function pathOf(req) {
    return String(req.originalUrl || req.url || req.path || '').split('?')[0];
}

function isExemptPath(req) {
    const p = pathOf(req);
    if (p === '/' || p === '/health' || p === '/api/health') return true;
    if (p.startsWith('/api/Auth')) return true;
    if (p.startsWith('/api/webhooks')) return true;
    if (p.startsWith('/api/billing')) return true;
    if (p.startsWith('/api/SigningFiles/public')) return true;
    if (p.startsWith('/api/platform-settings/public')) return true;
    if (p.startsWith('/api/platform/v1')) return true;
    if (p.startsWith('/api/calendar/invite')) return true;
    if (p.startsWith('/api/compliance')) return true;
    return false;
}

async function requireBillingAccess(req, res, next) {
    if (isExemptPath(req)) return next();

    try {
        const { getBillingSnapshot } = require('../lib/billing/firmBillingService');
        const snap = await getBillingSnapshot();
        if (!snap?.locked) return next();

        return sendError(res, {
            httpStatus: 402,
            errorCode: 'BILLING_LOCKED',
            message: getHebrewMessage('BILLING_LOCKED'),
            extras: {
                billingLocked: true,
                graceUntil: snap.graceUntil || null,
                status: snap.status,
                payUrl: snap.payUrl,
            },
        });
    } catch (e) {
        if (e?.code === '42P01' || String(e?.message || '').includes('does not exist')) {
            return next();
        }
        console.warn('[billing-lock] snapshot failed:', e?.message);
        return next();
    }
}

module.exports = { requireBillingAccess, isExemptPath };
