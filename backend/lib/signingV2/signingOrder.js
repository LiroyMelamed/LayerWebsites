const { expect } = require('./errors');
const { stages: maxStages } = require('./limits');

// Every active role belongs to exactly one stage. A stage is a barrier: all
// its obligations finish before the following stage becomes available.
function normalizeSigningOrder(order, active, code = 'INVALID_WORKFLOW') {
    expect(order && ['parallel', 'sequential', 'grouped'].includes(order.mode), code, 'signingOrder.mode');
    if (order.mode === 'parallel') return { mode: 'parallel', roles: [...active] };
    const groups = order.mode === 'grouped' ? order.groups : (Array.isArray(order.roles) ? order.roles.map(key => [key]) : null);
    expect(Array.isArray(groups) && groups.length > 0 && groups.length <= maxStages
        && groups.every(group => Array.isArray(group) && group.length > 0 && group.length <= active.length), code, 'signingOrder.groups');
    const roles = groups.flat();
    expect(roles.length === active.length && new Set(roles).size === roles.length && roles.every(key => active.includes(key)), code, 'signingOrder.groups');
    return order.mode === 'grouped' ? { mode: 'grouped', groups: groups.map(group => [...group]) } : { mode: 'sequential', roles };
}

module.exports = { normalizeSigningOrder };
