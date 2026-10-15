const pool = require('../config/db');
const { listClientSigningFiles } = require('../lib/clientSigningReadiness');
const { requireInt } = require('../utils/paramValidation');
const { createAppError } = require('../utils/appError');

// Customer browser entry is separate from the office manage capability. Auth
// has already resolved the current database identity and tenant on this request.
module.exports = async function requireClientSigningLink(req, res, next) {
    res.set('Cache-Control', 'private, no-store');
    try {
        if (!['User', 'Client'].includes(req.user?.Role) || req.firmPermissionMode !== 'legacy') {
            return next(createAppError('FORBIDDEN', 403));
        }
        // There is no recipient selector or caller-controlled signing policy.
        if ((req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) ||
            Object.keys(req.query || {}).length) {
            return next(createAppError('INVALID_PARAMETER', 422));
        }
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        // Reuse the exact personal ownership, tenant/case boundary and current
        // turn calculation advertised by the authenticated client dashboard.
        const files = await listClientSigningFiles(pool, req, { enabled: false });
        const file = files.find(item => Number(item.SigningFileId) === signingFileId);
        if (!file) return next(createAppError('DOCUMENT_NOT_FOUND', 404));
        if (!file.CanSignNow) {
            if (file.PersonalStatus === 'expired') return next(createAppError('DOCUMENT_EXPIRED', 410));
            if (file.PersonalStatus === 'waiting') return next(createAppError('SIGNING_NOT_YOUR_TURN', 403));
            return next(createAppError('DOCUMENT_NOT_SIGNABLE', 409));
        }
        // Internal flag: the shared issuer must target this exact current user,
        // even if a former office user also happens to own the document record.
        req.clientSelfSigningLink = true;
        return next();
    } catch (error) {
        return next(error);
    }
};
