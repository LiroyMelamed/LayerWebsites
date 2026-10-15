const crypto = require('crypto');

/**
 * resolveTenantContext – single-tenant module.
 *
 * Architecture: one database per firm.  There is no need for multi-firm
 * resolution.  Every call within this database implicitly belongs to the
 * same tenant (tenantId: 1).
 */

/** Returns a static tenant context – no DB lookup needed. */
function resolveTenantContext() {
    return { tenantId: 1 };
}

/** Utility – generate a UUID event id. Still used by other modules. */
function newEventId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (crypto.randomBytes(1)[0] % 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

module.exports = {
    resolveTenantContext,
    newEventId,
};
