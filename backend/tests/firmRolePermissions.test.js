const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeRolePermissions,
    hasAreaAction,
    getCasesDataScope,
    listVisiblePageKeys,
    getCatalogForApi,
} = require('../lib/firmRolePermissions');

test('catalog has no built-in role templates or secretary defaults', () => {
    const cat = getCatalogForApi();
    assert.ok(cat.areas.length > 0);
    assert.equal(typeof cat.version, 'number');
    for (const a of cat.areas) {
        assert.ok(!String(a.id).toLowerCase().includes('secretary'));
        assert.ok(!String(a.id).toLowerCase().includes('lawyer'));
    }
});

test('custom role name does not change normalized permissions', () => {
    const perms = normalizeRolePermissions({
        areas: {
            cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
        },
    });
    assert.equal(hasAreaAction(perms, 'cases', 'view'), true);
    assert.equal(hasAreaAction(perms, 'cases', 'create'), false);
    assert.equal(getCasesDataScope(perms), 'assigned_only');
    const perms2 = normalizeRolePermissions({
        areas: {
            cases: { visible: true, actions: ['view'], dataScope: 'all_firm' },
        },
    });
    assert.equal(getCasesDataScope(perms2), 'all_firm');
});

test('staff receives exactly what role JSON defines', () => {
    const perms = normalizeRolePermissions({
        areas: {
            main: { visible: true, actions: [] },
            clients: { visible: true, actions: ['view'] },
            cases: { visible: false, actions: [] },
        },
    });
    const pages = listVisiblePageKeys(perms);
    assert.ok(pages.includes('main'));
    assert.ok(pages.includes('allClients'));
    assert.ok(!pages.includes('allCases'));
});

test('unknown actions are stripped', () => {
    const perms = normalizeRolePermissions({
        areas: {
            cases: { visible: true, actions: ['view', 'manage_staff_roles', 'fake'], dataScope: 'assigned_only' },
        },
    });
    assert.deepEqual(perms.areas.cases.actions, ['view']);
});
