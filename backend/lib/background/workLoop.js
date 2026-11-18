'use strict';

// Poll only while idle. A fixed interval caps throughput even when durable
// backlog exists; overlapping intervals instead create unbounded concurrency.
function createWorkLoop({ run, idleMs = 1000, onError = () => {} }) {
    let timer = null, current = null, running = false;
    function schedule(delay) {
        timer = setTimeout(() => {
            timer = null;
            current = Promise.resolve().then(run).catch(error => { onError(error); return 0; });
            current.then(count => {
                current = null;
                if (running) schedule(Number(count) > 0 ? 0 : idleMs);
            });
        }, delay);
        timer.unref?.();
    }
    return {
        start() { if (!running) { running = true; schedule(0); } },
        async stop() { running = false; clearTimeout(timer); timer = null; await current; },
    };
}

module.exports = { createWorkLoop };
