'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTakbullPaymentPage } = require('../lib/payments/takbullClient');

test('hosted signup asks Takbull to return the browser; legacy iframe callers retain their contract', async t => {
    const original = global.fetch;
    t.after(() => { global.fetch = original; });
    const requests = [];
    global.fetch = async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ responseCode: 0, uniqId: 'synthetic-order' }) };
    };
    const input = { credentials: { apiKey: 'synthetic', apiSecret: 'synthetic' }, orderReference: 'synthetic', amount: 1,
        currency: 'ILS', saveToken: true, redirectAddress: 'https://synthetic.invalid/return' };
    await createTakbullPaymentPage({ ...input, returnMode: 'redirect' });
    await createTakbullPaymentPage(input);
    assert.equal(requests[0].DisplayType, 'redirect');
    assert.equal(requests[0].PostProcessMethod, '0');
    assert.equal(requests[0].RedirectAddress, input.redirectAddress);
    assert.equal(requests[0].OrderTotalSum, 1);
    assert.equal(requests[0].SaveToken, true);
    assert.equal(requests[1].DisplayType, 'iframe');
    assert.equal(requests[1].PostProcessMethod, '1');
});
