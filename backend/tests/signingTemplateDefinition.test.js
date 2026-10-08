const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDefinition, validatePageBounds, requestHash } = require('../lib/signingTemplateDefinition');
const input = () => ({ name: 'חוזה בדיקה', roles: [{ id: 'client', name: 'חותם ראשון', kind: 'first' }], documents: [{
    id: '02f15a23-b454-4d15-8e69-f222db11be28', name: 'חוזה', fileKey: 'users/10/source.pdf', fields: [{
        pageNum: 1, x: 100, y: 200, width: 160, height: 56, roleId: 'client', fieldType: 'signature',
    }],
}] });

test('template round-trip retains exact fractional signature coordinates without live signer identity', () => {
    const data = input();Object.assign(data.documents[0].fields[0], { x: 123.456, y: 345.678, signerUserId: 999, signatureImage: 'must-not-copy' });
    const clean = validateDefinition(data);
    assert.equal(clean.documents[0].fields[0].x, 123.456);
    assert.equal(clean.documents[0].fields[0].y, 345.678);
    assert.equal(clean.documents[0].fields[0].signerUserId, undefined);
    assert.equal(clean.documents[0].fields[0].signatureImage, undefined);
    assert.deepEqual(validateDefinition(JSON.parse(JSON.stringify(clean))), clean);
});
test('template rejects unassigned roles, invalid coordinates and silently reused lawyer stamps', () => {
    for (const patch of [{ roleId: 'foreign' }, { x: -1 }, { width: Infinity }, { x: 799, width: 20 }, { fieldType: 'lawyerstamp' }]) {
        const data = input();Object.assign(data.documents[0].fields[0], patch);
        assert.throws(() => validateDefinition(data), error => error.httpStatus === 422);
    }
});
test('template rejects duplicate role and document identities', () => {
    const data = input();data.roles.push({ ...data.roles[0] });assert.throws(() => validateDefinition(data));
    const docs = input();docs.documents.push({ ...docs.documents[0] });assert.throws(() => validateDefinition(docs));
});
test('actual rotated/cropped page bounds govern field acceptance', () => {
    const doc = validateDefinition(input()).documents[0];
    assert.doesNotThrow(() => validatePageBounds(doc, [{ width: 800, height: 600 }]));
    assert.throws(() => validatePageBounds(doc, [{ width: 800, height: 240 }]));
    assert.throws(() => validatePageBounds(doc, []));
});
test('idempotency fingerprint is stable across object key order and changes with content', () => {
    assert.equal(requestHash({ a: 1, b: { d: 2, c: 3 } }), requestHash({ b: { c: 3, d: 2 }, a: 1 }));
    assert.notEqual(requestHash(input()), requestHash({ ...input(), name: 'אחר' }));
});
