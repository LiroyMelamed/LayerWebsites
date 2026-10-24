'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const { createWhatsappLinkedWebhookRouter, authenticated, validateLinkedEvent } = require('../routes/whatsappLinkedWebhookRoutes');
const secret = 'synthetic-only-webhook-secret-0123456789';
const session = 'off_' + 'a'.repeat(32) + '_' + 'b'.repeat(16);
const NOW = 1792830000000;
const event = overrides => ({ id: 'evt_test_one', timestamp: NOW, session, event: 'session.status', payload: { status: 'FAILED' }, ...overrides });
const signature = raw => crypto.createHmac('sha512', secret).update(raw).digest('hex');
function fixture() {
    const calls = [], queries = [];
    const options = { env: { WHATSAPP_WAHA_WEBHOOK_SECRET: secret }, now: () => NOW,
        pool: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [{ id: 'connection-id', law_firm_tenant_id: 'office-id' }] }; } },
        scope: { withSystem: fn => fn() }, runOffice: (tenant, fn) => { assert.equal(tenant, 'office-id'); return fn(); },
        service: { receiveLinkedDeviceEvent: async (...args) => { calls.push(args); } } };
    const app = express(); app.use('/callback', createWhatsappLinkedWebhookRouter(options));
    app.use(express.json());
    return { app, calls, queries, options };
}
function post(app, value, headers = {}) {
    const raw = JSON.stringify(value);
    return request(app).post('/callback').set('Content-Type', 'application/json').set('X-Webhook-Hmac-Algorithm', 'sha512')
        .set('X-Webhook-Hmac', signature(raw)).set(headers).send(raw);
}

test('linked callback requires exact raw-body SHA512 authentication and trusted session lookup', async () => {
    const f = fixture();
    await post(f.app, event(), { 'X-Webhook-Hmac': '0'.repeat(128) }).expect(403);
    await post(f.app, event(), { 'X-Webhook-Hmac-Algorithm': 'sha256' }).expect(403);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
    await post(f.app, event()).expect(200);
    assert.deepEqual(f.queries[0].values, [session]); assert.match(f.queries[0].sql, /settings->>'gateway'='waha'/);
    assert.deepEqual(f.calls[0].slice(0, 2), ['office-id', 'connection-id']);
    assert.deepEqual(f.calls[0][2].payload, { status: 'FAILED' });
    assert.match(f.calls[0][3].payloadHash, /^[a-f0-9]{64}$/);
    const raw = Buffer.from('{}');
    assert.equal(authenticated(raw, { 'x-webhook-hmac-algorithm': 'sha512', 'x-webhook-hmac': signature(raw) }, 'short'), false);
});

test('signed timestamp, event id and server session define replay boundary; unrelated chats are never forwarded', async () => {
    const f = fixture();
    await post(f.app, event({ timestamp: NOW - 600001 })).expect(200);
    await post(f.app, event({ timestamp: NOW + 60001 })).expect(200);
    await post(f.app, event({ session: 'default' })).expect(400);
    await post(f.app, event({ id: '../not-an-id' })).expect(400);
    await post(f.app, event({ event: 'message', payload: { from: '972502222222@c.us', fromMe: false, body: 'Synthetic confidential chat' } })).expect(200);
    await post(f.app, event({ event: 'message', payload: { from: '123456@g.us', fromMe: false, body: 'STOP' } })).expect(200);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
    await post(f.app, event({ event: 'message', payload: { from: '972502222222@s.whatsapp.net', fromMe: false, body: 'הסר', _data: { private: 'must disappear' } }, me: { secret: 'must disappear' } })).expect(200);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0][2].payload, { from: '972502222222@c.us', fromMe: false, body: 'STOP' });
    assert.equal(f.calls[0][2].me, undefined);
    assert.equal(validateLinkedEvent(event({ payload: { status: 'WORKING', name: 'another-session' } }), NOW).invalid, true);
    assert.deepEqual(validateLinkedEvent(event({ payload: { status: 'WORKING', data: { reachoutTimelock: { isActive: true }, private: 'discard' } } }), NOW).body.payload,
        { status: 'WORKING', restricted: true });
    assert.deepEqual(validateLinkedEvent(event({ payload: { status: 'WORKING', data: { messageCapping: { cappingStatus: 'FIRST_WARNING', private: 'discard' } } } }), NOW).body.payload,
        { status: 'WORKING', restricted: true });
});

test('callback transport failure is retriable and ambiguous office matches have no effects', async () => {
    const f = fixture();
    f.options.service.receiveLinkedDeviceEvent = async () => { throw Error('synthetic unavailable'); };
    await post(f.app, event()).expect(503);
    f.options.pool.query = async () => ({ rows: [{ id: 'one' }, { id: 'two' }] });
    await post(f.app, event()).expect(200);
    assert.equal(f.calls.length, 0);
});
