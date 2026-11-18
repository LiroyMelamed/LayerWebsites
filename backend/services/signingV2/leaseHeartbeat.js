'use strict';
const jobs = require('./jobs');

// Rendering can include queue wait, storage verification and publication. Keep
// its lease alive during those waits. Publication still requires the original
// fencing token; losing the lease never permits a stale worker to publish.
async function withLeaseHeartbeat(pool, lease, task, { intervalMs = 20000, leaseSeconds = 60, onError = () => {} } = {}) {
    let pending = null;
    const timer = setInterval(() => {
        if (pending) return;
        pending = jobs.heartbeat(pool, lease, leaseSeconds)
            .then(owned => { if (!owned) clearInterval(timer); })
            .catch(onError).finally(() => { pending = null; });
    }, intervalMs);
    timer.unref?.();
    try { return await task(); }
    finally { clearInterval(timer); await pending; }
}

module.exports = { withLeaseHeartbeat };
