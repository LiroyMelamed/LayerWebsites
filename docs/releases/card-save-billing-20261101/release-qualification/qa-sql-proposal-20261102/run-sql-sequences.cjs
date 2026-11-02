'use strict';
// This runner is a proposal artifact: never run without separate QA approval.
const assert = require('node:assert/strict');
const test = require('node:test');
const guard = require('./strict-test-guard.cjs');
assert.ok(process.execArgv.includes('--experimental-permission'), 'Scoped Node filesystem permission mode is required');
assert.ok(process.execArgv.includes('--allow-fs-read=' + __dirname), 'Read scope must be exactly the isolated artifact');
assert.ok(!process.execArgv.some(value => /^--allow-(?:fs-write|child-process|worker|addons|wasi)(?:=|$)/.test(value)), 'Do not expand test permissions');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.BILLING_TEST_POSTGRES, '0');
assert.equal(process.env.BILLING_OPERATIONS_ENABLED, 'true');
for (const key of Object.keys(process.env)) assert.ok(['PATH', 'HOME', 'TMPDIR', 'NODE_ENV', 'BILLING_TEST_POSTGRES', 'BILLING_OPERATIONS_ENABLED'].includes(key), 'Unexpected inherited environment variable');
(async () => {
    const networkCanaries = await guard.canaries();
    test.after(() => console.log(JSON.stringify({ probe: 'FROZEN_SYNTHETIC_SQL_SEQUENCES', source: '6a3bd299227291feb0065ae3afa89a1f3ba2967a', node: process.version,
        pglite: '0.5.10', database: 'PGlite default memory filesystem only', networkCanaries, forbiddenOperations: guard.assertClean(), liveDatabase: false, liveProvider: false })));
    // One unchanged test file per sandboxed exec; no node --test worker fork.
    const allowed = new Set(['backend/tests/cardSetupDebtCollection.test.js', 'backend/tests/selfServiceCardSetupCollection.test.js']);
    assert.equal(process.argv.length, 3, 'Exactly one approved test selector is required');
    const selectedTest = process.argv[2];
    assert.ok(allowed.has(selectedTest), 'Unapproved test selector');
    console.log(JSON.stringify({ selectedTest, source: '6a3bd299227291feb0065ae3afa89a1f3ba2967a' }));
    require('./' + selectedTest);
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
