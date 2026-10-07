const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { expect, fail } = require('../../lib/signingV2/errors');

// Dedicated workers keep parsing, font work and PDF serialization off the HTTP
// event loop. Admission is bounded in both count and bytes, not Promise.all(2000).
class RenderPool {
    constructor({ concurrency = 2, maxQueued = 8, maxBytes = 128 * 1024 * 1024, timeoutMs = 60000, ...rendererOptions } = {}) {
        expect(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 4, 'INVALID_WORKER_CONFIGURATION');
        this.concurrency = concurrency;
        this.maxQueued = maxQueued;
        this.maxBytes = maxBytes;
        this.timeoutMs = timeoutMs;
        this.rendererOptions = rendererOptions;
        this.slots = [];
        this.queue = [];
        this.bytes = 0;
        this.closed = false;
    }

    renderHtml({ html }) {
        expect(typeof html === 'string', 'INVALID_DOCUMENT');
        return this.render({ html });
    }

    render(input) {
        if (this.closed) fail('WORKER_STOPPED', 503);
        const bytes = input.html !== undefined ? Buffer.byteLength(input.html) : input.sourceBytes.byteLength;
        if (this.queue.length >= this.maxQueued || this.bytes + bytes > this.maxBytes) fail('RENDERER_BUSY', 503);
        this.bytes += bytes;
        return new Promise((resolve, reject) => {
            this.queue.push({ id: randomUUID(), input, bytes, resolve, reject });
            this.drain();
        });
    }

    spawn() {
        const worker = new Worker(path.join(__dirname, 'renderWorker.js'), {
            workerData: this.rendererOptions,
            resourceLimits: { maxOldGenerationSizeMb: 384 },
        });
        const slot = { worker, task: null, timer: null, failed: false, browserPid: null };
        this.slots.push(slot);
        worker.on('message', message => {
            if (message.type === 'browser_started') { slot.browserPid = message.pid; return; }
            if (message.type === 'browser_closed') { slot.browserPid = null; return; }
            if (!slot.task || message.id !== slot.task.id) return;
            const task = slot.task;
            slot.task = null; clearTimeout(slot.timer); this.bytes -= task.bytes;
            if (message.error) {
                const error = Object.assign(new Error(message.error.code), { errorCode: message.error.code, extras: { fieldErrors: message.error.fieldErrors }, retryable: message.error.retryable });
                task.reject(error);
            } else task.resolve({ ...message.result, bytes: Buffer.from(message.result.bytes) });
            this.drain();
        });
        const lost = () => {
            if (slot.failed) return;
            slot.failed = true; clearTimeout(slot.timer);
            if (slot.browserPid) {
                try { process.kill(slot.browserPid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') console.error('[signingV2] renderer cleanup failed'); }
                slot.browserPid = null;
            }
            if (slot.task) {
                this.bytes -= slot.task.bytes;
                slot.task.reject(Object.assign(new Error('RENDER_WORKER_LOST'), { errorCode: 'RENDER_WORKER_LOST', retryable: true }));
                slot.task = null;
            }
            this.slots = this.slots.filter(item => item !== slot);
            this.drain();
        };
        worker.on('error', lost);
        worker.on('exit', lost);
        return slot;
    }

    drain() {
        if (this.closed) return;
        while (this.queue.length) {
            let slot = this.slots.find(item => !item.task && !item.failed);
            if (!slot && this.slots.length < this.concurrency) slot = this.spawn();
            if (!slot) return;
            slot.task = this.queue.shift();
            slot.timer = setTimeout(() => { slot.worker.terminate(); }, this.timeoutMs);
            slot.worker.postMessage({ type: 'render', id: slot.task.id, input: slot.task.input });
        }
    }

    async close() {
        this.closed = true;
        for (const task of this.queue.splice(0)) {
            this.bytes -= task.bytes;
            task.reject(Object.assign(new Error('WORKER_STOPPED'), { errorCode: 'WORKER_STOPPED', retryable: true }));
        }
        await Promise.all(this.slots.map(slot => new Promise(resolve => {
            // Close idle browsers gracefully. Running jobs retain their DB leases
            // for recovery if shutdown has to terminate them.
            const timeout = setTimeout(() => slot.worker.terminate().then(resolve), 5000);
            slot.worker.once('exit', () => { clearTimeout(timeout); resolve(); });
            slot.worker.postMessage({ type: 'close' });
        })));
    }
}

module.exports = { RenderPool };
