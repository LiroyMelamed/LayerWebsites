'use strict';
// Local synthetic test runner. Never imports application configuration or starts jobs.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const guard = path.join(root, 'docs/releases/card-save-billing-20261101/comprehensive-qa/offline-network-guard.cjs');
const pattern = /^(billing.*|signup.*|hostedPaymentVerification|systemMessageBillingSettlement|systemMessageSharedSettlement|savePackage.*|selfService.*|platformBilling|requireBillingAccess|takbullDocuments|pricingPackage|cardSetupDebtCollection|liveServerPreservation)\.test\.js$/;
const billing = fs.readdirSync(path.join(root, 'backend/tests')).filter(x => pattern.test(x)).sort().map(x => 'backend/tests/' + x);
const common = ['backend/tests/clientDocumentProfile.test.js', 'backend/tests/clientDocumentProfile.readScope.test.js',
    'backend/tests/clientDocumentProfile.postgres.test.js', 'backend/tests/officeRoleParity.recovery.test.js',
    'backend/tests/customerIdentity.recovery.test.js', 'backend/tests/customerRefresh.recovery.test.js',
    'scripts/tests/deploy-all-active-tenants.test.js', 'scripts/tests/propagate-main-to-tenants.test.js'];
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'LC_ALL'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, {NODE_PATH: '/tmp/layer-billing-lock-deps/node_modules', NODE_ENV: 'test', DB_DISABLE_CONNECT_TEST: 'true'});
const results = {};
for (const [name, files] of [['billing', billing], ['common', common]]) {
    const args = ['--require', guard, '--test', '--test-reporter=tap', '--test-concurrency=1', ...files];
    const r = cp.spawnSync(process.execPath, args, {cwd: root, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
    const log = r.stdout + r.stderr;
    fs.writeFileSync(path.join(__dirname, name + '.tap'), log);
    results[name] = {files, exitCode: r.status, signal: r.signal, command: [process.execPath, ...args],
        summary: log.split('\n').filter(x => /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(x))};
    console.log(JSON.stringify({name, ...results[name]}));
}
fs.writeFileSync(path.join(__dirname, 'backend-results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = Object.values(results).some(x => x.exitCode !== 0) ? 1 : 0;
