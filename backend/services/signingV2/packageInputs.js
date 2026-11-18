'use strict';
const { expect } = require('../../lib/signingV2/errors');
const { DATA_FIELDS, ROLE_FIELDS } = require('../../lib/wordTemplates/catalog');
const records = require('./wordTemplates');
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => value == null || Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
function sourceKey(field) {
    const source = field.source;
    return source.kind === 'manual' ? `manual.${field.key}` : source.kind === 'role'
        ? `role.${source.roleKey}.${source.property}` : `${source.kind}.${source.property}`;
}
function linked(field) {
    if (field.source.kind === 'role') return ROLE_FIELDS.find(item => item.property === field.source.property)?.resolver === 'role';
    return DATA_FIELDS.find(item => item.key === sourceKey(field))?.resolver !== 'manual' && field.source.kind !== 'manual';
}
function recordFor(field, input) {
    return field.source.kind === 'role' ? input.roleClientIds[field.source.roleKey] ?? null : field.source.kind === 'client'
        ? input.clientId : field.source.kind === 'case' ? input.caseId : null;
}
function conditionKeys(definition) {
    const keys=new Set();
    const visit=condition=>{if(!condition)return;if(condition.key)keys.add(condition.key);(condition.conditions||[]).forEach(visit);};
    (definition.signing?.roles||[]).forEach(role=>visit(role.when));
    return keys;
}
function referencedKeys(definition) {
    if(!definition.documents) return new Set(definition.fields.map(field=>field.key));
    const keys=new Set(definition.documents.flatMap(doc=>[...doc.mappings.map(mapping=>mapping.fieldKey),...doc.signatureFields.filter(field=>field.type==='data').map(field=>field.dataKey)]));
    conditionKeys(definition).forEach(key=>keys.add(key));
    return keys;
}
async function resolve(db, scope, definition, input, { lock = false } = {}) {
    expect(plain(input) && Object.keys(input).every(k => ['clientId','caseId','roleClientIds','values'].includes(k)), 'INVALID_PACKAGE_INPUTS');
    expect(id(input.clientId) && id(input.caseId) && plain(input.roleClientIds || {}) && plain(input.values || {}), 'INVALID_PACKAGE_INPUTS');
    const normalized = { clientId: input.clientId ?? null, caseId: input.caseId ?? null,
        roleClientIds: { ...input.roleClientIds }, values: { ...input.values } };
    expect(Object.entries(normalized.roleClientIds).every(([key,value]) => definition.dataRoles.some(role => role.key === key) && id(value) && value !== null), 'INVALID_PACKAGE_INPUTS');
    expect(Object.keys(normalized.values).every(key => definition.fields.some(field => field.key === key)), 'UNKNOWN_DATA_KEY');
    const keys=referencedKeys(definition);
    const activeFields=definition.fields.filter(field=>keys.has(field.key));
    const raw = await records.resolveRecordValues(db, scope, { ...normalized, manualValues: {} }, lock,
        new Set(activeFields.map(sourceKey)));
    const fields = activeFields.map(field => {
        const override = normalized.values[field.key];
        if (override !== undefined) {
            expect(plain(override) && Object.keys(override).every(k => ['value','recordId'].includes(k))
                && typeof override.value === 'string' && override.value.length <= 10000
                && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r\n\t]/u.test(override.value), 'INVALID_PACKAGE_INPUTS');
            // An override follows its selected person/case, not just its label.
            if (linked(field)) expect(Object.hasOwn(override,'recordId') && override.recordId === recordFor(field,normalized), 'PACKAGE_INPUT_PERSON_CHANGED');
            else expect(!Object.hasOwn(override,'recordId'), 'INVALID_PACKAGE_INPUTS');
        }
        const value = override?.value ?? String(raw[sourceKey(field)] ?? '');
        const maxLength = conditionKeys(definition).has(field.key) || definition.documents?.some(doc=>doc.signatureFields.some(item=>item.type==='data'&&item.dataKey===field.key)) ? 2000 : 10000;
        expect(value.length<=maxLength,'PACKAGE_VALUE_TOO_LONG',field.key);
        return { ...field, value, maxLength, missing: !value.trim(), overridden: override !== undefined,
            linked: linked(field), recordId: linked(field) ? recordFor(field,normalized) : null };
    });
    return { fields, inputs: normalized };
}
module.exports = { resolve, sourceKey, linked, recordFor, referencedKeys };
