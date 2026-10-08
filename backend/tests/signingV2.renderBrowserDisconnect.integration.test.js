const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter, once } = require('node:events');
const { PDFDocument } = require('pdf-lib');
const { bytesHash } = require('../lib/signingV2/canonical');
const { RenderPool } = require('../services/signingV2/renderPool');

test('browser loss rejects the current job once and preserves queued-job byte accounting', async () => {
    const workers = [];
    class FakeWorker extends EventEmitter {
        constructor() { super(); this.sent = []; this.terminations = 0; workers.push(this); }
        postMessage(message) { this.sent.push(message); }
        terminate() { this.terminations += 1; return Promise.resolve(0); }
    }
    const filename = require.resolve('../services/signingV2/renderPool');
    const module = { exports: {} };
    vm.runInNewContext(await fs.readFile(filename, 'utf8'), {
        module, __dirname: path.dirname(filename), setTimeout, clearTimeout, Buffer, process, console,
        require: id => id === 'node:worker_threads' ? { Worker: FakeWorker }
            : id.startsWith('.') ? require(path.resolve(path.dirname(filename), id)) : require(id),
    }, { filename });
    const pool = new module.exports.RenderPool({ concurrency: 1, maxQueued: 1, maxBytes: 20 });
    const first = pool.render({ sourceBytes: Buffer.alloc(7) });
    const rejected = assert.rejects(first, error => error.errorCode === 'RENDER_WORKER_LOST' && error.retryable === true);
    const queued = pool.render({ sourceBytes: Buffer.alloc(9) });
    const old = workers[0], oldTask = old.sent[0].id;
    old.emit('message', { type: 'browser_closed' });
    await rejected;
    assert.equal(old.terminations, 1);
    assert.equal(workers.length, 2);
    assert.equal(pool.bytes, 9);
    assert.equal(pool.queue.length, 0);
    assert.equal(pool.slots.length, 1);
    // Delayed browser/result/exit events cannot reclaim or complete a lost job.
    old.emit('message', { type: 'browser_closed' });
    old.emit('message', { id: oldTask, result: { bytes: Buffer.alloc(7) } });
    old.emit('exit', 0);
    assert.equal(pool.bytes, 9);
    assert.equal(old.terminations, 1);
    const fresh = workers[1];
    fresh.emit('message', { id: fresh.sent[0].id, result: { bytes: Buffer.from('fresh') } });
    assert.equal((await queued).bytes.toString(), 'fresh');
    assert.equal(pool.bytes, 0);
    assert.equal(pool.slots.length, 1);
    pool.slots = [];
    await pool.close();
});

test('an actual disconnected Chromium worker is retired before the next distinct real PDF',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
        const pool = new RenderPool({ concurrency: 1, noSandbox: true });
        t.after(() => pool.close());
        const source = await PDFDocument.create();
        source.addPage([595, 842]); source.addPage([595, 842]);
        const sourceBytes = Buffer.from(await source.save()), expectedSourceHash = bytesHash(sourceBytes);
        const input = value => ({ sourceBytes, expectedSourceHash, locale: 'en', fields: [
            { id: 'reference', type: 'data', pageNum: 1, x: 45, y: 85, width: 300, height: 30,
                fontSize: 13, overflow: 'block', value },
        ] });
        const first = await pool.render(input('DISCONNECT-FIRST-ONLY'));
        const old = pool.slots[0], oldThreadId = old.worker.threadId, oldBrowserPid = old.browserPid;
        assert.ok(oldBrowserPid > 0);
        const terminated = once(old.worker, 'exit');
        const browserClosed = new Promise(resolve => old.worker.on('message', message => {
            if (message.type === 'browser_closed') resolve();
        }));
        process.kill(oldBrowserPid, 'SIGKILL');
        await browserClosed;
        await terminated;
        assert.equal(pool.slots.length, 0);
        assert.equal(pool.bytes, 0);
        const second = await pool.render(input('DISCONNECT-SECOND-ONLY'));
        const fresh = pool.slots[0];
        assert.notEqual(fresh.worker.threadId, oldThreadId);
        assert.notEqual(fresh.browserPid, oldBrowserPid);
        assert.equal(pool.slots.length, 1);
        assert.equal(pool.bytes, 0);
        assert.equal((await PDFDocument.load(second.bytes)).getPageCount(), 2);
        assert.equal(first.contentHash, bytesHash(first.bytes));
        assert.equal(second.contentHash, bytesHash(second.bytes));
        assert.notEqual(second.contentHash, first.contentHash);
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(second.bytes), useSystemFonts: false,
            isEvalSupported: false, standardFontDataUrl: `${path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/` }).promise;
        let text;
        try { text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => item.str).join(''); }
        finally { await pdf.destroy(); }
        assert.match(text, /DISCONNECT-SECOND-ONLY/);
        assert.doesNotMatch(text, /DISCONNECT-FIRST-ONLY/);
        if (process.env.V2_QA_OUTPUT_DIR) {
            const directory = path.resolve(process.env.V2_QA_OUTPUT_DIR);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(path.join(directory, 'disconnect-first.pdf'), first.bytes);
            await fs.writeFile(path.join(directory, 'disconnect-second.pdf'), second.bytes);
            await fs.writeFile(path.join(directory, 'disconnect-proof.json'), JSON.stringify({
                sourceHash: expectedSourceHash, firstHash: first.contentHash, secondHash: second.contentHash,
                oldBrowserPid, freshBrowserPid: fresh.browserPid, oldThreadId, freshThreadId: fresh.worker.threadId,
                oldWorkerExited: true, secondPages: 2, secondText: text, bytesAfter: pool.bytes,
                noPreviousValue: true, originalBrowserExitCauseRepaired: false,
            }, null, 2));
        }
    });
