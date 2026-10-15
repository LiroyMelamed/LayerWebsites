/**
 * Invalidates operational dashboard caches after meaningful mutations.
 * Keeps MainScreen client list + Manager Home command center in sync.
 */
const { invalidateMainScreenDataCache } = require('./mainScreenDataCache');
const { invalidateManagerHomeCache } = require('../services/managerHome/managerHome.service');

function invalidateOperationalDashboardCaches() {
    try {
        invalidateMainScreenDataCache();
    } catch (_) { /* ignore */ }
    try {
        invalidateManagerHomeCache();
    } catch (_) { /* ignore */ }
}

module.exports = {
    invalidateOperationalDashboardCaches,
};
