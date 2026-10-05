const test = require('node:test');
const assert = require('node:assert/strict');
const identities = require('./helpers/identityFixture').useTestIdentities();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RATE_LIMIT_IP_WINDOW_MS = process.env.RATE_LIMIT_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_IP_MAX = process.env.RATE_LIMIT_IP_MAX || '100000';
process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS = process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_AUTH_IP_MAX = process.env.RATE_LIMIT_AUTH_IP_MAX || '100000';
process.env.RATE_LIMIT_USER_WINDOW_MS = process.env.RATE_LIMIT_USER_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_USER_MAX = process.env.RATE_LIMIT_USER_MAX || '100000';
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
process.env.IS_PRODUCTION = process.env.IS_PRODUCTION || 'false';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../config/db');
const { resetStore } = require('../utils/rateLimiter');
const { personalCalendarSql, lawyerMatchSql } = require('../lib/calendarVisibility');


function makeToken({ userid, role = 'Admin' } = {}) {
    return jwt.sign(
        { userid, role, phoneNumber: '0500000000' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function nextSundaySlot(offsetHours = 0) {
    const now = new Date();
    const day = now.getDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    const start = new Date(now);
    start.setDate(start.getDate() + daysUntilSunday);
    start.setHours(10 + offsetHours, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11 + offsetHours, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
}

async function isVisibleInPersonalCalendar(userId, eventId) {
    const { rows } = await pool.query(
        `SELECT 1 FROM calendar_events ce
         WHERE ce.id = $1 AND ${personalCalendarSql(2)}`,
        [eventId, userId]
    );
    return rows.length > 0;
}

async function isVisibleInFirmLawyerFilter(lawyerId, eventId) {
    const { rows } = await pool.query(
        `SELECT 1 FROM calendar_events ce
         WHERE ce.id = $1 AND ${lawyerMatchSql(2)}`,
        [eventId, lawyerId]
    );
    return rows.length > 0;
}

async function createEvent(creatorId, body) {
    assert.ok(Number.isInteger(creatorId), 'real creator fixture must be ready');
    assert.equal((await pool.query('SELECT 1 FROM users WHERE userid=$1', [creatorId])).rowCount, 1);
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${makeToken({ userid: creatorId })}`)
        .send(body);
    assert.equal(res.status, 201, `create failed: ${JSON.stringify(res.body)}`);
    return res.body.event;
}

async function deleteEvent(userId, eventId) {
    resetStore();
    const app = require('../app');
    await request(app)
        .delete(`/api/calendar/${eventId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: userId })}`);
}

test('personal calendar — creator does NOT see event when only other lawyers are tagged', async (t) => {
    const { start, end } = nextSundaySlot(0);
    const created = await createEvent(identities.admin, {
        title: 'E2E visibility — creator not in managers',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_id: identities.lawyer,
        manager_user_ids: [identities.lawyer, identities.lawyerB],
    });

    t.after(async () => {
        await deleteEvent(identities.admin, created.id);
    });

    assert.equal(
        await isVisibleInPersonalCalendar(identities.admin, created.id),
        false,
        'creator must not see event in personal calendar unless tagged'
    );
    assert.equal(await isVisibleInPersonalCalendar(identities.lawyer, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(identities.lawyerB, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(identities.staffOutsider, created.id), false);
    assert.equal(await isVisibleInFirmLawyerFilter(identities.admin, created.id), true);
});

test('personal calendar — all tagged associates see multi-lawyer meeting', async (t) => {
    const { start, end } = nextSundaySlot(2);
    const created = await createEvent(identities.admin, {
        title: 'E2E visibility — multi associate',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [identities.lawyer, identities.lawyerB, identities.lawyerC],
    });

    t.after(async () => {
        await deleteEvent(identities.admin, created.id);
    });

    for (const lawyerId of [identities.lawyer, identities.lawyerB, identities.lawyerC]) {
        assert.equal(
            await isVisibleInPersonalCalendar(lawyerId, created.id),
            true,
            `lawyer ${lawyerId} must see tagged event`
        );
    }
    assert.equal(await isVisibleInPersonalCalendar(identities.admin, created.id), false);
    assert.equal(await isVisibleInPersonalCalendar(identities.staffOutsider, created.id), false);
});

test('personal calendar — solo owner event visible only to owner', async (t) => {
    const { start, end } = nextSundaySlot(4);
    const created = await createEvent(identities.admin, {
        title: 'E2E visibility — solo owner',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
    });

    t.after(async () => {
        await deleteEvent(identities.admin, created.id);
    });

    assert.equal(await isVisibleInPersonalCalendar(identities.admin, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(identities.staffOutsider, created.id), false);
});

test('personal calendar — creator sees event when explicitly tagged as attendee', async (t) => {
    const { start, end } = nextSundaySlot(6);
    const created = await createEvent(identities.admin, {
        title: 'E2E visibility — creator in managers list',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [identities.admin, identities.lawyer],
    });

    t.after(async () => {
        await deleteEvent(identities.admin, created.id);
    });

    assert.equal(await isVisibleInPersonalCalendar(identities.admin, created.id), true);

    const { rows: junction } = await pool.query(
        'SELECT user_id FROM calendar_event_managers WHERE event_id = $1 ORDER BY user_id',
        [created.id]
    );
    assert.deepEqual(
        junction.map((r) => r.user_id).sort((a, b) => a - b),
        [identities.admin, identities.lawyer].sort((a, b) => a - b)
    );
});

test('personal calendar — leave owner visible even when manager_user_id differs', async (t) => {
    const { start, end } = nextSundaySlot(8);
    const created = await createEvent(identities.admin, {
        title: 'E2E visibility — leave for lawyer B',
        event_type: 'leave',
        start_time: start,
        end_time: end,
        all_day: true,
        manager_user_ids: [identities.lawyerB, identities.lawyer],
    });

    t.after(async () => {
        await deleteEvent(identities.admin, created.id);
    });

    assert.equal(created.ownerId, identities.lawyerB, 'leave owner should be tagged lawyer');
    assert.equal(
        await isVisibleInPersonalCalendar(identities.lawyerB, created.id),
        true,
        'lawyer on leave must see leave in personal calendar'
    );
});

test('personal calendar — production regression: untagged creator does not see owned meeting', async (t) => {
    const { start, end } = nextSundaySlot(9);
    const created = await createEvent(identities.admin, {
        title: 'Synthetic untagged creator regression', start_time: start, end_time: end,
        manager_user_ids: [identities.lawyer],
    });
    t.after(() => deleteEvent(identities.admin, created.id));
    const { rows } = await pool.query(
        `SELECT ce.id, ce.owner_id
         FROM calendar_events ce
         WHERE ce.id = $1
           AND EXISTS (SELECT 1 FROM calendar_event_managers cem WHERE cem.event_id = ce.id)
           AND NOT EXISTS (
               SELECT 1 FROM calendar_event_managers cem
               WHERE cem.event_id = ce.id AND cem.user_id = ce.owner_id
           )`, [created.id]
    );
    assert.equal(rows.length, 1, 'regression must execute with an untagged creator fixture');

    const ev = rows[0];
    assert.equal(
        await isVisibleInPersonalCalendar(ev.owner_id, ev.id),
        false,
        'creator who is not tagged must not see event in personal calendar'
    );
});


test('calendar API preserves office parity and rejects customers on event operations', async (t) => {
    const app = require('../app');
    const { start, end } = nextSundaySlot(10);
    const created = await createEvent(identities.admin, {
        title: 'Synthetic API access lifecycle',
        start_time: start, end_time: end,
        manager_user_ids: [identities.lawyer],
    });
    t.after(() => deleteEvent(identities.admin, created.id));
    const call = (method, id, userid, role = 'Lawyer', body) => {
        resetStore();
        const req = request(app)[method](`/api/calendar/${id}`)
            .set('Authorization', `Bearer ${makeToken({ userid, role })}`);
        return body ? req.send(body) : req;
    };
    assert.equal((await call('get', created.id, identities.lawyer)).status, 200);
    // Dedicated-office legacy Lawyers have the same office capabilities as Admins.
    assert.equal((await call('get', created.id, identities.staffOutsider, 'Lawyer')).status,200);
    assert.equal((await call('put', created.id, identities.staffOutsider, 'Lawyer', {title:'Office colleague update'})).status,200);
    for (const method of ['get', 'put', 'delete']) {
        const denied = await call(method, created.id, identities.client, 'User', method === 'put' ? { title: 'Unauthorized change' } : undefined);
        assert.equal(denied.status, 403, `${method} must reject customer`);
    }
    const updated = await call('put', created.id, identities.lawyer, 'Lawyer', { title: 'Assigned lawyer update' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.event.title, 'Assigned lawyer update');
    const missingId = 2147483647;
    assert.equal((await pool.query('SELECT 1 FROM calendar_events WHERE id=$1', [missingId])).rowCount, 0);
    for (const role of ['Admin', 'Lawyer']) {
        for (const method of ['get', 'put', 'delete']) {
            const missing = await call(method, missingId, identities.admin, role, method === 'put' ? { title: 'Missing' } : undefined);
            assert.equal(missing.status, 404, `${role} ${method} missing event must return404`);
        }
    }
});
