class MemoryCache {
    constructor({ name = 'cache', maxEntries = 1000 } = {}) {
        this.name = name;
        this.maxEntries = maxEntries;
        this.store = new Map();
    }

    _now() {
        return Date.now();
    }

    _isExpired(entry, now) {
        return entry.expiresAt !== null && now >= entry.expiresAt;
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        const now = this._now();
        if (this._isExpired(entry, now)) {
            this.store.delete(key);
            return undefined;
        }

        return entry.value;
    }

    set(key, value, { ttlMs } = {}) {
        const now = this._now();
        const expiresAt = Number.isFinite(ttlMs) ? now + Math.max(0, ttlMs) : null;

        this.store.set(key, { value, expiresAt, createdAt: now });

        // Simple bounded cache: if we exceed maxEntries, evict oldest.
        if (this.store.size > this.maxEntries) {
            let oldestKey = null;
            let oldestCreatedAt = Infinity;
            for (const [k, v] of this.store.entries()) {
                if (v.createdAt < oldestCreatedAt) {
                    oldestCreatedAt = v.createdAt;
                    oldestKey = k;
                }
            }
            if (oldestKey !== null) this.store.delete(oldestKey);
        }
    }

    delete(key) {
        this.store.delete(key);
    }

    deleteByPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    clear() {
        this.store.clear();
    }

    async getOrSet(key, { ttlMs }, loader) {
        const existing = this.get(key);
        if (existing !== undefined) return existing;

        const value = await loader();
        this.set(key, value, { ttlMs });
        return value;
    }
}

module.exports = {
    MemoryCache,
};
