const {
    isAreaVisible,
    hasAreaAction,
    getCasesDataScope,
    buildSessionScopeFromPermissions,
    buildPlatformAdminSessionScope,
    buildLegacySessionScope,
} = require('../firmRolePermissions');
const { createAppError } = require('../../utils/appError');
const { getHebrewMessage } = require('../../utils/errors.he');

function getSessionScopePayload(req) {
    if (req.firmPermissionMode === 'platform_admin') {
        return buildPlatformAdminSessionScope();
    }
    if (req.firmPermissionMode === 'role' && req.firmPermissions) {
        return buildSessionScopeFromPermissions(req.firmPermissions, req.firmStaffRoleName);
    }
    return buildLegacySessionScope();
}

function canViewAllFirmCases(req) {
    if (req.firmPermissionMode === 'platform_admin') return true;
    if (req.firmPermissionMode === 'legacy') {
        return String(req.user?.Role || '') === 'Admin';
    }
    if (req.firmPermissionMode === 'role') {
        return getCasesDataScope(req.firmPermissions) === 'all_firm';
    }
    return false;
}

function requireAreaAction(req, areaId, action) {
    if (req.firmPermissionMode === 'platform_admin') return null;
    if (req.firmPermissionMode === 'legacy') return null;
    if (req.firmPermissionMode === 'role') {
        if (hasAreaAction(req.firmPermissions, areaId, action)) return null;
        return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
    }
    return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
}

function requireAreaVisible(req, areaId) {
    if (req.firmPermissionMode === 'platform_admin') return null;
    if (req.firmPermissionMode === 'legacy') return null;
    if (req.firmPermissionMode === 'role') {
        if (isAreaVisible(req.firmPermissions, areaId)) return null;
        return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
    }
    return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
}

function isRoleModeStaff(req) {
    return req.firmPermissionMode === 'role';
}

module.exports = {
    getSessionScopePayload,
    canViewAllFirmCases,
    requireAreaAction,
    requireAreaVisible,
    isRoleModeStaff,
};
