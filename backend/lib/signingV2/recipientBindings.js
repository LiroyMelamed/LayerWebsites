// A role is a signing responsibility; a person may explicitly fill several roles.
// Contact equality never links identities. Links stay within a package, except
// an explicitly shared role which is already shared across the entire run.
function resolveRecipient(roles, input, role, rowIndex, path, errors) {
    const byKey = new Map(roles.map(item => [item.key, item]));
    const visited = new Set();
    let current = role;
    let value;
    for (;;) {
        if (visited.has(current.key)) {
            errors.push({ path: `${path}.sameAsRole`, code: 'RECIPIENT_LINK_CYCLE' });
            return {};
        }
        visited.add(current.key);
        value = current.audience === 'shared' ? input.shared?.[current.key] : input.rows[rowIndex]?.recipients?.[current.key];
        if (!value?.sameAsRole) break;
        const next = typeof value.sameAsRole === 'string' ? byKey.get(value.sameAsRole) : null;
        if (!next || (role.audience === 'shared' && next.audience !== 'shared')) {
            errors.push({ path: `${path}.sameAsRole`, code: 'RECIPIENT_LINK_UNAVAILABLE' });
            return {};
        }
        current = next;
    }
    const result = { ...(value || {}) };
    delete result.sameAsRole;
    delete result.bindingKey;
    if (current.key !== role.key) result.bindingKey = current.audience === 'shared' ? `shared:${current.key}` : `${rowIndex}:${current.key}`;
    return result;
}

function recipientIdentity(role, person, index) {
    return person.bindingKey || (role.audience === 'shared' ? `shared:${role.key}` : `${index}:${role.key}`);
}

module.exports = { resolveRecipient, recipientIdentity };
