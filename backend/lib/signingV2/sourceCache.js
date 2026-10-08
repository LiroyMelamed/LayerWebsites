const { bytesHash } = require('./canonical');
const { expect } = require('./errors');

class SourceCache {
    constructor({ maxBytes = 128 * 1024 * 1024 } = {}) {
        this.maxBytes = maxBytes;
        this.bytes = 0;
        this.entries = new Map();
        this.pending = new Map();
    }

    async get(contextId, artifact, load) {
        const key = `${contextId}:${artifact.id}:${artifact.content_sha256}`;
        if (this.entries.has(key)) {
            const value = this.entries.get(key);
            this.entries.delete(key); this.entries.set(key, value);
            return Buffer.from(value);
        }
        if (!this.pending.has(key)) {
            const promise = (async () => {
                const bytes = Buffer.from(await load(artifact.object_key));
                expect(bytes.length === Number(artifact.bytes) && bytesHash(bytes) === artifact.content_sha256, 'SOURCE_CHANGED');
                if (bytes.length <= this.maxBytes) {
                    while (this.bytes + bytes.length > this.maxBytes && this.entries.size) {
                        const oldest = this.entries.keys().next().value;
                        this.bytes -= this.entries.get(oldest).length;
                        this.entries.delete(oldest);
                    }
                    this.entries.set(key, bytes); this.bytes += bytes.length;
                }
                return bytes;
            })();
            this.pending.set(key, promise);
            promise.finally(() => this.pending.delete(key)).catch(() => {});
        }
        return Buffer.from(await this.pending.get(key));
    }
}

module.exports = { SourceCache };
