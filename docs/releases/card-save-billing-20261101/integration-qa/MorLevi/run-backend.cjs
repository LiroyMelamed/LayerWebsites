'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const all = fs.readdirSync(path.join(root, 'backend/tests')).sort();
const billingPattern = /^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$/;
const commonPattern = /^(clientDocumentProfile.*|signingWordRoutes|signingV2\.wordOriginBoundary|wordSigning|wordTemplate.*)\.test\.js$/;
const only = process.argv[2] || null;
const env = { ...process.env, NODE_ENV: 'test', DB_DISABLE_CONNECT_TEST: 'true', NODE_PATH: '/tmp/layer-billing-lock-deps/node_modules' };
for (const key of ['SIGNUP_RELEASE_QA_CONFIG', 'BILLING_TEST_POSTGRES', 'CLIENT_PROFILE_TEST_DATABASE_URL', 'CLIENT_PROFILE_TEST_SOCKET', 'CLIENT_PROFILE_TEST_MODULE_ROOT', 'WORD_HTTP_TEST_SOCKET', 'WORD_SERVICE_TEST_SOCKET', 'WORD_SERVICE_ACTUAL_SOCKET', 'WORD_MULTILINGUAL_ACTUAL', 'WORD_CONVERSION_INTEGRATION_EXECUTABLE', 'WORD_AUTOFILL_QA_BACKEND']) delete env[key];
const rows = [];
for (const [name, pattern] of [['billing', billingPattern], ['common', commonPattern]]) {
    if (only && only !== name) continue;
    const excluded = name === 'common' ? [{ file: 'wordTemplates.http.integration.test.js', reason: 'Top-level external private HTTP fixture is absent before the test can reach its opt-in skip; full attempt retained separately.' }] : [];
    const files = all.filter(file => pattern.test(file) && !excluded.some(row => row.file === file)).map(file => 'backend/tests/' + file);
    const command = ['--require', path.join(root, 'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs'), '--test', '--test-concurrency=2', ...files];
    const result = spawnSync(process.execPath, command, { cwd: root, env, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    fs.writeFileSync(path.join(__dirname, name + '-backend.tap'), (result.stdout || '') + (result.stderr || ''));
    rows.push({ gate: name, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), node: process.version,
        files, excluded, command: [process.execPath, ...command], exitCode: result.status, signal: result.signal, error: result.error?.code || null,
        exactBackendNodeModules: env.NODE_PATH, externalNetworkGuard: true,
        tail: ((result.stdout || '') + (result.stderr || '')).split('\n').slice(-14) });
    console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(path.join(__dirname, only ? only + '-portable-backend-run.json' : 'backend-runs.json'), JSON.stringify(rows, null, 2) + '\n');
process.exitCode = rows.some(row => row.exitCode !== 0) ? 1 : 0;
