const { createAppError } = require('../utils/appError');

function conversionStatus(code) {
    if (/^WORD_CONVERSION_(NOT_CONFIGURED|EXECUTABLE_UNAVAILABLE|BUSY)$/.test(code)) return 503;
    if (code === 'WORD_CONVERSION_TIMEOUT') return 504;
    if (code === 'WORD_CONVERSION_INVALID_DOCX') return 400;
    if (code === 'WORD_CONVERSION_ABORTED') return 409;
    return code.startsWith('WORD_CONVERSION_') ? 500 : 422;
}

function wordRouteError(error) {
    if (error?.name !== 'WordTemplateError') return error;
    const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(error.code || '') ? error.code : 'INVALID_DOCX';
    // Parsing/conversion errors contain no source text, file paths or process output.
    return createAppError(code, conversionStatus(code), code, undefined,
        { messageKey: 'signingWord.requestFailed', retryable: false });
}

function createWordStorage() {
    const { HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { r2, BUCKET } = require('../utils/r2');
    const storage = require('../services/signingV2/runtime').objectStorage({ client: r2, bucket: BUCKET });
    return {
        ...storage,
        async readUpload(key, maxBytes) {
            const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
            const size = Number(head.ContentLength);
            if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) throw createAppError('WORD_SOURCE_LIMIT', 413);
            const response = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
            const chunks = []; let length = 0;
            for await (const chunk of response.Body) {
                length += chunk.length;
                if (length > size || length > maxBytes) {
                    response.Body.destroy?.();
                    throw createAppError('WORD_SOURCE_LIMIT', 413);
                }
                chunks.push(Buffer.from(chunk));
            }
            if (length !== size) throw createAppError('WORD_SOURCE_CHANGED', 409);
            return Buffer.concat(chunks);
        },
    };
}

// Mounted after the incumbent v2 feature/auth/signing.upload middleware.
// Dependencies are injectable for focused route and fake-transport tests.
function createSigningWordRouter({ pool, actorScope, service, storage, convertDocxToPdf, Router } = {}) {
    const router = (Router || require('express').Router)();
    const word = service || require('../services/signingV2/wordTemplates');
    const convert = convertDocxToPdf || require('../lib/wordTemplates/converter').convertDocxToPdf;
    const store = () => storage || createWordStorage();
    const run = action => async (req, res, next) => {
        try {
            res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
            const scope = await actorScope(pool, req, 'upload');
            await action(req, res, scope);
        } catch (error) { next(wordRouteError(error)); }
    };

    router.get('/', run(async (_req, res, scope) => res.json(await word.list(pool, scope))));
    router.post('/', run(async (req, res, scope) => res.status(201).json({ source: await word.importSource(pool, scope, req.body || {}, { storage: store() }) })));
    // Fixed routes precede the source identifier route.
    router.get('/previews/:id', run(async (req, res, scope) => res.json({ preview: await word.previewInfo(pool, scope, req.params.id, { storage: store() }) })));
    router.get('/previews/:id/pdf', run(async (req, res, scope) => {
        const file = await word.previewPdf(pool, scope, req.params.id, { storage: store() });
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="document.pdf"' }).send(file.bytes);
    }));
    router.get('/:id', run(async (req, res, scope) => res.json({ source: await word.load(pool, scope, req.params.id, { storage: store() }) })));
    router.put('/:id', run(async (req, res, scope) => res.json({ source: await word.save(pool, scope, req.params.id, req.body || {}, { storage: store() }) })));
    router.post('/:id/archive', run(async (req, res, scope) => res.json(await word.archive(pool, scope, req.params.id, req.body || {}))));
    router.post('/:id/previews', run(async (req, res, scope) => res.status(201).json({ preview: await word.preview(pool, scope, req.params.id,
        { ...(req.body || {}), idempotencyKey: req.get('Idempotency-Key') }, { storage: store(), convertDocxToPdf: convert }) })));
    return router;
}

module.exports = createSigningWordRouter;
module.exports.wordRouteError = wordRouteError;
module.exports.createWordStorage = createWordStorage;
