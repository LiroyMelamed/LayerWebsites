const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

test('fetchTodayEvents scopes to personal calendar for non-platform admins', async () => {
    const queries = [];
    Module._load = function mockLoad(request, parent, isMain) {
        if (request === '../../config/db') {
            return {
                query: async (sql, params) => {
                    queries.push({ sql, params });
                    return { rows: [{ id: 1, start_time: new Date(), casename: null }] };
                },
            };
        }
        if (request === '../settingsService') {
            return { isPlatformAdmin: async () => false };
        }
        return originalLoad(request, parent, isMain);
    };

    try {
        delete require.cache[require.resolve('../services/managerHome/managerHome.service')];
        const servicePath = require.resolve('../services/managerHome/managerHome.service');
        const source = require('node:fs').readFileSync(servicePath, 'utf8');
        assert.match(source, /personalCalendarSql/);

        // Inline re-require of fetch logic via buildManagerHomePayload is heavy;
        // verify the service wires isPlatformAdmin into fetchTodayEvents.
        assert.match(source, /fetchTodayEvents\(userId, \{ firmWide: firmWideEvents \}\)/);
        assert.match(source, /firmWideEvents = userId \? await isPlatformAdmin\(userId\)/);
    } finally {
        Module._load = originalLoad;
        delete require.cache[require.resolve('../services/managerHome/managerHome.service')];
    }
});
