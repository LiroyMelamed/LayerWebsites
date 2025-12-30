const { MemoryCache } = require('./memoryCache');

const cache = new MemoryCache({ name: 'caseTypes', maxEntries: 500 });

const LIST_TTL_MS = 10 * 60 * 1000;
const BY_ID_TTL_MS = 60 * 60 * 1000;

function listKey({ role, userId }) {
    if (String(role).toLowerCase() === 'admin') return 'caseTypes:list:admin';
    return `caseTypes:list:user:${userId}`;
}

function byIdKey(caseTypeId) {
    return `caseTypes:id:${caseTypeId}`;
}

async function getCaseTypesListCached({ role, userId, loader, ttlMs = LIST_TTL_MS }) {
    if (typeof loader !== 'function') throw new Error('getCaseTypesListCached: loader is required');

    const key = listKey({ role, userId });

    // If we cannot scope (missing userId), do not cache.
    if (String(role).toLowerCase() !== 'admin' && !Number.isFinite(userId)) {
        return loader();
    }

    return cache.getOrSet(key, { ttlMs }, loader);
}

async function getCaseTypeByIdCached({ caseTypeId, loader, ttlMs = BY_ID_TTL_MS }) {
    if (typeof loader !== 'function') throw new Error('getCaseTypeByIdCached: loader is required');
    const key = byIdKey(caseTypeId);
    return cache.getOrSet(key, { ttlMs }, loader);
}

function invalidateCaseTypes({ caseTypeId } = {}) {
    // Always invalidate lists, regardless of which case type changed.
    cache.deleteByPrefix('caseTypes:list:');

    if (Number.isFinite(caseTypeId)) {
        cache.delete(byIdKey(caseTypeId));
    } else {
        // If we don't know which id changed (e.g. create), clear all id entries.
        cache.deleteByPrefix('caseTypes:id:');
    }
}

function __testReset() {
    cache.clear();
}

module.exports = {
    getCaseTypesListCached,
    getCaseTypeByIdCached,
    invalidateCaseTypes,
    __testReset,

    // exported for tests/debug
    _keys: { listKey, byIdKey },
    _ttls: { LIST_TTL_MS, BY_ID_TTL_MS },
};
