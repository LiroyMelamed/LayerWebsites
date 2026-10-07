const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { compilerFixture } = require('./helpers/signingV2Fixture');
const { validateDefinition, compilePackage, admission, normalizeValue } = require('../lib/signingV2/compiler');
const { canonical, digest } = require('../lib/signingV2/canonical');

const error = code => value => value?.errorCode === code;
const clone = value => JSON.parse(JSON.stringify(value));

test('canonical snapshots are deterministic, reject lossy JSON and keep exact identifiers/decimal amounts', () => {
    assert.equal(digest({ b: 1, a: '00001' }), digest({ a: '00001', b: 1 }));
    for (const invalid of [NaN, Infinity, undefined, new Date(), 9007199254740992]) assert.throws(() => canonical({ invalid }));
    assert.throws(() => canonical(JSON.parse('{"__proto__":{}}')));
    assert.equal(normalizeValue({ key: 'id', type: 'identifier' }, '000001'), '000001');
    assert.throws(() => normalizeValue({ key: 'id', type: 'identifier' }, 1), error('INVALID_DATA'));
    assert.equal(normalizeValue({ key: 'amount', type: 'decimal' }, '123456789123456789.125'), '123456789123456789.125');
    assert.throws(() => normalizeValue({ key: 'date', type: 'date' }, '01/02/2026'), error('AMBIGUOUS_DATE'));
    assert.throws(() => normalizeValue({ key: 'date', type: 'date' }, '2026-02-30'), error('INVALID_DATA'));
});

test('compiler creates immutable personalized snapshots and counts one task per document/participation, not spots', () => {
    const f = compilerFixture();
    const definition = clone(f.definition);
    definition.documents[0].fields.push({ ...definition.documents[0].fields[1], id: 'initials', type: 'initials', y: 300 });
    const compiled = compilePackage(validateDefinition(definition), f.input, f.directory);
    assert.equal(compiled.snapshot.tasks.length, 3);
    assert.equal(compiled.snapshot.tasks[0].fieldIds.length, 2);
    assert.equal(compiled.snapshot.documents[0].fields[0].value, '000012345');
    f.input.data.employeeId = 'CHANGED';
    assert.equal(compiled.snapshot.data.employeeId, '000012345');
    assert.ok(Object.isFrozen(compiled.snapshot.participants[0]));
    assert.equal(compiled.hash, digest(compiled.snapshot));
});

test('200 employees support 600, 1200 and 2000 documents; technical budgets apply beyond the UI', () => {
    for (const documentCount of [3, 6, 10]) {
        const f = compilerFixture({ documentCount });
        const packages = Array.from({ length: 200 }, (_, index) => compilePackage(f.definition, { ...f.input, data: { employeeId: String(index) } }, f.directory));
        const capacity = admission(packages);
        assert.equal(capacity.documents, 200 * documentCount);
        assert.equal(capacity.uniqueSourceBytes, 2048);
        assert.throws(() => admission([...packages, packages[0]]), error('CAPACITY_BUDGET_EXCEEDED'));
    }
});

test('unknown people, changed sources, overflow geometry and unknown data keys are blockers', () => {
    const f = compilerFixture();
    assert.throws(() => compilePackage(f.definition, { ...f.input, data: { employeeId: '1', surprise: true } }, f.directory), error('UNKNOWN_DATA_KEY'));
    const unknown = clone(f.input); unknown.roles.employee[0].personId = randomUUID();
    assert.throws(() => compilePackage(f.definition, unknown, f.directory), error('PARTICIPANT_NOT_AVAILABLE'));
    f.directory.sources.get(f.sourceId).content_sha256 = 'b'.repeat(64);
    assert.throws(() => compilePackage(f.definition, f.input, f.directory), error('SOURCE_CHANGED'));
    f.directory.sources.get(f.sourceId).content_sha256 = 'a'.repeat(64);
    const definition = clone(f.definition); definition.documents[0].fields[0].y = 1500;
    assert.throws(() => compilePackage(validateDefinition(definition), f.input, f.directory), error('INVALID_GEOMETRY'));
});

test('optional role needs an authored inactive treatment; informational annex is never counted signed', () => {
    const f = compilerFixture();
    const definition = clone(f.definition);
    definition.roles.push({ key: 'optional', label: 'Optional', capacity: 'personal', min: 0, max: 1, stage: 0 });
    definition.documents[0].fields.push({ ...definition.documents[0].fields[1], id: 'optional', roleKey: 'optional' });
    assert.throws(() => validateDefinition(definition), error('OPTIONAL_ROLE_TREATMENT_REQUIRED'));
    definition.documents[0].fields.at(-1).inactiveTreatment = 'authored_inactive';
    definition.documents.push({ key: 'annex', name: 'Information', sourceArtifactId: f.sourceId, sourceHash: 'a'.repeat(64), informational: true, viewRoles: ['employee'], fields: [] });
    const compiled = compilePackage(validateDefinition(definition), f.input, f.directory);
    assert.equal(compiled.snapshot.documents.length, 4);
    assert.equal(compiled.snapshot.tasks.length, 3);
    assert.equal(compiled.snapshot.documents[0].fields.at(-1).active, false);
    definition.documents.at(-1).fields.push(clone(definition.documents[0].fields[1]));
    assert.throws(() => validateDefinition(definition), error('INFORMATIONAL_SIGNATURE'));
});

test('two named corporate representatives need distinct verified people and current scoped authority', () => {
    const f = compilerFixture();
    const definition = clone(f.definition), input = clone(f.input);
    const companyId = randomUUID();
    f.directory.parties.set(companyId, { id: companyId, kind: 'legal_entity', name: 'Synthetic company' });
    definition.roles.push({ key: 'officer', label: 'Officer', capacity: 'representative', min: 2, max: 2, stage: 0 });
    definition.signingRules.push({ type: 'all_named', roles: [{ key: 'officer', occurrence: 0 }, { key: 'officer', occurrence: 1 }] });
    definition.documents[0].fields.push(...[0, 1].map(occurrence => ({ ...definition.documents[0].fields[1], id: `officer${occurrence}`, roleKey: 'officer', occurrence })));
    const authorityId = randomUUID();
    const authority = { id: authorityId, person_id: f.personId, represented_party_id: companyId, status: 'approved',
        valid_from: '2020-01-01T00:00:00Z', valid_until: null, scope: { roleKeys: ['officer'] }, version: 1 };
    f.directory.authorities.set(authorityId, authority);
    input.roles.officer = [0, 1].map(() => ({ personId: f.personId, partyId: companyId, authorityId }));
    const published = validateDefinition(definition);
    assert.throws(() => compilePackage(published, input, f.directory), error('DISTINCT_PEOPLE_REQUIRED'));
    const secondPerson = randomUUID(), secondAuthority = randomUUID();
    f.directory.people.set(secondPerson, { id: secondPerson, name: 'Second', identity_key: 'synthetic-second' });
    f.directory.authorities.set(secondAuthority, { ...authority, id: secondAuthority, person_id: secondPerson });
    input.roles.officer[1] = { personId: secondPerson, partyId: companyId, authorityId: secondAuthority };
    input.delivery[secondPerson] = clone(input.delivery[f.personId]);
    const compiled = compilePackage(published, input, f.directory);
    assert.equal(compiled.snapshot.participants.length, 3);
    assert.equal(compiled.snapshot.delivery.length, 2);
    assert.equal(compiled.snapshot.tasks.length, 5);
    f.directory.authorities.get(secondAuthority).status = 'revoked';
    assert.throws(() => compilePackage(published, input, f.directory), error('AUTHORITY_EXPIRED'));
    definition.signingRules[1].type = 'quorum';
    assert.throws(() => validateDefinition(definition), error('WORKFLOW_NOT_ENABLED'));
});
