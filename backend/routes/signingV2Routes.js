const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const { requireSigningEnabledForUser } = require('../middlewares/requireSigningEnabled');
const pool = require('../config/db');
const { actorScope } = require('../services/signingV2/access');
const management = require('../services/signingV2/management');
const actions = require('../services/signingV2/actions');
const selections = require('../services/signingV2/selections');
const creation = require('../services/signingV2/creation');
const drafts = require('../services/signingV2/drafts');
const caseContext = require('../services/signingV2/caseContext');
const clientContext = require('../services/signingV2/clientContext');
const authoring = require('../services/signingV2/authoring');
const workbook = require('../lib/signingV2/workbook');
const { objectStorage, officeQuota } = require('../services/signingV2/runtime');
const { createAppError } = require('../utils/appError');

const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const view = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });
// Reminders and resends use the existing publish capability; view access alone never sends.
const send = requireFirmAction('signing', 'upload', { legacy: 'lawyerOrAdmin' });
const manage = requireFirmAction('signing', 'manage', { legacy: 'lawyerOrAdmin' });

// Offices that have not been enabled keep the current signing flows untouched.
router.use((req, res, next) => (process.env.SIGNING_V2_ENABLED === 'true' ? next() : next(createAppError('NOT_FOUND', 404))));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(auth, requireSigningEnabledForUser);

const target = req => ({ packageId: req.params.id, personId: req.params.personId, purpose: req.body?.purpose, channel: req.body?.channel });

router.get('/submissions', view, run(async (req, res) => res.json(await management.listSubmissions(pool, await actorScope(pool, req, 'view'), req.query))));
router.post('/selections', send, run(async (req,res) => {
    const selection = await selections.freezeSelection(pool,await actorScope(pool,req,'upload'),
        {...(req.body || {}),idempotencyKey:req.get('Idempotency-Key')});
    res.status(selection.reused ? 200 : 201).json(selection);
}));
router.get('/selections/:id', send, run(async (req,res) =>
    res.json(await selections.getSelection(pool,await actorScope(pool,req,'upload'),req.params.id))));
router.get('/submissions/:id/packages', view, run(async (req, res) =>
    res.json(await management.listPackages(pool, await actorScope(pool, req, 'view'), req.params.id, req.query))));
router.get('/packages/:id', view, run(async (req, res) => res.json(await management.packageDetails(pool, await actorScope(pool, req, 'view'), req.params.id))));
const pdf = (res, file, name) => res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'X-Content-Type-Options': 'nosniff' }).send(file.bytes);
router.get('/packages/:id/documents/:documentId', view, run(async (req, res) => {
    const { r2, BUCKET } = require('../utils/r2');
    const file = await management.packageDocumentFile(pool, await actorScope(pool, req, 'view'), req.params.id, req.params.documentId, objectStorage({ client: r2, bucket: BUCKET }));
    pdf(res.set('X-Document-Final', String(file.final)), file, 'document.pdf');
}));
router.get('/packages/:id/evidence', view, run(async (req, res) => {
    const { r2, BUCKET } = require('../utils/r2');
    pdf(res, await management.packageEvidenceFile(pool, await actorScope(pool, req, 'view'), req.params.id, objectStorage({ client: r2, bucket: BUCKET })), 'evidence.pdf');
}));
router.post('/packages/:id/participants/:personId/action-preview', send, run(async (req, res) =>
    res.json(await actions.previewParticipantAction(pool, await actorScope(pool, req, 'upload'), target(req)))));
router.post('/packages/:id/participants/:personId/actions', send, run(async (req, res) => {
    const result = await actions.executeParticipantAction(pool, await actorScope(pool, req, 'upload'),
        { ...target(req), previewHash: req.body?.previewHash, idempotencyKey: req.get('Idempotency-Key') });
    // 202 only means the request is durably queued; the operation reports delivery facts.
    res.status(result.reused ? 200 : 202).json(result);
}));
router.get('/templates', view, run(async (req, res) => res.json(await creation.listTemplates(pool, await actorScope(pool, req, 'view')))));
router.get('/authoring/templates', view, run(async (req, res) => res.json(await authoring.catalog(pool, await actorScope(pool, req, 'view'), { archived: req.query.archived === 'true' }))));
router.post('/authoring/templates/:id/archive', manage, run(async (req, res) =>
    res.json(await authoring.setArchived(pool, await actorScope(pool, req, 'manage'), req.params.id, req.body || {}))));
router.get('/authoring/versions/:id', view, run(async (req, res) =>
    res.json({ version: authoring.versionView(await authoring.loadVersion(pool, await actorScope(pool, req, 'view'), req.params.id)) })));
router.put('/authoring/drafts/:id', send, run(async (req, res) =>
    res.json({ version: await authoring.save(pool, await actorScope(pool, req, 'upload'), req.params.id, req.body || {}) })));
router.post('/authoring/drafts/:id/publish', send, run(async (req, res) =>
    res.json({ version: await authoring.publish(pool, await actorScope(pool, req, 'upload'), req.params.id, req.body || {}) })));
router.post('/authoring/sources', send, run(async (req, res) => {
    const { r2, BUCKET } = require('../utils/r2');
    res.json({ source: await authoring.registerSource(pool, await actorScope(pool, req, 'upload'), req.body?.fileKey,
        { readPdf: require('../services/signingTemplateService').readPdf, storage: objectStorage({ client: r2, bucket: BUCKET }) }) });
}));
router.get('/authoring/versions/:id/documents/:key', view, run(async (req, res) => {
    const { r2, BUCKET } = require('../utils/r2');
    pdf(res, await authoring.documentFile(pool, await actorScope(pool, req, 'view'), req.params.id, req.params.key,
        objectStorage({ client: r2, bucket: BUCKET })), 'template.pdf');
}));
router.get('/creation/clients/:id', send, run(async (req, res) => res.json(await clientContext.loadClientContext(pool, await actorScope(pool, req, 'upload'), req.params.id))));
router.get('/creation/cases', send, run(async (req, res) => res.json(await caseContext.searchCases(pool, await actorScope(pool, req, 'upload'), req.query.q))));
router.get('/creation/cases/:id', send, run(async (req, res) => res.json(await caseContext.loadCaseContext(pool, await actorScope(pool, req, 'upload'), req.params.id))));
router.post('/templates/legacy/:id/import', send, run(async (req, res) => {
    const { r2, BUCKET } = require('../utils/r2');
    const result = await creation.importLegacyTemplate(pool, await actorScope(pool, req, 'upload'), req.params.id, {
        storage: objectStorage({ client: r2, bucket: BUCKET }), readPdf: require('../services/signingTemplateService').readPdf, locale: req.body?.locale, expectedVersion: req.body?.expectedVersion });
    res.status(result.reused ? 200 : 201).json(result);
}));
function workbookLayout(query) {
    try { return query.layout ? JSON.parse(query.layout) : {}; }
    catch { throw require('../utils/appError').createAppError('Invalid recipient layout', 422, 'INVALID_RECIPIENT_LAYOUT'); }
}
const workbookLocale = value => (['he', 'ar', 'en'].includes(value) ? value : 'he');
router.get('/templates/:versionId/workbook', view, run(async (req, res) => {
    const { definition } = await creation.loadVersion(pool, await actorScope(pool, req, 'view'), req.params.versionId);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="recipients.xlsx"' })
        .send(await workbook.makeWorkbook(definition, workbookLocale(req.query.locale), workbookLayout(req.query)));
}));
router.post('/templates/:versionId/workbook/inspect', send, run(async (req, res) => {
    const { definition } = await creation.loadVersion(pool, await actorScope(pool, req, 'upload'), req.params.versionId);
    const base64 = req.body?.base64;
    if (typeof base64 !== 'string' || base64.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw createAppError('INVALID_WORKBOOK', 422);
    res.json(await workbook.inspectWorkbook(Buffer.from(base64, 'base64'), definition, req.body));
}));
router.post('/templates/:versionId/workbook', send, run(async (req, res) => {
    const { definition } = await creation.loadVersion(pool, await actorScope(pool, req, 'upload'), req.params.versionId);
    const base64 = req.body?.base64;
    if (typeof base64 !== 'string' || base64.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw createAppError('INVALID_WORKBOOK', 422);
    res.json(await workbook.parseWorkbook(Buffer.from(base64, 'base64'), definition, req.body));
}));
router.post('/creation/preview', send, run(async (req, res) => res.json(await creation.previewCreation(pool, await actorScope(pool, req, 'upload'), req.body || {}))));
router.get('/creation/drafts', send, run(async (req, res) => res.json(await drafts.listDrafts(pool, await actorScope(pool, req, 'upload')))));
router.get('/creation/drafts/:id', send, run(async (req, res) => res.json(await drafts.getDraft(pool, await actorScope(pool, req, 'upload'), req.params.id))));
router.put('/creation/drafts/:id', send, run(async (req, res) => res.json(await drafts.saveDraft(pool, await actorScope(pool, req, 'upload'), req.params.id, req.body || {}))));
router.post('/creation/drafts/:id/submit', send, run(async (req, res) => {
    const draft = await drafts.submitDraft(pool, await actorScope(pool, req, 'upload'), req.params.id, req.body || {},
        { reserveCapacity: officeQuota({ checkFirmLimits: (...args) => require('../lib/limits/enforceFirmLimits').checkFirmLimitsOrNull(...args) }) });
    res.status(draft.result.reused ? 200 : 201).json(draft);
}));
router.post('/creation', send, run(async (req, res) => {
    const result = await creation.createFromRows(pool, await actorScope(pool, req, 'upload'),
        { ...(req.body || {}), idempotencyKey: req.get('Idempotency-Key') },
        { reserveCapacity: officeQuota({ checkFirmLimits: (...args) => require('../lib/limits/enforceFirmLimits').checkFirmLimitsOrNull(...args) }) });
    // 201 means every package, document, task and delivery intent is committed; preparation continues in the worker.
    res.status(result.reused ? 200 : 201).json(result);
}));
router.post('/packages/:id/issues/:issueId/resolve', manage, run(async (req,res) => res.json(await require('../services/signingV2/taskIssues').resolveTaskIssue(pool,
    await actorScope(pool,req,'manage'),req.params.id,req.params.issueId,{...(req.body || {}),idempotencyKey:req.get('Idempotency-Key')}))));
router.get('/operations/:id', view, run(async (req, res) => res.json(await actions.operationStatus(pool, await actorScope(pool, req, 'view'), req.params.id))));
router.use(require('../services/signingV2/errorAlerts').requestErrorReporter(pool, 'office'));

module.exports = router;
