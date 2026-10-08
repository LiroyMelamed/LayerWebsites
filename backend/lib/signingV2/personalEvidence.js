const { digest } = require('./canonical');
const { fail } = require('./errors');

const RECEIPT_VERSION = 1;
const evidenceJobInput = revisionHash => digest({ revisionHash, kind: 'evidence', receipts: RECEIPT_VERSION });
const personalEvidenceInput = (revisionId, revisionHash, personId) => digest({
    revisionId, revisionHash, personId, kind: 'personal_evidence', version: RECEIPT_VERSION,
});

function personalEvidence(data, personId) {
    const actions = data.actions.filter(action => action.personId === personId);
    if (!actions.length) fail('NOT_FOUND', 404);
    const documentIds = new Set(actions.map(action => action.documentId));
    return { ...data, personal: true, actions, documents: data.documents.filter(document => documentIds.has(document.id)) };
}

module.exports = { personalEvidence, personalEvidenceInput, evidenceJobInput };
