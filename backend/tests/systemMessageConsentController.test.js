'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemMessageConsentController } = require('../controllers/systemMessageConsentController');
const VERSION = 'melamedia-transactional-whatsapp-v1';
const ID = '8206c4ca-9922-42dd-aa26-1d897e092ca3';
const OFFICE = '60995d54-a683-4517-a741-707bd3ae5866';
const config = { captureEnabled: true, configured: true, mode: 'dedicated', ownerUserId: 7 };
function fixture(options = {}) {
    const calls = [], writes = [];
    const client = { query: async (sql, args) => {
        calls.push({ sql, args });
        if (sql.startsWith('SELECT')) return { rows: options.noUser ? [] : [{ userid: 7, name: 'Synthetic owner', phonenumber: '0500000091' }] };
        return { rows: [] };
    }, release: () => calls.push({ sql: 'RELEASE' }) };
    const database = { query: client.query, connect: async () => client };
    const messages = { CONSENT_VERSION: VERSION, getConfig: () => ({ ...config, ...options.config }),
        normalizeRecipient: value => value === '0500000091' ? '+972500000091' : null,
        getConsent: async identity => { calls.push({ identity }); return { available: true, optedIn: options.optedIn || false, version: VERSION }; },
        setConsent: async (connection, payload) => { assert.equal(connection, client); writes.push(payload); if (options.fail) throw Error('SYNTHETIC_INSERT_FAILURE'); } };
    const controller = createSystemMessageConsentController({ database, messages });
    const res = { setHeader: () => {}, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    const req = { firmPermissionContextValidated: true, firmTenantId: null, user: { UserId: 7, Role: 'Admin' },
        body: { optedIn: true, consentVersion: VERSION, actionId: ID } };
    let error;
    return { controller, req, res, calls, writes, next: value => { error = value; }, error: () => error };
}

test('disabled configuration performs no contact lookup or consent read', async () => {
    const f = fixture({ config: { captureEnabled: false, configured: false } });
    await f.controller.get(f.req, f.res, f.next);
    assert.equal(f.res.body.available, false); assert.equal(f.calls.length, 0); assert.equal(f.error(), undefined);
});
test('dedicated consent uses configured account owner and current database phone, never JWT phone', async () => {
    const f = fixture(); f.req.user.PhoneNumber = '0509999999';
    await f.controller.save(f.req, f.res, f.next);
    assert.equal(f.error(), undefined); assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0], { officeId: null, ownerUserId: 7, recipient: '+972500000091', recipientName: 'Synthetic owner',
        optedIn: true, version: VERSION, sourceRef: 'settings:' + ID, actionId: ID });
    assert.deepEqual(f.calls.filter(c => !c.sql?.startsWith('SELECT') && c.sql).map(c => c.sql), ['BEGIN', 'COMMIT', 'RELEASE']);
});
test('another platform admin cannot choose the configured owner or register consent for them', async () => {
    const f = fixture(); f.req.user.UserId = 8;
    await f.controller.save(f.req, f.res, f.next);
    assert.equal(f.error().httpStatus, 403); assert.equal(f.writes.length, 0);
    assert.ok(f.calls.some(c => c.sql === 'ROLLBACK'));
});
test('browser-supplied recipient, office, or owner fields are rejected before any transaction', async () => {
    for (const extra of [{ recipient: '+972500000099' }, { officeId: OFFICE }, { ownerUserId: 8 }]) {
        const f = fixture(); Object.assign(f.req.body, extra);
        await f.controller.save(f.req, f.res, f.next);
        assert.equal(f.error().httpStatus, 400); assert.equal(f.calls.length, 0);
    }
});
test('non-boolean grants, stale copy versions and missing action UUID are rejected', async () => {
    for (const patch of [{ optedIn: 'true' }, { consentVersion: 'old' }, { actionId: undefined }]) {
        const f = fixture(); Object.assign(f.req.body, patch);
        await f.controller.save(f.req, f.res, f.next);
        assert.equal(f.error().httpStatus, 400); assert.equal(f.writes.length, 0);
    }
});
test('shared consent requires validated current office ownership and exact DB office binding', async () => {
    const f = fixture({ config: { mode: 'sharedsignup', ownerUserId: null } });
    f.req.firmTenantId = OFFICE; f.req.isOfficeOwner = true;
    await f.controller.save(f.req, f.res, f.next);
    assert.equal(f.error(), undefined); assert.equal(f.writes[0].officeId, OFFICE);
    assert.deepEqual(f.calls.find(c => c.sql?.startsWith('SELECT')).args, [7, OFFICE]);
    const denied = fixture({ config: { mode: 'sharedsignup' } }); denied.req.firmTenantId = OFFICE;
    await denied.controller.save(denied.req, denied.res, denied.next);
    assert.equal(denied.error().httpStatus, 403); assert.equal(denied.writes.length, 0);
});
test('a changed or missing database owner cannot save consent', async () => {
    const f = fixture({ noUser: true });
    await f.controller.save(f.req, f.res, f.next);
    assert.equal(f.error().httpStatus, 403); assert.equal(f.writes.length, 0);
});
test('withdrawal is persisted as false; failure rolls the whole local action back', async () => {
    const f = fixture(); f.req.body.optedIn = false;
    await f.controller.save(f.req, f.res, f.next); assert.equal(f.writes[0].optedIn, false);
    const failed = fixture({ fail: true });
    await failed.controller.save(failed.req, failed.res, failed.next);
    assert.ok(failed.error()); assert.ok(failed.calls.some(c => c.sql === 'ROLLBACK'));
    assert.ok(!failed.calls.some(c => c.sql === 'COMMIT')); assert.equal(failed.res.body, undefined);
});
