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
    if (p === '/api/public/signup' || p.startsWith('/api/public/signup/')) return true;
    // This route enforces a separate owner service key before any read or write.
    if (p === '/api/business-control') return true;
    if (p.startsWith('/api/billing')) return true;
    if (p === '/api/staff/session-scope') return true; // Authenticated recovery navigation only.
    if (p.startsWith('/api/SigningFiles/public')) return true;
    if (p.startsWith('/api/platform-settings/public')) return true;
    if (p.startsWith('/api/platform/v1')) return true;
    if (p.startsWith('/api/calendar/invite')) return true;
    if (p.startsWith('/api/compliance')) return true;
    return false;
}

async function requireBillingAccess(req, res, next) {
    if (isExemptPath(req)) return next();
    // Headerless authenticated requests get their office from the verified DB identity later.
    const scope = require('../lib/tenant/databaseScope');
    if (scope.enabled() && scope.current().mode === 'none') return next();

    try {
        const { getBillingSnapshot } = require('../lib/billing/firmBillingService');
        const snap = await getBillingSnapshot();
        if (!snap?.locked) return next();

        // Business billing details are available only from the owner-authorized
        // billing routes. Public/client requests always receive a neutral outage.
        res.setHeader?.('Cache-Control', 'no-store');
        return sendError(res, {
            httpStatus: 503,
            errorCode: 'SERVICE_TEMPORARILY_UNAVAILABLE',
            message: 'השירות אינו זמין כרגע עקב תקלה זמנית. נסו שוב מאוחר יותר.',
        });
    } catch (e) {
        if (e?.code === '42P01' || String(e?.message || '').includes('does not exist')) {
            return next();
        }
        console.warn('[billing-lock] snapshot failed:', e?.message);
        return sendError(res, {
            httpStatus: 503,
            errorCode: 'SERVICE_TEMPORARILY_UNAVAILABLE',
            message: getHebrewMessage('INTERNAL_ERROR'),
        });
    }
}

module.exports = { requireBillingAccess, isExemptPath };
