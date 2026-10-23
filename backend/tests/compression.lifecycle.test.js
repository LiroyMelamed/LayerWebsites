'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

// Observe actual native compressors; never load application startup, DB or providers.
const streams = [];
const descriptors = new Map();
for (const name of ['createGzip', 'createDeflate', 'createBrotliCompress']) {
    if (typeof zlib[name] !== 'function') continue;
    const descriptor = Object.getOwnPropertyDescriptor(zlib, name);
    descriptors.set(name, descriptor);
    Object.defineProperty(zlib, name, { ...descriptor, value(...args) {
        const stream = descriptor.value.apply(this, args);
        streams.push(stream);
        return stream;
    } });
}
const compression = require(process.env.COMPRESSION_UNDER_TEST || 'compression');
test.after(() => {
    for (const [name, descriptor] of descriptors) Object.defineProperty(zlib, name, descriptor);
});
const body = 'Synthetic response text only. '.repeat(4096);
const encodings = ['gzip', 'deflate', ...(zlib.createBrotliCompress ? ['br'] : [])];

async function released(stream) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (stream.destroyed && stream.closed && stream._handle === null) return;
        await delay(10);
    }
    assert.equal(stream.destroyed, true, 'aborted compressor must be destroyed');
    assert.equal(stream.closed, true, 'native close must complete');
    assert.equal(stream._handle, null, 'native zlib handle must be released');
}

async function fixture(run, handler) {
    const from = streams.length;
    const middleware = compression();
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        middleware(req, res, () => handler(req, res));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    try { await run(url, () => streams.slice(from)); }
    finally {
        for (const stream of streams.slice(from)) stream.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

async function response(url, encoding) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers: encoding ? { 'Accept-Encoding': encoding } : {} }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve({ headers: res.headers, data: Buffer.concat(chunks), complete: res.complete }));
        });
        req.on('error', reject);
    });
}

for (const encoding of encodings) {
    test(`completed ${encoding} response retains body, negotiation and native cleanup`, async () => {
        await fixture(async (url, created) => {
            const result = await response(url, encoding);
            assert.equal(result.headers['content-encoding'], encoding);
            assert.match(result.headers.vary, /Accept-Encoding/i);
            const decode = encoding === 'gzip' ? zlib.gunzipSync : encoding === 'deflate' ? zlib.inflateSync : zlib.brotliDecompressSync;
            assert.equal(decode(result.data).toString(), body);
            assert.equal(result.complete, true);
            assert.equal(created().length, 1);
            await released(created()[0]);
        }, (_req, res) => res.end(body));
    });

    test(`client abort during ${encoding} response releases its native compressor`, async () => {
        await fixture(async (url, created) => {
            await new Promise((resolve, reject) => {
                const req = http.get(url, { headers: { 'Accept-Encoding': encoding } }, res => {
                    res.once('data', () => { res.destroy(); req.destroy(); resolve(); });
                    res.on('error', () => {});
                });
                req.once('error', reject);
            });
            assert.equal(created().length, 1);
            await released(created()[0]);
        }, (_req, res) => {
            res.write(body);
            res.flush();
            // Keep the response unfinished, without load or an unbounded producer.
        });
    });
}

test('a close before headers also releases a subsequently created compressor', async () => {
    let lateWrite;
    const wrote = new Promise(resolve => { lateWrite = resolve; });
    await fixture(async (url, created) => {
        const req = http.get(url, { headers: { 'Accept-Encoding': 'gzip' } });
        req.on('error', () => {});
        await wrote;
        assert.equal(created().length, 1);
        await released(created()[0]);
        req.destroy();
    }, (_req, res) => {
        res.once('close', () => {
            // A delayed handler may attempt headers after its peer disconnected.
            res.writeHead(200);
            lateWrite();
        });
        res.destroy();
    });
});

for (const [label, encoding, payload, cacheControl] of [
    ['identity without negotiation', undefined, body, undefined],
    ['below the default threshold', 'gzip', 'short', undefined],
    ['no-transform cache policy', 'gzip', body, 'no-transform'],
    ['mixed-case no-transform cache policy', 'gzip', body, 'No-Transform'],
]) {
    test(label, async () => {
        await fixture(async (url, created) => {
            const result = await response(url, encoding);
            assert.equal(result.headers['content-encoding'], undefined);
            assert.equal(result.data.toString(), payload);
            assert.equal(result.complete, true);
            assert.equal(created().length, 0);
        }, (_req, res) => {
            if (cacheControl) res.setHeader('Cache-Control', cacheControl);
            res.end(payload);
        });
    });
}
