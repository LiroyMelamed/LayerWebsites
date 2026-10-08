const { expect } = require('./errors');
const { canonical, digest, freeze, HASH_VERSION } = require('./canonical');
const limits = require('./limits');
const { normalizeSigningOrder } = require('./signingOrder');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-zA-Z0-9_]{0,63}$/;
const DATA_TYPES = new Set(['text', 'identifier', 'decimal', 'date', 'boolean', 'enum']);
const FIELD_TYPES = new Set(['data', 'signature', 'initials', 'text', 'date', 'checkbox']);
const CAPACITIES = new Set(['personal', 'representative', 'professional']);
const LOCALES = new Set(['he', 'ar', 'en']);

function list(value, max, path, min = 0) {
    expect(Array.isArray(value) && value.length >= min && value.length <= max, 'INVALID_DEFINITION', path);
    return value;
}
function text(value, max, path) {
    expect(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_DEFINITION', path);
    return value.trim();
}
function keyed(values, path) {
    const map = new Map();
    for (const item of values) {
        expect(item && KEY.test(item.key) && !map.has(item.key), 'INVALID_DEFINITION', path);
        map.set(item.key, item);
    }
    return map;
}
// Preview admission changes when evaluation semantics change. Existing immutable
// snapshots are never re-evaluated; a new submission must review the new result.
const CONDITION_EVALUATOR_VERSION = 2;
function validateCondition(condition, keys, path, budget = { nodes: 0 }, depth = 0) {
    if (condition == null) return null;
    expect(typeof condition === 'object' && !Array.isArray(condition) && ++budget.nodes <= 50 && depth <= 4, 'INVALID_CONDITION', path);
    if (['all', 'any'].includes(condition.operator)) {
        expect(condition.key === undefined && condition.value === undefined && condition.values === undefined, 'INVALID_CONDITION', path);
        expect(Array.isArray(condition.conditions) && condition.conditions.length > 0 && condition.conditions.length <= 20, 'INVALID_CONDITION', path);
        condition.conditions.forEach((child, index) => {
            expect(child != null, 'INVALID_CONDITION', `${path}.conditions.${index}`);
            validateCondition(child, keys, `${path}.conditions.${index}`, budget, depth + 1);
        });
        return condition;
    }
    expect(condition.conditions === undefined, 'INVALID_CONDITION', path);
    expect(condition && keys.has(condition.key), 'INVALID_CONDITION', path);
    expect(['equals', 'in', 'present'].includes(condition.operator), 'INVALID_CONDITION', path);
    const values = condition.operator === 'in' ? list(condition.values, 50, path, 1) : [condition.value];
    const comparison = value => {
        const normalized = normalizeValue(keys.get(condition.key), value, path);
        expect(normalized !== null, 'INVALID_CONDITION', path);
        return normalized;
    };
    if (condition.operator === 'in') condition.values = values.map(comparison);
    if (condition.operator === 'equals') condition.value = comparison(condition.value);
    return condition;
}
function decimalComparable(value) {
    const trimmed = value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return trimmed === '-0' ? '0' : trimmed;
}
function evaluateCondition(condition, data, keys) {
    if (!condition) return { result: true };
    if (['all', 'any'].includes(condition.operator)) {
        const decisive = condition.operator === 'any';
        let unknown;
        for (const child of condition.conditions) {
            const evaluated = evaluateCondition(child, data, keys);
            if (evaluated.result === decisive) return evaluated;
            if (evaluated.missingKey) unknown ||= evaluated;
        }
        return unknown || { result: !decisive };
    }
    const value = data[condition.key];
    if (condition.operator === 'present') return { result: value !== null && value !== undefined && value !== '' };
    // Unknown is not false: otherwise missing input could silently omit a
    // required annex or participant. Only an explicit presence rule can do so.
    if (value === null || value === undefined || value === '') return { result: null, missingKey: condition.key };
    const values = condition.operator === 'in' ? condition.values : [condition.value];
    const compare = keys.get(condition.key)?.type === 'decimal' ? decimalComparable : canonical;
    return { result: values.some(candidate => compare(candidate) === compare(value)) };
}
function conditionMatches(condition, data, keys = new Map()) {
    const evaluated = evaluateCondition(condition, data, keys);
    expect(evaluated.result !== null, 'DATA_REQUIRED', evaluated.missingKey);
    return evaluated.result;
}

function normalizeValue(field, value, path = field.key) {
    if (value === null || value === undefined || value === '') {
        expect(!field.required, 'DATA_REQUIRED', path);
        return null;
    }
    if (field.type === 'boolean') {
        expect(typeof value === 'boolean', 'INVALID_DATA', path);
        return value;
    }
    // Identifiers and exact decimal amounts must arrive as strings, never rounded spreadsheet numbers.
    expect(typeof value === 'string', 'INVALID_DATA', path);
    const normalized = value.normalize('NFC').trim();
    expect(normalized.length > 0 && normalized.length <= (field.maxLength || 2000), 'INVALID_DATA', path);
    expect(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized), 'INVALID_DATA', path);
    if (field.type === 'decimal') expect(/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(normalized), 'INVALID_DATA', path);
    if (field.type === 'date') {
        expect(/^\d{4}-\d{2}-\d{2}$/.test(normalized), 'AMBIGUOUS_DATE', path);
        const date = new Date(`${normalized}T00:00:00Z`);
        expect(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized, 'INVALID_DATA', path);
    }
    if (field.type === 'enum') expect(field.options.includes(normalized), 'INVALID_DATA', path);
    return normalized;
}

function validateDefinition(input) {
    expect(input?.schemaVersion === 2, 'INVALID_DEFINITION');
    // Copy caller data before normalizing; the published object never shares mutable input state.
    const definition = JSON.parse(canonical(input));
    definition.name = text(definition.name, 200, 'name');
    expect(LOCALES.has(definition.locale), 'INVALID_LOCALE', 'locale');
    const keys = keyed(list(definition.dataKeys || [], limits.dataKeys, 'dataKeys'), 'dataKeys');
    for (const field of keys.values()) {
        expect(DATA_TYPES.has(field.type), 'INVALID_DEFINITION', `dataKeys.${field.key}`);
        expect(field.required === undefined || typeof field.required === 'boolean', 'INVALID_DEFINITION', field.key);
        if (field.maxLength !== undefined) expect(Number.isInteger(field.maxLength) && field.maxLength > 0 && field.maxLength <= 2000, 'INVALID_DEFINITION', field.key);
        if (field.type === 'enum') list(field.options, 50, field.key, 1).forEach(option => text(option, 200, field.key));
        if (field.defaultValue !== undefined) field.defaultValue = normalizeValue(field, field.defaultValue);
    }
    const stages = list(definition.stages, limits.stages, 'stages', 1);
    keyed(stages, 'stages');
    stages.forEach((stage, index) => {
        text(stage.label, 200, `stages.${index}.label`);
        // F1 is a linear sequence of parallel stages. More general DAGs are not silently accepted.
        expect(stage.after === (index === 0 ? null : stages[index - 1].key), 'INVALID_WORKFLOW', `stages.${index}.after`);
    });
    const roles = keyed(list(definition.roles, limits.participationsPerPackage, 'roles', 1), 'roles');
    let maximumPeople = 0;
    for (const role of roles.values()) {
        text(role.label, 200, `roles.${role.key}.label`);
        expect(CAPACITIES.has(role.capacity), 'INVALID_DEFINITION', role.key);
        expect(Number.isInteger(role.min) && Number.isInteger(role.max) && role.min >= 0 && role.max >= Math.max(role.min, 1), 'INVALID_DEFINITION', role.key);
        expect(Number.isInteger(role.stage) && role.stage >= 0 && role.stage < stages.length, 'INVALID_WORKFLOW', role.key);
        maximumPeople += role.max;
        validateCondition(role.when, keys, role.key);
    }
    expect(maximumPeople <= limits.participationsPerPackage, 'CAPACITY_BUDGET_EXCEEDED', 'roles');
    const documents = keyed(list(definition.documents, limits.documentsPerPackage, 'documents', 1), 'documents');
    for (const document of documents.values()) {
        text(document.name, 200, `documents.${document.key}.name`);
        expect(document.informational === undefined || typeof document.informational === 'boolean', 'INVALID_DEFINITION', document.key);
        const viewRoles = document.viewRoles || [];
        expect(Array.isArray(viewRoles) && viewRoles.length <= roles.size && new Set(viewRoles).size === viewRoles.length
            && viewRoles.every(key => roles.has(key)), 'INVALID_DOCUMENT_VISIBILITY', document.key);
        expect(!document.informational || viewRoles.length > 0, 'DOCUMENT_VIEW_ROLES_REQUIRED', document.key);
        expect(UUID.test(document.sourceArtifactId) && /^[a-f0-9]{64}$/.test(document.sourceHash), 'INVALID_SOURCE', document.key);
        validateCondition(document.when, keys, document.key);
        const fields = list(document.fields || [], limits.fieldsPerDocument, `${document.key}.fields`);
        const fieldIds = new Set();
        for (const field of fields) {
            const path = `${document.key}.${field.id}`;
            expect(KEY.test(field.id) && !fieldIds.has(field.id), 'INVALID_DEFINITION', path);
            fieldIds.add(field.id);
            expect(FIELD_TYPES.has(field.type), 'INVALID_DEFINITION', path);
            expect(field.required === undefined || typeof field.required === 'boolean', 'INVALID_DEFINITION', path);
            expect(Number.isInteger(field.pageNum) && field.pageNum >= 1 && field.pageNum <= limits.sourcePagesPerDocument, 'INVALID_GEOMETRY', path);
            expect(['x', 'y', 'width', 'height'].every(key => typeof field[key] === 'number' && Number.isFinite(field[key])), 'INVALID_GEOMETRY', path);
            expect(field.x >= 0 && field.y >= 0 && field.width > 0 && field.height > 0 && field.x + field.width <= 800, 'INVALID_GEOMETRY', path);
            if (field.type === 'data') {
                expect(keys.has(field.dataKey), 'INVALID_DEFINITION', path);
                expect(field.overflow === 'block', 'INVALID_DEFINITION', path);
                expect(Number.isFinite(field.fontSize) && field.fontSize >= 8 && field.fontSize <= 72, 'INVALID_DEFINITION', path);
                expect(['start', 'center', 'end'].includes(field.align || 'start'), 'INVALID_DEFINITION', path);
            } else {
                expect(!document.informational, 'INFORMATIONAL_SIGNATURE', path);
                const role = roles.get(field.roleKey);
                expect(role && Number.isInteger(field.occurrence) && field.occurrence >= 0 && field.occurrence < role.max, 'INVALID_ROLE_BINDING', path);
                if (role.min <= field.occurrence || role.when) {
                    expect(['authored_inactive', 'exclude_document'].includes(field.inactiveTreatment), 'OPTIONAL_ROLE_TREATMENT_REQUIRED', path);
                }
            }
        }
        expect(document.informational || fields.some(field => field.type !== 'data' && field.required), 'NO_SIGNING_OBLIGATIONS', document.key);
    }
    for (const rule of list(definition.signingRules || [], limits.participationsPerPackage, 'signingRules')) {
        expect(['specific', 'all_named'].includes(rule.type), 'WORKFLOW_NOT_ENABLED', 'signingRules');
        const refs = list(rule.roles, 2, 'signingRules.roles', rule.type === 'specific' ? 1 : 2);
        expect(refs.length === (rule.type === 'specific' ? 1 : 2), 'INVALID_WORKFLOW', 'signingRules.roles');
        const unique = new Set();
        refs.forEach(ref => {
            const role = roles.get(ref.key);
            expect(role && Number.isInteger(ref.occurrence) && ref.occurrence >= 0 && ref.occurrence < role.max, 'INVALID_ROLE_BINDING', 'signingRules.roles');
            unique.add(`${ref.key}:${ref.occurrence}`);
        });
        expect(unique.size === refs.length, 'DISTINCT_PEOPLE_REQUIRED', 'signingRules.roles');
    }
    definition.dataKeys = [...keys.values()];
    definition.signingRules ||= [];
    definition.policy ||= {};
    for (const flag of ['internalApproval', 'requiredAllPdfReview', 'identityBeforeView']) {
        expect(definition.policy[flag] === undefined || typeof definition.policy[flag] === 'boolean', 'INVALID_DEFINITION', `policy.${flag}`);
    }
    expect(definition.policy.otpRequired === true, 'OTP_REQUIRED', 'policy.otpRequired');
    expect(['invite', 'manual'].includes(definition.policy.deliveryMode), 'INVALID_DEFINITION', 'policy.deliveryMode');
    expect(!definition.policy.identityBeforeView, 'WORKFLOW_NOT_ENABLED', 'policy.identityBeforeView');
    return freeze(definition);
}

function signingStages(definition, input, omitted) {
    const order = input.signingOrder;
    if (order == null) return null;
    const active = definition.roles.filter(role => !omitted.has(role.key)).map(role => role.key);
    const normalized = normalizeSigningOrder(order, active);
    if (order.mode === 'parallel') {
        return {
            byRole: new Map(definition.roles.map(role => [role.key, 0])),
            stages: [{ key: 'together', label: definition.name, after: null }],
        };
    }
    const groups = normalized.mode === 'grouped' ? normalized.groups : normalized.roles.map(key => [key]);
    return {
        byRole: new Map(groups.flatMap((roles, index) => roles.map(key => [key, index]))),
        stages: groups.map((roles, index) => ({
            key: `order${index + 1}`,
            label: roles.map(key => definition.roles.find(role => role.key === key).label).join(' · '),
            after: index ? `order${index}` : null,
        })),
    };
}

function compilePackage(definition, input, directory, now = new Date()) {
    const data = {};
    const provenance = {};
    const dataKeys = new Map(definition.dataKeys.map(field => [field.key, field]));
    const validKeys = new Set(definition.dataKeys.map(field => field.key));
    expect(Object.keys(input.data || {}).every(key => validKeys.has(key)), 'UNKNOWN_DATA_KEY');
    for (const key of definition.dataKeys) {
        const provided = Object.hasOwn(input.data || {}, key.key);
        data[key.key] = normalizeValue(key, provided ? input.data[key.key] : key.defaultValue);
        const origin = input.provenance?.[key.key];
        expect(!origin || ['manual', 'client', 'case', 'import', 'collected', 'default'].includes(origin.source), 'INVALID_PROVENANCE', key.key);
        provenance[key.key] = origin ? JSON.parse(canonical(origin)) : { source: provided ? 'manual' : 'default' };
    }
    const participants = [];
    const byRole = new Map();
    const knownRoles = new Set(definition.roles.map(role => role.key));
    const omitted = new Set(Array.isArray(input.omitRoles) ? input.omitRoles : []);
    expect(input.omitRoles === undefined || (Array.isArray(input.omitRoles) && omitted.size === input.omitRoles.length && [...omitted].every(key => knownRoles.has(key)) && omitted.size < knownRoles.size), 'INVALID_ROLE_BINDING');
    const chosenOrder = signingStages(definition, input, omitted);
    expect(Object.keys(input.roles || {}).every(key => knownRoles.has(key) && !omitted.has(key)), 'INVALID_ROLE_BINDING');
    for (const role of definition.roles) {
        const assignments = input.roles?.[role.key] || [];
        expect(Array.isArray(assignments), 'INVALID_ROLE_BINDING', role.key);
        if (omitted.has(role.key)) {
            expect(assignments.length === 0, 'ROLE_CAPACITY_EXCEEDED', role.key);
            continue;
        }
        const active = conditionMatches(role.when, data, dataKeys);
        expect(active ? assignments.length >= role.min && assignments.length <= role.max : assignments.length === 0, 'ROLE_CAPACITY_EXCEEDED', role.key);
        assignments.forEach((assignment, occurrence) => {
            const person = directory.people.get(assignment.personId);
            const party = directory.parties.get(assignment.partyId);
            expect(person && party, 'PARTICIPANT_NOT_AVAILABLE', role.key);
            if (role.capacity === 'personal') expect(party.kind === 'person' && party.person_id === person.id, 'INVALID_CAPACITY', role.key);
            let authority = null;
            if (role.capacity === 'representative') {
                authority = directory.authorities.get(assignment.authorityId);
                expect(party.kind === 'legal_entity' && authority?.person_id === person.id && authority?.represented_party_id === party.id, 'AUTHORITY_REQUIRED', role.key);
                expect(authority.status === 'approved' && new Date(authority.valid_from) <= now && (!authority.valid_until || new Date(authority.valid_until) > now), 'AUTHORITY_EXPIRED', role.key);
                expect(authority.scope?.roleKeys?.includes(role.key) || authority.scope?.allSigning === true, 'AUTHORITY_SCOPE_MISMATCH', role.key);
            }
            const participant = {
                roleKey: role.key, occurrence, capacity: role.capacity, stage: chosenOrder ? chosenOrder.byRole.get(role.key) : role.stage,
                personId: person.id, partyId: party.id,
                authorityId: authority?.id || null, authorityVersion: authority?.version || null,
                identity: { name: person.name, personId: person.id, identityKey: person.identity_key || null, partyName: party.name, partyKind: party.kind },
            };
            participants.push(participant);
            byRole.set(`${role.key}:${occurrence}`, participant);
        });
    }
    expect(participants.length <= limits.participationsPerPackage, 'CAPACITY_BUDGET_EXCEEDED');
    for (const rule of definition.signingRules) {
        const selected = rule.roles.map(ref => byRole.get(`${ref.key}:${ref.occurrence}`));
        expect(selected.every(Boolean), 'ROLE_REQUIRED', 'signingRules');
        if (rule.type === 'all_named') {
            expect(selected.every(person => person.identity.identityKey), 'IDENTITY_VERIFICATION_REQUIRED', 'signingRules');
            expect(new Set(selected.map(person => person.personId)).size === 2 && new Set(selected.map(person => person.identity.identityKey)).size === 2, 'DISTINCT_PEOPLE_REQUIRED', 'signingRules');
        }
    }
    const documents = [];
    const exclusions = [];
    const tasks = [];
    for (const document of definition.documents) {
        const missing = document.fields.filter(field => field.type !== 'data' && !byRole.has(`${field.roleKey}:${field.occurrence}`));
        const included = conditionMatches(document.when, data, dataKeys);
        if (!included || missing.some(field => field.inactiveTreatment === 'exclude_document')) {
            exclusions.push({ documentKey: document.key, reason: !included ? 'condition' : 'inactive_role' });
            continue;
        }
        const source = directory.sources.get(document.sourceArtifactId);
        expect(source?.state === 'ready' && source.kind === 'source' && source.content_sha256 === document.sourceHash, 'SOURCE_CHANGED', document.key);
        expect(source.bytes > 0 && source.bytes <= limits.sourceBytesPerDocument, 'CAPACITY_BUDGET_EXCEEDED', document.key);
        const pages = source.metadata.pages;
        expect(Array.isArray(pages) && pages.length > 0 && pages.length <= limits.sourcePagesPerDocument, 'INVALID_SOURCE', document.key);
        const fields = document.fields.map(field => {
            const page = pages[field.pageNum - 1];
            expect(page && page.width > 0 && page.height > 0 && field.y + field.height <= 800 * page.height / page.width, 'INVALID_GEOMETRY', `${document.key}.${field.id}`);
            if (field.type === 'data') return { ...field, value: data[field.dataKey] };
            return { ...field, active: byRole.has(`${field.roleKey}:${field.occurrence}`) };
        });
        const byParticipant = new Map();
        for (const field of fields.filter(item => item.type !== 'data' && item.active)) {
            const ref = `${field.roleKey}:${field.occurrence}`;
            if (!byParticipant.has(ref)) byParticipant.set(ref, []);
            byParticipant.get(ref).push(field);
        }
        for (const [ref, obligations] of byParticipant) {
            const participant = byRole.get(ref);
            tasks.push({ documentKey: document.key, roleKey: participant.roleKey, occurrence: participant.occurrence,
                stage: participant.stage, required: obligations.some(field => field.required), fieldIds: obligations.map(field => field.id) });
        }
        const readPersonIds = [...new Set(participants.filter(person => document.viewRoles?.includes(person.roleKey)
            || byParticipant.has(`${person.roleKey}:${person.occurrence}`)).map(person => person.personId))].sort();
        expect(readPersonIds.length > 0, 'INVALID_DOCUMENT_VISIBILITY', document.key);
        documents.push({ key: document.key, name: document.name, sourceArtifactId: source.id, sourceHash: source.content_sha256,
            sourceBytes: Number(source.bytes), pages, informational: Boolean(document.informational), fields,
            readPersonIds,
            inclusionReason: { rule: document.when || null, result: true } });
    }
    expect(documents.length > 0 && tasks.some(task => task.required), 'NO_SIGNING_OBLIGATIONS');
    for (const rule of definition.signingRules) for (const ref of rule.roles) {
        expect(tasks.some(task => task.roleKey === ref.key && task.occurrence === ref.occurrence && task.required), 'RULE_WITHOUT_REQUIRED_TASK');
    }
    // Every selected participant must have an actual task. Hidden, unused recipients cannot get an invite.
    for (const participant of participants) expect(tasks.some(task => task.roleKey === participant.roleKey && task.occurrence === participant.occurrence), 'ROLE_WITHOUT_DOCUMENTS', participant.roleKey);
    const personIds = [...new Set(participants.map(person => person.personId))];
    expect(Object.keys(input.delivery || {}).every(id => personIds.includes(id)), 'INVALID_DELIVERY');
    const delivery = personIds.map(personId => {
        const profile = input.delivery?.[personId];
        expect(profile && LOCALES.has(profile.locale), 'INVALID_DELIVERY', personId);
        expect(Array.isArray(profile.channels) && profile.channels.length > 0 && profile.channels.length <= 2 && new Set(profile.channels).size === profile.channels.length, 'INVALID_DELIVERY', personId);
        for (const channel of profile.channels) {
            expect(['email', 'sms', 'manual'].includes(channel), 'INVALID_DELIVERY', personId);
            if (channel === 'email') expect(typeof profile.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) && profile.email.length <= 254, 'INVALID_DELIVERY', personId);
            if (channel === 'sms') expect(/^\+[1-9]\d{7,14}$/.test(profile.phone || ''), 'INVALID_DELIVERY', personId);
        }
        expect(definition.policy.deliveryMode === 'manual' ? profile.channels.length === 1 && profile.channels[0] === 'manual' : !profile.channels.includes('manual'), 'INVALID_DELIVERY', personId);
        return { personId, locale: profile.locale, channels: [...profile.channels].sort(), email: profile.email || null, phone: profile.phone || null };
    });
    const deadline = input.deadline || null;
    if (deadline) expect(typeof deadline === 'string' && /Z$/.test(deadline) && new Date(deadline) > now, 'INVALID_DEADLINE');
    const snapshot = { schemaVersion: 2, definitionHash: digest(definition), locale: definition.locale, data, provenance,
        participants, documents, exclusions, tasks, stages: chosenOrder ? chosenOrder.stages : definition.stages, signingRules: definition.signingRules,
        policy: definition.policy, delivery, deadline };
    expect(Buffer.byteLength(canonical(snapshot)) <= limits.snapshotBytes, 'CAPACITY_BUDGET_EXCEEDED');
    return freeze({ snapshot, hash: digest(snapshot), hashVersion: HASH_VERSION });
}

function admission(compiled) {
    expect(compiled.length > 0 && compiled.length <= limits.packages, 'CAPACITY_BUDGET_EXCEEDED');
    const sources = new Map();
    let documents = 0, outputPages = 0, estimatedOutputBytes = 0, snapshotBytes = 0;
    for (const item of compiled) {
        snapshotBytes += Buffer.byteLength(canonical(item.snapshot));
        for (const document of item.snapshot.documents) {
            documents += 1;
            sources.set(document.sourceArtifactId, document.sourceBytes);
            outputPages += document.pages.length;
            // A conservative reservation; renderer verifies the actual output before activation.
            estimatedOutputBytes += document.sourceBytes + document.pages.length * 32 * 1024;
        }
    }
    const uniqueSourceBytes = [...sources.values()].reduce((sum, bytes) => sum + bytes, 0);
    expect(documents <= limits.totalDocuments && outputPages <= limits.outputPages && estimatedOutputBytes <= limits.outputBytes && uniqueSourceBytes <= limits.uniqueSourceBytes && snapshotBytes <= limits.snapshotBytes, 'CAPACITY_BUDGET_EXCEEDED');
    return { packages: compiled.length, documents, outputPages, estimatedOutputBytes, uniqueSourceBytes, snapshotBytes };
}

module.exports = { validateDefinition, compilePackage, admission, normalizeValue, conditionMatches, CONDITION_EVALUATOR_VERSION, UUID, LOCALES };
