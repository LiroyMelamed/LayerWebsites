const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EVENT_STATUS_CANCELLED,
    EVENT_STATUS_SCHEDULED,
    activeEventStatusSql,
    isEventCancelled,
    normalizeEventStatus,
} = require('../lib/calendarEventStatus');

test('normalizeEventStatus defaults unknown values to scheduled', () => {
    assert.equal(normalizeEventStatus(null), EVENT_STATUS_SCHEDULED);
    assert.equal(normalizeEventStatus(undefined), EVENT_STATUS_SCHEDULED);
    assert.equal(normalizeEventStatus(''), EVENT_STATUS_SCHEDULED);
    assert.equal(normalizeEventStatus('CANCELLED'), EVENT_STATUS_CANCELLED);
});

test('isEventCancelled recognizes cancelled only', () => {
    assert.equal(isEventCancelled('cancelled'), true);
    assert.equal(isEventCancelled('scheduled'), false);
});

test('activeEventStatusSql filters cancelled rows', () => {
    assert.match(activeEventStatusSql(), /COALESCE\(ce\.event_status/);
    assert.match(activeEventStatusSql(), /scheduled/);
});
