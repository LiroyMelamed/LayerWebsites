const requireFirmAction = require('./requireFirmAction');
const officeView = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });

// A customer's own documents are not an office-staff capability. The detail
// and PDF controllers still verify primary-client / assigned-signer ownership.
module.exports = async function requireSigningReadAccess(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';
    if (mode === 'legacy' && ['User', 'Client', 'ExternalSigner'].includes(req.user?.Role)) {
        try {
            const id = Number(req.params?.signingFileId);
            if (Number.isSafeInteger(id) && id > 0) {
                const { rows } = await require('../config/db').query('SELECT status FROM signingfiles WHERE signingfileid=$1', [id]);
                if (rows[0]?.status === 'draft') return next(require('../utils/appError').createAppError('FORBIDDEN', 403));
            }
            return next();
        } catch (error) { return next(error); }
    }
    return officeView(req, res, next);
};
