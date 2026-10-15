const test = require('node:test');
const assert = require('node:assert/strict');
const { personalCalendarSql, lawyerMatchSql } = require('../lib/calendarVisibility');

test('personalCalendarSql includes owner only when no managers are tagged', () => {
    const sql = personalCalendarSql(1);
    assert.match(sql, /ce\.owner_id = \$1/);
    assert.match(sql, /NOT EXISTS/);
    assert.match(sql, /ce\.manager_user_id IS NULL/);
});

test('personalCalendarSql checks junction managers for tagged associates', () => {
    const sql = personalCalendarSql(1);
    assert.match(sql, /calendar_event_managers/);
});

test('lawyerMatchSql includes owner and junction', () => {
    const sql = lawyerMatchSql(1);
    assert.match(sql, /ce\.owner_id = \$1/);
    assert.match(sql, /calendar_event_managers/);
});
