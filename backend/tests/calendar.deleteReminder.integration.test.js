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

function makeToken({ userid, role = 'Admin' } = {}) {
    return jwt.sign(
        { userid, role, phoneNumber: '0500000000' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function futureReminderSlot() {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
}

async function createReminderEvent() {
    resetStore();
    const app = require('../app');
    const { start, end } = futureReminderSlot();
    const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${makeToken({ userid: CREATOR_ID })}`)
        .send({
            title: 'E2E delete cascade reminder',
            event_type: 'reminder',
            start_time: start,
            end_time: end,
            reminder_to_email: 'calendar-delete-test@example.com',
            reminder_client_name: 'בדיקת מחיקה',
        });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.event;
}

async function deleteCalendarEvent(eventId) {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .delete(`/api/calendar/${eventId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: CREATOR_ID })}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
}

test('delete calendar event cancels linked PENDING reminder instead of cascade delete', async (t) => {
    const { rows: schema } = await pool.query(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'scheduled_email_reminders'
              AND column_name = 'calendar_event_id'
        ) AS ok`
    );
    if (!schema[0]?.ok) {
        t.skip('calendar_event_id column not migrated in this environment');
        return;
    }

    const created = await createReminderEvent();
    assert.ok(created.id, 'calendar event should be created');

    const { rows: before } = await pool.query(
        'SELECT id, status, calendar_event_id FROM scheduled_email_reminders WHERE calendar_event_id = $1',
        [created.id]
    );
    assert.equal(before.length, 1, 'linked reminder should exist');
    const reminderId = before[0].id;

    t.after(async () => {
        await pool.query('DELETE FROM scheduled_email_reminders WHERE id = $1', [reminderId]);
    });

    await deleteCalendarEvent(created.id);

    const { rows: eventRows } = await pool.query(
        'SELECT 1 FROM calendar_events WHERE id = $1',
        [created.id]
    );
    assert.equal(eventRows.length, 0, 'calendar event should be deleted');

    const { rows: reminderRows } = await pool.query(
        'SELECT status, calendar_event_id, cancelled_at FROM scheduled_email_reminders WHERE id = $1',
        [reminderId]
    );
    assert.equal(reminderRows.length, 1, 'reminder row must be preserved');
    assert.equal(reminderRows[0].status, 'CANCELLED');
    assert.equal(reminderRows[0].calendar_event_id, null);
    assert.ok(reminderRows[0].cancelled_at, 'cancelled_at should be set');
});
