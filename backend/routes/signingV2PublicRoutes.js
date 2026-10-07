const crypto = require('node:crypto');
const router = require('express').Router();
const pool = require('../config/db');
const { createRateLimitMiddleware, getClientIp } = require('../utils/rateLimiter');
const { createAppError } = require('../utils/appError');

const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
// The link keeps its token in the URL fragment; the page sends it in this header so it never reaches access logs.
const tokenOf = req => String(req.get('X-Signing-Grant') || '');
const tokenKey = req => `g:${crypto.createHash('sha256').update(tokenOf(req)).digest('hex').slice(0, 32)}`;
const ipKey = req => `ip:${getClientIp(req, { trustProxy: true })}`;
const limiter = (name, windowMs, max, keyFn) => createRateLimitMiddleware({ name, windowMs, max, keyFn, trustProxy: true });

const viewLimit = limiter('signing_v2_public_view', 60 * 1000, 120, tokenKey);
const ipLimit = limiter('signing_v2_public_ip', 60 * 1000, 240, ipKey);
const challengeLimit = limiter('signing_v2_public_otp', 10 * 60 * 1000, 12, ipKey);
const verifyLimit = limiter('signing_v2_public_verify', 10 * 60 * 1000, 40, ipKey);

let service = null;
const signing = () => (service ||= require('../services/signingV2/runtime').publicSigningFromEnvironment({ pool }));

router.use((req, res, next) => (process.env.SIGNING_V2_ENABLED === 'true' ? next() : next(createAppError('NOT_FOUND', 404))));
router.use((req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }); next(); });
router.use(ipLimit);

const pdf = (res, file, name) => res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`,
    'X-Content-Type-Options': 'nosniff' }).send(file.bytes);

router.get('/package', viewLimit, run(async (req, res) => res.json(await signing().describe(tokenOf(req)))));
router.get('/documents/:documentId', viewLimit, run(async (req, res) => {
    const file = await signing().documentPdf(tokenOf(req), req.params.documentId);
    pdf(res.set('X-Document-Final', String(file.final)), file, file.final ? 'signed.pdf' : 'document.pdf');
}));
router.get('/packages/:packageId/evidence', viewLimit, run(async (req, res) => pdf(res, await signing().evidencePdf(tokenOf(req), req.params.packageId), 'evidence.pdf')));
router.post('/sessions', viewLimit, run(async (req, res) => res.status(201).json(await signing().createSession(tokenOf(req), req.body || {},
    { ip: getClientIp(req, { trustProxy: true }), userAgent: req.get('User-Agent') }))));
router.post('/sessions/:id/challenge', challengeLimit, run(async (req, res) => res.json(await signing().challenge(tokenOf(req), req.params.id, req.body || {}))));
router.post('/sessions/:id/verify', verifyLimit, run(async (req, res) => res.json(await signing().verify(tokenOf(req), req.params.id, req.body || {}))));
router.post('/sessions/:id/accept', viewLimit, run(async (req, res) => {
    const result = await signing().accept(tokenOf(req), req.params.id, { ...(req.body || {}), idempotencyKey: req.get('Idempotency-Key') });
    res.status(200).json(result);
}));

module.exports = router;
module.exports.useService = value => { service = value; };
