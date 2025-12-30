const { MemoryCache } = require('./memoryCache');

const cache = new MemoryCache({ name: 'mainScreenData', maxEntries: 10 });

// Keep short; this response can be large.
const MAIN_SCREEN_TTL_MS = 15 * 1000;

async function getMainScreenDataCached({ loader, ttlMs = MAIN_SCREEN_TTL_MS }) {
    if (typeof loader !== 'function') throw new Error('getMainScreenDataCached: loader is required');
    return cache.getOrSet('mainScreenData:admin', { ttlMs }, loader);
}

function __testReset() {
    cache.clear();
}

module.exports = {
    getMainScreenDataCached,
    __testReset,
    _ttls: { MAIN_SCREEN_TTL_MS },
};
