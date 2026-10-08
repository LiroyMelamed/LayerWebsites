const { expect } = require('./errors');

// Audience describes this send, not the signer's profession or permissions.
// Return new roles; the published definition and its PDF fields stay immutable.
function recipientRoles(definition, overrides = {}, omitted = []) {
    expect(overrides && typeof overrides === 'object' && !Array.isArray(overrides), 'INVALID_RECIPIENT_LAYOUT');
    const known = new Set(definition.roles.map(role => role.key));
    expect(Object.entries(overrides).every(([key, value]) => known.has(key) && ['each', 'shared'].includes(value)), 'INVALID_RECIPIENT_LAYOUT');
    expect(Array.isArray(omitted) && new Set(omitted).size === omitted.length && omitted.every(key => known.has(key)), 'INVALID_RECIPIENT_LAYOUT');
    return definition.roles.filter(role => !omitted.includes(role.key)).map(role => ({ ...role,
        audience: (Object.hasOwn(overrides, role.key) ? overrides[role.key] : null) || (role.audience === 'shared' ? 'shared' : 'each') }));
}

module.exports = { recipientRoles };
