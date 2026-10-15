const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

test('native template lifecycle is scoped, reversible, CAS-bound and independent of existing packages',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `lifecycle-${randomUUID()}.invalid` });
    const base = '/api/signing-v2';
    const as = (call, token = f.token) => call.set('Authorization', `Bearer ${token}`);
    const ok = (reply, status = 200) => { assert.equal(reply.status, status, JSON.stringify(reply.body)); return reply.body; };
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(f.definition), 201).template;
    const imported = ok(await as(request(f.app).post(`${base}/templates/legacy/${legacy.id}/import`)).send({ locale: 'he', expectedVersion: legacy.version }), 201);
    const versionId = imported.versionId, templateId = imported.templateId;
    const list = async (archived = false, token) => ok(await as(request(f.app).get(`${base}/authoring/templates?archived=${archived}`), token)).templates;
    const head = async (archived = false) => (await list(archived)).find(v => v.id === versionId);
    const archive = (archived, expectedVersion, token) => as(request(f.app).post(`${base}/authoring/templates/${templateId}/archive`), token).send({ archived, expectedVersion });
    const original = ok(await as(request(f.app).get(`${base}/authoring/versions/${versionId}`))).version;
    const body = { name: 'Synthetic archive safety', templateVersionId: versionId,
        shared: { shared: { name: 'Synthetic office', email: 'office@example.invalid', channel: 'email' } },
        rows: [{ key: 'one', recipients: { first: { name: 'Synthetic client', email: 'client@example.invalid', channel: 'email' } } }] };
    const preview = ok(await as(request(f.app).post(`${base}/creation/preview`)).send(body));
    assert.equal(preview.valid, true, JSON.stringify(preview));
    const created = ok(await as(request(f.app).post(`${base}/creation`)).set('Idempotency-Key', randomUUID()).send({ ...body, previewHash: preview.previewHash }), 201);
    const pkg = (await f.pool.query('SELECT * FROM signing_packages WHERE submission_id=$1', [created.submissionId])).rows[0];
    const snapshot = async () => ({
        revision: (await f.pool.query('SELECT * FROM signing_package_revisions WHERE id=$1', [pkg.active_revision_id])).rows[0],
        tasks: (await f.pool.query('SELECT * FROM signing_tasks WHERE revision_id=$1 ORDER BY id', [pkg.active_revision_id])).rows,
        jobs: (await f.pool.query('SELECT * FROM signing_jobs WHERE owner_context_id=$1 ORDER BY id', [pkg.owner_context_id])).rows,
    });
    const before = await snapshot();
    let counter;
    await t.test('archive freezes the reviewed lifecycle version once without altering packages or definitions', async () => {
        const entry = await head(); counter = entry.lifecycleVersion;
        assert.equal(entry.canArchive, true); assert.equal(entry.sourceAvailable, true);
        const replies = await Promise.all([archive(true, counter), archive(true, counter)]);
        assert.deepEqual(replies.map(r => r.status).sort(), [200, 412]);
        counter = ok(replies.find(r => r.status === 200)).lifecycleVersion;
        assert.equal((await list()).some(v => v.id === versionId), false);
        const picker = ok(await as(request(f.app).get(`${base}/templates`)));
        assert.equal(picker.legacy.some(v => v.id === legacy.id), false);
        assert.equal(picker.templates.some(v => v.templateId === templateId), false);
        const retry = await as(request(f.app).post(`${base}/templates/legacy/${legacy.id}/import`)).send({ locale: 'he', expectedVersion: legacy.version });
        assert.equal(retry.status, 409); assert.equal(retry.body.code, 'TEMPLATE_ARCHIVED');
        assert.equal(ok(await as(request(f.app).get(`${base}/authoring/templates`))).importedOrigins.some(v => v.templateId === legacy.id), true);
        const archived = await head(true);
        assert.equal(archived.archived, true); assert.equal(archived.canEdit, false);
        assert.deepEqual(archived.definition, original.definition);
        assert.deepEqual(await snapshot(), before);
        assert.equal(ok(await as(request(f.app).get(`${base}/packages/${pkg.id}`))).package.id, pkg.id);
        for (const path of [`/authoring/versions/${versionId}`, `/authoring/versions/${versionId}/documents/${original.definition.documents[0].key}`]) {
            assert.equal((await as(request(f.app).get(`${base}${path}`))).status, 404, path);
        }
        assert.equal((await as(request(f.app).post(`${base}/creation/preview`)).send(body)).status, 404);
        assert.equal((await as(request(f.app).put(`${base}/authoring/drafts/${randomUUID()}`)).send({ expectedVersion: 0, templateId, baseVersionId: versionId, definition: original.definition })).status, 404);
        assert.deepEqual(ok(await archive(true, counter)), { archived: true, lifecycleVersion: counter });
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_events_v2 WHERE owner_context_id=$1 AND kind='template_archived'", [pkg.owner_context_id])).rows[0].n, 1);
    });
    await t.test('restore is explicit and concurrent retries cannot overwrite a newer action', async () => {
        const replies = await Promise.all([archive(false, counter), archive(false, counter)]);
        assert.deepEqual(replies.map(r => r.status).sort(), [200, 412]);
        const next = ok(replies.find(r => r.status === 200));
        assert.equal(next.archived, false);
        assert.equal((await archive(true, counter)).status, 412);
        counter = next.lifecycleVersion;
        assert.equal((await head()).lifecycleVersion, counter);
        assert.deepEqual(ok(await as(request(f.app).get(`${base}/authoring/versions/${versionId}`))).version, original);
        assert.equal(ok(await as(request(f.app).post(`${base}/creation/preview`)).send(body)).valid, true);
        assert.deepEqual(await snapshot(), before);
    });
    let draft;
    await t.test('saving a private draft invalidates an older archive confirmation and survives archive/restore', async () => {
        draft = ok(await as(request(f.app).put(`${base}/authoring/drafts/${randomUUID()}`)).send({ expectedVersion: 0, templateId, baseVersionId: versionId,
            definition: { ...original.definition, name: 'Private preserved work' } })).version;
        assert.equal((await archive(true, counter)).status, 412);
        counter = (await head()).lifecycleVersion;
        const saved = ok(await as(request(f.app).put(`${base}/authoring/drafts/${draft.id}`)).send({ expectedVersion: draft.editVersion,
            definition: { ...draft.definition, name: 'Latest private work' } })).version;
        assert.equal((await archive(true, counter)).status, 412);
        counter = (await head()).lifecycleVersion;
        counter = ok(await archive(true, counter)).lifecycleVersion;
        assert.equal((await as(request(f.app).put(`${base}/authoring/drafts/${draft.id}`)).send({ expectedVersion: saved.editVersion, definition: saved.definition })).status, 404);
        assert.equal((await as(request(f.app).post(`${base}/authoring/drafts/${draft.id}/publish`)).send({ expectedVersion: saved.editVersion, definitionHash: saved.definitionHash })).status, 404);
        counter = ok(await archive(false, counter)).lifecycleVersion;
        assert.deepEqual(ok(await as(request(f.app).get(`${base}/authoring/versions/${draft.id}`))).version, saved);
    });
    await t.test('manage controls archive independently of upload and respects assigned/deployment scope', async () => {
        const { makePermissions } = require('./helpers/pgTestHarness');
        const actor = async (actions, dataScope) => {
            const role = (await f.pool.query('INSERT INTO firm_staff_roles(name,permissions,is_active) VALUES($1,$2,TRUE) RETURNING id',
                [`Lifecycle ${randomUUID()}`, makePermissions({ signing: { visible: true, actions, dataScope } })])).rows[0];
            const user = (await f.pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Synthetic lifecycle',$1,'Lawyer','synthetic',$2) RETURNING userid",
                [`${randomUUID()}@example.invalid`, role.id])).rows[0];
            return jwt.sign({ userid: user.userid, role: 'Lawyer' }, process.env.JWT_SECRET);
        };
        const reader = await actor(['view', 'upload'], 'all_firm');
        assert.equal((await archive(true, counter, reader)).status, 403);
        assert.equal((await list(false, reader)).find(v => v.id === versionId).canArchive, false);
        const assigned = await actor(['view', 'manage'], 'assigned_only');
        assert.equal((await archive(true, counter, assigned)).status, 404);
        const manager = await actor(['view', 'manage'], 'all_firm');
        assert.equal((await as(request(f.app).post(`${base}/authoring/drafts/${draft.id}/publish`), manager).send({})).status, 403);
        counter = ok(await archive(true, counter, manager)).lifecycleVersion;
        counter = ok(await archive(false, counter, manager)).lifecycleVersion;
        const deployment = process.env.SIGNING_DEPLOYMENT_KEY;
        process.env.SIGNING_DEPLOYMENT_KEY = `foreign-${randomUUID()}.invalid`;
        try { assert.equal((await archive(true, counter)).status, 404); }
        finally { process.env.SIGNING_DEPLOYMENT_KEY = deployment; }
    });
    await t.test('an archived legacy source cannot reappear as an available native template or be restored indirectly', async () => {
        const blocker = await f.pool.connect();
        let creation;
        try {
            await blocker.query('BEGIN');
            await blocker.query('UPDATE signing_templates SET archived=true WHERE id=$1', [legacy.id]);
            creation = as(request(f.app).post(`${base}/creation`)).set('Idempotency-Key', randomUUID())
                .send({ ...body, previewHash: preview.previewHash }).then(reply => reply);
            let blocked = false;
            for (let attempt = 0; attempt < 100; attempt += 1) {
                const waiting = await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
                    AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0
                    AND query LIKE '%id::text=$1 AND NOT archived%FOR SHARE%'`);
                if (waiting.rowCount) { blocked = true; break; }
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.equal(blocked, true, 'creation must wait for the legacy source archive transaction');
            await blocker.query('COMMIT');
            assert.equal((await creation).status, 404, 'archive wins before creation commits, so no new send is created');
        } finally { await blocker.query('ROLLBACK'); blocker.release(); if (creation) await creation; }

        assert.equal((await list()).some(v => v.templateId === templateId), false);
        const unavailable = await head(true);
        assert.equal(unavailable.sourceAvailable, false); assert.equal(unavailable.archived, false); assert.equal(unavailable.canEdit, false);
        assert.equal((await as(request(f.app).get(`${base}/authoring/versions/${versionId}`))).status, 404);
        assert.equal((await as(request(f.app).post(`${base}/creation/preview`)).send(body)).status, 404);
        counter = ok(await archive(true, counter)).lifecycleVersion;
        assert.equal((await archive(false, counter)).status, 409);
        assert.deepEqual(await snapshot(), before);
        assert.equal(ok(await as(request(f.app).get(`${base}/packages/${pkg.id}`))).package.id, pkg.id);
        assert.equal(f.deliveries.length, 0); assert.equal(f.otp.length, 0);
    });
});
