const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkLoop } = require('../lib/background/workLoop');
const { withLeaseHeartbeat } = require('../services/signingV2/leaseHeartbeat');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('backlog runs immediately without overlapping; idle work polls and shutdown joins in-flight work', async t => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let calls = 0, active = 0, maxActive = 0;
    const loop = createWorkLoop({ idleMs: 10000, run: async () => {
        calls++; active++; maxActive = Math.max(active, maxActive);
        if (calls === 2) { entered(); await gate; }
        active--; return calls < 3 ? 4 : 0;
    } });
    t.after(async () => { release(); await loop.stop(); });
    loop.start(); loop.start();
    let timeout;
    try { await Promise.race([started, new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('backlog waited for idle polling interval')), 2000);
    })]); } finally { clearTimeout(timeout); }
    let stopped = false;
    const stopping = loop.stop().then(() => { stopped = true; });
    await delay(20); assert.equal(stopped, false); assert.equal(calls, 2);
    release(); await stopping; await delay(20);
    assert.equal(calls, 2); assert.equal(maxActive, 1);
});

test('idle queue and a rejected pass do not spin', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0, errors = 0;
    const loop = createWorkLoop({ idleMs: 50, run: async () => { calls++; if (calls === 1) throw new Error('temporary'); return 0; }, onError: () => errors++ });
    t.after(() => loop.stop()); loop.start();
    t.mock.timers.tick(0); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1); assert.equal(errors, 1);
    t.mock.timers.tick(49); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
    t.mock.timers.tick(1); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    await loop.stop();
});

test('long rendering renews only its fenced lease, serializes heartbeats and stops renewing after completion', async () => {
    let count = 0, active = 0, maxActive = 0;
    const lease = { owner_context_id: 'office', id: 'job', fencing_token: 4, leased_by: 'worker' };
    const pool = { query: async (sql, params) => {
        assert.match(sql, /fencing_token=\$3/); assert.match(sql, /lease_until > clock_timestamp/);
        assert.deepEqual(params, ['office', 'job', 4, 'worker', 60]);
        count++; active++; maxActive = Math.max(maxActive, active); await delay(15); active--; return { rowCount: 1 };
    } };
    assert.equal(await withLeaseHeartbeat(pool, lease, async () => { await delay(70); return 'published'; }, { intervalMs: 5 }), 'published');
    const finished = count; await delay(30);
    assert.ok(finished >= 2); assert.equal(count, finished); assert.equal(active, 0); assert.equal(maxActive, 1);
});

test('lost lease stops renewal; task errors are retained and heartbeat errors cannot bypass fencing', async () => {
    let count = 0;
    const lost = { query: async () => { count++; return { rowCount: 0 }; } };
    await withLeaseHeartbeat(lost, {}, () => delay(35), { intervalMs: 5 });
    assert.equal(count, 1);
    let failures = 0;
    await assert.rejects(withLeaseHeartbeat({ query: async () => { throw new Error('db down'); } }, {},
        async () => { await delay(25); throw new Error('render failed'); }, { intervalMs: 5, onError: () => failures++ }), /render failed/);
    assert.ok(failures > 0);
});
