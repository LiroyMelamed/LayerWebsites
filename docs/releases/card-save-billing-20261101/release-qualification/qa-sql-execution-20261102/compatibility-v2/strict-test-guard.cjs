'use strict';
// Test-only preload. No app/configuration import; all new I/O fails closed.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const dgram = require('node:dgram');
const child = require('node:child_process');
const root = __dirname;
const counts = { network: 0, forbiddenImport: 0, forbiddenFs: 0 };
const inside = filename => filename === root || filename.startsWith(root + path.sep);
const fail = kind => { counts[kind]++; throw Object.assign(new Error('SQL_QA_' + kind.toUpperCase() + '_BLOCKED'), { code: 'SQL_QA_BOUNDARY_BLOCKED' }); };
const denyNetwork = () => fail('network');

// PGlite0.5.10 NODEFS.staticInit reads exactly these public O_* enum values.
// Under Node permission mode native process.binding is forbidden. Supply inert
// same-platform data, never the native binding or any filesystem capability.
const requiredFsConstantNames = Object.freeze([
    'O_APPEND', 'O_CREAT', 'O_EXCL', 'O_NOCTTY', 'O_RDONLY',
    'O_RDWR', 'O_SYNC', 'O_TRUNC', 'O_WRONLY', 'O_NOFOLLOW',
]);
const inertFsConstants = Object.create(null);
for (const name of requiredFsConstantNames) {
    const descriptor = Object.getOwnPropertyDescriptor(fs.constants, name);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && Number.isSafeInteger(descriptor.value), 'Missing numeric public fs constant');
    Object.defineProperty(inertFsConstants, name, { value: descriptor.value, enumerable: true });
}
Object.freeze(inertFsConstants);
const inertConstantsBinding = Object.create(null);
Object.defineProperty(inertConstantsBinding, 'fs', { value: inertFsConstants, enumerable: true });
Object.freeze(inertConstantsBinding);
let allowedBindingCalls = 0, rejectedBindingCalls = 0, completedBindingCanaries = 0;
function inertBinding(name) {
    if (arguments.length !== 1 || name !== 'constants') {
        rejectedBindingCalls++;
        return fail('forbiddenImport');
    }
    allowedBindingCalls++;
    return inertConstantsBinding;
}
Object.freeze(inertBinding);
Object.defineProperty(process, 'binding', { value: inertBinding, configurable: false, writable: false });
net.Socket.prototype.connect = denyNetwork;
net.Server.prototype.listen = denyNetwork;
tls.connect = denyNetwork;
for (const mod of [http, https]) for (const key of ['get', 'request']) mod[key] = denyNetwork;
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
    dns[key] = denyNetwork;
    dns.promises[key] = async () => denyNetwork();
}
dgram.createSocket = denyNetwork;
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[key] = denyNetwork;
Object.defineProperty(global, 'fetch', { value: async () => denyNetwork(), configurable: false, writable: false });
Object.defineProperty(global, 'WebSocket', { value: function () { denyNetwork(); }, configurable: false, writable: false });

// Physical reads are limited to the copied artifact. PGlite's default MEMFS
// database is not a host filesystem. Physical mutation is never needed here.
const readFd = new Set();
const checkedPath = input => {
    if (typeof input === 'number') { if (!readFd.has(input)) fail('forbiddenFs'); return; }
    let filename;
    try { filename = input instanceof URL ? require('node:url').fileURLToPath(input) : String(input); }
    catch (_) { fail('forbiddenFs'); }
    if (!inside(path.resolve(filename))) fail('forbiddenFs');
};
const readFlags = flags => flags === undefined || flags === 'r' || flags === 'rs' || flags === 'sr' || flags === 0;
for (const key of ['readFileSync', 'statSync', 'lstatSync', 'accessSync', 'readdirSync', 'readlinkSync', 'realpathSync']) {
    const original = fs[key]; fs[key] = function (filename, ...args) { checkedPath(filename); return original.call(this, filename, ...args); };
    if (original.native) fs[key].native = function (filename, ...args) { checkedPath(filename); return original.native.call(this, filename, ...args); };
}
for (const key of ['readFile', 'stat', 'lstat', 'access', 'readdir', 'readlink', 'realpath']) {
    const original = fs[key]; fs[key] = function (filename, ...args) { checkedPath(filename); return original.call(this, filename, ...args); };
    const originalPromise = fs.promises[key];
    fs.promises[key] = async function (filename, ...args) { checkedPath(filename); return originalPromise.call(this, filename, ...args); };
}
const openSync = fs.openSync;
fs.openSync = function (filename, flags, ...args) { checkedPath(filename); if (!readFlags(flags)) fail('forbiddenFs'); const fd = openSync.call(this, filename, flags, ...args); readFd.add(fd); return fd; };
const open = fs.open;
fs.open = function (filename, flags, ...args) {
    checkedPath(filename); if (!readFlags(flags)) fail('forbiddenFs');
    const callback = args.pop();
    return open.call(this, filename, flags, ...args, (error, fd) => { if (!error) readFd.add(fd); callback(error, fd); });
};
const openPromise = fs.promises.open;
fs.promises.open = async function (filename, flags, ...args) { checkedPath(filename); if (!readFlags(flags)) fail('forbiddenFs'); return openPromise.call(this, filename, flags, ...args); };
for (const key of ['appendFile', 'writeFile', 'truncate', 'ftruncate', 'rename', 'copyFile', 'cp', 'rm', 'rmdir', 'mkdir', 'mkdtemp', 'unlink', 'link', 'symlink', 'chmod', 'chown', 'utimes']) {
    for (const name of [key, key + 'Sync']) if (typeof fs[name] === 'function') fs[name] = () => fail('forbiddenFs');
    if (typeof fs.promises[key] === 'function') fs.promises[key] = async () => fail('forbiddenFs');
}
for (const key of ['createWriteStream', 'watch', 'watchFile']) fs[key] = () => fail('forbiddenFs');
for (const key of ['write', 'writeSync']) {
    const original = fs[key]; fs[key] = function (fd, ...args) { if (fd !== 1 && fd !== 2) fail('forbiddenFs'); return original.call(this, fd, ...args); };
}
const createReadStream = fs.createReadStream;
fs.createReadStream = function (filename, options) { checkedPath(filename); return createReadStream.call(this, filename, options); };

const files = new Set([
    'strict-test-guard.cjs', 'run-sql-sequences.cjs',
    'backend/tests/cardSetupDebtCollection.test.js', 'backend/tests/selfServiceCardSetupCollection.test.js',
    ...['firmBillingService.js', 'selfServiceRenewal.js', 'billingOperations.js', 'pricingPackage.js', 'tenantBillingDefaults.js', 'signupQuote.js', 'calendarMonths.js'].map(name => 'backend/lib/billing/' + name),
].map(name => path.join(root, name)));
const dependency = path.join(root, 'node_modules/@electric-sql/pglite') + path.sep;
const allowedBuiltins = new Set(['test', 'assert', 'assert/strict', 'fs', 'fs/promises', 'path', 'vm', 'crypto', 'module', 'url', 'stream', 'stream/promises', 'util', 'zlib', 'buffer', 'events', 'async_hooks', 'os', 'perf_hooks', 'string_decoder']);
const originalLoad = Module._load;
Module._load = function (specifier, parent, isMain) {
    const name = specifier.replace(/^node:/, '');
    if (Module.isBuiltin(specifier)) {
        if (!allowedBuiltins.has(name)) fail('forbiddenImport');
        return originalLoad.apply(this, arguments);
    }
    // Explicitly reject live DB/configuration/transports even if fixtures regress.
    if (['pg', 'pg-native', 'dotenv', 'ws', 'nodemailer', 'supertest', 'express'].includes(specifier) || /(?:^|[/\\])config[/\\]db(?:\.js)?$/.test(specifier)) fail('forbiddenImport');
    const resolved = Module._resolveFilename(specifier, parent, isMain);
    if (!files.has(resolved) && !resolved.startsWith(dependency)) fail('forbiddenImport');
    if (resolved.endsWith('.node')) fail('forbiddenImport');
    return originalLoad.apply(this, arguments);
};
module.exports = {
    async canaries() {
        assert.throws(() => net.connect({ host: '127.0.0.1', port: 5432 }), /SQL_QA_NETWORK_BLOCKED/);
        assert.throws(() => net.connect({ path: '/var/run/postgresql/.s.PGSQL.5432' }), /SQL_QA_NETWORK_BLOCKED/);
        await assert.rejects(global.fetch('https://api.takbull.co.il/'), /SQL_QA_NETWORK_BLOCKED/);
        assert.throws(() => child.execFile('/usr/bin/true'), /SQL_QA_NETWORK_BLOCKED/);
        assert.deepEqual(counts, { network: 4, forbiddenImport: 0, forbiddenFs: 0 });
        assert.equal(allowedBindingCalls, 0); assert.equal(rejectedBindingCalls, 0);
        const enums = process.binding('constants');
        assert.equal(Object.getPrototypeOf(enums), null);
        assert.equal(Object.getPrototypeOf(enums.fs), null);
        assert.ok(Object.isFrozen(enums) && Object.isFrozen(enums.fs));
        assert.deepEqual(Object.keys(enums), ['fs']);
        assert.deepEqual(Object.keys(enums.fs), [...requiredFsConstantNames]);
        for (const name of requiredFsConstantNames) assert.equal(enums.fs[name], fs.constants[name]);
        assert.equal(allowedBindingCalls, 1);
        assert.throws(() => process.binding('tcp_wrap'), /SQL_QA_FORBIDDENIMPORT_BLOCKED/);
        assert.equal(rejectedBindingCalls, 1);
        assert.deepEqual(counts, { network: 4, forbiddenImport: 1, forbiddenFs: 0 });
        // Reset only the exact, checked canary effects before original tests.
        counts.network = 0; counts.forbiddenImport = 0;
        allowedBindingCalls = 0; rejectedBindingCalls = 0; completedBindingCanaries = 2;
        return 4;
    },
    assertClean() {
        assert.deepEqual(counts, { network: 0, forbiddenImport: 0, forbiddenFs: 0 });
        assert.equal(process.binding, inertBinding);
        assert.equal(rejectedBindingCalls, 0);
        assert.equal(completedBindingCanaries, 2);
        return { ...counts };
    },
    bindingCompatibility() {
        return { inertConstants: true, allowedBindingCalls, rejectedBindingCalls, nativeBindingDelegations: 0 };
    },
    bindingCanaryCount() { return completedBindingCanaries; },
};
