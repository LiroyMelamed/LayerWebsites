'use strict';
// Exact-source local integration gates. No application boot or environment file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const out = __dirname;
const root = path.resolve(out, '../../../../..');
const guard = path.join(root, 'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs');
const deps = '/tmp/layer-billing-lock-deps/node_modules';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths = git('ls-files', '-z', 'backend', 'scripts/check-signing-release.cjs', 'docs/signing-v2/release-baseline.json')
    .split('\0').filter(p => /\.(?:[cm]?js|json|sql|ts)$/.test(p));
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, hash(fs.readFileSync(path.join(root, p)))]));
const before = hashes();
const candidate = git('rev-parse', 'HEAD');
const billing = JSON.parse(fs.readFileSync(path.join(root, 'docs/releases/card-save-billing-20261101/comprehensive-qa/backend-test-selection.json'))).files;
const common = [
    'clientDocumentProfile.test.js', 'clientDocumentProfile.readScope.test.js', 'clientDocumentProfile.postgres.test.js',
    'customerIdentity.recovery.test.js', 'clientPortal.mainScope.test.js', 'clientPortal.unit.test.js',
    'authMiddleware.shape.test.js', 'signingV2.featureEntryRoutes.test.js', 'signingV2.wordOriginBoundary.test.js',
    'signingWordRoutes.test.js',
].map(p => 'backend/tests/' + p);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || '/tmp',
    LANG: process.env.LANG || 'en_US.UTF-8', NODE_PATH: deps, NODE_ENV: 'test', DB_DISABLE_CONNECT_TEST: 'true' };
const results = [];
for (const [name, files] of [['billing', billing], ['common-boundaries', common]]) {
    const startedAtUtc = new Date().toISOString();
    const args = ['--require', guard, '--test', '--test-reporter=tap', '--test-concurrency=2', ...files];
    const run = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
        timeout: 600000 });
    const log = (run.stdout || '') + (run.stderr || '');
    fs.writeFileSync(path.join(out, name + '.tap'), log);
    const summary = {};
    for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
        const match = log.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'));
        summary[key] = match ? Number(match[1]) : null;
    }
    const row = { name, startedAtUtc, finishedAtUtc: new Date().toISOString(), files, args,
        exitCode: run.status, signal: run.signal, summary, logSha256: hash(log) };
    results.push(row);
    console.log(JSON.stringify(row));
}
const after = hashes();
const changedSourcePaths = sourcePaths.filter(p => before[p] !== after[p]);
const receipt = { candidate, headAtFinish: git('rev-parse', 'HEAD'), node: process.version, dependencyRoot: deps,
    sourcePathsSha256: before, changedSourcePaths, sourceStable: changedSourcePaths.length === 0,
    outboundNetworkGuard: guard, applicationDbAccess: false, providerCalls: 'synthetic only',
    preloadBillingSnapshotStubUsed: false, fullSignupFixtureSupplied: false,
    clientProfilePostgresFixtureSupplied: false, results };
fs.writeFileSync(path.join(out, 'offline-gates.json'), JSON.stringify(receipt, null, 2) + '\n');
process.exitCode = results.every(r => r.exitCode === 0) && receipt.sourceStable ? 0 : 1;
