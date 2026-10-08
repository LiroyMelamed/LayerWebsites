const { createHash } = require('node:crypto');
const { expect } = require('./errors');

const HASH_VERSION = 'sha256:canonical-json-v1';
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Only JSON values are admissible. Never silently drop undefined, NaN or class state.
function canonical(value, depth = 0) {
    expect(depth <= 32, 'INVALID_DEFINITION');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
        expect(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'INVALID_DATA');
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
    expect(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_DATA');
    const keys = Object.keys(value).sort();
    expect(keys.every(key => !UNSAFE_KEYS.has(key)), 'INVALID_DATA');
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
}

function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function bytesHash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

module.exports = { HASH_VERSION, canonical, digest, bytesHash, freeze };
