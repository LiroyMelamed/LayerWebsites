const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { syntheticPdf, fakeProvider } = require('./helpers/signingV2Delivery');
const { createSubmission } = require('../services/signingV2/submissions');
const { createRuntime } = require('../services/signingV2/runtime');
const { RenderPool } = require('../services/signingV2/renderPool');
const jobs = require('../services/signingV2/jobs');
const diskStorage = require('./helpers/signingCrashStorage.cjs');

const env = { SIGNING_V2_GRANT_KEY: Buffer.alloc(32, 23).toString('base64'), WEBSITE_DOMAIN: 'https://qa.example.invalid' };

test('worker drain joins a busy tick, and shutdown waits for the current pass',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
    const pool = require('../config/db');
    process.env.SIGNING_V2_ENABLED = 'true';
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'signing-runtime-'));
    const source = await syntheticPdf('SYNTHETIC BUSY WORKER ONLY');
    const f = await databaseFixture(pool, { documentCount: 1, sourceBytes: source });
    const storage = diskStorage(directory);
    await storage.write(`synthetic/${f.contextId}/source.pdf`, source);
    const renderer = new RenderPool({ concurrency: 1 });
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const render = renderer.render.bind(renderer);
    renderer.render = async input => { entered(); await gate; return render(input); };
    const provider = fakeProvider(), errors = [];
    const runtime = createRuntime({ pool, renderer, storage, provider, env, contextIds: [f.contextId],
        log: { error: (...args) => errors.push(args.join(' ')) } });
    t.after(async () => { release(); await runtime.stop(); await renderer.close(); await fs.rm(directory, { recursive: true, force: true }); });
    await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const tick = runtime.tick(); await started;
    assert.strictEqual(runtime.tick(), tick, 'concurrent ticks share one pass');
    let drained = false, stopped = false;
    const drain = runtime.drain().then(count => { drained = true; return count; });
    const stop = runtime.stop().then(() => { stopped = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(drained, false); assert.equal(stopped, false);
    release();
    assert.equal(await drain, 4); await stop;
    assert.equal(await runtime.tick(), 0);
    assert.equal(provider.calls.length, 1);
    assert.deepEqual(errors, []);
    assert.equal((await pool.query("SELECT count(*)::integer n FROM signing_jobs WHERE owner_context_id=$1 AND state<>'complete'", [f.contextId])).rows[0].n, 0);
});

test('killed PDF workers recover once before/after publication; a killed provider dispatch stays uncertain without a second send',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 180000 }, async t => {
    const pool = require('../config/db');
    t.after(() => pool.end());
    process.env.SIGNING_V2_ENABLED = 'true';
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; });
    for (const point of ['after_upload', 'after_publish', 'provider_accepted']) {
        await t.test(point, async t => {
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'signing-crash-'));
            t.after(() => fs.rm(directory, { recursive: true, force: true }));
            const source = await syntheticPdf('SYNTHETIC WORKER CRASH ONLY');
            const f = await databaseFixture(pool, { documentCount: 1, sourceBytes: source });
            const storage = diskStorage(directory);
            await storage.write(`synthetic/${f.contextId}/source.pdf`, source);
            await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
            if (point === 'provider_accepted') {
                const initial = createRuntime({ pool, storage, env, contextIds: [f.contextId] });
                try { assert.equal(await initial.drain(), 3); } finally { await initial.stop(); }
            }
            const child = fork(path.join(__dirname, 'helpers/signingWorkerCrashChild.cjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
            let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
            t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL'); });
            const marker = once(child, 'message');
            child.send({ point, contextId: f.contextId, directory });
            const timeout = setTimeout(() => child.kill('SIGKILL'), 45000);
            let event;
            try { [event] = await Promise.race([marker, once(child, 'exit').then(() => { throw new Error(`Worker exited before marker: ${stderr.slice(-300)}`); })]); }
            finally { clearTimeout(timeout); }
            assert.equal(event.point, point, JSON.stringify(event));
            const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
            // The worker was killed abruptly; reap only the exact synthetic Chrome PIDs it reported.
            for (const pid of event.browserPids) {
                try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
            }
            const before = (await pool.query('SELECT state FROM signing_jobs WHERE id=$1', [event.lease.id])).rows[0].state;
            assert.equal(before, point === 'after_publish' ? 'complete' : 'running');
            if (before === 'running') await pool.query("UPDATE signing_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE owner_context_id=$1 AND id=$2", [f.contextId, event.lease.id]);
            const renderer = new RenderPool({ concurrency: 1 });
            let renders = 0; const render = renderer.render.bind(renderer);
            renderer.render = input => { renders++; return render(input); };
            const provider = fakeProvider(), errors = [];
            const restarted = createRuntime({ pool, renderer, storage, provider, env, contextIds: [f.contextId],
                log: { error: (...args) => errors.push(args.join(' ')) } });
            t.after(async () => { await restarted.stop(); await renderer.close(); });
            await restarted.drain();
            assert.equal(await restarted.drain(), 0, 'finished jobs are not repeated');
            assert.deepEqual(errors, []);
            assert.equal(renders, point === 'after_upload' ? 1 : 0, 'published PDFs are reused');
            assert.equal((await pool.query("SELECT count(*)::integer n FROM signing_artifacts WHERE owner_context_id=$1 AND kind='prepared'", [f.contextId])).rows[0].n, 1);
            const doc = (await pool.query('SELECT state,prepared_artifact_id FROM signing_documents WHERE owner_context_id=$1', [f.contextId])).rows[0];
            assert.equal(doc.state, 'ready'); assert.ok(doc.prepared_artifact_id);
            await assert.rejects(jobs.complete(pool, event.lease, async () => { throw new Error('Stale worker must not publish'); }), { errorCode: 'WORKER_LEASE_LOST' });
            if (point === 'provider_accepted') {
                assert.equal((await fs.readFile(path.join(directory, 'fake-provider.jsonl'), 'utf8')).trim().split('\n').length, 1);
                assert.equal(provider.calls.length, 0, 'unknown provider outcome is never blindly retried');
                assert.equal((await pool.query('SELECT state FROM signing_deliveries WHERE owner_context_id=$1', [f.contextId])).rows[0].state, 'uncertain');
                assert.equal((await pool.query('SELECT state FROM signing_jobs WHERE id=$1', [event.lease.id])).rows[0].state, 'uncertain');
            } else {
                assert.equal(provider.calls.length, 1);
                assert.equal((await pool.query("SELECT count(*)::integer n FROM signing_jobs WHERE owner_context_id=$1 AND state<>'complete'", [f.contextId])).rows[0].n, 0);
            }
        });
    }
});
