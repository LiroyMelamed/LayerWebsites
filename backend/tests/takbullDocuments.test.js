'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createTakbullPaymentPage,
    chargeTakbullToken,
    extractTakbullDocument,
} = require('../lib/payments/takbullClient');

const input = {
    credentials: { apiKey: 'synthetic-key', apiSecret: 'synthetic-secret' },
    orderReference: 'synthetic-billing-order', amount: 1353, currency: 'ILS',
    cardExternalToken: 'synthetic-card-token',
    customerFullName: 'Synthetic Customer', customerEmail: 'synthetic@example.invalid', customerPhone: '0500000000',
    customerAddress: { address1: 'Synthetic street 1', city: 'Synthetic City', country: 'IL', zip: '00000' },
    ipnAddress: 'https://api.example.invalid/ipn', redirectAddress: 'https://app.example.invalid/return',
    cancelReturnAddress: 'https://app.example.invalid/cancel', purpose: 'Synthetic monthly subscription',
};

function response(raw, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => raw };
}

function intercept(t, fetcher) {
    const oldFetch = global.fetch;
    const oldType = process.env.TAKBULL_DOCUMENT_TYPE;
    delete process.env.TAKBULL_DOCUMENT_TYPE;
    global.fetch = fetcher;
    t.after(() => {
        global.fetch = oldFetch;
        if (oldType === undefined) delete process.env.TAKBULL_DOCUMENT_TYPE;
        else process.env.TAKBULL_DOCUMENT_TYPE = oldType;
    });
}

test('hosted checkout and saved-card charge request one provider-native document with recipient and amount', async t => {
    const calls = [];
    intercept(t, async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, options, body });
        return url.endsWith('/ChargeToken')
            ? response({ internalCode: 0, transactionInternalNumber: 'synthetic-tx', documentId: 92, invoiceUniqId: 'synthetic-invoice', documentNumber: 40019 })
            : response({ responseCode: 0, uniqId: 'synthetic-order' });
    });
    await createTakbullPaymentPage(input);
    const charged = await chargeTakbullToken(input);
    assert.equal(calls.length, 2, 'no separate document creation or delivery write');
    for (const { body, options } of calls) {
        assert.equal(body.CreateDocument, true);
        assert.equal(body.DocumentType, undefined, 'preserve merchant document type and VAT settings');
        assert.equal(body.Customer.Email, input.customerEmail);
        assert.equal(body.Customer.CustomerFullName, input.customerFullName);
        assert.deepEqual(body.Customer.Address, { Address1: 'Synthetic street 1', City: 'Synthetic City', Country: 'IL', Zip: '00000' });
        assert.equal(body.OrderTotalSum, 1353);
        assert.equal(body.Products[0].Price, 1353);
        assert.equal(body.Products[0].Quantity, 1);
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal);
    }
    assert.equal(charged.ok, true);
    assert.equal(charged.definitiveFailure, false);
    assert.deepEqual(charged.document, { created: true, id: '92', uniqId: 'synthetic-invoice', number: '40019', deliveryStatus: 'unknown' });
});

test('1 ILS card verification remains a real payment document and gets a line item without a supplied purpose', async t => {
    let body;
    intercept(t, async (_url, options) => {
        body = JSON.parse(options.body);
        return response({ responseCode: 0, uniqId: 'synthetic-setup' });
    });
    await createTakbullPaymentPage({ ...input, amount: 1, purpose: undefined });
    assert.equal(body.CreateDocument, true);
    assert.equal(body.OrderTotalSum, 1);
    assert.equal(body.Products[0].Price, 1);
    assert.ok(body.Products[0].Description);
});

test('explicit receipt type or existing configured type is validated before any payment request', async t => {
    const bodies = [];
    intercept(t, async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return response({ internalCode: 0, transactionInternalNumber: 'synthetic-tx' });
    });
    process.env.TAKBULL_DOCUMENT_TYPE = '400';
    await chargeTakbullToken(input);
    await chargeTakbullToken({ ...input, documentType: 320 });
    await chargeTakbullToken({ ...input, createDocument: false });
    assert.deepEqual(bodies.map(b => [b.CreateDocument, b.DocumentType]), [[true, 400], [true, 320], [false, undefined]]);
    for (const invalid of [305, 330, 0, 'garbage']) {
        await assert.rejects(chargeTakbullToken({ ...input, documentType: invalid }), /TAKBULL_DOCUMENT_TYPE/);
    }
    assert.equal(bodies.length, 3);
});

test('zero, negative, or invalid amount never reaches a payment/document operation', async t => {
    let calls = 0;
    intercept(t, async () => { calls++; throw Error('must not dispatch'); });
    for (const amount of [0, -1, NaN, Infinity, 'invalid']) {
        await assert.rejects(chargeTakbullToken({ ...input, amount }), /amount must be positive/);
        await assert.rejects(createTakbullPaymentPage({ ...input, amount }), /amount must be positive/);
    }
    assert.equal(calls, 0);
});

test('timeout is not retried and cannot trigger a separate document operation', async t => {
    let calls = 0;
    intercept(t, async () => { calls++; throw Error('synthetic timeout after provider accepted request'); });
    await assert.rejects(chargeTakbullToken(input), /synthetic timeout/);
    assert.equal(calls, 1);
});

test('HTTP errors, malformed responses, and unbound provider errors remain uncertain', async t => {
    const replies = [response({}, 503), { ok: true, status: 200, json: async () => { throw Error('bad JSON'); } }, response({ internalCode: 62, orderStatus: 1 })];
    let calls = 0;
    intercept(t, async () => { calls++; return replies.shift(); });
    for (let i = 0; i < 3; i++) {
        const result = await chargeTakbullToken(input);
        assert.equal(result.ok, false);
        assert.equal(result.definitiveFailure, false);
        assert.equal(result.document.created, null);
    }
    assert.equal(calls, 3, 'no retry or separate document creation');
});

test('document error after an approved charge is uncertain and never a safe new-charge signal', async t => {
    const calls = [];
    intercept(t, async (url, options) => {
        calls.push([url, options.method]);
        if (url.endsWith('/ChargeToken')) return response({ internalCode: 99, transactionInternalNumber: 'synthetic-tx' });
        return response({ transactionId: 'synthetic-tx', amount: 1353, currency: 'ILS', transactionType: 10, paymentMethod: 3, status: 1, statusCode: 0, isDocumentCreated: false });
    });
    const result = await chargeTakbullToken(input);
    assert.equal(result.ok, false);
    assert.equal(result.definitiveFailure, false);
    assert.equal(calls.length, 2);
    assert.ok(calls[1][0].includes('/GetTransaction?transactionInternalNumber=synthetic-tx'));
    assert.equal(calls[1][1], undefined, 'reconciliation is read-only');
});

test('only a matching terminal failed card charge permits retry; mismatches and unavailable reads remain uncertain', async t => {
    const failed = { transactionId: 'synthetic-tx', amount: 1353, currency: 'ILS', transactionType: 10, paymentMethod: 3, status: 2, statusCode: 5 };
    let current = failed;
    intercept(t, async url => {
        if (url.endsWith('/ChargeToken')) return response({ internalCode: 5, transactionInternalNumber: 'synthetic-tx' });
        if (current === null) throw Error('synthetic provider unavailable');
        return response(current);
    });
    for (const status of [2, 6]) {
        current = { ...failed, status };
        assert.equal((await chargeTakbullToken(input)).definitiveFailure, true);
    }
    for (const patch of [{ transactionId: 'different' }, { amount: 1 }, { currency: 'USD' }, { transactionType: 20 }, { paymentMethod: 1 }, { status: 1 }, { status: 4 }, { statusCode: 0 }, { statusCode: null }]) {
        current = { ...failed, ...patch };
        assert.equal((await chargeTakbullToken(input)).definitiveFailure, false, JSON.stringify(patch));
    }
    current = null;
    assert.equal((await chargeTakbullToken(input)).definitiveFailure, false);
});

test('document reference does not assert email delivery or mistake zero document ID for a receipt', () => {
    assert.deepEqual(extractTakbullDocument({ documentId: 0 }), { created: null, id: null, uniqId: null, number: null, deliveryStatus: 'unknown' });
    assert.equal(extractTakbullDocument({ isDocumentCreated: false }).created, false);
    assert.equal(extractTakbullDocument({ isDocumentCreated: true }).created, true);
});
