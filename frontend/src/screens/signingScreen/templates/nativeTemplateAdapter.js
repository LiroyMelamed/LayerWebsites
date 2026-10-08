// The incumbent PDF editor uses roleId/fieldType. Keep all native metadata on
// each record so editing geometry never drops authority, conditions or slots.
export function toEditor(definition) {
    const sourceRoles = definition.roles?.length ? definition.roles : [{ key: 'first', label: '', capacity: 'personal', min: 1, max: 1, stage: 0 }];
    const stages = definition.stages?.length ? definition.stages : [{ key: 'first', after: null }];
    const groups = stages.map((_, index) => sourceRoles.filter(role => (role.stage || 0) === index).map(role => role.key)).filter(group => group.length);
    return { name: definition.name, nativeDefinition: definition, dataKeys: definition.dataKeys || [],
        roles: sourceRoles.map(role => ({ id: role.key, name: role.label, kind: role.audience === 'shared' ? 'shared' : 'custom', nativeRole: role })),
        signingOrder: groups.length <= 1 ? 'parallel' : groups.some(group => group.length > 1) ? 'grouped' : 'sequential',
        signingGroups: groups, requireOtp: true, completionEmail: '', completionMode: 'package',
        documents: (definition.documents || []).map(doc => ({ id: doc.key, name: doc.name, nativeDocument: doc,
            sourceArtifactId: doc.sourceArtifactId, sourceHash: doc.sourceHash,
            fields: (doc.fields || []).map(field => ({ ...field, nativeField: field, roleId: field.roleKey,
                fieldType: field.type, isRequired: field.required === true, fieldLabel: field.label || '' })) })) };
}

export function fromEditor(draft, locale) {
    const roles = draft.roles.map(role => role.id);
    const groups = draft.signingOrder === 'grouped' ? draft.signingGroups : draft.signingOrder === 'sequential' ? roles.map(key => [key]) : [roles];
    return { ...draft.nativeDefinition, schemaVersion: 2, name: draft.name, locale: draft.nativeDefinition?.locale || locale,
        dataKeys: draft.dataKeys || [],
        stages: groups.map((group, index) => ({ key: `stage${index + 1}`, label: group.map(key => draft.roles.find(role => role.id === key)?.name).join(' · '), after: index ? `stage${index}` : null })),
        roles: draft.roles.map(role => ({ ...role.nativeRole, key: role.id, label: role.name,
            audience: ['shared','lawyer'].includes(role.kind) ? 'shared' : 'each', capacity: role.nativeRole?.capacity || 'personal',
            min: role.nativeRole?.min ?? 1, max: role.nativeRole?.max ?? 1, stage: groups.findIndex(group => group.includes(role.id)) })),
        documents: draft.documents.map(doc => ({ ...doc.nativeDocument, key: doc.id, name: doc.name,
            sourceArtifactId: doc.sourceArtifactId, sourceHash: doc.sourceHash,
            fields: (doc.fields || []).map(field => {
                const result = { ...field.nativeField, id: field.id, type: field.fieldType === 'number' ? 'text' : field.fieldType,
                    pageNum: field.pageNum, x: field.x, y: field.y, width: field.width, height: field.height, label: field.fieldLabel || '', required: field.isRequired };
                if (result.type === 'data') {
                    delete result.roleKey; delete result.occurrence;
                    return { ...result, dataKey: field.dataKey, overflow: 'block', fontSize: field.fontSize || 14, align: field.align || 'start' };
                }
                if (field.inactiveTreatment) result.inactiveTreatment = field.inactiveTreatment;
                else delete result.inactiveTreatment;
                return { ...result, roleKey: field.roleId, occurrence: field.occurrence ?? field.nativeField?.occurrence ?? 0 };
            }) })),
        signingRules: [...(draft.nativeDefinition?.signingRules || []).filter(rule => rule.source !== 'role_pair'), ...draft.roles.filter(role => role.nativeRole?.capacity === 'representative' && role.nativeRole?.min === 2 && role.nativeRole?.max === 2 && !(draft.nativeDefinition?.signingRules || []).filter(rule => rule.source !== 'role_pair').some(rule => rule.type === 'all_named' && rule.roles?.every(ref => ref.key === role.id))).map(role => ({ type:'all_named', source:'role_pair', roles:[{key:role.id,occurrence:0},{key:role.id,occurrence:1}] }))],
        policy: { ...draft.nativeDefinition?.policy, otpRequired: true, deliveryMode: draft.nativeDefinition?.policy?.deliveryMode || 'invite' } };
}
