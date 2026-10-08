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

test('cases.view only does not expose newOrUpdateCase in session pages', () => {
    const perms = normalizeRolePermissions({
        areas: {
            main: { visible: true, actions: [] },
            cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
        },
    });
    const pages = listVisiblePageKeys(perms);
    assert.ok(pages.includes('allCases'));
    assert.ok(pages.includes('taggedCases'));
    assert.ok(pages.includes('myCases'));
    assert.ok(!pages.includes('newOrUpdateCase'));
});

test('cases.create exposes newOrUpdateCase in session pages', () => {
    const perms = normalizeRolePermissions({
        areas: {
            main: { visible: true, actions: [] },
            cases: { visible: true, actions: ['view', 'create'], dataScope: 'all_firm' },
        },
    });
    const pages = listVisiblePageKeys(perms);
    assert.ok(pages.includes('newOrUpdateCase'));
});

test('signing.view only does not expose uploadFileForSigning', () => {
    const perms = normalizeRolePermissions({
        areas: {
            main: { visible: true, actions: [] },
            signing: { visible: true, actions: ['view'] },
        },
    });
    const pages = listVisiblePageKeys(perms);
    assert.ok(pages.includes('signingFiles'));
    assert.ok(!pages.includes('uploadFileForSigning'));
});

test('signing.upload exposes uploadFileForSigning', () => {
    const perms = normalizeRolePermissions({
        areas: {
            main: { visible: true, actions: [] },
            signing: { visible: true, actions: ['view', 'upload'] },
        },
    });
    const pages = listVisiblePageKeys(perms);
    assert.ok(pages.includes('uploadFileForSigning'));
});

test('unknown actions are stripped', () => {
    const perms = normalizeRolePermissions({
        areas: {
            cases: { visible: true, actions: ['view', 'manage_staff_roles', 'fake'], dataScope: 'assigned_only' },
        },
    });
    assert.deepEqual(perms.areas.cases.actions, ['view']);
});

test('new signing approvals are explicit and never inherited from v3 manage/upload or role names', () => {
    const old = normalizeRolePermissions({ version:3, areas:{signing:{visible:true,actions:['view','manage','upload']}} });
    assert.equal(old.version,4);
    assert.equal(hasAreaAction(old,'signing','authority_manage'),false);
    assert.equal(hasAreaAction(old,'signing','package_approve'),false);
    const explicit=normalizeRolePermissions({areas:{signing:{visible:true,actions:['view','authority_manage','package_approve']}}});
    assert.equal(hasAreaAction(explicit,'signing','authority_manage'),true);
    assert.equal(hasAreaAction(explicit,'signing','package_approve'),true);
    assert.equal(hasAreaAction(explicit,'signing','upload'),false);
});
