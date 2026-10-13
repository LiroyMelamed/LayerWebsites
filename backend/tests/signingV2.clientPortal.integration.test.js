const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { createGrantService, loadPublicGrant } = require('../services/signingV2/grants');
const { createClientPortalService } = require('../services/signingV2/clientPortal');
const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
const { runWithTenant } = require('../lib/tenant/tenantContext');

// Synthetic state transitions below exercise access boundaries, not signing/PDF
// acceptance. No renderer, worker, storage transport, OTP or provider is invoked.
test('authenticated customer portal only indexes and opens existing exact-person live grants',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const request = require('supertest'), jwt = require('jsonwebtoken');
    const key = Buffer.alloc(32, 21);
    const grants = createGrantService({ encryptionKey: key });
    const f = await databaseFixture(pool, { packageCount: 3, documentCount: 1, configure: ({ definition, packages }) => {
        definition.stages.push({ key: 'later', label: 'Later', after: 'employee' });
        definition.roles.push({ key: 'later', label: 'Same person later', capacity: 'personal', min: 1, max: 1, stage: 1 });
        definition.signingRules.push({ type: 'specific', roles: [{ key: 'later', occurrence: 0 }] });
        definition.documents[0].fields.push({ id: 'laterSignature', type: 'signature', roleKey: 'later', occurrence: 0,
            pageNum: 1, x: 30, y: 200, width: 200, height: 60, required: true });
        for (const item of packages) item.roles.later = item.roles.employee;
        return definition;
    } });
    await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    await pool.query("UPDATE signing_package_revisions SET workflow_state='active' WHERE owner_context_id=$1", [f.contextId]);
    await pool.query("UPDATE signing_documents SET state='ready',prepared_artifact_id=source_artifact_id WHERE owner_context_id=$1", [f.contextId]);
    await pool.query(`UPDATE signing_tasks t SET state=CASE WHEN stage=0 THEN 'ready' ELSE 'blocked' END,stage_artifact_id=d.source_artifact_id
        FROM signing_documents d WHERE t.owner_context_id=$1 AND d.id=t.document_id`, [f.contextId]);
    const revisions = (await pool.query(`SELECT r.*,pk.external_key FROM signing_package_revisions r JOIN signing_packages pk ON pk.id=r.package_id
        WHERE r.owner_context_id=$1 ORDER BY pk.external_key`, [f.contextId])).rows;
    for (const revision of revisions) {
        const docs = (await pool.query('SELECT * FROM signing_documents WHERE revision_id=$1', [revision.id])).rows;
        await grants.issueRevisionGrants(pool, revision, docs);
    }
    const users = [];
    for (let index = 0; index < 2; index += 1) users.push((await pool.query(`INSERT INTO users(name,email,role,passwordhash)
        VALUES('Synthetic same customer name',$1,'User','synthetic-only') RETURNING userid`, [`${randomUUID()}@example.invalid`])).rows[0].userid);
    const personIds = f.input.packages.map(item => item.roles.employee[0].personId);
    for (let index = 0; index < 2; index += 1) await pool.query('UPDATE signing_people SET linked_userid=$2 WHERE id=$1', [personIds[index], users[index]]);
    const deploymentKey = (await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1', [f.contextId])).rows[0].deployment_key;
    const env = { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: deploymentKey,
        SIGNING_V2_GRANT_KEY: key.toString('base64') };
    const portal = createClientPortalService({ pool, env });
    const req = { user: { UserId: users[0], Role: 'User' }, firmTenantId: null };
    const ownGrant = (await pool.query('SELECT * FROM signing_public_grants WHERE owner_context_id=$1 AND person_id=$2', [f.contextId, personIds[0]])).rows[0];
    const ownToken = grants.tokenForDelivery(ownGrant);
    const ownDocument = (await pool.query('SELECT * FROM signing_documents WHERE revision_id=$1', [revisions[0].id])).rows[0];
    const tasks = (await pool.query('SELECT * FROM signing_tasks WHERE revision_id=$1 ORDER BY stage', [revisions[0].id])).rows;
    const publicSigning = createPublicSigningService({ pool, storage: {}, otpKey: key });
    const counts = async () => (await pool.query(`SELECT
        (SELECT count(*) FROM signing_public_grants WHERE owner_context_id=$1) AS grants,
        (SELECT count(*) FROM signing_sessions_v2 WHERE owner_context_id=$1) AS sessions,
        (SELECT count(*) FROM signing_actions WHERE owner_context_id=$1) AS actions,
        (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs,
        (SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1) AS deliveries,
        (SELECT count(*) FROM signing_otp_challenges_v2 WHERE owner_context_id=$1) AS challenges`, [f.contextId])).rows[0];

    await t.test('list exposes metadata only, exact linked person, current tasks and no mutation', async () => {
        const before = await counts();
        const list = await portal.list(req);
        assert.equal(list.enabled, true); assert.equal(list.documents.length, 1);
        const doc = list.documents[0];
        assert.equal(doc.DocumentId, ownDocument.id); assert.equal(doc.GrantId, ownGrant.id);
        assert.equal(doc.PersonalStatus, 'pending'); assert.equal(doc.CanSignNow, true);
        assert.equal(doc.CanDownload, true); assert.equal(doc.IsFinal, false); assert.equal(doc.PersonalSignedAt, null);
        assert.equal(doc.CaseId, null); assert.equal(doc.CaseName, null);
        assert.deepEqual(Object.keys(doc).sort(), ['DocumentId', 'GrantId', 'PackageId', 'FileName', 'CaseId', 'CaseName', 'CreatedAt',
            'PersonalStatus', 'CanSignNow', 'PersonalSignedAt', 'CanDownload', 'IsFinal'].sort());
        const json = JSON.stringify(list);
        assert.ok(!json.includes(ownToken)); assert.ok(!json.includes(ownGrant.token_hash));
        assert.doesNotMatch(json, /encrypted_token|allowed_task_ids|evidence|contact_endpoints|identity_snapshot/);
        const opened = await portal.open(req, doc.DocumentId, doc.GrantId);
        assert.deepEqual(opened, { url: `/ViewSignedDocument/Sign#${ownToken}` });
        assert.deepEqual(await counts(), before, 'reads and deliberate open do not create grants, sessions, OTP, jobs or deliveries');
        const foreignReq = { ...req, user: { UserId: users[1], Role: 'User' } };
        const foreign = await portal.list(foreignReq);
        assert.equal(foreign.documents.length, 1); assert.notEqual(foreign.documents[0].DocumentId, doc.DocumentId);
        await assert.rejects(portal.open(foreignReq, doc.DocumentId, doc.GrantId), { errorCode: 'NOT_FOUND' });
        await assert.rejects(portal.open(req, foreign.documents[0].DocumentId, doc.GrantId), { errorCode: 'NOT_FOUND' });
        await assert.rejects(portal.open(req, doc.DocumentId, foreign.documents[0].GrantId), { errorCode: 'NOT_FOUND' });
        // Third person deliberately shares the fixture delivery endpoint but has no linked_userid.
        assert.equal((await pool.query('SELECT linked_userid FROM signing_people WHERE id=$1', [personIds[2]])).rows[0].linked_userid, null);
    });

    await t.test('ready task without its ready PDF is waiting and a final id alone is not completion', async () => {
        const failedArtifact = randomUUID(), pendingArtifact = randomUUID();
        await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,state)
            VALUES($1,$3,'stage',$4,'failed'),($2,$3,'stage',$5,'pending')`,
        [failedArtifact, pendingArtifact, f.contextId, 'b'.repeat(64), 'c'.repeat(64)]);
        try {
            for (const artifactId of [null, failedArtifact, pendingArtifact]) {
                await pool.query('UPDATE signing_tasks SET stage_artifact_id=$2 WHERE id=$1', [tasks[0].id, artifactId]);
                const doc = (await portal.list(req)).documents[0];
                assert.equal(doc.CanSignNow, false); assert.equal(doc.PersonalStatus, 'waiting');
                await assert.rejects(publicSigning.createSession(ownToken, { taskIds: [tasks[0].id], consentVersion: CONSENT_VERSION }),
                    { errorCode: 'NOT_YOUR_TURN' });
            }
            await pool.query("UPDATE signing_documents SET final_artifact_id=$2,state='final' WHERE id=$1", [ownDocument.id, failedArtifact]);
            let doc = (await portal.list(req)).documents[0];
            assert.equal(doc.IsFinal, false); assert.equal(doc.CanDownload, false);
            await pool.query("UPDATE signing_documents SET final_artifact_id=source_artifact_id,state='ready' WHERE id=$1", [ownDocument.id]);
            assert.equal((await portal.list(req)).documents[0].IsFinal, false, 'ready final artifact without final document state is not completion');
            await pool.query("UPDATE signing_documents SET state='final' WHERE id=$1", [ownDocument.id]);
            assert.equal((await portal.list(req)).documents[0].IsFinal, true);
        } finally {
            await pool.query('UPDATE signing_tasks SET stage_artifact_id=$2 WHERE id=$1', [tasks[0].id, tasks[0].stage_artifact_id]);
            await pool.query("UPDATE signing_documents SET state='ready',final_artifact_id=NULL WHERE id=$1", [ownDocument.id]);
        }
        assert.equal((await portal.list(req)).documents[0].CanSignNow, true);
    });

    await t.test('authenticated open keeps public consent and unverified-session safeguards', async () => {
        const token = (await portal.open(req, ownDocument.id, ownGrant.id)).url.split('#')[1];
        await assert.rejects(publicSigning.createSession(token, { taskIds: [tasks[0].id], consentVersion: 'old' }), { errorCode: 'CONSENT_CHANGED' });
        const session = await publicSigning.createSession(token, { taskIds: [tasks[0].id], consentVersion: CONSENT_VERSION, locale: 'en' });
        await assert.rejects(publicSigning.accept(token, session.sessionId, { idempotencyKey: randomUUID(), consent: false }), { errorCode: 'CONSENT_REQUIRED' });
        const stored = (await pool.query('SELECT verified_at,verified_challenge_id FROM signing_sessions_v2 WHERE id=$1', [session.sessionId])).rows[0];
        assert.equal(stored.verified_at, null); assert.equal(stored.verified_challenge_id, null);
        assert.equal((await counts()).actions, '0'); assert.equal((await counts()).challenges, '0');
    });

    await t.test('a missing explicit link is never inferred from contact or package client ownership', async () => {
        await pool.query('UPDATE signing_packages SET client_userid=$2 WHERE id=$1', [revisions[0].package_id, users[0]]);
        await pool.query('UPDATE signing_people SET linked_userid=NULL WHERE id=$1', [personIds[0]]);
        try {
            assert.deepEqual((await portal.list(req)).documents, []);
            await assert.rejects(portal.open(req, ownDocument.id, ownGrant.id), { errorCode: 'NOT_FOUND' });
        } finally { await pool.query('UPDATE signing_people SET linked_userid=$2 WHERE id=$1', [personIds[0], users[0]]); }
    });

    for (const [label, invalidate, restore] of [
        ['revoked', () => pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE id=$1', [ownGrant.id]),
            () => pool.query('UPDATE signing_public_grants SET revoked_at=NULL WHERE id=$1', [ownGrant.id])],
        ['expired', () => pool.query("UPDATE signing_public_grants SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1", [ownGrant.id]),
            () => pool.query('UPDATE signing_public_grants SET created_at=$2,expires_at=$3 WHERE id=$1', [ownGrant.id, ownGrant.created_at, ownGrant.expires_at])],
        ['profile changed', () => pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE revision_id=$1', [revisions[0].id]),
            () => pool.query('UPDATE signing_delivery_profiles SET version=version-1 WHERE revision_id=$1', [revisions[0].id])],
        ['revision superseded', () => pool.query('UPDATE signing_packages SET active_revision_id=NULL WHERE id=$1', [revisions[0].package_id]),
            () => pool.query('UPDATE signing_packages SET active_revision_id=$2 WHERE id=$1', [revisions[0].package_id, revisions[0].id])],
        ['workflow cancelled', () => pool.query("UPDATE signing_package_revisions SET workflow_state='cancelled' WHERE id=$1", [revisions[0].id]),
            () => pool.query("UPDATE signing_package_revisions SET workflow_state='active' WHERE id=$1", [revisions[0].id])],
    ]) await t.test(`${label} is excluded from both index and open with public-grant parity`, async () => {
        await invalidate();
        try {
            assert.deepEqual((await portal.list(req)).documents, []);
            await assert.rejects(portal.open(req, ownDocument.id, ownGrant.id), { errorCode: 'NOT_FOUND' });
            await assert.rejects(loadPublicGrant(pool, ownToken), { errorCode: 'LINK_UNAVAILABLE' });
        } finally { await restore(); }
    });

    await t.test('tenant/deployment scope is current, fail-closed and never creates a context', async () => {
        const total = (await pool.query('SELECT count(*) FROM signing_owner_contexts')).rows[0].count;
        env.SIGNING_DEPLOYMENT_KEY = `uncreated-${randomUUID()}.invalid`;
        try {
            assert.deepEqual((await portal.list(req)).documents, []);
            await assert.rejects(portal.open(req, ownDocument.id, ownGrant.id), { errorCode: 'NOT_FOUND' });
            assert.equal((await pool.query('SELECT count(*) FROM signing_owner_contexts')).rows[0].count, total);
        } finally { env.SIGNING_DEPLOYMENT_KEY = deploymentKey; }
        const tenantId = randomUUID();
        await pool.query('INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,$3)', [tenantId, `qa-${tenantId}`, 'Synthetic other tenant']);
        await assert.rejects(runWithTenant({ id: tenantId }, () => portal.list({ ...req, firmTenantId: tenantId })), { errorCode: 'FORBIDDEN' });
        await pool.query('UPDATE users SET law_firm_tenant_id=$2 WHERE userid=$1', [users[0], tenantId]);
        try {
            await assert.rejects(portal.open(req, ownDocument.id, ownGrant.id), { errorCode: 'FORBIDDEN' });
            assert.deepEqual((await runWithTenant({ id: tenantId }, () => portal.list({ ...req, firmTenantId: tenantId }))).documents, []);
        } finally { await pool.query('UPDATE users SET law_firm_tenant_id=NULL WHERE userid=$1', [users[0]]); }
    });

    await t.test('document authority does not reveal an unrelated case name; linked case metadata is scoped', async () => {
        const caseId = (await pool.query(`INSERT INTO cases(casename,casemanagerid,userid,createdat,updatedat,isclosed,istagged)
            VALUES('Synthetic private case',$1,$2,now(),now(),false,false) RETURNING caseid`, [f.scope.userId, users[1]])).rows[0].caseid;
        await pool.query('UPDATE signing_packages SET case_id=$2 WHERE id=$1', [revisions[0].package_id, caseId]);
        let doc = (await portal.list(req)).documents[0];
        assert.equal(doc.DocumentId, ownDocument.id); assert.equal(doc.CaseId, null); assert.equal(doc.CaseName, null);
        await pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [caseId, users[0]]);
        doc = (await portal.list(req)).documents[0];
        assert.equal(doc.CaseId, caseId); assert.equal(doc.CaseName, 'Synthetic private case');
    });

    await t.test('own accepted task can still wait for another role; restricted reminders never expand to later tasks', async () => {
        await pool.query("UPDATE signing_tasks SET state='accepted' WHERE id=$1", [tasks[0].id]);
        assert.equal((await portal.list(req)).documents[0].PersonalStatus, 'waiting');
        assert.equal((await portal.list(req)).documents[0].CanSignNow, false);
        const profile = (await pool.query('SELECT * FROM signing_delivery_profiles WHERE revision_id=$1', [revisions[0].id])).rows[0];
        const followup = await grants.issueFollowupGrant(pool, { contextId: f.contextId, revisionId: revisions[0].id, personId: personIds[0],
            profileId: profile.id, profileVersion: profile.version, tasks: [{ taskId: tasks[0].id, documentId: ownDocument.id }], deadline: null });
        await pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE id=$1', [ownGrant.id]);
        await pool.query("UPDATE signing_tasks SET state='ready' WHERE id=$1", [tasks[1].id]);
        const doc = (await portal.list(req)).documents[0];
        assert.equal(doc.GrantId, followup.id); assert.equal(doc.PersonalStatus, 'signed');
        assert.equal(doc.CanSignNow, false); assert.equal(doc.IsFinal, false);
        const token = (await portal.open(req, doc.DocumentId, doc.GrantId)).url.split('#')[1];
        assert.deepEqual((await loadPublicGrant(pool, token)).allowed_task_ids, [tasks[0].id]);
        assert.deepEqual((await publicSigning.describe(token)).packages[0].documents[0].tasks.map(task => task.taskId), [tasks[0].id]);
        await assert.rejects(publicSigning.createSession(token, { taskIds: [tasks[1].id], consentVersion: CONSENT_VERSION }), { errorCode: 'TASK_UNAVAILABLE' });
        await pool.query('UPDATE signing_public_grants SET revoked_at=NULL WHERE id=$1', [ownGrant.id]);
        assert.equal((await portal.list(req)).documents[0].GrantId, ownGrant.id, 'prefer a valid invitation exposing the now-ready task');
        assert.equal((await portal.list(req)).documents.length, 1, 'overlapping grants do not duplicate a document');
    });

    await t.test('returning signer keeps prior signed date only through eligible grants while opening the newly ready scope', async () => {
        const profile = (await pool.query('SELECT * FROM signing_delivery_profiles WHERE revision_id=$1', [revisions[0].id])).rows[0];
        const previousGrant = (await pool.query(`SELECT * FROM signing_public_grants WHERE owner_context_id=$1 AND person_id=$2
            AND allowed_task_ids=$3::uuid[] AND revoked_at IS NULL`, [f.contextId, personIds[0], [tasks[0].id]])).rows[0];
        assert.ok(previousGrant);
        const previousSession = (await pool.query(`SELECT * FROM signing_sessions_v2 WHERE owner_context_id=$1 AND grant_id=$2
            ORDER BY created_at LIMIT 1`, [f.contextId, ownGrant.id])).rows[0];
        const acceptedAt = '2026-01-02T03:04:05.000Z';
        // Authorization fixture only: immutable action metadata for an earlier
        // stage, not evidence of executing a real OTP/signature acceptance.
        await pool.query(`INSERT INTO signing_actions(id,owner_context_id,task_id,participation_id,person_id,session_id,
                manifest_hash,payload_hash,consent_snapshot,values_snapshot,accepted_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','{}',$9)`,
        [randomUUID(), f.contextId, tasks[0].id, tasks[0].participation_id, personIds[0], previousSession.id,
            previousSession.manifest_hash, 'e'.repeat(64), acceptedAt]);
        const currentGrant = await grants.issueFollowupGrant(pool, { contextId: f.contextId, revisionId: revisions[0].id, personId: personIds[0],
            profileId: profile.id, profileVersion: profile.version, tasks: [{ taskId: tasks[1].id, documentId: ownDocument.id }], deadline: null });
        await pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE id=$1', [ownGrant.id]);
        try {
            const before = await counts(), list = await portal.list(req), doc = list.documents[0];
            assert.equal(list.documents.length, 1); assert.equal(doc.GrantId, currentGrant.id);
            assert.equal(doc.PersonalStatus, 'pending'); assert.equal(doc.CanSignNow, true); assert.equal(doc.IsFinal, false);
            assert.equal(new Date(doc.PersonalSignedAt).toISOString(), acceptedAt);
            const token = (await portal.open(req, doc.DocumentId, doc.GrantId)).url.split('#')[1];
            assert.deepEqual(await counts(), before, 'preserving signed history and opening creates no session or action');
            assert.deepEqual((await loadPublicGrant(pool, token)).allowed_task_ids, [tasks[1].id]);
            await assert.rejects(publicSigning.accept(token, previousSession.id, { consent: true, idempotencyKey: randomUUID() }),
                { errorCode: 'SESSION_EXPIRED' });
            await assert.rejects(publicSigning.createSession(token, { taskIds: [tasks[1].id], consentVersion: 'old' }),
                { errorCode: 'CONSENT_CHANGED' });
            const newSession = await publicSigning.createSession(token, { taskIds: [tasks[1].id], consentVersion: CONSENT_VERSION });
            assert.notEqual(newSession.sessionId, previousSession.id);
            assert.equal((await pool.query('SELECT verified_at FROM signing_sessions_v2 WHERE id=$1', [newSession.sessionId])).rows[0].verified_at, null);

            await pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE id=$1', [previousGrant.id]);
            assert.equal((await portal.list(req)).documents[0].PersonalSignedAt, null, 'revoked old scope supplies no history');
            await pool.query(`UPDATE signing_public_grants SET revoked_at=NULL,created_at=now()-interval '2 days',
                expires_at=now()-interval '1 day' WHERE id=$1`, [previousGrant.id]);
            assert.equal((await portal.list(req)).documents[0].PersonalSignedAt, null, 'expired old scope supplies no history');
        } finally {
            await pool.query('UPDATE signing_public_grants SET revoked_at=NULL WHERE id=$1', [ownGrant.id]);
            await pool.query('UPDATE signing_public_grants SET revoked_at=NULL,created_at=$2,expires_at=$3 WHERE id=$1',
                [previousGrant.id, previousGrant.created_at, previousGrant.expires_at]);
            await pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE id=$1', [currentGrant.id]);
        }
    });

    await t.test('HTTP auth, no-store, feature flag and exact open body', async () => {
        const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
        Object.assign(process.env, env);
        t.after(() => { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
        const app = require('../app');
        const auth = call => call.set('Authorization', `Bearer ${jwt.sign({ userid: users[0], role: 'User' }, process.env.JWT_SECRET)}`);
        assert.equal((await request(app).get('/api/signing-v2/client/documents')).status, 401);
        const list = await auth(request(app).get('/api/signing-v2/client/documents'));
        assert.equal(list.status, 200, JSON.stringify(list.body)); assert.equal(list.headers['cache-control'], 'private, no-store');
        assert.equal(list.body.documents.length, 1);
        const opened = await auth(request(app).post(`/api/signing-v2/client/documents/${ownDocument.id}/open`)).send({ grantId: ownGrant.id });
        assert.equal(opened.status, 200, JSON.stringify(opened.body)); assert.equal(opened.body.url, `/ViewSignedDocument/Sign#${ownToken}`);
        assert.equal(opened.headers['cache-control'], 'private, no-store'); assert.equal(opened.headers['referrer-policy'], 'no-referrer');
        const missing = await auth(request(app).post(`/api/signing-v2/client/documents/${ownDocument.id}/open`)).send({});
        assert.equal(missing.status, 404);
        assert.equal((await auth(request(app).post('/api/signing-v2/client/documents/not-a-uuid/open')).send({ grantId: ownGrant.id })).status, 404);
        const staff = jwt.sign({ userid: f.scope.userId, role: 'Admin' }, process.env.JWT_SECRET);
        assert.equal((await request(app).get('/api/signing-v2/client/documents').set('Authorization', `Bearer ${staff}`)).status, 403);
        process.env.SIGNING_V2_ENABLED = 'false';
        assert.equal((await request(app).get('/api/signing-v2/client/documents')).status, 401);
        assert.deepEqual((await auth(request(app).get('/api/signing-v2/client/documents'))).body, { enabled: false, documents: [] });
        assert.equal((await auth(request(app).post(`/api/signing-v2/client/documents/${ownDocument.id}/open`)).send({ grantId: ownGrant.id })).status, 404);
    });

    await t.test('download grants require completed active revision and ready final artifact and never permit signing', async () => {
        await pool.query('UPDATE signing_public_grants SET revoked_at=now() WHERE owner_context_id=$1 AND person_id=$2', [f.contextId, personIds[0]]);
        const profile = (await pool.query('SELECT * FROM signing_delivery_profiles WHERE revision_id=$1', [revisions[0].id])).rows[0];
        const copy = await grants.issueDownloadGrant(pool, { contextId: f.contextId, revisionId: revisions[0].id,
            personId: personIds[0], profileId: profile.id, profileVersion: profile.version, documents: [{ documentId: ownDocument.id }] });
        assert.deepEqual((await portal.list(req)).documents, []);
        await assert.rejects(portal.open(req, ownDocument.id, copy.id), { errorCode: 'NOT_FOUND' });
        await pool.query("UPDATE signing_package_revisions SET workflow_state='complete' WHERE id=$1", [revisions[0].id]);
        assert.deepEqual((await portal.list(req)).documents, [], 'workflow completion without a ready final PDF is insufficient');
        await pool.query("UPDATE signing_documents SET state='final',final_artifact_id=source_artifact_id WHERE id=$1", [ownDocument.id]);
        await pool.query("UPDATE signing_tasks SET state='accepted' WHERE revision_id=$1", [revisions[0].id]);
        const acceptedAt = '2026-01-02T03:04:05.000Z';
        // Reuse the earlier immutable metadata fixture; no new acceptance occurs.
        const doc = (await portal.list(req)).documents[0];
        assert.equal(doc.GrantId, copy.id); assert.equal(doc.PersonalStatus, 'signed');
        assert.equal(new Date(doc.PersonalSignedAt).toISOString(), acceptedAt);
        assert.equal(doc.IsFinal, true); assert.equal(doc.CanDownload, true); assert.equal(doc.CanSignNow, false);
        const token = (await portal.open(req, doc.DocumentId, doc.GrantId)).url.split('#')[1];
        assert.equal((await publicSigning.describe(token)).readOnly, true);
        await assert.rejects(publicSigning.createSession(token, { taskIds: [tasks[0].id], consentVersion: CONSENT_VERSION }), { errorCode: 'LINK_UNAVAILABLE' });
    });
});
