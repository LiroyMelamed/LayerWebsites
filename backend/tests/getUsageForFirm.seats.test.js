const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const pool = require('../config/db');

/** Shared stub factory – returns a pool.query replacement that handles
 *  all four getUsageForFirm queries (docs, storage, seats, sms). */
function makeQueryStub(overrides = {}) {
    const seenSql = [];

    const stub = async (sql, _params) => {
        const s = String(sql);
        seenSql.push(s);

        if (s.includes('"DocumentsCreatedThisMonth"')) {
            return { rows: [{ DocumentsCreatedThisMonth: '0', DocumentsTotal: '0' }] };
        }
        if (s.includes('"StorageBytesTotal"')) {
            return { rows: [{ StorageBytesTotal: '0' }] };
        }
        if (s.includes('"SeatsUsed"')) {
            return { rows: [{ SeatsUsed: overrides.seats ?? 2 }] };
        }
        if (s.includes('"SmsSentThisMonth"')) {
            return { rows: [{ SmsSentThisMonth: overrides.sms ?? 0 }] };
        }

        throw new Error(`Unexpected SQL in test stub: ${s}`);
    };

    return { stub, seenSql };
}

test('getUsageForFirm counts seats using only Admin role (system administrators)', async () => {
    const originalQuery = pool.query.bind(pool);
    const { stub, seenSql } = makeQueryStub({ seats: 2, sms: 0 });
    pool.query = stub;

    try {
        // Require after stubbing to ensure module loads cleanly in test env.
        const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');

        const usage = await getUsageForFirm(null);
        assert.equal(usage.scope, 'firm');
        assert.equal(usage.seats.used, 2);
        assert.equal(usage.sms.sentThisMonth, 0);

        const seatsSql = seenSql.find((q) => q.includes('"SeatsUsed"'));
        assert.ok(seatsSql, 'expected SeatsUsed query');
        assert.match(seatsSql, /from\s+users/i);
        assert.match(seatsSql, /role\s*=\s*'Admin'/i);
    } finally {
        pool.query = originalQuery;
    }
});

test('getUsageForFirm returns real SMS count from message_delivery_events', async () => {
    const originalQuery = pool.query.bind(pool);
    const { stub, seenSql } = makeQueryStub({ seats: 1, sms: 7 });
    pool.query = stub;

    try {
        // Re-require to pick up fresh module
        delete require.cache[require.resolve('../lib/limits/getUsageForFirm')];
        const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');

        const usage = await getUsageForFirm(null);
        assert.equal(usage.sms.sentThisMonth, 7, 'expected real SMS count from message_delivery_events');

        const smsSql = seenSql.find((q) => q.includes('"SmsSentThisMonth"'));
        assert.ok(smsSql, 'expected SmsSentThisMonth query');
        assert.match(smsSql, /message_delivery_events/i, 'SMS query must hit message_delivery_events');
        assert.match(smsSql, /channel\s*=\s*'SMS'/i, 'query must filter on channel=SMS');
    } finally {
        pool.query = originalQuery;
    }
});
