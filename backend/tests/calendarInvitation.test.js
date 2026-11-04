const test = require('node:test');
const assert = require('node:assert/strict');
const ICAL = require('ical.js');
const nodemailer = require('nodemailer');
const { buildCalendarInvitation } = require('../lib/calendarInvitation');
const { parseInvitationFile } = require('../lib/calendarInvitationImport');
const { responsiveEmailHtml } = require('../lib/responsiveEmailHtml');
const now = Date.parse('2026-11-04T00:00:00Z');
const envelope = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:synthetic@example.invalid\r\nORGANIZER:mailto:organizer@example.invalid\r\nDTSTAMP:20261104T080000Z\r\nSUMMARY:פגישה לבדיקה\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const sample = { id: 41, title: 'בדיקת זימון, עו״ד', description: 'Internal case notes must not leak', start_time: '2026-11-05T08:00:00Z', end_time: '2026-11-05T09:00:00Z', updated_at: '2026-11-04T07:00:00Z', location: 'משרד הדגמה' };
function invitation(event = sample) { return buildCalendarInvitation({ event, recipientEmail: 'recipient@example.invalid', organizerEmail: 'office@example.invalid', organizerName: 'משרד הדגמה', domain: 'https://qa.example.invalid' }); }

test('outgoing REQUEST has stable tenant-specific UID, one attendee and no internal notes', async () => {
    const first = invitation(), second = invitation({ ...sample, title: 'Moved', updated_at: '2026-11-04T08:00:00Z' });
    const parse = value => new ICAL.Component(ICAL.parse(value.content));
    const root = parse(first), ev = new ICAL.Event(root.getFirstSubcomponent('vevent'));
    const changed = new ICAL.Event(parse(second).getFirstSubcomponent('vevent'));
    assert.equal(root.getFirstPropertyValue('method'), 'REQUEST');
    assert.equal(ev.uid, changed.uid); assert.ok(changed.sequence > ev.sequence);
    assert.equal(ev.attendees.length, 1); assert.equal(ev.startDate.toJSDate().toISOString(), sample.start_time.replace('Z', '.000Z'));
    assert.ok(!first.content.includes(sample.description));
    const mail = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail({ from: 'office@example.invalid', to: 'recipient@example.invalid', subject: 'Synthetic invite', text: 'Invite', html: '<p>Invite</p>', icalEvent: first });
    assert.match(mail.message.toString(), /text\/calendar;[^\r\n]*method=REQUEST/i);
    assert.match(mail.message.toString(), /application\/ics/i);
    assert.equal(parseInvitationFile(first.content, now).events.length, 1);
});
test('all-day outgoing invitations preserve Jerusalem dates and exclusive ends', () => {
    for (const end of ['2026-11-05T21:59:59.999Z', '2026-11-05T22:00:00Z']) {
        const result = parseInvitationFile(invitation({ ...sample, all_day: true, start_time: '2026-11-04T22:00:00Z', end_time: end }).content, now);
        assert.equal(result.events[0].startTime, '2026-11-04T22:00:00.000Z');
        assert.equal(result.events[0].endTime, '2026-11-05T21:59:59.999Z');
    }
});
test('incoming IANA TZID and floating office times use Jerusalem, independent of server time zone', () => {
    for (const tz of [';TZID=Asia/Jerusalem', '']) {
        const row = parseInvitationFile(envelope(`DTSTART${tz}:20261105T100000\r\nDTEND${tz}:20261105T110000`), now).events[0];
        assert.equal(row.startTime, '2026-11-05T08:00:00.000Z');
    }
    assert.throws(() => parseInvitationFile(envelope('DTSTART;TZID=Unrecognized/Zone:20261105T100000\r\nDTEND;TZID=Unrecognized/Zone:20261105T110000'), now), /אזור הזמן/);
});
test('weekly recurrence retains local time over DST and imports each occurrence once', () => {
    const rows = parseInvitationFile(envelope('DTSTART;TZID=Asia/Jerusalem:20261020T100000\r\nDTEND;TZID=Asia/Jerusalem:20261020T110000\r\nRRULE:FREQ=WEEKLY;COUNT=4'), now).events;
    assert.equal(rows.length, 4); assert.equal(new Set(rows.map(x => x.recurrenceKey)).size, 4);
    assert.equal(rows[0].startTime, '2026-10-20T07:00:00.000Z');
    assert.equal(rows[1].startTime, '2026-10-27T08:00:00.000Z');
});
test('cancellation with UID and no times is accepted; replies, oversized and malformed files are rejected', () => {
    assert.equal(parseInvitationFile(envelope('').replace('METHOD:REQUEST', 'METHOD:CANCEL'), now).events[0].cancelled, true);
    assert.throws(() => parseInvitationFile(envelope('').replace('METHOD:REQUEST', 'METHOD:REPLY'), now), /תגובה/);
    assert.throws(() => parseInvitationFile('a'.repeat(512 * 1024 + 1), now), /512KB/);
    assert.throws(() => parseInvitationFile('invalid', now), /אינו תקין/);
});
test('calendar text cannot add attendees or fetch remote attachments', () => {
    const out = invitation({ ...sample, title: 'hello\r\nATTENDEE:mailto:other@example.invalid' });
    const ev = new ICAL.Event(new ICAL.Component(ICAL.parse(out.content)).getFirstSubcomponent('vevent'));
    assert.equal(ev.attendees.length, 1);
    const imported = parseInvitationFile(envelope('DTSTART:20261105T080000Z\r\nDTEND:20261105T090000Z\r\nATTACH:http://127.0.0.1/private'), now).events[0];
    assert.equal(imported.attachments, undefined);
});
test('responsive email preserves links and branding and shrinks old 640px / 40rem wrappers idempotently', () => {
    for (const width of ['640px', '40rem']) {
        const source = `<table width="640" style="width:${width};background:#2A4365"><tr><td><img width="170" src="https://example.invalid/logo.png"><a href="https://example.invalid/a?a=b&amp;c=d">longaddress@example.invalid</a></td></tr></table>`;
        const html = responsiveEmailHtml(source);
        assert.match(html, /width="100%"/); assert.match(html, /width:100%;max-width:640px;table-layout:fixed/);
        assert.match(html, /word-break:break-word/); assert.match(html, /width="170"/);
        assert.match(html, /href="https:\/\/example.invalid\/a\?a=b&amp;c=d"/);
        assert.match(html, /background:#2A4365/); assert.equal(responsiveEmailHtml(html), html);
    }
});
