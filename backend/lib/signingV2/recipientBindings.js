// A role is a signing responsibility; a person may explicitly fill several roles.
// Contact equality never links identities. Links stay within a package, except
// an explicitly shared role which is already shared across the entire run.
const recipientPeople = value => Array.isArray(value?.people) ? value.people : [value || {}];
const occurrenceKey = (role, rowIndex, occurrence) => `${role.audience === 'shared' ? 'shared' : rowIndex}:${role.key}${occurrence ? `:${occurrence}` : ''}`;

function resolveRecipient(roles, input, role, rowIndex, path, errors, occurrence = 0) {
    const byKey = new Map(roles.map(item => [item.key, item]));
    const visited = new Set();
    const origin = recipientPeople(role.audience === 'shared' ? input.shared?.[role.key] : input.rows[rowIndex]?.recipients?.[role.key])[occurrence];
    let current = role;
    let slot = occurrence;
    let value;
    for (;;) {
        const reference = `${current.key}:${slot}`;
        if (visited.has(reference)) {
            errors.push({ path: `${path}.sameAsRole`, code: 'RECIPIENT_LINK_CYCLE' });
            return {};
        }
        visited.add(reference);
        const group = current.audience === 'shared' ? input.shared?.[current.key] : input.rows[rowIndex]?.recipients?.[current.key];
        value = recipientPeople(group)[slot];
        if (!value?.sameAsRole) break;
        const next = typeof value.sameAsRole === 'string' ? byKey.get(value.sameAsRole) : null;
        if (!next || (role.audience === 'shared' && next.audience !== 'shared')) {
            errors.push({ path: `${path}.sameAsRole`, code: 'RECIPIENT_LINK_UNAVAILABLE' });
            return {};
        }
        const nextGroup = next.audience === 'shared' ? input.shared?.[next.key] : input.rows[rowIndex]?.recipients?.[next.key];
        const nextSlot = value.sameAsOccurrence ?? 0;
        if ((next.max > 1 && value.sameAsOccurrence == null) || !Number.isInteger(nextSlot) || nextSlot < 0
            || nextSlot >= recipientPeople(nextGroup).length || nextSlot >= (next.max ?? 1)) {
            errors.push({ path: `${path}.sameAsRole`, code: 'RECIPIENT_LINK_UNAVAILABLE' });
            return {};
        }
        slot = nextSlot;
        current = next;
    }
    const result = { ...(value || {}) };
    delete result.sameAsRole;
    delete result.sameAsOccurrence;
    delete result.bindingKey;
    if (current.key !== role.key || slot !== occurrence) {
        result.bindingKey = occurrenceKey(current, rowIndex, slot);
        // Reusing a person does not reuse a capacity or an authority from a
        // different responsibility. Each role chooses its represented party.
        delete result.partyId; delete result.authorityId;
        if (origin?.partyId) result.partyId = origin.partyId;
        if (origin?.authorityId) result.authorityId = origin.authorityId;
    }
    return result;
}

function recipientIdentity(role, person, index, occurrence = 0) {
    return person.bindingKey || occurrenceKey(role, index, occurrence);
}

module.exports = { resolveRecipient, recipientIdentity, recipientPeople };
