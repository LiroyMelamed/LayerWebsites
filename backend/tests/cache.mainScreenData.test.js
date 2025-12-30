const test = require('node:test');
const assert = require('node:assert/strict');

const { getMainScreenDataCached, __testReset } = require('../utils/mainScreenDataCache');

test('main screen data cache memoizes within TTL', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { ok: true, n: calls };
    };

    const ttlMs = 25;

    const v1 = await getMainScreenDataCached({ loader, ttlMs });
    const v2 = await getMainScreenDataCached({ loader, ttlMs });

    assert.equal(calls, 1);
    assert.deepEqual(v1, v2);
});

test('main screen data cache expires after TTL', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { ok: true, n: calls };
    };

    const ttlMs = 25;

    const v1 = await getMainScreenDataCached({ loader, ttlMs });
    await new Promise((r) => setTimeout(r, ttlMs + 10));
    const v2 = await getMainScreenDataCached({ loader, ttlMs });

    assert.equal(calls, 2);
    assert.notDeepEqual(v1, v2);
});
