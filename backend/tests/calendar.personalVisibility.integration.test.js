const test = require('node:test');
const assert = require('node:assert/strict');

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

const CREATOR_ID = 1017;
const LAWYER_A = 1088;
const LAWYER_B = 1092;
const LAWYER_C = 1102;
const OUTSIDER_ID = 1091;

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
    const created = await createEvent(CREATOR_ID, {
        title: 'E2E visibility — creator not in managers',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_id: LAWYER_A,
        manager_user_ids: [LAWYER_A, LAWYER_B],
    });

    t.after(async () => {
        await deleteEvent(CREATOR_ID, created.id);
    });

    assert.equal(
        await isVisibleInPersonalCalendar(CREATOR_ID, created.id),
        false,
        'creator must not see event in personal calendar unless tagged'
    );
    assert.equal(await isVisibleInPersonalCalendar(LAWYER_A, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(LAWYER_B, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(OUTSIDER_ID, created.id), false);
    assert.equal(await isVisibleInFirmLawyerFilter(CREATOR_ID, created.id), true);
});

test('personal calendar — all tagged associates see multi-lawyer meeting', async (t) => {
    const { start, end } = nextSundaySlot(2);
    const created = await createEvent(CREATOR_ID, {
        title: 'E2E visibility — multi associate',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [LAWYER_A, LAWYER_B, LAWYER_C],
    });

    t.after(async () => {
        await deleteEvent(CREATOR_ID, created.id);
    });

    for (const lawyerId of [LAWYER_A, LAWYER_B, LAWYER_C]) {
        assert.equal(
            await isVisibleInPersonalCalendar(lawyerId, created.id),
            true,
            `lawyer ${lawyerId} must see tagged event`
        );
    }
    assert.equal(await isVisibleInPersonalCalendar(CREATOR_ID, created.id), false);
    assert.equal(await isVisibleInPersonalCalendar(OUTSIDER_ID, created.id), false);
});

test('personal calendar — solo owner event visible only to owner', async (t) => {
    const { start, end } = nextSundaySlot(4);
    const created = await createEvent(CREATOR_ID, {
        title: 'E2E visibility — solo owner',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
    });

    t.after(async () => {
        await deleteEvent(CREATOR_ID, created.id);
    });

    assert.equal(await isVisibleInPersonalCalendar(CREATOR_ID, created.id), true);
    assert.equal(await isVisibleInPersonalCalendar(OUTSIDER_ID, created.id), false);
});

test('personal calendar — creator sees event when explicitly tagged as attendee', async (t) => {
    const { start, end } = nextSundaySlot(6);
    const created = await createEvent(CREATOR_ID, {
        title: 'E2E visibility — creator in managers list',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [CREATOR_ID, LAWYER_A],
    });

    t.after(async () => {
        await deleteEvent(CREATOR_ID, created.id);
    });

    assert.equal(await isVisibleInPersonalCalendar(CREATOR_ID, created.id), true);

    const { rows: junction } = await pool.query(
        'SELECT user_id FROM calendar_event_managers WHERE event_id = $1 ORDER BY user_id',
        [created.id]
    );
    assert.deepEqual(
        junction.map((r) => r.user_id).sort((a, b) => a - b),
        [CREATOR_ID, LAWYER_A].sort((a, b) => a - b)
    );
});

test('personal calendar — production regression: untagged creator does not see owned meeting', async () => {
    const { rows } = await pool.query(
        `SELECT ce.id, ce.owner_id
         FROM calendar_events ce
         WHERE ce.id = 1
           AND EXISTS (SELECT 1 FROM calendar_event_managers cem WHERE cem.event_id = ce.id)
           AND NOT EXISTS (
               SELECT 1 FROM calendar_event_managers cem
               WHERE cem.event_id = ce.id AND cem.user_id = ce.owner_id
           )`
    );
    if (!rows.length) return;

    const ev = rows[0];
    assert.equal(
        await isVisibleInPersonalCalendar(ev.owner_id, ev.id),
        false,
        'creator who is not tagged must not see event in personal calendar'
    );
});
