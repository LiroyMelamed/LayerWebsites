const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { googleCalendarEventTimes } = require('../lib/googleCalendarEventTimes');

test('controller paginates and upserts a repeat sync without duplicating recurring instances or touching manual events', async () => {
    const key = 'ab'.repeat(32), iv = Buffer.alloc(12, 1);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    const token = [iv, Buffer.concat([cipher.update('test-token'), cipher.final()]), cipher.getAuthTag()].map(x => x.toString('base64')).join(':');
    const events = [
        { id: 'series_20261103', start: { date: '2026-11-03' }, end: { date: '2026-11-04' } },
        { id: 'series_20261104', start: { dateTime: '2026-11-04T09:00:00+02:00' }, end: { dateTime: '2026-11-04T10:00:00+02:00' } },
    ];
    const stored = new Map([['manual', ['untouched']]]), pages = [];
    const pool = { query: async (sql, args) => {
        if (sql.includes('FROM user_calendar_tokens')) return { rows: [{ google_access_token: token }] };
        assert.match(sql, /ON CONFLICT \(owner_id, google_event_id\)/);
        stored.set(`${args[0]}:${args[7]}`, args);
        return { rows: [] };
    } };
    const module = { exports: {} };
    const mockedRequire = name => {
        if (name === 'crypto') return crypto;
        if (name === '../config/db') return pool;
        if (name === '../services/settingsService') return { getSetting: async () => 'true' };
        if (name === '../lib/googleCalendarEventTimes') return { googleCalendarEventTimes };
        if (name === 'googleapis') return { google: {
            auth: { OAuth2: class { setCredentials() {} on() {} } },
            calendar: () => ({ events: { list: async params => {
                assert.equal(params.calendarId, 'primary'); assert.equal(params.singleEvents, true);
                pages.push(params.pageToken || 'first');
                return { data: { items: [events[params.pageToken ? 1 : 0]], nextPageToken: params.pageToken ? undefined : 'next' } };
            } } }),
        } };
        // Unused collaborators intentionally cannot send invitations or messages.
        return {};
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/calendarController'), 'utf8'), {
        require: mockedRequire, module, process: { env: { CALENDAR_ENCRYPTION_KEY: key } }, Buffer, console,
    });
    const result = [];
    const res = { json: body => result.push(body), status: code => { throw Error(`Unexpected HTTP ${code}`); } };
    await module.exports.syncGoogleEvents({ user: { UserId: 42 } }, res);
    await module.exports.syncGoogleEvents({ user: { UserId: 42 } }, res);
    assert.deepEqual(pages, ['first', 'next', 'first', 'next']);
    assert.equal(stored.size, 3);
    assert.deepEqual(stored.get('manual'), ['untouched']);
    assert.equal(stored.get('42:series_20261103')[5], '2026-11-03T21:59:59.999Z');
    assert.equal(stored.get('42:series_20261104')[4], '2026-11-04T09:00:00+02:00');
    for (const body of result) assert.deepEqual(JSON.parse(JSON.stringify(body)), { ok: true, synced: 2, total: 2, failed: 0 });
});
