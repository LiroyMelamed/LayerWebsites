'use strict';
// Reusable authoring metadata only. Per-client input values are deliberately not
// part of this schema; the existing signing compiler receives generated PDFs.
const { expect } = require('./errors');
const { UUID } = require('./compiler');
const { DATA_FIELDS, ROLE_FIELDS } = require('../wordTemplates/catalog');
const limits = require('./limits');
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
function shape(value, keys, code = 'INVALID_PACKAGE_RECIPE') {
    expect(plain(value) && Object.keys(value).every(key => keys.includes(key)), code);
}
function key(value) { expect(typeof value === 'string' && KEY.test(value) && !['constructor', 'prototype', '__proto__'].includes(value), 'INVALID_PACKAGE_RECIPE'); return value; }
function title(value) { expect(typeof value === 'string' && value.trim() && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value), 'INVALID_PACKAGE_RECIPE'); return value.trim(); }
function list(value, max) { expect(Array.isArray(value) && value.length <= max, 'INVALID_PACKAGE_RECIPE'); return value; }
function unique(items) { expect(new Set(items.map(item => item.key)).size === items.length, 'DUPLICATE_RECIPE_KEY'); }
function condition(value, fields, depth = 0, budget = { nodes: 0 }) {
    expect(depth <= 4 && ++budget.nodes <= 50, 'INVALID_CONDITION');
    shape(value, ['operator', 'key', 'value', 'values', 'conditions'], 'INVALID_CONDITION');
    if (['all', 'any'].includes(value.operator)) {
        expect(value.key === undefined && value.value === undefined && value.values === undefined
            && Array.isArray(value.conditions) && value.conditions.length > 0 && value.conditions.length <= 20, 'INVALID_CONDITION');
        value.conditions.forEach(child => condition(child, fields, depth + 1, budget));
    } else {
        expect(fields.some(field => field.key === value.key) && value.conditions === undefined, 'INVALID_CONDITION');
        expect(['equals', 'in', 'present'].includes(value.operator), 'INVALID_CONDITION');
        if (value.operator === 'equals') expect(typeof value.value === 'string' && value.values === undefined, 'INVALID_CONDITION');
        if (value.operator === 'in') expect(Array.isArray(value.values) && value.values.length > 0 && value.values.length <= 50
            && value.values.every(item => typeof item === 'string') && value.value === undefined, 'INVALID_CONDITION');
        if (value.operator === 'present') expect(value.value === undefined && value.values === undefined, 'INVALID_CONDITION');
    }
}
function normalizeRecipe(input, { draft = false } = {}) {
    const draftTitle = value => draft && typeof value === 'string' && !value.trim() ? '' : title(value);
    shape(input, ['schemaVersion', 'name', 'locale', 'dataRoles', 'signing', 'fields', 'documents']);
    expect(input.schemaVersion === 3 && ['he', 'en', 'ar'].includes(input.locale), 'INVALID_PACKAGE_RECIPE');
    const dataRoles = list(input.dataRoles, 40).map(role => {
        shape(role, ['key', 'label']); return { key: key(role.key), label: draftTitle(role.label) };
    });
    unique(dataRoles);
    const fields = list(input.fields, limits.dataKeys).map(field => {
        shape(field, ['key', 'label', 'source', 'required']);
        shape(field.source, ['kind', 'property', 'roleKey']);
        const source = field.source;
        expect(typeof field.required === 'boolean', 'INVALID_PACKAGE_RECIPE');
        if (source.kind === 'manual') expect(Object.keys(source).length === 1, 'INVALID_FIELD_SOURCE');
        else if (source.kind === 'role') {
            expect(dataRoles.some(role => role.key === source.roleKey) && ROLE_FIELDS.some(item => item.property === source.property), 'INVALID_FIELD_SOURCE');
        } else {
            expect(['client', 'case', 'office'].includes(source.kind) && !Object.hasOwn(source, 'roleKey')
                && DATA_FIELDS.some(item => item.key === `${source.kind}.${source.property}`), 'INVALID_FIELD_SOURCE');
        }
        return { key: key(field.key), label: draftTitle(field.label), source: { ...source }, required: field.required };
    });
    unique(fields);
    // Signing roles/settings keep the incumbent v2 contract. The native compiler
    // performs final validation after exact sources and geometry are prepared.
    shape(input.signing, ['roles', 'stages', 'policy', 'signingRules']);
    for(const rule of list(input.signing.signingRules||[],limits.participationsPerPackage)){
        shape(rule,['type','roles','source']);expect(['specific','all_named'].includes(rule.type)&&[undefined,'role_pair'].includes(rule.source),'INVALID_WORKFLOW');
        expect(Array.isArray(rule.roles)&&rule.roles.length===(rule.type==='specific'?1:2),'INVALID_WORKFLOW');
        for(const ref of rule.roles){shape(ref,['key','occurrence']);expect(input.signing.roles.some(role=>role.key===ref.key&&Number.isInteger(ref.occurrence)&&ref.occurrence>=0&&ref.occurrence<role.max),'INVALID_ROLE_BINDING');}
    }
    list(input.signing.roles, limits.participationsPerPackage);
    list(input.signing.stages, limits.stages);
    for (const role of input.signing.roles) {
        shape(role, ['key', 'label', 'capacity', 'audience', 'stage', 'min', 'max', 'when']);
        key(role.key); draftTitle(role.label);
        expect(['personal','representative','professional'].includes(role.capacity) && ['each','shared',undefined].includes(role.audience)
            && Number.isInteger(role.stage) && role.stage >= 0 && role.stage < input.signing.stages.length
            && Number.isInteger(role.min) && Number.isInteger(role.max) && role.min >= 0 && role.max >= Math.max(1,role.min) && role.max <= 8, 'INVALID_PACKAGE_RECIPE');
        if (role.when) condition(role.when, fields);
    }
    for (const stage of input.signing.stages) { shape(stage, ['key', 'label', 'after']); key(stage.key); draftTitle(stage.label); }
    shape(input.signing.policy, ['otpRequired', 'deliveryMode']);
    expect(input.signing.policy.otpRequired === true && input.signing.policy.deliveryMode === 'invite', 'INVALID_PACKAGE_RECIPE');
    unique(input.signing.roles); unique(input.signing.stages);
    const documents = list(input.documents, limits.documentsPerPackage).map(doc => {
        shape(doc, ['key', 'name', 'source', 'mappings', 'signatureFields']);
        shape(doc.source, ['kind', 'id', 'version', 'hash']);
        expect(['word', 'pdf'].includes(doc.source.kind) && UUID.test(doc.source.id) && HASH.test(doc.source.hash), 'INVALID_SOURCE');
        expect(Number.isSafeInteger(doc.source.version) && doc.source.version > 0, 'INVALID_SOURCE');
        if (doc.source.kind === 'pdf') expect(doc.source.version === 1, 'INVALID_SOURCE');
        const mappings = list(doc.mappings, 1000).map(mapping => {
            shape(mapping, ['bindingId', 'fieldKey']);
            expect(typeof mapping.bindingId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(mapping.bindingId)
                && fields.some(field => field.key === mapping.fieldKey), 'INVALID_FIELD_MAPPING');
            return { bindingId: mapping.bindingId, fieldKey: mapping.fieldKey };
        });
        expect(new Set(mappings.map(item => item.bindingId)).size === mappings.length, 'INVALID_FIELD_MAPPING');
        if (doc.source.kind === 'pdf') expect(mappings.length === 0, 'INVALID_FIELD_MAPPING');
        const signatureFields = list(doc.signatureFields, limits.fieldsPerDocument).map(field => {
            shape(field, ['key', 'type', 'roleKey', 'occurrence', 'required', 'placement', 'dataKey', 'fontSize', 'align', 'inactiveTreatment', 'label']);
            key(field.key);
            if(field.label!==undefined) expect(typeof field.label==='string'&&field.label.length<=120,'INVALID_RECIPE_FIELD');
            expect(['signature', 'initials', 'email', 'phone', 'text', 'date', 'checkbox', 'idnumber', 'lawyerStamp', 'data'].includes(field.type)
                && typeof field.required === 'boolean', 'INVALID_RECIPE_FIELD');
            if (field.type === 'data') expect(fields.some(item => item.key === field.dataKey), 'INVALID_RECIPE_FIELD');
            else expect(input.signing.roles.some(role => role.key === field.roleKey && Number.isInteger(field.occurrence) && field.occurrence >= 0 && field.occurrence < role.max), 'INVALID_RECIPE_FIELD');
            if (doc.source.kind === 'word') {
                shape(field.placement, ['kind', 'anchor', 'offsetX', 'offsetY', 'width', 'height']);
                expect(field.placement.kind === 'word-anchor', 'WORD_SIGNATURE_ANCHOR_REQUIRED');
                shape(field.placement.anchor, ['part', 'paragraphId', 'paragraphHash', 'start', 'end', 'selectedTextHash', 'sourceHash']);
                const a = field.placement.anchor;
                expect(a.sourceHash === doc.source.hash && HASH.test(a.paragraphHash) && HASH.test(a.selectedTextHash)
                    && typeof a.part === 'string' && typeof a.paragraphId === 'string'
                    && Number.isSafeInteger(a.start) && Number.isSafeInteger(a.end) && a.start >= 0 && a.end > a.start, 'INVALID_RECIPE_FIELD');
                expect(['offsetX', 'offsetY', 'width', 'height'].every(k => Number.isFinite(field.placement[k]))
                    && field.placement.width > 0 && field.placement.height > 0, 'INVALID_RECIPE_FIELD');
            } else {
                shape(field.placement, ['kind', 'page', 'x', 'y', 'width', 'height']);
                expect(field.placement.kind === 'pdf' && Number.isSafeInteger(field.placement.page) && field.placement.page > 0
                    && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(field.placement[k]))
                    && field.placement.x >= 0 && field.placement.y >= 0 && field.placement.width > 0 && field.placement.height > 0, 'INVALID_RECIPE_FIELD');
            }
            return JSON.parse(JSON.stringify(field));
        });
        unique(signatureFields);
        return { key: key(doc.key), name: draftTitle(doc.name), source: { ...doc.source }, mappings, signatureFields };
    });
    unique(documents);
    return { schemaVersion: 3, name: draftTitle(input.name), locale: input.locale, dataRoles,
        signing: JSON.parse(JSON.stringify(input.signing)), fields, documents };
}
function assertReadyRecipe(definition) {
    require('./compiler').validateDefinition({schemaVersion:2,name:definition.name,locale:definition.locale,...definition.signing,
        dataKeys:definition.fields.map(field=>({key:field.key,label:field.label,type:'text',required:field.required})),
        documents:definition.documents.map(doc=>({key:doc.key,name:doc.name,sourceArtifactId:doc.source.id,sourceHash:doc.source.hash,
            fields:doc.signatureFields.map(field=>({id:field.key,type:field.type,required:field.required,
                ...(doc.source.kind==='word'?{pageNum:1,x:0,y:0,width:field.placement.width,height:field.placement.height}:{pageNum:field.placement.page,x:field.placement.x,y:field.placement.y,width:field.placement.width,height:field.placement.height}),
                ...(field.type==='data'?{dataKey:field.dataKey,fontSize:field.fontSize||12,align:field.align||'start',overflow:'block'}:{roleKey:field.roleKey,occurrence:field.occurrence,...(field.inactiveTreatment?{inactiveTreatment:field.inactiveTreatment}:{})})
            }))}))});
}
module.exports = { normalizeRecipe, assertReadyRecipe };
