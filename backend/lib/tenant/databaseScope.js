'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function enabled() {
    return String(process.env.MULTI_TENANT_MODE || '').trim().toLowerCase() === 'true' && process.env.TENANT_DB_ISOLATION_ENABLED === '1';
}
function assertConfigured() {
    if (String(process.env.MULTI_TENANT_MODE || '').trim().toLowerCase() === 'true' && !enabled()) throw new Error('OFFICE_ISOLATION_CONFIGURATION_REQUIRED');
}
function current() { return context.getStore() || { mode: 'none', tenantId: '' }; }
function withOffice(id, fn) {
    if (!UUID.test(String(id || ''))) throw new Error('INVALID_DATABASE_OFFICE');
    return context.run({ mode: 'office', tenantId: String(id).toLowerCase() }, fn);
}
// These boundaries are server-only; never derive the mode from request parameters.
function withSystem(fn) { return context.run({ mode: 'system', tenantId: '' }, fn); }
function withLegacyOffice(fn) { return context.run({ mode: 'legacy', tenantId: '' }, fn); }
function withoutScope(fn) { return context.run({ mode: 'none', tenantId: '' }, fn); }
function cacheKey() { const s = current(); return enabled() ? `${s.mode}:${s.tenantId}` : 'dedicated'; }
module.exports = { enabled, assertConfigured, current, withOffice, withSystem, withLegacyOffice, withoutScope, cacheKey };
