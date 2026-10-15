const test = require('node:test');
const assert = require('node:assert/strict');
const { PENDING_SIGNING_AUTO_DELETE_DAYS } = require('../lib/signingPendingCleanup');

test('pending signing auto-delete threshold is 30 days', () => {
    assert.equal(PENDING_SIGNING_AUTO_DELETE_DAYS, 30);
});
