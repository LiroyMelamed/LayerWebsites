const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { syntheticPdf, fakeProvider } = require('./helpers/signingV2Delivery');
const { createSubmission } = require('../services/signingV2/submissions');
const { createRuntime } = require('../services/signingV2/runtime');
const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
const { bytesHash } = require('../lib/signingV2/canonical');
const jobs = require('../services/signingV2/jobs');

function signaturePng(width = 240, height = 80) {
    const rows = [];
    for (let y = 0; y < height; y += 1) {
        const row = Buffer.alloc(1 + width * 4);
        for (let x = 0; x < width; x += 1) {
            const ink = Math.abs(y - (height / 2 + Math.sin(x / 18) * height / 4)) < 2.5;
            row.writeUInt32BE(ink ? 0x1a2b6dff : 0x00000000, 1 + x * 4);
        }
        rows.push(row);
    }
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}


test('600 real PDFs across200 packages need3 explicit frozen sessions with fresh OTP, survive replay and finish exactly once',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 600000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    process.env.SIGNING_V2_ENABLED = 'true'; t.after(() => { delete process.env.SIGNING_V2_ENABLED; });
    const sourceBytes = await syntheticPdf('SYNTHETIC VOLUME CONSENT ONLY');
    const f = await databaseFixture(pool, { packageCount: 200, documentCount: 3, sourceBytes,
        configure: ({ definition, packages }) => {
            const first = packages[0];
            for (const item of packages) { item.roles = first.roles; item.delivery = first.delivery; }
            return definition;
        } });
    const objects = new Map([[`synthetic/${f.contextId}/source.pdf`, sourceBytes]]);
    const storage = { read: async key => { assert.ok(objects.has(key), `object exists: ${key}`); return Buffer.from(objects.get(key)); },
        write: async (key, bytes) => objects.set(key, Buffer.from(bytes)),
        verify: async (key, length, hash) => { assert.equal(objects.get(key)?.length, length); assert.equal(bytesHash(objects.get(key)), hash); } };
    const provider = fakeProvider(), codes = [], errors = [], key = Buffer.alloc(32, 19);
    const { RenderPool } = require('../services/signingV2/renderPool');
    const renderer = new RenderPool({ concurrency: 4 });
    const renderTimes = [], queryTimes = [];
    const render = renderer.render.bind(renderer);
    renderer.render = async input => { const started = performance.now(); try { return await render(input); } finally { renderTimes.push(performance.now()-started); } };
    const query = pool.query.bind(pool);
    pool.query = async (...args) => { const started = performance.now(); try { return await query(...args); } finally { queryTimes.push(performance.now()-started); } };
    const runtime = createRuntime({ pool, storage, provider, renderer, contextIds: [f.contextId],
        env: { SIGNING_V2_GRANT_KEY: key.toString('base64'), WEBSITE_DOMAIN: 'https://qa.example.invalid', SIGNING_V2_RENDERERS: '4' },
        log: { log() {}, error: (...args) => errors.push(args.join(' ')) } });
    t.after(async () => { await runtime.stop(); await renderer.close(); });
    const service = createPublicSigningService({ pool, storage, otpKey: key, otpTransport: { send: async item => codes.push(item.code) } });
    const measured = { environment: 'isolated local QA PostgreSQL/Chromium, fake provider; NOT representative', acceptanceMs: [] };
    const timed = async fn => { const start = performance.now(); const result = await fn(); return { ms: Math.round(performance.now()-start), result }; };
    const created = await timed(() => createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} }));
    measured.durableCreationMs = created.ms;
    const drainKind = async kind => {
        let count = 0;
        for (;;) {
            const batch = await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'volume-consent-test', kinds: [kind], limit: 8 });
            if (!batch.length) return count;
            await Promise.all(batch.map(runtime.handlers[kind])); count += batch.length;
        }
    };
    measured.documentsReadyMs = (await timed(async () => {
        for (const [kind, count] of [['prepare_document',600], ['validate_package',200], ['activate_package',200]]) {
            const stage = await timed(() => drainKind(kind)); assert.equal(stage.result, count); measured[kind] = stage.ms;
            t.diagnostic(`${kind}: ${stage.ms}ms`);
        }
    })).ms;
    measured.fakeProviderAcceptedMs = (await timed(() => drainKind('dispatch_delivery'))).ms;
    assert.equal(provider.calls.length, 1, 'a shared signer gets one invitation for the entire run');
    const token = new URL(provider.calls[0].url).hash.slice(1);
    let view = await service.describe(token);
    assert.equal(view.packages.length, 200); assert.deepEqual(view.counts, { ready: 600, accepted: 0, waiting: 0 });
    const all = view.packages.flatMap(pkg => pkg.documents.flatMap(document => document.tasks));
    await assert.rejects(service.createSession(token, { taskIds: all.map(task => task.taskId), consentVersion: CONSENT_VERSION }), error => error.errorCode === 'INVALID_SELECTION');
    const signature = signaturePng().toString('base64');
    const sessionIds = new Set();
    for (let offset = 0; offset < 600; offset += 200) {
        const taskIds = all.slice(offset, offset + 200).map(task => task.taskId);
        const session = await service.createSession(token, { taskIds, consentVersion: CONSENT_VERSION, locale: 'he' });
        sessionIds.add(session.sessionId); assert.equal(session.taskCount, 200);
        const payload = { consent: true, signature, values: {}, idempotencyKey: randomUUID() };
        await assert.rejects(service.accept(token, session.sessionId, payload), error => error.errorCode === 'OTP_REQUIRED', 'previous session verification never authorizes a new group');
        await service.challenge(token, session.sessionId, { channel: 'email' });
        assert.equal(codes.length, offset / 200 + 1);
        await service.verify(token, session.sessionId, { code: codes.at(-1) });
        const accepted = await timed(() => service.accept(token, session.sessionId, payload));
        measured.acceptanceMs.push(accepted.ms);
        assert.equal(accepted.result.tasks.length, 200);
        const replay = await service.accept(token, session.sessionId, payload); assert.equal(replay.reused, true);
        view = await service.describe(token);
        assert.deepEqual(view.counts, { ready: 400-offset, accepted: offset+200, waiting: 0 });
    }
    assert.equal(sessionIds.size, 3);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM signing_actions WHERE owner_context_id=$1', [f.contextId])).rows[0].n, 600);
    measured.finalPdfAndEvidenceMs = (await timed(() => runtime.drain())).ms;
    const stats = values => { const sorted = [...values].sort((a,b)=>a-b); return { n: sorted.length, total: Math.round(sorted.reduce((a,b)=>a+b,0)), p95: Math.round(sorted[Math.ceil(sorted.length*.95)-1]), max: Math.round(sorted.at(-1)) }; };
    measured.renderCalls = stats(renderTimes); measured.databaseCalls = stats(queryTimes);
    t.diagnostic(JSON.stringify(measured));
    assert.deepEqual(errors, []);
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM signing_documents WHERE owner_context_id=$1 AND state='final'", [f.contextId])).rows[0].n, 600);
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM signing_package_revisions WHERE owner_context_id=$1 AND workflow_state='complete'", [f.contextId])).rows[0].n, 200);
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM signing_jobs WHERE owner_context_id=$1 AND state<>'complete'", [f.contextId])).rows[0].n, 0);
    const { PDFDocument } = require('pdf-lib');
    for (const pkg of [view.packages[0], view.packages[199]]) {
        const final = await service.documentPdf(token, pkg.documents[0].documentId);
        assert.equal(final.final, true); assert.equal((await PDFDocument.load(final.bytes)).getPageCount(), 1);
        assert.ok((await PDFDocument.load((await service.evidencePdf(token, pkg.packageId)).bytes)).getPageCount() >= 1);
    }
});
