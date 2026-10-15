'use strict';
const express = require('express');
const auth = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const { createAppError } = require('../utils/appError');
const { isMultiTenantMode } = require('../lib/tenant/tenantContext');
const scope = require('../lib/tenant/databaseScope');
const pool = require('../config/db');
const { service, worker, runOffice } = require('../services/integrations/runtime');
const { positiveId } = require('../services/integrations/validation');
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(auth);

// Case readers retain the existing record permissions; clients cannot see internal imports.
router.get('/cases/:caseId', require('../middlewares/requireFirmAction')('cases', 'view', { legacy: 'lawyerOrAdmin' }), wrap(async (req, res) => {
    if (req.user.Role === 'User' || req.user.Role === 'Client') throw createAppError('FORBIDDEN', 403, 'אין הרשאה');
    const caseId = positiveId(req.params.caseId);
    const denied = await require('../lib/firmPermissions/caseAccess').assertCaseRecordAccess(req, caseId);
    if (denied) throw denied;
    const officeId = req.firmTenantId || null;
    const updates = await pool.query('SELECT id,title,body,occurred_at,is_demo FROM court_updates WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 ORDER BY occurred_at DESC', [caseId, officeId]);
    const group = await pool.query('SELECT mode,status,error_code,invite_link FROM case_whatsapp_groups WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2', [caseId, officeId]);
    res.json({ updates: updates.rows, group: group.rows[0] || null });
}));

// Office owners may connect their number. Only platform administrators set the
// automation policy and recipient list. A target office is accepted only after PA auth.
router.use((req, res, next) => {
    if (req.isOfficeOwner && req.firmTenantId) { req.integrationPolicyAdmin = false; return next(); }
    requirePlatformAdmin(req, res, err => { if (err) return next(err); req.integrationPolicyAdmin = true; next(); });
});
router.get('/offices', wrap(async (req, res) => {
    if (req.firmTenantId) return res.json({ offices: [{ id: req.firmTenantId, name: req.tenant?.name || 'המשרד שלי' }], canConfigurePolicy: false });
    if (!isMultiTenantMode()) return res.json({ offices: [{ id: 'dedicated', name: 'המשרד הנוכחי' }], canConfigurePolicy: true });
    const rows = await scope.withSystem(() => pool.query('SELECT id,name FROM law_firm_tenants WHERE is_active=true ORDER BY name'));
    res.json({ offices: rows.rows, canConfigurePolicy: true });
}));
// Scope middleware must call next inside AsyncLocalStorage's callback.
router.use((req, _res, next) => {
    (async () => {
        let tenantId = req.firmTenantId || null;
        if (tenantId && req.query.officeId && req.query.officeId !== tenantId) throw createAppError('FORBIDDEN', 403, 'אין הרשאה למשרד המבוקש');
        if (!tenantId && isMultiTenantMode()) {
            if (!req.integrationPolicyAdmin || !/^[a-f0-9-]{36}$/i.test(String(req.query.officeId || ''))) throw createAppError('OFFICE_REQUIRED', 400, 'יש לבחור משרד');
            const tenant = await scope.withSystem(() => pool.query('SELECT id FROM law_firm_tenants WHERE id=$1 AND is_active=true', [req.query.officeId]));
            if (!tenant.rows[0]) throw createAppError('OFFICE_NOT_FOUND', 404, 'המשרד לא נמצא');
            tenantId = tenant.rows[0].id;
        }
        req.integrationOfficeId = tenantId;
        runOffice(tenantId, next);
    })().catch(next);
});
const policy = (req, _res, next) => req.integrationPolicyAdmin ? next() : next(createAppError('FORBIDDEN', 403, 'רק מנהל הפלטפורמה רשאי לשנות את הגדרות הסנכרון והאוטומציה'));
router.get('/', wrap(async (req, res) => res.json({ ...await service.snapshot(req.integrationOfficeId), canConfigurePolicy: req.integrationPolicyAdmin })));
router.get('/settings', wrap(async (req, res) => res.json({ ...await service.settingsSnapshot(req.integrationOfficeId), canConfigurePolicy: req.integrationPolicyAdmin })));
router.put('/court', policy, wrap(async (req, res) => { await service.saveCourt(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.post('/court/demo-cases', wrap(async (req, res) => res.json({ caseIds: await service.seedDemo(req.integrationOfficeId) })));
router.put('/court/mapping', wrap(async (req, res) => { await service.linkCourt(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.post('/court/sync', wrap(async (req, res) => { await service.syncCourt(req.integrationOfficeId); res.json({ ok: true }); }));
router.put('/whatsapp', policy, wrap(async (req, res) => { await service.saveWhatsapp(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.post('/whatsapp/signup', wrap(async (req, res) => res.json(await service.startSignup(req.integrationOfficeId, req.user.UserId))));
router.post('/whatsapp/signup/complete', wrap(async (req, res) => { await service.completeSignup(req.integrationOfficeId, req.user.UserId, req.body); res.json({ ok: true }); }));
router.post('/whatsapp/check', wrap(async (req, res) => res.json(await service.checkWhatsapp(req.integrationOfficeId))));
router.delete('/whatsapp', wrap(async (req, res) => { await service.disconnectWhatsapp(req.integrationOfficeId); res.json({ ok: true }); }));
router.post('/whatsapp/demo/:caseId', policy, wrap(async (req, res) => {
    await service.previewGroup(req.integrationOfficeId, req.params.caseId);
    await worker.processOffice(req.integrationOfficeId, { demoOnly: true, caseId: positiveId(req.params.caseId) }); res.json({ ok: true });
}));
module.exports = router;
