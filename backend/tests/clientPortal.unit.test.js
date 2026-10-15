const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { clientTenantId, listClientSigningFiles, personalSigningProgress } = require('../lib/clientSigningReadiness');

test('a request tenant cannot replace the authenticated client tenant', () => {
    assert.throws(() => clientTenantId({ firmTenantId: 'owner', tenant: { id: 'other' } }), { errorCode: 'FORBIDDEN' });
    assert.throws(() => clientTenantId({ firmTenantId: null, tenant: { id: 'other' } }), { errorCode: 'FORBIDDEN' });
    assert.equal(clientTenantId({ firmTenantId: 'owner', tenant: { id: 'owner' } }), 'owner');
});

test('unknown sequential indices never produce an actionable client item', () => {
    const result = personalSigningProgress({ Status: 'pending', PersonalTotalSpots: '1', PersonalSignedSpots: '0',
        SigningOrder: 'sequential', PersonalNextIndex: 1, NextUnsignedIndex: 1, HasUnindexedRequiredSpots: true }, true);
    assert.equal(result.PersonalStatus, 'unavailable');
    assert.equal(result.CanSignNow, false);
});

test('expiry includes the exact deadline used by signing submission', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    const result = personalSigningProgress({ Status: 'pending', PersonalTotalSpots: 1, PersonalSignedSpots: 0,
        SigningOrder: 'parallel', ExpiresAt: new Date(now).toISOString() }, true, now);
    assert.equal(result.PersonalStatus, 'expired');
    assert.equal(result.CanSignNow, false);
});

test('personal completion survives later global expiry, rejection or cancellation', () => {
    for (const Status of ['pending', 'expired', 'rejected', 'cancelled']) {
        const PersonalSignedAt = '2026-10-01T12:00:00Z';
        const result = personalSigningProgress({ Status, PersonalTotalSpots: 2, PersonalSignedSpots: 2,
            PersonalSignedAt, SigningOrder: 'parallel', ExpiresAt: '2026-10-02T12:00:00Z' }, true,
        Date.parse('2026-10-13T12:00:00Z'));
        assert.equal(result.PersonalStatus, 'signed', Status);
        assert.equal(result.CanSignNow, false, Status);
        assert.equal(result.PersonalSignedAt, PersonalSignedAt);
        assert.equal(result.Status, Status, 'overall status is preserved for context');
    }
});

test('invalid non-null expiry cannot advertise an unfinished document as ready', () => {
    for (const ExpiresAt of ['invalid-date', '']) {
        const result = personalSigningProgress({ Status: 'pending', PersonalTotalSpots: 1, PersonalSignedSpots: 0,
            SigningOrder: 'parallel', ExpiresAt }, true);
        assert.equal(result.PersonalStatus, 'unavailable');
        assert.equal(result.CanSignNow, false);
    }
});

test('signing discovery and metadata failures are propagated instead of reporting an empty list', async () => {
    for (const failAt of [1, 2]) {
        let calls = 0;
        await assert.rejects(listClientSigningFiles({ query: async () => {
            if (++calls === failAt) throw new Error('synthetic database failure');
            return { rows: [] };
        } }, { user: { UserId: 1 } }, { enabled: false }), /synthetic database failure/);
    }
});

function stageHandler(query) {
    const module = { exports: {} }, filename = path.resolve(__dirname, '../controllers/stageFilesController.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console: { error() {} },
        require(id) {
            if (id === '../config/db') return { query };
            if (id === '../lib/clientSigningReadiness') return { clientTenantId };
            return {};
        },
    });
    return module.exports.getClientFiles;
}
function response() {
    return { statusCode: 200, body: null, set() { return this; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}

test('attachment database failures return an error, never an empty success', async () => {
    const handler = stageHandler(async () => { throw new Error('synthetic database failure'); });
    const res = response();
    await handler({ user: { UserId: 1, Role: 'User' }, firmTenantId: null, firmPermissionContextValidated: true }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.errorCode, 'INTERNAL_ERROR');
    assert.equal(Array.isArray(res.body), false);
});

test('attachment handler denies unauthenticated, staff, external and wrong-tenant callers before querying', async () => {
    let calls = 0;
    const handler = stageHandler(async () => { calls++; return { rows: [] }; });
    for (const [req, expected] of [
        [{}, 401],
        [{ user: { UserId: 1, Role: 'Admin' } }, 403],
        [{ user: { UserId: 1, Role: 'ExternalSigner' } }, 403],
        [{ user: { UserId: 1, Role: 'User' }, firmPermissionMode: 'role' }, 403],
        [{ user: { UserId: 1, Role: 'User' }, firmTenantId: 'owner', tenant: { id: 'other' } }, 403],
    ]) {
        const res = response(); await handler(req, res); assert.equal(res.statusCode, expected);
    }
    assert.equal(calls, 0);
});
