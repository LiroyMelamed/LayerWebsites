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
const { randomUUID } = require('node:crypto');

const REQUIRED_MESSAGE =
    'לא ניתן למחוק משתמש משום שיש לו נתונים משפטיים. ניתן לפנות למנהל המערכת לבירור.';

function makeToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function createUser({ role = 'User' } = {}) {
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`test_${unique}`, `test_${unique}@example.com`, `050${unique.slice(-7)}`, null, role, `co_${unique}`]
    );
    return res.rows[0].userid;
}

async function insertAuditEvent({ actorUserId }) {
    const eventId = randomUUID();
    await pool.query(
        `insert into audit_events (eventid, event_type, actor_userid, success)
         values ($1, $2, $3, true)`,
        [eventId, 'TEST_LEGAL_DATA', actorUserId]
    );
    return eventId;
}

test('admin delete customer is blocked when customer has audit_events', async () => {
    resetStore();
    const app = require('../app');

    const actingAdminId = await createUser({ role: 'Admin' });
    const targetUserId = await createUser({ role: 'User' });
    const auditEventId = await insertAuditEvent({ actorUserId: targetUserId });

    const res = await request(app)
        .delete(`/api/Customers/DeleteCustomer/${targetUserId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: actingAdminId, role: 'Admin' })}`);

    assert.equal(res.status, 409);
    assert.equal(res.body?.errorCode, 'USER_HAS_LEGAL_DATA');
    assert.equal(res.body?.message, REQUIRED_MESSAGE);

    const userRes = await pool.query('select 1 from users where userid = $1', [targetUserId]);
    assert.equal(userRes.rowCount, 1);

    const auditRes = await pool.query('select actor_userid from audit_events where eventid = $1', [auditEventId]);
    assert.equal(auditRes.rowCount, 1);
    assert.equal(auditRes.rows[0].actor_userid, targetUserId);
});

test('admin delete admin is blocked when target admin has audit_events', async () => {
    resetStore();
    const app = require('../app');

    const actingAdminId = await createUser({ role: 'Admin' });
    const targetAdminId = await createUser({ role: 'Admin' });
    const auditEventId = await insertAuditEvent({ actorUserId: targetAdminId });

    const res = await request(app)
        .delete(`/api/Admins/DeleteAdmin/${targetAdminId}`)
        .set('Authorization', `Bearer ${makeToken({ userid: actingAdminId, role: 'Admin' })}`);

    assert.equal(res.status, 409);
    assert.equal(res.body?.errorCode, 'USER_HAS_LEGAL_DATA');
    assert.equal(res.body?.message, REQUIRED_MESSAGE);

    const userRes = await pool.query('select 1 from users where userid = $1', [targetAdminId]);
    assert.equal(userRes.rowCount, 1);

    const auditRes = await pool.query('select actor_userid from audit_events where eventid = $1', [auditEventId]);
    assert.equal(auditRes.rowCount, 1);
    assert.equal(auditRes.rows[0].actor_userid, targetAdminId);
});

test('self delete is blocked when user has audit_events', async () => {
    resetStore();
    const app = require('../app');

    const userId = await createUser({ role: 'User' });
    const auditEventId = await insertAuditEvent({ actorUserId: userId });

    const res = await request(app)
        .delete('/api/Customers/DeleteMyAccount')
        .set('Authorization', `Bearer ${makeToken({ userid: userId, role: 'User' })}`);

    assert.equal(res.status, 409);
    assert.equal(res.body?.errorCode, 'USER_HAS_LEGAL_DATA');
    assert.equal(res.body?.message, REQUIRED_MESSAGE);

    const userRes = await pool.query('select 1 from users where userid = $1', [userId]);
    assert.equal(userRes.rowCount, 1);

    const auditRes = await pool.query('select actor_userid from audit_events where eventid = $1', [auditEventId]);
    assert.equal(auditRes.rowCount, 1);
    assert.equal(auditRes.rows[0].actor_userid, userId);
});
