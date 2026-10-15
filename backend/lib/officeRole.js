const { isMultiTenantMode } = require('./tenant/tenantContext');

/** Professional title stays in ProfessionalRole; legacy office capabilities are shared. */
function applyLegacyOfficeRole(req) {
    // Legacy firm-wide queries are safe only for dedicated tenant databases.
    // Shared-database tenant predicates must be audited before widening access there.
    if (isMultiTenantMode()) return;
    if (req.firmPermissionMode !== 'legacy' || req.user?.Role !== 'Lawyer') return;
    req.user.ProfessionalRole = 'Lawyer';
    req.user.Role = 'Admin';
}
function canOverridePublicSignerIdentity(req) {
    return ['legacy', 'platform_admin'].includes(req.firmPermissionMode) && req.user?.Role === 'Admin';
}
module.exports = { applyLegacyOfficeRole, canOverridePublicSignerIdentity };
