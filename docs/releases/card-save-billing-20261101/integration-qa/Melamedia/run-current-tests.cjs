'use strict';
// Local integration evidence only; no provider or application database access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const mode = process.argv[2];
const out = __dirname;
const guard = path.join(root, 'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const tracked = git('ls-files', '-z', 'backend', 'frontend', 'scripts', 'docs/signing-v2/release-baseline.json')
    .split('\0').filter(name => /\.(?:[cm]?js|jsx|tsx?|json|s?css|sql)$/.test(name));
const hashes = () => Object.fromEntries(tracked.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const before = hashes(), head = git('rev-parse', 'HEAD');
let files, command, cwd = root;
const env = { ...process.env, NODE_ENV: 'test', DB_DISABLE_CONNECT_TEST: 'true', CI: 'true', BROWSERSLIST_IGNORE_OLD_DATA: 'true',
    NODE_PATH: '/tmp/layer-billing-lock-deps/node_modules' };
for (const key of ['SIGNUP_RELEASE_QA_CONFIG', 'BILLING_TEST_POSTGRES', 'CLIENT_PROFILE_TEST_SOCKET']) delete env[key];
if (mode === 'billing') {
    const pattern = /^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$/;
    files = fs.readdirSync(path.join(root, 'backend/tests')).filter(name => pattern.test(name)).sort().map(name => 'backend/tests/' + name);
    command = [process.execPath, '--require', guard, '--test', '--test-concurrency=2', ...files];
} else if (mode === 'common') {
    files = ['clientDocumentProfile.test.js', 'clientDocumentProfile.readScope.test.js', 'clientDocumentProfile.postgres.test.js',
        'caseScope.recovery.test.js', 'signingV2.wordOriginBoundary.test.js'].map(name => 'backend/tests/' + name);
    command = [process.execPath, '--require', guard, '--test', '--test-concurrency=2', ...files];
} else if (mode === 'frontend') {
    cwd = path.join(root, 'frontend');
    files = git('ls-files', '-z', 'frontend/src').split('\0').filter(name => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)).map(name => name.slice('frontend/'.length));
    command = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', process.execPath,
        path.join(cwd, 'node_modules/react-scripts/bin/react-scripts.js'), 'test', '--watchAll=false', '--runInBand',
        '--cacheDirectory', '/tmp/layer-integration-Melamedia-jest', '--json', '--outputFile', path.join(out, 'frontend-results.json'),
        '--runTestsByPath', ...files];
} else throw Error('Unknown test mode');
const start = new Date().toISOString();
const result = spawnSync(command[0], command.slice(1), { cwd, env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
fs.writeFileSync(path.join(out, mode + '.log'), (result.stdout || '') + (result.stderr || ''));
const after = hashes();
const changed = tracked.filter(name => before[name] !== after[name]);
const receipt = { startedAtUtc: start, completedAtUtc: new Date().toISOString(), candidate: head, headAtFinish: git('rev-parse', 'HEAD'),
    mode, files, command, exitCode: result.status, signal: result.signal, node: process.version,
    network: mode === 'frontend' ? 'OS sandbox denies all network' : 'pre-socket JS guard blocks external native fetch/TCP and application database ports',
    sourceStable: changed.length === 0 && git('rev-parse', 'HEAD') === head, changedPaths: changed,
    sourceHashes: before, sourceHashesAfter: after };
fs.writeFileSync(path.join(out, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ mode, count: files.length, exitCode: result.status, signal: result.signal, sourceStable: receipt.sourceStable }));
console.log(((result.stdout || '') + (result.stderr || '')).split('\n').slice(-20).join('\n'));
process.exitCode = result.status || (result.signal || changed.length ? 1 : 0);
