const test = require('node:test');
const assert = require('node:assert/strict');
const { decorateCalendarReminder } = require('../lib/calendarReminderListing');
const row = { source: 'calendar', status: 'PENDING', scheduled_for: '2026-09-17T04:30:00Z' };
test('unsent calendar reminder expires only after the scheduler grace', () => {
 assert.equal(decorateCalendarReminder(row, Date.parse('2026-09-17T04:35:00Z')).status, 'PENDING');
 assert.equal(decorateCalendarReminder(row, Date.parse('2026-09-17T04:35:01Z')).status, 'MISSED');
});
test('night quiet hours defer expiry until 07:00 Israel plus grace', () => {
 const night = { ...row, scheduled_for: '2026-09-17T03:00:00Z' };
 assert.equal(decorateCalendarReminder(night, Date.parse('2026-09-17T03:50:00Z')).status, 'PENDING');
 assert.equal(decorateCalendarReminder(night, Date.parse('2026-09-17T04:06:00Z')).status, 'MISSED');
});
test('sent/cancelled rows and retryable email/signing queues keep their status', () => {
 const now = Date.parse('2026-10-07T00:00:00Z');
 for (const status of ['SENT', 'CANCELLED']) assert.equal(decorateCalendarReminder({ ...row, status }, now).status, status);
 for (const source of ['email', 'signing']) assert.equal(decorateCalendarReminder({ ...row, source }, now).status, 'PENDING');
});
