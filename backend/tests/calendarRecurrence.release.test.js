const test = require('node:test'), assert = require('node:assert/strict');
const {expandRecurrenceOccurrences:expand, MAX_OCCURRENCES}=require('../lib/calendarRecurrence');
const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'});
test('weekly recurrence preserves Jerusalem office hour across autumn DST',()=>{
 const rows=expand({startTime:'2026-10-18T09:00:00+03:00',endTime:'2026-10-18T10:00:00+03:00',frequency:'weekly',until:'2026-11-01'});
 assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>fmt.format(x.start)),['2026-10-18 09:00','2026-10-25 09:00','2026-11-01 09:00']);assert.ok(rows.every(x=>fmt.format(x.end).endsWith('10:00')));
});
test('daily recurrence preserves office time across spring DST',()=>{
 const rows=expand({startTime:'2026-03-26T09:00:00+02:00',endTime:'2026-03-26T10:00:00+02:00',frequency:'daily',until:'2026-03-28'});assert.equal(rows.length,3);assert.ok(rows.every(x=>fmt.format(x.start).endsWith('09:00')));
});
test('monthly month-end clamps once and retains original day next month',()=>{
 const rows=expand({startTime:'2026-01-31T10:00:00+02:00',endTime:'2026-01-31T11:00:00+02:00',frequency:'monthly',until:'2026-03-31'});assert.deepEqual(rows.map(x=>fmt.format(x.start)),['2026-01-31 10:00','2026-02-28 10:00','2026-03-31 10:00']);
});
test('all-day recurrence preserves local midnight and exclusive end across DST',()=>{
 const rows=expand({startTime:'2026-03-26T00:00:00+02:00',endTime:'2026-03-27T00:00:00+02:00',frequency:'daily',until:'2026-03-28'});assert.equal(rows.length,3);assert.ok(rows.every(x=>fmt.format(x.start).endsWith('00:00')&&fmt.format(x.end).endsWith('00:00')));assert.equal(rows[1].end-rows[1].start,23*3600000);
});
test('oversized series exposes overflow; invalid and inverted until do not create a phantom occurrence',()=>{
 assert.equal(expand({startTime:'2026-01-01T08:00:00Z',endTime:'2026-01-01T09:00:00Z',frequency:'daily',until:'2027-01-01'}).length,MAX_OCCURRENCES+1);
 for(const until of ['invalid','2025-12-30'])assert.deepEqual(expand({startTime:'2026-01-01T08:00:00Z',endTime:'2026-01-01T09:00:00Z',frequency:'daily',until}),[]);
});
