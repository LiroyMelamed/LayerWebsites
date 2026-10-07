const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const { requireSigningEnabledForUser } = require('../middlewares/requireSigningEnabled');
const pool = require('../config/db');
const service = require('../services/signingBatchService');
const templates = require('../services/signingTemplateService');
const publicService = require('../services/signingBatchPublicService');
const { sendBatch, recipientUrl } = require('../services/signingBatchDelivery');
const { makeWorkbook, parseWorkbook } = require('../lib/signingRecipientsWorkbook');
const { invalid } = require('../lib/signingTemplateDefinition');
const { createAppError } = require('../utils/appError');
const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const view = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });
const upload = requireFirmAction('signing', 'upload', { legacy: 'lawyerOrAdmin' });
const manage = requireFirmAction('signing', 'manage', { legacy: 'lawyerOrAdmin' });
const deliver = (req, res, next) => service.loadBatch(req, req.params.id).then(({ batch }) => {
    if (!service.canDeliver(req, batch)) throw createAppError('FORBIDDEN', 403);
    next();
}).catch(next);

router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store');next(); });
router.get('/completed/:token', run(require('../services/signingPackageCompletion').downloadPackage));
router.get('/public/:token', run(async (req, res) => res.json(await publicService.publicDetails(req))));
router.post('/public/:token/session', run(async (req, res) => res.json(await publicService.startSession(req))));
router.post('/public/:token/confirm-otp', run(async (req, res) => res.json(await publicService.confirmOtp(req))));
router.use(auth, requireSigningEnabledForUser);
router.get('/contacts', upload, run(async (req, res) => {
    const scope = await templates.actorScope(req);const query = String(req.query.q || '').trim().slice(0, 100);
    const { rows } = await pool.query(`SELECT userid AS "userId",name,email,phonenumber AS phone,role FROM users
        WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid AND role<>'Deleted'
        AND (name ILIKE $2 OR email ILIKE $2 OR phonenumber ILIKE $2) AND ($3::boolean=false OR role IN ('Admin','Lawyer')) ORDER BY name LIMIT 30`, [scope.tenantId, `%${query.replace(/[%_\\]/g, '\\$&')}%`, req.query.lawyer === '1']);
    res.json({ contacts: rows });
}));
router.get('/', view, run(async (req, res) => {
    const scope = await templates.actorScope(req);const filter = templates.scopeClause(scope, 'b');
    const { rows } = await pool.query(`SELECT b.id,b.name,b.status,b.created_at,b.template_version FROM signing_batches b WHERE ${filter.sql} ORDER BY b.created_at DESC LIMIT 100`, filter.params);
    res.json({ batches: rows });
}));
router.get('/workbook/:templateId', view, run(async (req, res) => {
    const { template } = await templates.loadTemplate(req, req.params.templateId);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="recipients.xlsx"' }).send(Buffer.from(await makeWorkbook(template.definition)));
}));
router.post('/workbook/:templateId/preview', upload, run(async (req, res) => {
    const { template } = await templates.loadTemplate(req, req.params.templateId);
    const base64 = req.body?.base64;
    if (typeof base64 !== 'string' || base64.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) invalid('קובץ Excel אינו תקין');
    res.json(await parseWorkbook(Buffer.from(base64, 'base64'), template.definition));
}));
router.post('/', upload, run(async (req, res) => { req.setTimeout(600000);res.setTimeout(600000);const result = await service.createBatch(req);res.status(result.reused ? 200 : 201).json(result); }));
router.get('/:id', view, run(async (req, res) => res.json(await service.batchDetails(req, req.params.id))));
router.get('/:id/packages/:packageIndex/download', view, run(async (req, res) => {
    const { batch } = await service.loadBatch(req, req.params.id);
    if (batch.status === 'cancelled') throw createAppError('CONFLICT', 409);
    await require('../services/signingPackageCompletion').sendPackageArchive(batch, Number(req.params.packageIndex), req, res);
}));
router.post('/:id/completion', manage, run(async (req, res) => {
    const { batch } = await service.loadBatch(req, req.params.id);
    const { packageContext, completePackage } = require('../services/signingPackageCompletion');
    const files = (await pool.query('SELECT DISTINCT ON(package_index) signingfileid FROM signing_batch_files WHERE batch_id=$1 ORDER BY package_index,document_index', [batch.id])).rows;
    for (const file of files) await completePackage(await packageContext(file.signingfileid), req);
    res.json(await service.batchDetails(req, batch.id));
}));
router.post('/:id/send', deliver, run(async (req, res) => { req.setTimeout(600000);res.setTimeout(600000);res.json(await sendBatch(req, req.params.id)); }));
router.post('/:id/recipients/:recipientId/link', deliver, run(async (req, res) => {
    const { batch } = await service.loadBatch(req, req.params.id);
    if (batch.status === 'cancelled') throw createAppError('CONFLICT', 409);
    const found = await pool.query('SELECT id,user_id FROM signing_batch_recipients WHERE batch_id=$1 AND id=$2', [batch.id, req.params.recipientId]);
    if (!found.rows.length) throw createAppError('NOT_FOUND', 404);
    // Explicit manual delivery publishes this recipient's packages just like sending an invitation.
    await pool.query(`UPDATE signingfiles sf SET status='pending' FROM signing_batch_files bf
        WHERE bf.batch_id=$1 AND bf.signingfileid=sf.signingfileid AND sf.status='draft'
        AND EXISTS(SELECT 1 FROM signaturespots s WHERE s.signingfileid=sf.signingfileid AND s.signeruserid=$2)`, [batch.id, found.rows[0].user_id]);
    await pool.query("UPDATE signing_batches SET status='ready' WHERE id=$1 AND status='draft'", [batch.id]);
    res.json({ url: recipientUrl(found.rows[0].id) });
}));
module.exports = router;
