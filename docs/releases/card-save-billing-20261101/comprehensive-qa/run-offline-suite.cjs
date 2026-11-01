'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const pattern = /^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$/;
const files = fs.readdirSync(path.join(root, 'backend/tests')).filter(name => pattern.test(name)).sort().map(name => 'backend/tests/' + name);
const env = { ...process.env, DB_DISABLE_CONNECT_TEST: 'true', NODE_ENV: 'test' };
delete env.SIGNUP_RELEASE_QA_CONFIG;
delete env.BILLING_TEST_POSTGRES;
fs.writeFileSync(path.join(__dirname, 'backend-test-selection.json'), JSON.stringify({
    node: process.version, files, provider: 'synthetic boundaries only',
    signupReleaseConfigSupplied: false, outboundNetworkGuard: true, testConcurrency: 2,
}, null, 2) + '\n');
const args = ['--require', path.join(__dirname, 'offline-network-guard.cjs'), '--test', '--test-concurrency=2', ...files];
const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
fs.writeFileSync(path.join(__dirname, 'backend-broad-final.tap'), result.stdout + result.stderr);
console.log(JSON.stringify({ fileCount: files.length, exitCode: result.status, signal: result.signal,
    log: path.join(__dirname, 'backend-broad-final.tap') }));
console.log((result.stdout + result.stderr).split('\n').slice(-25).join('\n'));
process.exitCode = result.status || (result.signal ? 1 : 0);
