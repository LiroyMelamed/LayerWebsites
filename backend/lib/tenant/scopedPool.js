'use strict';
const scope = require('./databaseScope');

/** Scope a checked-out connection for its whole lease, including explicit transactions. */
function installScopedPool(pool) {
    const connect = pool.connect.bind(pool);
    const query = pool.query.bind(pool);
    let readiness;
    pool.ensureOfficeIsolation = () => {
        scope.assertConfigured();
        if (!scope.enabled()) return Promise.resolve();
        if (!readiness) readiness = (async () => {
            const client = await connect();
            try { await require('./isolationSchema').assertIsolationReady(client); }
            finally { client.release(); }
        })();
        return readiness;
    };
    async function lease() {
        await pool.ensureOfficeIsolation();
        const client = await connect();
        const rawQuery = client.query.bind(client), rawRelease = client.release.bind(client);
        const selected = scope.current();
        try {
            await rawQuery("SELECT set_config('app.office_mode',$1,false), set_config('app.office_id',$2,false)", [selected.mode, selected.tenantId]);
        } catch (error) { rawRelease(true); throw error; }
        let released = false;
        client.release = (error) => {
            if (released) throw new Error('Database connection already released');
            released = true;
            client.release = rawRelease;
            // A forgotten/failed transaction must never carry a tenant to the next borrower.
            void rawQuery('ROLLBACK').then(() => rawQuery("SELECT set_config('app.office_mode','none',false), set_config('app.office_id','',false)"))
                .then(() => rawRelease(error), () => rawRelease(true));
        };
        return client;
    }
    pool.connect = function (callback) {
        scope.assertConfigured();
        if (!scope.enabled()) return connect(callback);
        const promise = lease();
        if (typeof callback === 'function') {
            promise.then(client => callback(null, client, client.release), error => callback(error));
            return;
        }
        return promise;
    };
    pool.query = function (...args) {
        scope.assertConfigured();
        if (!scope.enabled()) return query(...args);
        const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
        const promise = (async () => {
            const client = await lease();
            try { return await client.query(...args); } finally { client.release(); }
        })();
        if (callback) { promise.then(result => callback(null, result), error => callback(error)); return; }
        return promise;
    };
}
module.exports = { installScopedPool };
