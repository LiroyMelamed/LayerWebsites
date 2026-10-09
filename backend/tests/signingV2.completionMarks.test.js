const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { compilerFixture } = require('./helpers/signingV2Fixture');
const { validateDefinition, compilePackage } = require('../lib/signingV2/compiler');
const { validateSignerFieldValue } = require('../lib/signingV2/signerFieldValue');
const marks = require('../services/signingV2/completionMarks');
const { bytesHash } = require('../lib/signingV2/canonical');
const png = require('./helpers/completionMarkPng')();
const field = () => ({ id: 'officeMark', type: 'completionMark', pageNum: 1, x: 60, y: 600, width: 240, height: 80,
    assetId: randomUUID(), assetHash: bytesHash(png), required: false, automaticAtCompletion: true });

test('typed signer values preserve leading zeroes and reject malformed document values', () => {
    for (const [type, value] of [['email','document@example.invalid'],['phone','+972501234567'],['phone','0501234567'],['idnumber','000123456']]) {
        assert.equal(validateSignerFieldValue(type, value, 'field'), undefined);
    }
    for (const [type, value] of [['email','a@'],['phone','+123'],['phone','++972501234567'],['idnumber','1e9'],['idnumber','12abc']]) {
        assert.throws(() => validateSignerFieldValue(type, value, 'field'), { errorCode: 'INVALID_VALUES' });
    }
});
test('an authorized automatic mark adds no signer task and stays hash-bound in the immutable snapshot', () => {
    const f = compilerFixture(), definition = structuredClone(f.definition), mark = field();
    definition.documents[0].fields.push(mark);
    const before = compilePackage(f.definition, f.input, f.directory);
    const after = compilePackage(validateDefinition(definition), f.input, f.directory);
    assert.equal(after.snapshot.tasks.length, before.snapshot.tasks.length);
    assert.equal(after.snapshot.tasks.some(task => task.fieldIds.includes(mark.id)), false);
    assert.equal(after.snapshot.documents[0].fields.find(item => item.id === mark.id).assetHash, mark.assetHash);
    assert.notEqual(after.hash, before.hash);
    for (const patch of [{ required: true }, { automaticAtCompletion: false }, { roleKey: 'employee' }, { assetHash: 'wrong' }]) {
        const invalid = structuredClone(definition); Object.assign(invalid.documents[0].fields.at(-1), patch);
        assert.throws(() => validateDefinition(invalid), { errorCode: 'COMPLETION_MARK_AUTHORIZATION_REQUIRED' });
    }
});
test('automatic assets need explicit authorization and both send and template management permission', async () => {
    const image = `data:image/png;base64,${png.toString('base64')}`;
    for (const scope of [{ send: false, templateManage: true }, { send: true, templateManage: false }]) {
        await assert.rejects(marks.register(null, scope, { image, authorized: true, kind: 'office_stamp' }, null), { errorCode: 'FORBIDDEN' });
    }
    await assert.rejects(marks.register(null, { send: true, templateManage: true }, { image, authorized: false, kind: 'office_stamp' }, null), { errorCode: 'COMPLETION_MARK_AUTHORIZATION_REQUIRED' });
});
test('marks wait for the entire revision and never apply to stage PDFs or incomplete packages', async () => {
    const mark = field(), document = { owner_context_id: randomUUID(), revision_id: randomUUID(), field_bindings: [mark] };
    let calls = 0;
    const db = { query: async () => { calls++; return { rows: [{ count: 1 }] }; } };
    assert.deepEqual(await marks.applyMarks(db, document, 'stage', null, new Map(), []), []); assert.equal(calls, 0);
    await assert.rejects(marks.applyMarks(db, document, 'final', null, new Map(), []), { errorCode: 'SIGNATURES_INCOMPLETE' });
});
test('final marks use only the exact authorized bytes; changed or foreign assets fail closed', async () => {
    const mark = field(), asset = { id: mark.assetId, content_sha256: mark.assetHash, created_by: 23, metadata: { markKind: 'office_stamp' } };
    const document = { owner_context_id: randomUUID(), revision_id: randomUUID(), field_bindings: [mark] };
    const db = rows => ({ query: async sql => ({ rows: sql.includes('count(*)') ? [{ count: 0 }] : rows }) });
    const imageMap = new Map(), applied = [];
    assert.deepEqual(await marks.applyMarks(db([asset]), document, 'final', async () => png, imageMap, applied), [{ fieldId: mark.id, hash: mark.assetHash, kind: 'office_stamp', authorizedBy: 23 }]);
    assert.equal(imageMap.get(mark.assetId), png); assert.equal(applied[0].value, mark.assetId);
    await assert.rejects(marks.applyMarks(db([]), document, 'final', null, new Map(), []), { errorCode: 'ARTIFACT_HASH_MISMATCH' });
    await assert.rejects(marks.applyMarks(db([{ ...asset, content_sha256: '0'.repeat(64) }]), document, 'final', null, new Map(), []), { errorCode: 'ARTIFACT_HASH_MISMATCH' });
    await assert.rejects(marks.assertAssets({ query: async () => ({ rows: [] }) }, { contextId: document.owner_context_id, userId: 23 }, { documents: [{ fields: [mark] }] }), { errorCode: 'NOT_FOUND' });
});
test('automatic marks are explained separately from OTP actions and personal receipts exclude unrelated marks', () => {
    const { evidenceHtml } = require('../services/signingV2/completion');
    const { personalEvidence } = require('../lib/signingV2/personalEvidence');
    const data = { locale: 'en', completedAt: new Date(), documents: [
        { id: 'mine', name: 'Mine', completionMarks: [{ hash: 'public-mark-hash' }] },
        { id: 'other', name: 'Other', completionMarks: [{ hash: 'private-mark-hash' }] }], actions: [{ personId: 'one', documentId: 'mine' }] };
    const receipt = personalEvidence(data, 'one');
    const html = evidenceHtml({ ...receipt, actions: [] });
    assert.match(html, /not a personal signing action/); assert.match(html, /public-mark-hash/); assert.doesNotMatch(html, /private-mark-hash/);
});
