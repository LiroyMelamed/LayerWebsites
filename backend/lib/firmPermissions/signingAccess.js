const pool = require('../../config/db');
const { createAppError } = require('../../utils/appError');
const { getHebrewMessage } = require('../../utils/errors.he');
const { requireAreaAction } = require('./accessPure');
const { getSigningDataScope } = require('../firmRolePermissions');
const { isMultiTenantMode } = require('../tenant/tenantContext');

function forbidden() { return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')); }
function signingScopeFilter(req, { forceMine = false, alias = 'sf' } = {}) {
    // alias is supplied only by trusted server code.
    if (req.firmPermissionMode !== 'role') return null;
    if (!req.firmPermissionContextValidated) return { error: forbidden() };
    if (isMultiTenantMode() && !req.firmTenantId) return { error: forbidden() };
    const own = forceMine || getSigningDataScope(req.firmPermissions) !== 'all_firm';
    return {
        own,
        sql: `EXISTS (SELECT 1 FROM users scope_owner WHERE scope_owner.userid = ${alias}.lawyerid AND scope_owner.law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid) AND (${alias}.caseid IS NULL OR EXISTS (SELECT 1 FROM cases scope_file_case WHERE scope_file_case.caseid = ${alias}.caseid AND (to_jsonb(scope_file_case)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $1::text))` + (own ? (req.firmPermissions?.areas?.signing?.legacyCaseAssignment ? ` AND (${alias}.lawyerid = $2 OR EXISTS (SELECT 1 FROM case_users signing_assignment WHERE signing_assignment.caseid = ${alias}.caseid AND signing_assignment.userid = $2))` : ` AND ${alias}.lawyerid = $2`) : ''),
        params: own ? [req.firmTenantId || null, req.user?.UserId] : [req.firmTenantId || null],
    };
}
async function assertSigningFileOfficeAccess(req, signingFileId, action = 'view') {
    if (req.firmPermissionMode === 'platform_admin' || req.firmPermissionMode === 'legacy') return null;
    if (req.firmPermissionMode !== 'role') return forbidden();
    const signingAction = action === 'upload' ? 'upload' : action === 'manage' ? 'manage' : 'view';
    const permErr = requireAreaAction(req, 'signing', signingAction);
    if (permErr) return permErr;
    const filter = signingScopeFilter(req);
    if (filter.error) return filter.error;
    const { rows } = await pool.query(
        `SELECT sf.signingfileid, sf.caseid, sf.lawyerid FROM signingfiles sf WHERE ${filter.sql} AND sf.signingfileid = $${filter.params.length + 1} LIMIT 1`,
        [...filter.params, signingFileId],
    );
    if (!rows.length) return forbidden();
    // Controllers consume only grants verified for this request and this exact record.
    if (!req.firmSigningAccess) req.firmSigningAccess = new Map();
    const grants = req.firmSigningAccess.get(Number(signingFileId)) || new Set();
    grants.add(signingAction);
    req.firmSigningAccess.set(Number(signingFileId), grants);
    return null;
}
function hasVerifiedSigningAction(req, file, action) {
    const id = Number(file?.SigningFileId ?? file?.signingfileid ?? req.params?.signingFileId);
    return Boolean(req.firmSigningAccess?.get(id)?.has(action));
}
async function assertSigningUploadReferences(req) {
    if (req.firmPermissionMode !== 'role') return null;
    if (!req.firmPermissionContextValidated) return forbidden();
    const actionError = requireAreaAction(req, 'signing', 'upload');
    if (actionError) return actionError;
    if (isMultiTenantMode() && !req.firmTenantId) return forbidden();
    const signers = Array.isArray(req.body?.signers) ? req.body.signers : (req.body?.clientId ? [{ userId: req.body.clientId }] : []);
    // Existing external-signer creation is dedicated-DB only and must not create unscoped identities.
    if ((isMultiTenantMode() || req.firmTenantId) && signers.some(signer => !signer.userId)) return forbidden();
    for (const signer of signers) {
        if (!signer.userId) continue;
        const { rows } = await pool.query('SELECT 1 FROM users WHERE userid = $1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid LIMIT 1', [signer.userId, req.firmTenantId || null]);
        if (!rows.length) return forbidden();
    }
    if (req.body?.caseId && Number(req.body.caseId) !== 0) {
        const { rows } = await pool.query("SELECT 1 FROM cases c WHERE c.caseid = $1 AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text LIMIT 1", [req.body.caseId, req.firmTenantId || null]);
        if (!rows.length) return forbidden();
    }
    return null;
}
module.exports = { assertSigningFileOfficeAccess, signingScopeFilter, hasVerifiedSigningAction, assertSigningUploadReferences };
