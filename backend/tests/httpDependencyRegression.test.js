const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const req = process.env.RELEASE_HTTP_DEPS_ROOT
    ? createRequire(require('node:path').resolve(process.env.RELEASE_HTTP_DEPS_ROOT, 'package.json'))
    : require;
const express = req('express');
const proxyaddr = req('proxy-addr');
const compression = req('compression');

test('HTTP compression preserves the complete UTF-8 response', async () => {
    const content = 'מסמך בדיקת שרת סינתטי ללא תוקף משפטי\n'.repeat(100);
    const app = express(); app.use(compression({ threshold: 1024 }));
    app.get('/', (_request, response) => response.type('text/plain').send(content));
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise(resolve => server.once('listening', resolve));
        const result = await new Promise((resolve, reject) => {
            http.get({ hostname: '127.0.0.1', port: server.address().port, headers: { 'accept-encoding': 'gzip' } }, response => {
                const chunks = []; response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => resolve({ encoding: response.headers['content-encoding'], bytes: Buffer.concat(chunks) }));
                response.on('error', reject);
            }).on('error', reject);
        });
        assert.equal(result.encoding, 'gzip');
        assert.equal(zlib.gunzipSync(result.bytes).toString(), content);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

// One bounded local aborted response is enough to observe resource cleanup.
test('aborting a compressed response releases its zlib stream', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(zlib, 'createGzip');
    let stream, server, client;
    Object.defineProperty(zlib, 'createGzip', { ...descriptor, value: (...args) => {
        stream = descriptor.value(...args); return stream;
    } });
    try {
        const app = express(); app.use(compression({ threshold: 0 }));
        let closed;
        const finished = new Promise(resolve => { closed = resolve; });
        app.get('/', (_request, response) => {
            response.type('text/plain'); response.write('Synthetic bounded response.'); response.flush();
            response.on('close', () => setImmediate(closed));
        });
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        client = http.get({ hostname: '127.0.0.1', port: server.address().port, headers: { 'accept-encoding': 'gzip' } }, response => {
            response.once('data', () => response.destroy()); response.on('error', () => {});
        });
        client.on('error', () => {});
        let timer;
        try { await Promise.race([finished, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('local request timeout')), 3000); })]); }
        finally { clearTimeout(timer); }
        assert.ok(stream); assert.equal(stream.destroyed, true, 'closed HTTP response must release compressor');
    } finally {
        stream?.destroy(); client?.destroy();
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        Object.defineProperty(zlib, 'createGzip', descriptor);
    }
});

test('IPv4-mapped IPv6 trust boundaries do not trust unrelated IPv4 peers', () => {
    assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('198.51.100.7'), false);
    assert.equal(proxyaddr.compile('::/1')('198.51.100.7'), false);
    const correct = proxyaddr.compile('::ffff:10.0.0.0/104');
    assert.equal(correct('10.1.2.3'), true);
    assert.equal(correct('198.51.100.7'), false);
    assert.equal(proxyaddr.compile('loopback')('127.0.0.1'), true);
});
