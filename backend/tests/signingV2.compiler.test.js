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

test('one send can leave out a signer while the published template stays unchanged', () => {
    const f = compilerFixture();
    const definition = clone(f.definition);
    definition.roles.push({ key: 'witness', label: 'Witness', capacity: 'personal', min: 1, max: 1, stage: 0 });
    definition.documents[0].fields.push({ ...definition.documents[0].fields[1], id: 'witness', roleKey: 'witness' });
    const published = validateDefinition(definition);
    const input = clone(f.input);
    input.omitRoles = ['witness'];
    const compiled = compilePackage(published, input, f.directory);
    assert.equal(compiled.snapshot.definitionHash, digest(published));
    assert.deepEqual(compiled.snapshot.participants.map(person => person.roleKey), ['employee']);
    assert.equal(compiled.snapshot.documents[0].fields.find(field => field.id === 'witness').active, false);
    assert.equal(compiled.snapshot.tasks.every(task => task.roleKey !== 'witness'), true);
    assert.throws(() => compilePackage(published, { ...input, omitRoles: ['employee', 'witness'] }, f.directory), error('INVALID_ROLE_BINDING'));
    const witnessId = randomUUID(), witnessParty = randomUUID();
    f.directory.people.set(witnessId, { id: witnessId, name: 'Witness', identity_key: null });
    f.directory.parties.set(witnessParty, { id: witnessParty, kind: 'person', person_id: witnessId, name: 'Witness' });
    const withoutEmployee = clone(f.input);
    delete withoutEmployee.roles.employee;
    withoutEmployee.roles.witness = [{ personId: witnessId, partyId: witnessParty }];
    withoutEmployee.delivery[witnessId] = clone(withoutEmployee.delivery[f.personId]);
    delete withoutEmployee.delivery[f.personId];
    withoutEmployee.omitRoles = ['employee'];
    assert.throws(() => compilePackage(published, withoutEmployee, f.directory), error('ROLE_REQUIRED'));
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

test('a send can ask everyone to sign together or one role after another without changing the template', () => {
    const f = compilerFixture();
    const definition = clone(f.definition);
    definition.roles.push({ key: 'lawyer', label: 'Lawyer', capacity: 'personal', min: 1, max: 1, stage: 0 });
    definition.documents[0].fields.push({ ...definition.documents[0].fields[1], id: 'lawyer', roleKey: 'lawyer' });
    const published = validateDefinition(definition);
    const lawyerId = randomUUID(), lawyerParty = randomUUID();
    f.directory.people.set(lawyerId, { id: lawyerId, name: 'Lawyer', identity_key: null });
    f.directory.parties.set(lawyerParty, { id: lawyerParty, kind: 'person', person_id: lawyerId, name: 'Lawyer' });
    const input = clone(f.input);
    input.roles.lawyer = [{ personId: lawyerId, partyId: lawyerParty }];
    input.delivery[lawyerId] = clone(input.delivery[f.personId]);
    const together = compilePackage(published, { ...input, signingOrder: { mode: 'parallel' } }, f.directory);
    assert.equal(together.snapshot.tasks.every(task => task.stage === 0), true);
    assert.equal(together.snapshot.definitionHash, digest(published));
    const ordered = compilePackage(published, { ...input, signingOrder: { mode: 'sequential', roles: ['lawyer', 'employee'] } }, f.directory);
    const stageOf = role => ordered.snapshot.participants.find(person => person.roleKey === role).stage;
    assert.equal(stageOf('lawyer'), 0);
    assert.equal(stageOf('employee'), 1);
    assert.deepEqual(ordered.snapshot.stages.map(stage => stage.label), ['Lawyer', 'Employee']);
    assert.throws(() => compilePackage(published, { ...input, signingOrder: { mode: 'sequential', roles: ['employee'] } }, f.directory), error('INVALID_WORKFLOW'));
});


test('grouped signing order rejects missing, duplicate, foreign or empty stage members and never mutates input', () => {
    const { normalizeSigningOrder } = require('../lib/signingV2/signingOrder');
    const input = { mode: 'grouped', groups: [['buyer', 'seller'], ['lawyer']] };
    const normalized = normalizeSigningOrder(input, ['buyer', 'seller', 'lawyer']);
    assert.deepEqual(normalized, input); normalized.groups[0].pop(); assert.equal(input.groups[0].length, 2);
    for (const groups of [null, [], [[]], [['buyer'], []], [['buyer','seller']], [['buyer','seller'], ['buyer','lawyer']],
        [['buyer','seller'], ['foreign']], [['buyer','seller'], 'lawyer'], [['buyer','seller'], [null]]]) {
        assert.throws(() => normalizeSigningOrder({mode:'grouped',groups}, ['buyer','seller','lawyer']), error('INVALID_WORKFLOW'));
    }
    assert.deepEqual(normalizeSigningOrder({ mode:'grouped', groups:[['buyer','lawyer']] }, ['buyer','lawyer']).groups, [['buyer','lawyer']]);
});

test('comparison conditions block unknown data; only presence explicitly accepts missing values', () => {
    const { conditionMatches, validateDefinition } = require('../lib/signingV2/compiler');
    for (const operator of ['equals', 'in']) {
        const condition = { key: 'flag', operator, value: false, values: [false] };
        for (const value of [undefined, null, '']) assert.throws(() => conditionMatches(condition, { flag: value }), { errorCode: 'DATA_REQUIRED' });
        assert.equal(conditionMatches(condition, { flag: false }), true);
        assert.equal(conditionMatches(condition, { flag: true }), false);
    }
    for (const value of [undefined, null, '']) assert.equal(conditionMatches({ key: 'flag', operator: 'present' }, { flag: value }), false);
    assert.equal(conditionMatches({ key: 'flag', operator: 'present' }, { flag: false }), true);
    const { compilerFixture } = require('./helpers/signingV2Fixture');
    const definition = structuredClone(compilerFixture().definition);
    definition.documents[0].when = { key: 'salary', operator: 'equals', value: null };
    assert.throws(() => validateDefinition(definition), { errorCode: 'INVALID_CONDITION' });
    definition.documents[0].when = { key: 'salary', operator: 'in', values: ['1.00', null] };
    assert.throws(() => validateDefinition(definition), { errorCode: 'INVALID_CONDITION' });
});
