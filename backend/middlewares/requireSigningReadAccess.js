const requireFirmAction = require('./requireFirmAction');
const officeView = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });

// A customer's own documents are not an office-staff capability. The detail
// and PDF controllers still verify primary-client / assigned-signer ownership.
module.exports = function requireSigningReadAccess(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';
    if (mode === 'legacy' && ['User', 'Client', 'ExternalSigner'].includes(req.user?.Role)) return next();
    return officeView(req, res, next);
};
