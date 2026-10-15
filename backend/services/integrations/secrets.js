'use strict';
const crypto = require('node:crypto');
function key(env) {
    const value = String(env.INTEGRATIONS_ENCRYPTION_KEY || '');
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('INTEGRATIONS_ENCRYPTION_KEY_REQUIRED');
    return Buffer.from(value, 'hex');
}
function seal(value, binding, env = process.env) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(env), iv);
    cipher.setAAD(Buffer.from(binding));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function open(value, binding, env = process.env) {
    const [v, iv, tag, data] = String(value || '').split('.');
    if (v !== 'v1' || !iv || !tag || !data) throw new Error('INVALID_INTEGRATION_SECRET');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key(env), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from(binding)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
}
module.exports = { key, seal, open };
