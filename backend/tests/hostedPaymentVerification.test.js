'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyHostedPayment, verifySignupPayment } = require('../lib/payments/verifySignupPayment');

const credentials = { apiKey: 'synthetic', apiSecret: 'synthetic' };
const order = {
    uniqId: 'synthetic-order-id', order_reference: 'synthetic-subscription-20261025',
    currency: 'ILS', orderTotalSum: 532.75, orderStatus: 3,
    transactions: [{ transactionId: 'synthetic-transaction-id', status: 1, amount: 532.75 }],
};
const transaction = {
    transactionId: 'synthetic-transaction-id', amount: 532.75, currency: 'ILS',
    status: 1, statusCode: 0, transactionType: 10, paymentMethod: 3,
};
function provider({ orderPatch, transactionPatch, failRead } = {}) {
    const reads = [];
    const fetcher = async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, 'https://api.takbull.co.il');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.API_Key, credentials.apiKey);
        assert.equal(options.headers.API_Secret, credentials.apiSecret);
        const isOrder = url.pathname.endsWith('/GetOrder');
        reads.push(isOrder ? 'order' : 'transaction');
        if (isOrder) assert.equal(url.searchParams.get('orderUniqId'), order.uniqId);
        else assert.equal(url.searchParams.get('transactionInternalNumber'), transaction.transactionId);
        return {
            ok: failRead !== (isOrder ? 'order' : 'transaction'),
            json: async () => isOrder ? { ...order, ...orderPatch } : { ...transaction, ...transactionPatch },
        };
    };
    return { fetcher, reads };
}
const verify = p => verifyHostedPayment(credentials, order.uniqId, order.order_reference, 532.75, p.fetcher);

test('hosted subscription verification binds the exact approved order and transaction without requiring a saved card', async () => {
    const p = provider();
    const result = await verify(p);
    assert.deepEqual(result, { transactionId: transaction.transactionId, tokenInfo: null });
    assert.deepEqual(p.reads, ['order', 'transaction']);
});

test('foreign order identity, price, currency and ambiguous approved transaction are rejected before transaction lookup', async () => {
    for (const orderPatch of [
        { uniqId: 'foreign' }, { order_reference: 'foreign' }, { currency: 'USD' },
        { orderTotalSum: 532 }, { orderStatus: 2 }, { transactions: [] },
        { transactions: [{ transactionId: transaction.transactionId, status: 1, amount: 532 }] },
        { transactions: [...order.transactions, { transactionId: 'second-approved', status: 1, amount: 532.75 }] },
        { transactions: [...order.transactions, { transactionId: 'additional-wrong-amount', status: 1, amount: 1 }] },
    ]) {
        const p = provider({ orderPatch });
        await assert.rejects(verify(p), /IDENTITY_MISMATCH/);
        assert.deepEqual(p.reads, ['order']);
    }
});

test('callback-like approval cannot replace independent transaction amount, identity and card evidence', async () => {
    for (const transactionPatch of [
        { transactionId: 'foreign' }, { amount: 1 }, { currency: 'USD' },
        { status: 0 }, { statusCode: null }, { statusCode: 1 },
        { transactionType: 20 }, { paymentMethod: 2 },
    ]) await assert.rejects(verify(provider({ transactionPatch })), /IDENTITY_MISMATCH/);
});

test('unavailable provider reads and malformed expected prices never become verified receipts', async () => {
    for (const failRead of ['order', 'transaction']) await assert.rejects(verify(provider({ failRead })), /PROVIDER_UNAVAILABLE/);
    for (const amount of [0, -1, NaN, Infinity, '532.75']) {
        const p = provider();
        await assert.rejects(verifyHostedPayment(credentials, order.uniqId, order.order_reference, amount, p.fetcher), /VERIFICATION_REQUIRED/);
        assert.equal(p.reads.length, 0);
    }
});

test('optional hosted token handling does not relax the one-shekel signup card-storage requirement', async () => {
    const missingToken = provider({
        orderPatch: { orderTotalSum: 1, transactions: [{ transactionId: transaction.transactionId, status: 1, amount: 1 }] },
        transactionPatch: { amount: 1 },
    });
    await assert.rejects(verifySignupPayment(credentials, order.uniqId, order.order_reference, missingToken.fetcher), /TOKEN_REQUIRED/);
});
