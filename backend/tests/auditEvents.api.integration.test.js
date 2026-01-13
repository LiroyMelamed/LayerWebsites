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

function makeToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function hasColumn({ table, column }) {
    const res = await pool.query(
        `select 1
         from information_schema.columns
         where table_name = $1
           and column_name = $2
         limit 1`,
        [table, column]
    );
    return res.rows.length > 0;
}

async function createUser({ prefix, role }) {
    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`${prefix}-${role}`, `${prefix}-${role}@example.com`, `050${String(Date.now()).slice(-7)}`, null, role, `${prefix}-co`]
    );
    return res.rows[0].userid;
}

async function createSigningFile({ prefix, lawyerId, clientId }) {
    const supportsPresentedHash = await hasColumn({ table: 'signingfiles', column: 'presentedpdfsha256' });
    const presentedPdfSha256 = supportsPresentedHash ? '0'.repeat(64) : null;

    const res = await pool.query(
        `insert into signingfiles
         (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat${supportsPresentedHash ? ', presentedpdfsha256' : ''})
         values ($1,$2,$3,$4,$5,$5,'pending',$6,$7${supportsPresentedHash ? ', $8' : ''})
         returning signingfileid`,
        [
            null,
            lawyerId,
            clientId,
            `${prefix}-doc.pdf`,
            `${prefix}/filekey.pdf`,
            null,
            null,
            ...(supportsPresentedHash ? [presentedPdfSha256] : []),
        ]
    );

    return res.rows[0].signingfileid;
}

async function insertAuditEvent({ signingFileId, actorUserId, actorType, eventType, success = true, occurredAtUtc = null }) {
    const eventId = randomUUID();

    if (occurredAtUtc) {
        await pool.query(
            `insert into audit_events (eventid, occurred_at_utc, event_type, signingfileid, actor_userid, actor_type, success, request_id, ip, user_agent, metadata)
             values ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
            [
                eventId,
                occurredAtUtc,
                eventType,
                signingFileId,
                actorUserId,
                actorType,
                success,
                randomUUID(),
                '1.2.3.4',
                'Chrome/Test',
                JSON.stringify({ safe: true, otp_hash: 'should_not_leak' }),
            ]
        );
        return eventId;
    }

    await pool.query(
        `insert into audit_events (eventid, event_type, signingfileid, actor_userid, actor_type, success, request_id, ip, user_agent, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
            eventId,
            eventType,
            signingFileId,
            actorUserId,
            actorType,
            success,
            randomUUID(),
            '1.2.3.4',
            'Chrome/Test',
            JSON.stringify({ safe: true, otp_hash: 'should_not_leak' }),
        ]
    );

    return eventId;
}

test('GET /api/audit-events returns 401 without auth', async () => {
    resetStore();
    const app = require('../app');

    const res = await request(app).get('/api/audit-events');

    assert.equal(res.status, 401);
    assert.equal(res.body?.errorCode, 'UNAUTHORIZED');
});

test('GET /api/audit-events returns 403 for User role', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-audit-events-user-${Date.now()}`;
    const userId = await createUser({ prefix, role: 'User' });

    const res = await request(app)
        .get('/api/audit-events')
        .set('Authorization', `Bearer ${makeToken({ userid: userId, role: 'User' })}`);

    assert.equal(res.status, 403);
    assert.equal(res.body?.code, 'FORBIDDEN');
    assert.equal(res.body?.errorCode, 'FORBIDDEN');
});

test('GET /api/audit-events supports filtering + cursor pagination for Admin', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-audit-events-admin-${Date.now()}`;
    const adminId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId: adminId, clientId });

    // Insert two deterministic timestamps so ordering is predictable.
    await insertAuditEvent({
        signingFileId,
        actorUserId: clientId,
        actorType: 'CLIENT',
        eventType: 'PDF_VIEWED',
        occurredAtUtc: '2026-01-13T10:00:00Z',
    });
    await insertAuditEvent({
        signingFileId,
        actorUserId: clientId,
        actorType: 'CLIENT',
        eventType: 'SIGN_SUCCESS',
        occurredAtUtc: '2026-01-13T11:00:00Z',
    });

    const first = await request(app)
        .get(`/api/audit-events?signingFileId=${signingFileId}&limit=1`)
        .set('Authorization', `Bearer ${makeToken({ userid: adminId, role: 'Admin' })}`);

    assert.equal(first.status, 200);
    assert.equal(Array.isArray(first.body?.items), true);
    assert.equal(first.body.items.length, 1);
    assert.equal(first.body.items[0].signingFileId, signingFileId);
    assert.equal(typeof first.body.items[0].id, 'string');
    assert.equal(first.body.items[0].eventType, 'SIGN_SUCCESS');
    assert.equal(typeof first.body.nextCursor, 'string');

    // Ensure secret-ish metadata key is redacted.
    assert.equal(first.body.items[0]?.details?.otp_hash, '[REDACTED]');

    const second = await request(app)
        .get(`/api/audit-events?signingFileId=${signingFileId}&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
        .set('Authorization', `Bearer ${makeToken({ userid: adminId, role: 'Admin' })}`);

    assert.equal(second.status, 200);
    assert.equal(second.body.items.length, 1);
    assert.equal(second.body.items[0].eventType, 'PDF_VIEWED');
});

test('GET /api/audit-events restricts Lawyer role to own signing files', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-audit-events-lawyer-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Lawyer' });
    const otherLawyerId = await createUser({ prefix, role: 'Lawyer' });
    const clientId = await createUser({ prefix, role: 'User' });

    const mySigningFileId = await createSigningFile({ prefix: `${prefix}-mine`, lawyerId, clientId });
    const otherSigningFileId = await createSigningFile({ prefix: `${prefix}-other`, lawyerId: otherLawyerId, clientId });

    await insertAuditEvent({
        signingFileId: mySigningFileId,
        actorUserId: clientId,
        actorType: 'CLIENT',
        eventType: 'SIGN_ATTEMPT',
        occurredAtUtc: '2026-01-13T12:00:00Z',
    });

    await insertAuditEvent({
        signingFileId: otherSigningFileId,
        actorUserId: clientId,
        actorType: 'CLIENT',
        eventType: 'SIGN_ATTEMPT',
        occurredAtUtc: '2026-01-13T12:05:00Z',
    });

    const res = await request(app)
        .get('/api/audit-events?eventType=SIGN_ATTEMPT&limit=50')
        .set('Authorization', `Bearer ${makeToken({ userid: lawyerId, role: 'Lawyer' })}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.items.some((i) => i.signingFileId === otherSigningFileId), false);
    assert.equal(res.body.items.some((i) => i.signingFileId === mySigningFileId), true);
});
