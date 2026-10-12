"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGO_INPUT_LIMIT = void 0;
exports.normalizeSignupLogo = normalizeSignupLogo;
exports.saveSignupLogo = saveSignupLogo;
exports.readSignupLogo = readSignupLogo;
const node_crypto_1 = require("node:crypto");
const sharp_1 = __importDefault(require("sharp"));
const client_s3_1 = require("@aws-sdk/client-s3");
exports.LOGO_INPUT_LIMIT = 2 * 1024 * 1024;
const fail = (code) => Object.assign(new Error(code), { code });
async function normalizeSignupLogo(value) {
    if (typeof value !== 'string' || !value)
        throw fail('LOGO_REQUIRED');
    if (value.length > Math.ceil(exports.LOGO_INPUT_LIMIT / 3) * 4 + 40)
        throw fail('LOGO_TOO_LARGE');
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match)
        throw fail('LOGO_INVALID');
    const input = Buffer.from(match[2], 'base64');
    if (input.length > exports.LOGO_INPUT_LIMIT)
        throw fail('LOGO_TOO_LARGE');
    // Reject active/vector formats before passing untrusted bytes to a decoder.
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
    if ((match[1] === 'png' && !png) || (match[1] === 'jpeg' && !jpeg))
        throw fail('LOGO_INVALID');
    try {
        const image = (0, sharp_1.default)(input, { failOn: 'warning', limitInputPixels: 4096 * 4096 });
        const meta = await image.metadata();
        if (!['png', 'jpeg'].includes(meta.format || '') || (meta.pages || 1) !== 1)
            throw fail('LOGO_INVALID');
        if (!meta.width || !meta.height || meta.width !== meta.height || meta.width < 1024 || meta.width > 4096)
            throw fail('LOGO_DIMENSIONS');
        // Retain transparency, remove metadata, never crop or upscale the customer's mark.
        const { data, info } = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
        return { data, width: info.width, height: info.height, sha256: (0, node_crypto_1.createHash)('sha256').update(data).digest('hex') };
    }
    catch (e) {
        if (e.code?.startsWith('LOGO_'))
            throw e;
        throw fail('LOGO_INVALID');
    }
}
function storage() {
    const { S3_ENDPOINT, S3_KEY, S3_SECRET, S3_BUCKET } = process.env;
    if (!S3_ENDPOINT || !S3_KEY || !S3_SECRET || !S3_BUCKET)
        throw fail('LOGO_STORAGE_UNAVAILABLE');
    return { bucket: S3_BUCKET, client: new client_s3_1.S3Client({ region: 'auto', endpoint: S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET } }) };
}
function logoKey(id, hash) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || !/^[a-f0-9]{64}$/.test(hash))
        throw fail('LOGO_NOT_FOUND');
    return `signup-logos/${id}/${hash}.png`;
}
async function saveSignupLogo(value, id) {
    const image = await normalizeSignupLogo(value), key = logoKey(id, image.sha256);
    const { client, bucket } = storage();
    try {
        await client.send(new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, Body: image.data, ContentType: 'image/png', Metadata: { sha256: image.sha256, purpose: 'business-branding-v1' } }), { abortSignal: AbortSignal.timeout(15000) });
    }
    catch {
        throw fail('LOGO_STORAGE_UNAVAILABLE');
    }
    const base = (process.env.SIGNUP_LOGO_PUBLIC_BASE || 'https://api-lawyer.mela-media.co.il').replace(/\/$/, '');
    return { version: 1, key, url: `${base}/api/public/signup/logos/${id}/${image.sha256}.png`, sha256: image.sha256, width: image.width, height: image.height, bytes: image.data.length, contentType: 'image/png' };
}
async function readSignupLogo(id, file) {
    if (!file.endsWith('.png'))
        throw fail('LOGO_NOT_FOUND');
    const key = logoKey(id, file.slice(0, -4)), { client, bucket } = storage();
    const result = await client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
    if (!result.Body || (result.ContentLength || 0) > 20_000_000)
        throw fail('LOGO_NOT_FOUND');
    return Buffer.from(await result.Body.transformToByteArray());
}
