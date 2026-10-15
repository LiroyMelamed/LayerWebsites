const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRolePermissions } = require('../lib/firmRolePermissions');
const { canViewAllFirmCases, requireAreaAction } = require('../lib/firmPermissions/accessPure');

test('legacy Admin sees all firm cases', () => {
    const req = { firmPermissionMode: 'legacy', user: { Role: 'Admin' } };
    assert.equal(canViewAllFirmCases(req), true);
});

test('legacy Lawyer shares Admin firm-wide capabilities', () => {
    const req = { firmPermissionMode: 'legacy', user: { Role: 'Lawyer' } };
    assert.equal(canViewAllFirmCases(req), true);
});

test('role mode uses dataScope not JWT role', () => {
    const perms = normalizeRolePermissions({
        areas: {
            cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
        },
    });
    const req = {
        firmPermissionMode: 'role',
        user: { Role: 'Staff' },
        firmPermissions: perms,
    };
    assert.equal(canViewAllFirmCases(req), false);
    assert.equal(requireAreaAction(req, 'cases', 'view'), null);
    assert.ok(requireAreaAction(req, 'cases', 'delete'));
});

test('platform admin mode full case access', () => {
    const req = { firmPermissionMode: 'platform_admin', user: { Role: 'Admin' } };
    assert.equal(canViewAllFirmCases(req), true);
});
