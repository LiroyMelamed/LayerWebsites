const test = require('node:test');
const assert = require('node:assert/strict');
const { personalEvidence, personalEvidenceInput, evidenceJobInput } = require('../lib/signingV2/personalEvidence');
const { evidenceHtml } = require('../services/signingV2/completion');

test('personal receipts keep all capacities of the explicit person and only their documents/actions', () => {
    const data = { locale: 'en', runName: 'Synthetic', reference: '1', ownerName: 'Office', revisionHash: 'hash', completedAt: new Date(),
        documents: [{ id: 'a', name: 'Shared document', pages: 1 }, { id: 'b', name: 'Private document for other signer', pages: 1 }],
        actions: [{ personId: 'one', documentId: 'a', role: 'professional' }, { personId: 'one', documentId: 'a', role: 'personal' },
            { personId: 'two', documentId: 'b', ip: 'other-private-ip', hint: 'other-private-hint' }] };
    const receipt = personalEvidence(data, 'one');
    assert.equal(receipt.personal, true); assert.equal(receipt.actions.length, 2);
    assert.deepEqual(receipt.documents.map(doc => doc.id), ['a']);
    assert.doesNotMatch(JSON.stringify(receipt), /other-private|Private document/);
    assert.equal(data.actions.length, 3); assert.equal(data.documents.length, 2);
    assert.throws(() => personalEvidence(data, 'unknown'), { errorCode: 'NOT_FOUND' });
    assert.notEqual(personalEvidenceInput('revision', 'hash', 'one'), personalEvidenceInput('revision', 'hash', 'two'));
    assert.notEqual(personalEvidenceInput('revision', 'hash', 'one'), personalEvidenceInput('new-revision', 'hash', 'one'));
    assert.equal(evidenceJobInput('hash'), evidenceJobInput('hash'));
    for (const [locale, title] of [['he', 'אישור החתימה שלך'], ['ar', 'إيصال توقيعك'], ['en', 'Your signing receipt']]) {
        const html = evidenceHtml({ ...receipt, locale, actions: [] });
        assert.ok(html.includes(title)); assert.ok(!html.includes('other-private'));
    }
});
