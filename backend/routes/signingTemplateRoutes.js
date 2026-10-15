const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const { requireSigningEnabledForUser } = require('../middlewares/requireSigningEnabled');
const service = require('../services/signingTemplateService');
const { createAppError } = require('../utils/appError');

const view = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });
const upload = requireFirmAction('signing', 'upload', { legacy: 'lawyerOrAdmin' });
const manage = requireFirmAction('signing', 'manage', { legacy: 'lawyerOrAdmin' });
const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(auth, requireSigningEnabledForUser);
router.get('/', view, run(async (req, res) => res.json({ templates: await service.listTemplates(req) })));
router.post('/', upload, run(async (req, res) => res.status(201).json({ template: await service.saveTemplate(req) })));
router.get('/:id', view, run(async (req, res) => res.json({ template: (await service.loadTemplate(req, req.params.id)).template })));
router.put('/:id', manage, upload, run(async (req, res) => res.json({ template: await service.saveTemplate(req, req.params.id) })));
router.post('/:id/archive', manage, run(async (req, res) => { await service.archiveTemplate(req, req.params.id);res.json({ success: true }); }));
router.get('/:id/documents/:documentId/pdf', view, run(async (req, res) => {
    const { template } = await service.loadTemplate(req, req.params.id);
    const document = template.definition.documents.find(doc => doc.id === req.params.documentId);
    if (!document) throw createAppError('NOT_FOUND', 404);
    const file = await service.readPdf(document.fileKey);
    if (file.sha256 !== document.sha256) throw createAppError('CONFLICT', 409, 'קובץ התבנית השתנה');
    res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' }).send(file.bytes);
}));
module.exports = router;
