const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { participantSummary } = require('../services/signingV2/participantSummary');

test('shared signer summaries use current authorized packages and canonical identity capacities',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 45000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const fixture = async () => {
        let sharedPersonId, sharedPartyId, otherPartyId, peerPersonId;
        const f = await databaseFixture(pool, { packageCount: 5, documentCount: 2, configure: ({ definition, packages, parties }) => {
            const shared = packages[0].roles.employee[0]; sharedPersonId = shared.personId; sharedPartyId = shared.partyId;
            otherPartyId = parties[1].id; peerPersonId = packages[2].roles.employee[0].personId;
            const peer = packages[2].roles.employee[0];
            definition.stages.push({ key: 'returning', label: 'Returning person', after: 'employee' },
                { key: 'professional', label: 'Professional capacity', after: 'returning' });
            definition.roles.push({ key: 'returning', label: 'Returning person', capacity: 'personal', min: 1, max: 1, stage: 1 },
                { key: 'professional', label: 'Professional capacity', capacity: 'professional', min: 1, max: 1, stage: 2 });
            definition.documents.forEach(document => document.fields.push(
                { id: 'returning', type: 'signature', roleKey: 'returning', occurrence: 0, pageNum: 1, x: 30, y: 190, width: 200, height: 60, required: true },
                { id: 'professional', type: 'signature', roleKey: 'professional', occurrence: 0, pageNum: 1, x: 30, y: 280, width: 200, height: 60, required: true }));
            packages.forEach((item, index) => {
                const professional = index === 2 ? peer : { ...shared, partyId: index === 3 ? otherPartyId : shared.partyId };
                item.roles = { employee: [shared], returning: [shared], professional: [professional] };
                item.delivery = Object.fromEntries([...new Set([shared.personId, professional.personId])].map(personId =>
                    [personId, { locale: 'en', channels: ['email'], email: 'shared-summary@example.invalid' }]));
            });
            return definition;
        } });
        const receipt = await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
        const packages = (await pool.query('SELECT id,active_revision_id FROM signing_packages WHERE owner_context_id=$1 ORDER BY external_key', [f.contextId])).rows;
        const revision = index => packages[index].active_revision_id;
        await pool.query("UPDATE signing_package_revisions SET workflow_state=CASE WHEN id=$1 THEN 'cancelled' ELSE 'active' END WHERE owner_context_id=$2", [revision(4), f.contextId]);
        // Task states are projection fixtures; signature acceptance is already
        // covered by the incumbent stage/OTP evidence, not repeated here.
        await pool.query(`UPDATE signing_tasks SET state=CASE
            WHEN revision_id=$1 AND stage=0 THEN 'accepted'
            WHEN revision_id=$2 AND stage=0 THEN 'ready'
            WHEN revision_id=$3 AND stage=0 THEN 'clarification'
            WHEN revision_id=$4 AND stage<2 THEN 'accepted'
            ELSE 'blocked' END WHERE owner_context_id=$5`, [revision(0), revision(1), revision(2), revision(3), f.contextId]);
        return { f, receipt, packages, revision, sharedPersonId, sharedPartyId, otherPartyId, peerPersonId };
    };
    const check = (name, run) => t.test(name, { skip: Boolean(process.env.QA_PARTICIPANT_SUMMARY_CASE && !new RegExp(process.env.QA_PARTICIPANT_SUMMARY_CASE).test(name)) }, run);

    await check('later tasks remain waiting after earlier acceptance and capacities and represented parties have separate disjoint counts', async () => {
        const h = await fixture(), data = await participantSummary(pool, h.f.scope, h.receipt.submissionId);
        assert.equal(data.rows.length, 4);
        const personal = data.rows.find(row => row.personId === h.sharedPersonId && row.capacity === 'personal');
        assert.deepEqual([personal.packageCount, personal.attentionPackages, personal.readyPackages, personal.waitingPackages, personal.completePackages], [4, 1, 1, 1, 1]);
        assert.deepEqual([personal.participationCount, personal.documentCount, personal.taskCount, personal.requiredTaskCount], [8, 8, 16, 16]);
        assert.deepEqual([personal.acceptedTaskCount, personal.readyTaskCount, personal.waitingTaskCount, personal.attentionTaskCount], [6, 2, 6, 2]);
        const professional = data.rows.find(row => row.personId === h.sharedPersonId && row.partyId === h.sharedPartyId && row.capacity === 'professional');
        const otherParty = data.rows.find(row => row.personId === h.sharedPersonId && row.partyId === h.otherPartyId);
        assert.equal(professional.packageCount, 2); assert.equal(professional.waitingPackages, 2); assert.equal(professional.participationCount, 2);
        assert.equal(otherParty.packageCount, 1); assert.equal(otherParty.partyName, 'Employee 1'); assert.equal(otherParty.waitingPackages, 1);
        assert.equal(data.rows.find(row => row.personId === h.peerPersonId).packageCount, 1, 'a shared email never merges canonical people');
        for (const row of data.rows) assert.equal(row.packageCount, row.attentionPackages + row.readyPackages + row.waitingPackages + row.completePackages);
    });

    await check('failed current delivery takes attention precedence without duplicate packages and a later successful resend clears it', async () => {
        const h = await fixture();
        const profile = (await pool.query('SELECT * FROM signing_delivery_profiles WHERE revision_id=$1 AND person_id=$2', [h.revision(1), h.sharedPersonId])).rows[0];
        const failedId = randomUUID(), acceptedId = randomUUID();
        await pool.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,event_key,purpose,channel,target_snapshot,state,created_at)
            VALUES($1,$2,$3,$4,$5,'invitation','email','{}','failed',clock_timestamp())`,
        [failedId, h.f.contextId, profile.id, profile.version, `summary:${failedId}`]);
        let row = (await participantSummary(pool, h.f.scope, h.receipt.submissionId)).rows.find(item => item.personId === h.sharedPersonId && item.capacity === 'personal');
        assert.deepEqual([row.packageCount, row.attentionPackages, row.readyPackages, row.waitingPackages, row.completePackages], [4, 2, 0, 1, 1]);
        await pool.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,event_key,purpose,channel,target_snapshot,state,created_at)
            VALUES($1,$2,$3,$4,$5,'resend','email','{}','provider_accepted',clock_timestamp())`,
        [acceptedId, h.f.contextId, profile.id, profile.version, `summary:${acceptedId}`]);
        row = (await participantSummary(pool, h.f.scope, h.receipt.submissionId)).rows.find(item => item.personId === h.sharedPersonId && item.capacity === 'personal');
        assert.deepEqual([row.attentionPackages, row.readyPackages, row.waitingPackages, row.completePackages], [1, 1, 1, 1]);
    });

    await check('one scoped query excludes private peer names and follows current package assignment without exposing hidden counts', async () => {
        const h = await fixture();
        const userId = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic summary viewer',$1,'Staff','synthetic') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
        const scope = { ...h.f.scope, all: false, userId, caseView: false, caseAll: false };
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [h.f.contextId, h.packages[0].id, userId]);
        const before = new Date((await pool.query('SELECT statement_timestamp() AS now')).rows[0].now).getTime();
        let queryCount = 0;
        const db = { query: (...args) => { queryCount += 1; return pool.query(...args); } };
        const first = await participantSummary(db, scope, h.receipt.submissionId); assert.equal(queryCount, 1);
        const after = new Date((await pool.query('SELECT statement_timestamp() AS now')).rows[0].now).getTime();
        assert.equal(first.rows.length, 2); assert.ok(first.rows.every(row => row.packageCount === 1));
        assert.equal(first.rows.some(row => row.personId === h.peerPersonId || row.partyId === h.otherPartyId), false);
        assert.equal(JSON.stringify(first).includes('Synthetic employee 2'), false);
        assert.equal(first.summaryScope, 'all_authorized_active_children'); assert.equal(first.scope.submissionId, h.receipt.submissionId);
        assert.equal(first.scope.kind, 'authorized_packages'); assert.match(first.scope.fingerprint, /^[a-f0-9]{64}$/);
        assert.equal(first.projectionVersion, 2); assert.equal(first.freshness, 'current');
        assert.ok(Date.parse(first.asOf) >= before && Date.parse(first.asOf) <= after);
        await pool.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND user_id=$2', [h.f.contextId, userId]);
        await assert.rejects(participantSummary(pool, scope, h.receipt.submissionId), { errorCode: 'NOT_FOUND', httpStatus: 404 });
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [h.f.contextId, h.packages[3].id, userId]);
        const current = await participantSummary(pool, scope, h.receipt.submissionId);
        assert.equal(current.rows.length, 2); assert.ok(current.rows.every(row => row.packageCount === 1));
        assert.equal(current.rows.find(row => row.capacity === 'professional').partyId, h.otherPartyId);
        assert.equal(current.rows.find(row => row.capacity === 'personal').completePackages, 1);
        await assert.rejects(participantSummary(pool, scope, randomUUID()), { errorCode: 'NOT_FOUND', httpStatus: 404 });
        await assert.rejects(participantSummary(pool, { ...h.f.scope, contextId: randomUUID() }, h.receipt.submissionId), { errorCode: 'NOT_FOUND', httpStatus: 404 });
    });

    await check('only the current revision contributes and cancelled packages and cancelled alternatives do not become completed signatures', async () => {
        const h = await fixture(), replacementId = randomUUID();
        await pool.query(`INSERT INTO signing_package_revisions(id,owner_context_id,package_id,revision_no,replaces_revision_id,workflow_state,snapshot,revision_hash)
            SELECT $1,owner_context_id,package_id,2,id,'active',snapshot,revision_hash FROM signing_package_revisions WHERE id=$2`, [replacementId, h.revision(0)]);
        await pool.query('UPDATE signing_packages SET active_revision_id=$1 WHERE id=$2', [replacementId, h.packages[0].id]);
        await pool.query("UPDATE signing_tasks SET state='cancelled' WHERE revision_id=$1 AND stage=2", [h.revision(3)]);
        const data = await participantSummary(pool, h.f.scope, h.receipt.submissionId);
        const personal = data.rows.find(row => row.personId === h.sharedPersonId && row.capacity === 'personal');
        assert.deepEqual([personal.packageCount, personal.attentionPackages, personal.readyPackages, personal.waitingPackages, personal.completePackages], [3, 1, 1, 0, 1]);
        assert.equal(data.rows.some(row => row.personId === h.sharedPersonId && row.partyId === h.otherPartyId), false, 'a cancelled alternative does not claim completion');
        assert.equal(data.rows.find(row => row.personId === h.sharedPersonId && row.capacity === 'professional').packageCount, 1);
    });
});
