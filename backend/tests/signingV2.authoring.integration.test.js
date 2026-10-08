const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const templates = require('../services/signingV2/templates');
const people = require('../services/signingV2/people');
const { loadDirectory, createSubmission } = require('../services/signingV2/submissions');

test('v2 authoring versions, explicit identities, scoped lookup and frozen approval inputs', { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    assert.equal(process.env.DB_PORT, '55442');
    const pool = require('../config/db'); t.after(() => pool.end());
    const f = await databaseFixture(pool);
    await t.test('incomplete draft autosave uses compare-and-swap; published version cannot be edited', async () => {
        const incomplete = { schemaVersion: 2, name: 'Incomplete authoring draft' };
        const draft = await templates.createDraft(pool, f.scope, { definition: incomplete });
        assert.equal(draft.state, 'draft');
        await assert.rejects(templates.publish(pool, f.scope, draft.template_id, draft.id, 1, draft.definition_hash), { errorCode: 'INVALID_LOCALE' });
        await assert.rejects(templates.saveDraft(pool, f.scope, draft.template_id, draft.id, f.definition), { errorCode: 'PRECONDITION_REQUIRED' });
        const outcomes = await Promise.allSettled([1, 2].map(() => templates.saveDraft(pool, f.scope, draft.template_id, draft.id, f.definition, 1)));
        assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(outcomes.find(result => result.status === 'rejected').reason.errorCode, 'VERSION_CHANGED');
        const saved = outcomes.find(result => result.status === 'fulfilled').value;
        const published = await templates.publish(pool, f.scope, draft.template_id, draft.id, saved.edit_version, saved.definition_hash);
        assert.equal(published.state, 'published');
        await assert.rejects(templates.saveDraft(pool, f.scope, draft.template_id, draft.id, f.definition, published.edit_version), { errorCode: 'VERSION_CHANGED' });
        const next = await templates.createDraft(pool, f.scope, { templateId: draft.template_id, definition: f.definition });
        assert.equal(next.version, 2); assert.notEqual(next.id, published.id);
    });
    await t.test('shared phone and email are two people until the office explicitly selects an existing person', async () => {
        const contact = { name: 'Shared endpoint', endpoints: { email: 'shared@example.invalid', phone: '+15555550123' } };
        const first = await people.createPerson(pool, f.scope, contact), second = await people.createPerson(pool, f.scope, contact);
        assert.notEqual(first.person.id, second.person.id); assert.notEqual(first.party.id, second.party.id);
        assert.equal((await people.searchPeople(pool, f.scope, 'shared@example.invalid')).length, 2);
        const unrelated = { ...f.scope, all: false, userId: f.scope.userId + 1000000 };
        assert.equal((await people.searchPeople(pool, unrelated, 'shared@example.invalid')).length, 0);
        await assert.rejects(people.loadPerson(pool, unrelated, first.person.id), { errorCode: 'NOT_FOUND' });
        await assert.rejects(loadDirectory(pool, unrelated, f.definition, f.input.packages), { errorCode: 'PARTICIPANT_NOT_AVAILABLE' });
    });
    await t.test('all-firm viewing does not grant editing other owners templates', async () => {
        const actor = { ...f.scope, userId: f.scope.userId + 1000000, all: true, manage: false };
        await assert.rejects(templates.createDraft(pool, actor, { templateId: f.templateId, definition: f.definition }), { errorCode: 'FORBIDDEN' });
    });
    await t.test('a changed person name after preview requires a new approval preview', async () => {
        const personId = f.input.packages[0].roles.employee[0].personId;
        await pool.query('UPDATE signing_people SET name=$1,version=version+1 WHERE owner_context_id=$2 AND id=$3', ['Changed name', f.contextId, personId]);
        await assert.rejects(createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} }), { errorCode: 'PREVIEW_CHANGED' });
        assert.equal((await pool.query('SELECT count(*) FROM signing_submissions WHERE owner_context_id=$1', [f.contextId])).rows[0].count, '0');
    });
    await t.test('legacy template APIs cannot reopen v2 templates', async () => {
        const legacy = require('../services/signingTemplateService');
        const req = { user: { UserId: f.scope.userId, Role: 'Admin' }, firmPermissionMode: 'legacy' };
        await assert.rejects(legacy.loadTemplate(req, f.templateId), { errorCode: 'NOT_FOUND' });
        assert.ok(!(await legacy.listTemplates(req)).some(template => template.id === f.templateId));
    });
    await t.test('ready artifact checksum and object key cannot be replaced', async () => {
        await assert.rejects(pool.query('UPDATE signing_artifacts SET object_key=$1 WHERE owner_context_id=$2 AND id=$3', [`replacement/${randomUUID()}`, f.contextId, f.sourceId]), { code: '23514' });
    });
});
