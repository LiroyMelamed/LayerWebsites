const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const jobs = require('../services/signingV2/jobs');
const { createErrorAlerts, requestErrorReporter, buildAlertEmail } = require('../services/signingV2/errorAlerts');
const { createAppError } = require('../utils/appError');

test('signing failures atomically queue deduplicated platform-admin email summaries, preserve unknown outcomes and exclude sensitive input',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
    const pool = require('../config/db');
    const admins = [];
    t.after(async () => {
        await pool.query('UPDATE platform_admins SET is_active=FALSE WHERE user_id=ANY($1::integer[])', [admins]);
        await pool.end();
    });
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/2026-10-08_01_signing_error_alerts.sql'), 'utf8');
    await pool.query(migration); await pool.query(migration);
    const f = await databaseFixture(pool, { documentCount: 1 });
    const submission = await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const suffix = randomUUID();
    const emails = [`admin-a-${suffix}@example.invalid`, `admin-b-${suffix}@example.invalid`, `inactive-${suffix}@example.invalid`];
    for (const [index, email] of emails.entries()) {
        const user = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic platform admin',$1,'Admin','synthetic-only') RETURNING userid", [email])).rows[0];
        await pool.query('INSERT INTO platform_admins(user_id,is_active) VALUES($1,$2)', [user.userid, index !== 2]);
        admins.push(user.userid);
    }
    const claim = () => jobs.claim(pool, { workerId: 'alert-qa', contextIds: [f.contextId], kinds: ['prepare_document'], limit: 1 });
    let [lease] = await claim();
    await jobs.failed(pool, lease, { code: 'PDF_PREPARATION_FAILED' });
    await pool.query('UPDATE signing_jobs SET available_at=clock_timestamp() WHERE id=$1', [lease.id]);
    [lease] = await claim(); await jobs.failed(pool, lease, { code: 'PDF_PREPARATION_FAILED' });
    const retry = (await pool.query('SELECT * FROM signing_error_alerts WHERE owner_context_id=$1', [f.contextId])).rows;
    assert.equal(retry.length, 1); assert.equal(retry[0].occurrences, 2);
    await pool.query('UPDATE signing_jobs SET available_at=clock_timestamp() WHERE id=$1', [lease.id]);
    [lease] = await claim(); await jobs.failed(pool, lease, { code: 'PDF_PREPARATION_FAILED', retryable: false });
    await pool.query("UPDATE signing_deliveries SET state='failed',error_code='PROVIDER_REJECTED' WHERE owner_context_id=$1", [f.contextId]);
    await pool.query("UPDATE signing_deliveries SET state='failed',error_code='PROVIDER_REJECTED' WHERE owner_context_id=$1", [f.contextId]);
    assert.equal((await pool.query('SELECT count(*)::integer n FROM signing_error_alerts WHERE owner_context_id=$1', [f.contextId])).rows[0].n, 3);
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        await db.query("UPDATE signing_jobs SET state='needs_attention',error_code='ROLLED_BACK_ERROR' WHERE id=$1", [lease.id]);
        await db.query('ROLLBACK');
    } finally { db.release(); }
    assert.equal((await pool.query("SELECT count(*)::integer n FROM signing_error_alerts WHERE owner_context_id=$1 AND error_code='ROLLED_BACK_ERROR'", [f.contextId])).rows[0].n, 0);
    const active = (await pool.query(`SELECT DISTINCT lower(trim(u.email)) AS email FROM platform_admins a JOIN users u ON u.userid=a.user_id
        WHERE a.is_active=TRUE AND u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`)).rows.map(row => row.email);
    const messages = [], errors = [];
    const config = { pool, origin: 'https://qa.example.invalid', contextIds: [f.contextId], delaySeconds: 0,
        log: { error: (...args) => errors.push(args.join(' ')) }, sendEmail: async message => { messages.push(message); return { ok: true, messageId: `fake-${messages.length}` }; } };
    const alerts = createErrorAlerts(config), other = createErrorAlerts(config);
    await Promise.all([alerts.prepare(), other.prepare()]);
    await Promise.all([alerts.flush(), other.flush()]);
    while (await alerts.flush()) { /* bounded pending summaries for synthetic existing admins */ }
    assert.deepEqual(messages.map(item => item.toEmail).sort(), active.sort());
    assert.equal(messages.some(item => item.toEmail === emails[2]), false);
    assert.equal(messages.every(item => item.htmlBody.includes('PDF_PREPARATION_FAILED') && item.htmlBody.includes('PROVIDER_REJECTED')), true);
    assert.equal(messages.some(item => item.htmlBody.includes('synthetic-shared@example.invalid')), false);
    assert.equal(messages.some(item => item.htmlBody.includes('SYNTHETIC VOLUME')), false);
    assert.equal(messages.every(item => item.htmlBody.includes('https://qa.example.invalid/AdminStack/SigningManagerScreen?panel=runs')), true);
    assert.equal(messages.every(item => item.htmlBody.includes(`submission=${submission.submissionId}`)), true);
    assert.equal(await alerts.flush(), 0);
    assert.deepEqual(errors, []);

    // Exercise one already-prepared summary repeatedly: configuration failure is safe
    // to retry; an ambiguous provider response is quarantined; QA never says sent.
    const row = (await pool.query('SELECT * FROM signing_error_emails WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1', [admins[0]])).rows[0];
    const reset = () => pool.query("UPDATE signing_error_emails SET state='pending',available_at=clock_timestamp(),attempts=0 WHERE id=$1", [row.id]);
    await reset();
    const noTransport = createErrorAlerts({ ...config, sendEmail: async () => ({ ok: false, errorCode: 'SMTP_NOT_CONFIGURED' }) });
    assert.equal(await noTransport.flush(), 1);
    assert.equal((await pool.query('SELECT state FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].state, 'pending');
    await pool.query('UPDATE signing_error_emails SET available_at=clock_timestamp() WHERE id=$1', [row.id]);
    assert.equal(await alerts.flush(), 1);
    await reset();
    const unknown = createErrorAlerts({ ...config, sendEmail: async () => { throw new Error('provider may have accepted'); } });
    assert.equal(await unknown.flush(), 1); assert.equal(await unknown.flush(), 0);
    assert.equal((await pool.query('SELECT state FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].state, 'uncertain');
    await reset();
    const noop = createErrorAlerts({ ...config, sendEmail: async () => ({ ok: true, simulated: true, mode: 'qa-noop' }) });
    assert.equal(await noop.flush(), 1);
    assert.equal((await pool.query('SELECT state,accepted_at FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].state, 'simulated');
    assert.equal((await pool.query('SELECT accepted_at FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].accepted_at, null);
    await pool.query("UPDATE signing_error_emails SET state='dispatching',lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [row.id]);
    assert.equal(await alerts.flush(), 0);
    assert.equal((await pool.query('SELECT state FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].state, 'uncertain');
    await reset();
    await pool.query('UPDATE platform_admins SET is_active=FALSE WHERE user_id=$1', [admins[0]]);
    const before = messages.length; assert.equal(await alerts.flush(), 1); assert.equal(messages.length, before);
    assert.equal((await pool.query('SELECT state FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].state, 'cancelled');
    await pool.query('DELETE FROM users WHERE userid=$1', [admins[0]]);
    assert.equal((await pool.query('SELECT recipient_user_id FROM signing_error_emails WHERE id=$1', [row.id])).rows[0].recipient_user_id, null,
        'historical alert receipts do not prevent removing an administrator');

    const req = { method: 'POST', route: { path: '/sessions/:id/challenge' },
        originalUrl: '/sessions/PRIVATE_TOKEN?otp=123456', body: { name: 'PRIVATE_PERSON', otp: '123456' } };
    const report = requestErrorReporter(pool, `synthetic-${suffix}`);
    const next = error => assert.ok(error);
    await report(createAppError('INVALID_CODE', 422), req, null, next);
    await report(Object.assign(new Error('expired'), { name: 'TokenExpiredError' }), req, null, next);
    assert.equal((await pool.query('SELECT count(*)::integer n FROM signing_error_alerts WHERE phase LIKE $1', [`synthetic-${suffix}%`])).rows[0].n, 0);
    await report(createAppError('OTP_DELIVERY_FAILED', 502), req, null, next);
    await report(createAppError('OTP_DELIVERY_FAILED', 502), req, null, next);
    const events = (await pool.query('SELECT * FROM signing_error_alerts WHERE phase LIKE $1', [`synthetic-${suffix}%`])).rows;
    assert.equal(events.length, 1); assert.equal(events[0].occurrences, 2);
    assert.equal(/PRIVATE|123456/.test(JSON.stringify(events)), false);
    for (const locale of ['he', 'ar', 'en']) {
        const email = buildAlertEmail(events, { origin: 'https://qa.example.invalid', locale });
        assert.ok(email.htmlBody.includes(`lang="${locale}"`));
        assert.ok(email.htmlBody.includes(`dir="${locale === 'en' ? 'ltr' : 'rtl'}"`));
    }
    const express = require('express');
    const request = require('supertest');
    const router = require('../routes/signingV2PublicRoutes');
    process.env.SIGNING_V2_ENABLED = 'true';
    router.useService({ describe: async () => { throw createAppError('SYNTHETIC_PUBLIC_FAILURE', 503); } });
    t.after(() => { router.useService(null); delete process.env.SIGNING_V2_ENABLED; });
    const app = express(); app.use('/public', router); app.use(require('../middlewares/errorHandler'));
    const response = await request(app).get('/public/package').set('X-Signing-Grant', 'PRIVATE_GRANT_NEVER_LOGGED');
    assert.equal(response.status, 503);
    const captured = (await pool.query("SELECT * FROM signing_error_alerts WHERE phase='signer:GET:/package' AND error_code='SYNTHETIC_PUBLIC_FAILURE' ORDER BY first_seen_at DESC LIMIT 1")).rows[0];
    assert.ok(captured);
    assert.equal(JSON.stringify(captured).includes('PRIVATE_GRANT'), false);
});
