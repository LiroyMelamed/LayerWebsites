const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = require('../lib/tenant/databaseScope');
const { clientTenantId } = require('../lib/clientSigningReadiness');
const { createClientPortalService } = require('../services/signingV2/clientPortal');

function sharedMode(t) {
    const before = [process.env.MULTI_TENANT_MODE, process.env.TENANT_DB_ISOLATION_ENABLED];
    process.env.MULTI_TENANT_MODE = 'true';
    process.env.TENANT_DB_ISOLATION_ENABLED = '1';
    t.after(() => ['MULTI_TENANT_MODE', 'TENANT_DB_ISOLATION_ENABLED'].forEach((key, i) => {
        if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i];
    }));
}

test('current customer database lookup validates context without granting an office role', async () => {
    const filename = path.resolve(__dirname, '../middlewares/attachFirmPermissions.js');
    const loaded = { exports: {} };
    let identity = { userid: 7, role: 'Client', law_firm_tenant_id: null };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module: loaded, exports: loaded.exports,
        require(id) {
            if (id === '../config/db') return { query: async () => ({ rows: identity ? [identity] : [] }) };
            return require(path.resolve(path.dirname(filename), id));
        },
    });
    async function validate(tenant) {
        const req = { user: { UserId: 7, Role: 'User' }, tenant, firmPermissionContextValidated: true };
        let error;
        await loaded.exports(req, {}, e => { error = e; });
        return { req, error };
    }
    const valid = await validate();
    assert.equal(valid.error, undefined);
    assert.equal(valid.req.firmPermissionContextValidated, true);
    assert.equal(valid.req.firmPermissionMode, 'legacy');
    assert.equal(valid.req.user.Role, 'Client');
    assert.equal(valid.req.isPlatformAdminUser, false);
    assert.equal(valid.req.firmPermissions, null);
    const mismatch = await validate({ id: 'other-office' });
    assert.equal(mismatch.error.httpStatus, 403);
    assert.equal(mismatch.req.firmPermissionContextValidated, false);
    identity = null;
    const absent = await validate();
    assert.equal(absent.error.httpStatus, 401);
    assert.equal(absent.req.firmPermissionContextValidated, false);
    identity = { userid: 7, role: 'Admin', law_firm_tenant_id: null };
    const stale = await validate();
    assert.equal(stale.error.httpStatus, 401);
    assert.equal(stale.req.firmPermissionContextValidated, false);
});

test('legacy customer scope requires both validated identity and the server-owned legacy database boundary', t => {
    sharedMode(t);
    const req = { firmTenantId: null, firmPermissionContextValidated: true };
    const deny = fn => assert.throws(fn, { errorCode: 'FORBIDDEN' });
    scope.withoutScope(() => deny(() => clientTenantId(req)));
    scope.withSystem(() => deny(() => clientTenantId(req)));
    scope.withOffice('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () => deny(() => clientTenantId(req)));
    scope.withLegacyOffice(() => {
        assert.equal(clientTenantId(req), null);
        deny(() => clientTenantId({ ...req, firmPermissionContextValidated: false }));
        deny(() => clientTenantId({ ...req, tenant: { id: 'foreign' } }));
        delete process.env.TENANT_DB_ISOLATION_ENABLED;
        deny(() => clientTenantId(req));
    });
});

test('package discovery in validated legacy scope retains exact actor and office matching', async t => {
    sharedMode(t);
    let actor = { userid: 7, role: 'Client', law_firm_tenant_id: null };
    const service = createClientPortalService({
        pool: { query: async () => ({ rows: [actor] }) }, env: { SIGNING_V2_ENABLED: 'false' },
    });
    const req = { user: { UserId: 7 }, firmTenantId: null, firmPermissionContextValidated: true };
    await assert.rejects(scope.withoutScope(() => service.list(req)), { httpStatus: 403 });
    await assert.rejects(scope.withSystem(() => service.list(req)), { httpStatus: 403 });
    await scope.withLegacyOffice(async () => {
        assert.deepEqual(await service.list(req), { enabled: false, documents: [] });
        await assert.rejects(service.list({ ...req, firmPermissionContextValidated: false }), { httpStatus: 403 });
        actor = { ...actor, law_firm_tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
        await assert.rejects(service.list(req), { httpStatus: 403 });
        actor = { ...actor, law_firm_tenant_id: null, role: 'Admin' };
        await assert.rejects(service.list(req), { httpStatus: 403 });
    });
});
