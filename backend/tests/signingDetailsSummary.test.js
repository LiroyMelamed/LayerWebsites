const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { signingDetailsSummary } = require('../lib/signingDetailsSummary');

test('details count required fields consistently with the list and deduplicate signer names', () => {
    assert.deepEqual(signingDetailsSummary([
        { IsRequired: true, IsSigned: true, SignerName: 'One' },
        { IsRequired: true, IsSigned: false, FieldType: 'text', SignerName: 'One' },
        { IsRequired: false, IsSigned: true, SignerName: 'Two' },
        { IsRequired: true, IsSigned: true, FieldType: 'LawyerStamp', SignerName: 'Two' },
    ]), { TotalSpots: 2, SignedSpots: 1, ClientName: 'One, Two' });
});

test('a fully signed multi-signer document reports 4/4 instead of 0/0', () => {
    const spots = [1, 1, 2, 2].map(id => ({ IsRequired: true, IsSigned: true, SignerName: `Signer ${id}` }));
    assert.deepEqual(signingDetailsSummary(spots), { TotalSpots: 4, SignedSpots: 4, ClientName: 'Signer 1, Signer 2' });
});

test('an empty document has no invented signer or signature', () => {
    assert.deepEqual(signingDetailsSummary([]), { TotalSpots: 0, SignedSpots: 0, ClientName: null });
});

const source = fs.readFileSync(path.join(__dirname, '../controllers/signingFileController.js'), 'utf8');
const handlerSource = source.slice(source.indexOf('exports.getSigningFileDetails ='), source.indexOf('// Evidence package for court'));

async function details({ staff = false, authorized = true } = {}) {
    const queries = [];
    const ownSpot = { IsRequired: true, IsSigned: true, SignerName: 'Own signer', SignerUserId: 2 };
    const otherSpot = { IsRequired: true, IsSigned: false, SignerName: 'Other signer', SignerUserId: 3 };
    let response;
    const context = {
        exports: {}, console, signingDetailsSummary,
        requireInt: () => 11,
        getSchemaSupport: async () => ({ signaturespotsSignerUserId: true, signaturespotsFieldType: true }),
        pool: { query: async (sql, params) => {
            queries.push({ sql, params });
            if (sql.includes('from signingfiles')) return { rows: [{ SigningFileId: 11, LawyerId: 1, ClientId: authorized ? 2 : 99, CaseName: 'Example case' }] };
            if (sql.includes('select 1')) return { rows: [] };
            assert.match(sql, /from signaturespots/);
            if (!staff) {
                assert.match(sql, /and signeruserid = \$2/);
                assert.deepEqual(Array.from(params), [11, 2]);
            }
            return { rows: staff ? [ownSpot, otherSpot] : [ownSpot] };
        } },
        resolveFirmSigningPolicyForSigningFileId: async () => ({}),
        getSigningOtpEnabled: async () => true,
        computeRequireOtpEffectiveFromFirmPolicy: () => true,
        canViewSigningFileAsOfficeStaff: () => staff,
        canViewAllSigningSpots: () => staff,
        fail: (_next, code, status) => { response = { code, status }; },
    };
    vm.runInNewContext(handlerSource, context);
    await context.exports.getSigningFileDetails({ user: { UserId: 2, Role: staff ? 'Admin' : 'User' } }, { json: value => { response = value; } }, () => {});
    return { response, queries };
}

test('details response summarizes only the requesting client’s authorized spots', async () => {
    const { response } = await details();
    assert.equal(response.file.TotalSpots, 1);
    assert.equal(response.file.SignedSpots, 1);
    assert.equal(response.file.ClientName, 'Own signer');
    assert.equal(response.file.CaseName, 'Example case');
    assert.equal(response.signatureSpots.length, 1);
});

test('office details summarize the complete authorized document', async () => {
    const { response } = await details({ staff: true });
    assert.equal(response.file.TotalSpots, 2);
    assert.equal(response.file.SignedSpots, 1);
    assert.equal(response.file.ClientName, 'Own signer, Other signer');
});

test('an unrelated client cannot read summaries or signer names', async () => {
    const { response, queries } = await details({ authorized: false });
    assert.deepEqual(response, { code: 'FORBIDDEN', status: 403 });
    assert.equal(queries.length, 2);
});
