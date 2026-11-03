const test = require('node:test');
const assert = require('node:assert/strict');
const { googleCalendarEventTimes: convert } = require('../lib/googleCalendarEventTimes');
const day = (start, end) => convert({ start: { date: start }, end: { date: end } });

test('single day stays within its Jerusalem civil date in winter and summer', () => {
    assert.deepEqual(day('2026-11-03', '2026-11-04'), { startTime: '2026-11-02T22:00:00.000Z', endTime: '2026-11-03T21:59:59.999Z', allDay: true });
    assert.deepEqual(day('2026-07-03', '2026-07-04'), { startTime: '2026-07-02T21:00:00.000Z', endTime: '2026-07-03T20:59:59.999Z', allDay: true });
});
test('multi-day exclusive end and year boundary', () => {
    assert.deepEqual(day('2026-12-30', '2027-01-02'), { startTime: '2026-12-29T22:00:00.000Z', endTime: '2027-01-01T21:59:59.999Z', allDay: true });
});
test('spring and autumn DST days have their actual 23/25 hour durations', () => {
    for (const [start, end, hours] of [['2026-03-27', '2026-03-28', 23], ['2026-10-25', '2026-10-26', 25]]) {
        const result = day(start, end);
        assert.equal(Date.parse(result.endTime) - Date.parse(result.startTime) + 1, hours * 3600000);
    }
});
test('timed appointments retain exact source instants and offsets', () => {
    const startTime = '2026-11-03T08:30:00+02:00', endTime = '2026-11-03T09:00:00+02:00';
    assert.deepEqual(convert({ start: { dateTime: startTime }, end: { dateTime: endTime } }), { startTime, endTime, allDay: false });
});
test('invalid, missing, reversed and mixed date forms are not imported', () => {
    for (const event of [{}, { start: { date: '2026-02-30' }, end: { date: '2026-03-03' } }, { start: { date: '2026-11-03' }, end: { date: '2026-11-03' } }, { start: { date: '2026-11-04' }, end: { date: '2026-11-03' } }, { start: { dateTime: '2026-11-03T08:00:00Z' }, end: { date: '2026-11-04' } }]) assert.equal(convert(event), null);
});
