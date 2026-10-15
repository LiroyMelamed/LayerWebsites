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

const CREATOR_ID = 1017;
const LAWYER_A = 1088;
const LAWYER_B = 1092;

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

async function createEvent(body) {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${makeToken({ userid: CREATOR_ID })}`)
        .send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.event;
}

async function updateEvent(eventId, body) {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .put(`/api/calendar/${eventId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: CREATOR_ID })}`)
        .send(body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.event;
}

async function deleteEvent(eventId) {
    resetStore();
    const app = require('../app');
    await request(app)
        .delete(`/api/calendar/${eventId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: CREATOR_ID })}`);
}

async function junctionUserIds(eventId) {
    const { rows } = await pool.query(
        'SELECT user_id FROM calendar_event_managers WHERE event_id = $1 ORDER BY user_id',
        [eventId]
    );
    return rows.map((r) => r.user_id);
}

test('update with only manager_user_id replaces junction rows', async (t) => {
    const { start, end } = nextSundaySlot(0);
    const created = await createEvent({
        title: 'E2E junction — initial multi',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [LAWYER_A, LAWYER_B],
    });

    t.after(async () => { await deleteEvent(created.id); });

    assert.deepEqual(await junctionUserIds(created.id), [LAWYER_A, LAWYER_B].sort((a, b) => a - b));

    await updateEvent(created.id, { manager_user_id: LAWYER_A });

    assert.deepEqual(await junctionUserIds(created.id), [LAWYER_A]);
});

test('update with manager_user_id null clears junction rows', async (t) => {
    const { start, end } = nextSundaySlot(1);
    const created = await createEvent({
        title: 'E2E junction — clear via null',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [LAWYER_A],
    });

    t.after(async () => { await deleteEvent(created.id); });

    await updateEvent(created.id, { manager_user_id: null });

    assert.deepEqual(await junctionUserIds(created.id), []);
});

test('update without manager fields leaves junction unchanged', async (t) => {
    const { start, end } = nextSundaySlot(2);
    const created = await createEvent({
        title: 'E2E junction — title only update',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [LAWYER_A, LAWYER_B],
    });

    t.after(async () => { await deleteEvent(created.id); });

    await updateEvent(created.id, { title: 'E2E junction — renamed' });

    assert.deepEqual(await junctionUserIds(created.id), [LAWYER_A, LAWYER_B].sort((a, b) => a - b));
});

test('update with manager_user_ids empty array clears junction rows', async (t) => {
    const { start, end } = nextSundaySlot(3);
    const created = await createEvent({
        title: 'E2E junction — clear via array',
        event_type: 'appointment',
        start_time: start,
        end_time: end,
        manager_user_ids: [LAWYER_A, LAWYER_B],
    });

    t.after(async () => { await deleteEvent(created.id); });

    await updateEvent(created.id, { manager_user_ids: [] });

    assert.deepEqual(await junctionUserIds(created.id), []);
});
