const test = require('node:test');
const assert = require('node:assert/strict');

// Enable firm-scope behavior for this unit test.
process.env.FIRM_SCOPE_ENABLED = 'true';
process.env.NODE_ENV = 'test';

const pool = require('../config/db');

test('getUsageForFirm counts seats using only Admin/Lawyer roles (excludes clients)', async () => {
    const originalQuery = pool.query.bind(pool);

    const seenSql = [];

    pool.query = async (sql, params) => {
        seenSql.push(String(sql));

        const s = String(sql);
        if (s.includes('as "DocumentsCreatedThisMonth"') || s.includes('as "DocumentsTotal"')) {
            return { rows: [{ DocumentsCreatedThisMonth: '0', DocumentsTotal: '0' }] };
        }

        if (s.includes('as "StorageBytesTotal"')) {
            return { rows: [{ StorageBytesTotal: '0' }] };
        }

        if (s.includes('as "SeatsUsed"')) {
            return { rows: [{ SeatsUsed: 2 }] };
        }

        if (s.includes('as "OtpSmsThisMonth"')) {
            return { rows: [{ OtpSmsThisMonth: '0' }] };
        }

        if (s.includes('as "EvidenceGenerationsThisMonth"')) {
            return { rows: [{ EvidenceGenerationsThisMonth: '0' }] };
        }

        if (s.includes('as "EvidenceCpuSecondsThisMonth"')) {
            return { rows: [{ EvidenceCpuSecondsThisMonth: '0' }] };
        }

        throw new Error(`Unexpected SQL in test stub: ${s}`);
    };

    try {
        // Require after stubbing to ensure module loads cleanly in test env.
        const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');

        const usage = await getUsageForFirm(123);
        assert.equal(usage.scope, 'firm');
        assert.equal(usage.firmId, 123);
        assert.equal(usage.seats.used, 2);

        const seatsSql = seenSql.find((q) => q.includes('as "SeatsUsed"'));
        assert.ok(seatsSql, 'expected SeatsUsed query');
        assert.match(seatsSql, /from\s+firm_users\s+fu/i);
        assert.match(seatsSql, /join\s+users\s+u\s+on\s+u\.userid\s*=\s*fu\.userid/i);
        assert.match(seatsSql, /u\.role\s+in\s*\(\s*'Admin'\s*,\s*'Lawyer'\s*\)/i);
    } finally {
        pool.query = originalQuery;
    }
});
