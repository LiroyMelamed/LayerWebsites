const { createCipheriv, createDecipheriv, createHmac, randomBytes } = require('node:crypto');

const ENC_PREFIX = 'enc:v1:';

function getProviderSecretsKey() {
    const raw = String(process.env.PROVIDER_SECRETS_KEY || '').trim();
    if (!raw) return null;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    return createHmac('sha256', 'layerwebsites-provider-secrets').update(raw).digest();
}

function encryptSecret(plaintext, key = getProviderSecretsKey()) {
    const value = String(plaintext || '');
    if (!key) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['enc:v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

function decryptSecret(value, key = getProviderSecretsKey()) {
    const raw = String(value || '');
    if (!raw.startsWith(ENC_PREFIX)) return raw;
    if (!key) {
        throw new Error('PROVIDER_SECRETS_KEY required to decrypt card tokens');
    }
    const parts = raw.split(':');
    if (parts.length !== 5) throw new Error('Invalid encrypted secret format');
    const iv = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const data = Buffer.from(parts[4], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function isEncryptedSecret(value) {
    return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

module.exports = {
    getProviderSecretsKey,
    encryptSecret,
    decryptSecret,
    isEncryptedSecret,
};
