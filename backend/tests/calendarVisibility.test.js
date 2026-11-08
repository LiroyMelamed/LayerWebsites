const test = require('node:test');
const assert = require('node:assert/strict');
const { personalCalendarSql, lawyerMatchSql, lawyerMatchAnySql, parseLawyerIdList } = require('../lib/calendarVisibility');

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

test('lawyerMatchAnySql matches any id in the list', () => {
    const sql = lawyerMatchAnySql(2);
    assert.match(sql, /ce\.owner_id = ANY\(\$2::int\[\]\)/);
    assert.match(sql, /cem\.user_id = ANY\(\$2::int\[\]\)/);
});

test('parseLawyerIdList keeps a unique ordered set', () => {
    assert.deepEqual(parseLawyerIdList('4,2', ['2', '9']).ids, [4, 2, 9]);
    assert.equal(parseLawyerIdList('0').error, 'invalid');
    assert.equal(parseLawyerIdList('nope').error, 'invalid');
});
