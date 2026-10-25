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
const productIdentity = require('../config/productIdentity');
const { createCourtOwnerImport, enabled: courtImportEnabled, MAX_BYTES: COURT_IMPORT_MAX_BYTES } = require('../services/integrations/courtOwnerImport');
const courtImports = createCourtOwnerImport({ pool });
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(auth);
const importOwnerPolicy = req => req.firmPermissionContextValidated === true && req.user?.Role === 'Admin' &&
    (req.firmTenantId ? req.isOfficeOwner === true : req.isPlatformAdminUser === true);
const caseReader = require('../middlewares/requireFirmAction')('cases', 'view', { legacy: 'lawyerOrAdmin' });
async function readableCase(req) {
    if (req.user.Role === 'User' || req.user.Role === 'Client') throw createAppError('FORBIDDEN', 403, 'אין הרשאה');
    const caseId=positiveId(req.params.caseId);
    const denied=await require('../lib/firmPermissions/caseAccess').assertCaseRecordAccess(req,caseId);
    if(denied)throw denied;
    return caseId;
}

router.get('/cases/:caseId/court-documents/:documentId', caseReader, wrap(async(req,res)=>{
    const caseId=await readableCase(req);
    const doc=await courtImports.document({officeId:req.firmTenantId || null,caseId,documentId:req.params.documentId});
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/pdf',
        'Content-Disposition':`attachment; filename="court-decision.pdf"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        'Content-Length':String(doc.buffer.length),'X-Content-SHA256':doc.sha256}).send(doc.buffer);
}));

// Case readers retain the existing record permissions; clients cannot see internal imports.
router.get('/cases/:caseId', caseReader, wrap(async (req, res) => {
    const caseId = await readableCase(req);
    const officeId = req.firmTenantId || null;
    const updates = courtImportEnabled(process.env) ?
        await pool.query(`SELECT u.id,u.title,u.body,u.occurred_at,u.is_demo,u.source_kind,u.court_number,u.document_id,
            d.filename AS source_filename,d.sha256,d.issued_on::text AS issued_on FROM court_updates u
            LEFT JOIN court_import_documents d ON d.id=u.document_id AND d.law_firm_tenant_id IS NOT DISTINCT FROM u.law_firm_tenant_id
            WHERE u.case_id=$1 AND u.law_firm_tenant_id IS NOT DISTINCT FROM $2 ORDER BY u.occurred_at DESC`,[caseId,officeId]) :
        await pool.query(`SELECT id,title,body,occurred_at,is_demo,CASE WHEN is_demo THEN 'demo' ELSE 'owner_file' END AS source_kind
            FROM court_updates WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 ORDER BY occurred_at DESC`, [caseId, officeId]);
    const group = await pool.query('SELECT mode,status,error_code,invite_link FROM case_whatsapp_groups WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2', [caseId, officeId]);
    const courtImport=await courtImports.capability({officeId,caseId,actorUserId:req.user.UserId,policyAllowed:importOwnerPolicy(req)});
    res.json({ updates: updates.rows, group: group.rows[0] || null, courtImport });
}));

// Platform Settings belongs to the office owner. Shared-deployment owners manage
// their own connection and automation; only provider admins may target another office.
router.use((req, res, next) => {
    if (req.isOfficeOwner && req.firmTenantId) { req.integrationPolicyAdmin = true; return next(); }
    requirePlatformAdmin(req, res, err => { if (err) return next(err); req.integrationPolicyAdmin = true; next(); });
});
router.get('/offices', wrap(async (req, res) => {
    const context = { ...productIdentity, demoOnly: process.env.WHATSAPP_DEMO_ONLY === 'true' };
    if (req.firmTenantId) return res.json({ context, offices: [{ id: req.firmTenantId, name: req.tenant?.name || 'המשרד שלי' }], canConfigurePolicy: req.integrationPolicyAdmin });
    if (!isMultiTenantMode()) {
        const name = await require('../services/settingsService').getSetting('firm', 'LAW_FIRM_NAME', process.env.FIRM_DISPLAY_NAME || 'המשרד הנוכחי');
        return res.json({ context, offices: [{ id: 'dedicated', name }], canConfigurePolicy: true });
    }
    const rows = await scope.withSystem(() => pool.query('SELECT id,name FROM law_firm_tenants WHERE is_active=true ORDER BY name'));
    res.json({ context, offices: rows.rows, canConfigurePolicy: true });
}));
// Scope middleware must call next inside AsyncLocalStorage's callback.
router.use((req, _res, next) => {
    (async () => {
        let tenantId = req.firmTenantId || null;
        if (tenantId && req.query.officeId && req.query.officeId !== tenantId) throw createAppError('FORBIDDEN', 403, 'אין הרשאה למשרד המבוקש');
        if (!tenantId && !isMultiTenantMode() && req.query.officeId && req.query.officeId !== 'dedicated') throw createAppError('OFFICE_NOT_FOUND', 404, 'המשרד לא נמצא בסביבה זו');
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
const courtFileUpload = require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:COURT_IMPORT_MAX_BYTES,files:1,fields:7,parts:8,fieldSize:2048}}).single('file');
router.post('/court/import-file',policy,require('../middlewares/requireFirmAction')('cases','edit',{legacy:'admin'}),
    (req,res,next)=>{
        if(!importOwnerPolicy(req))return next(createAppError('FORBIDDEN',403,'רק בעל המשרד או מנהל הפלטפורמה רשאי לייבא קובץ'));
        if(!courtImportEnabled(process.env))return next(createAppError('COURT_OWNER_IMPORT_DISABLED',503,'יבוא הקובץ זמין כעת בסביבת QA בלבד; סנכרון אוטומטי אינו מחובר'));
        courtFileUpload(req,res,error=>next(error?createAppError(error.code==='LIMIT_FILE_SIZE'?'COURT_IMPORT_TOO_LARGE':'COURT_IMPORT_INVALID',error.code==='LIMIT_FILE_SIZE'?413:400,'קובץ היבוא או פרטיו אינם תקינים'):undefined));
    },wrap(async(req,res)=>{
        const caseId=positiveId(req.body.caseId);
        const denied=await require('../lib/firmPermissions/caseAccess').assertCaseRecordAccess(req,caseId,'edit');
        if(denied)throw denied;
        const result=await courtImports.importFile({officeId:req.integrationOfficeId,actorUserId:req.user.UserId,input:req.body,file:req.file});
        res.set('Cache-Control','no-store').status(result.imported?201:200).json(result);
    }));
router.get('/', wrap(async (req, res) => res.json({ ...await service.snapshot(req.integrationOfficeId), canConfigurePolicy: req.integrationPolicyAdmin })));
router.get('/settings', wrap(async (req, res) => res.json({ ...await service.settingsSnapshot(req.integrationOfficeId), canConfigurePolicy: req.integrationPolicyAdmin })));
router.put('/court', policy, wrap(async (req, res) => { await service.saveCourt(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.post('/court/demo-cases', wrap(async (req, res) => res.json({ caseIds: await service.seedDemo(req.integrationOfficeId) })));
router.put('/court/mapping', wrap(async (req, res) => { await service.linkCourt(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.post('/court/sync', wrap(async (req, res) => { await service.syncCourt(req.integrationOfficeId); res.json({ ok: true }); }));
router.put('/whatsapp', policy, wrap(async (req, res) => { await service.saveWhatsapp(req.integrationOfficeId, req.body, req.user.UserId); res.json({ ok: true }); }));
router.post('/whatsapp/linked-device/start', policy, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await service.startLinkedDevice(req.integrationOfficeId, req.body));
}));
router.get('/whatsapp/linked-device/qr', policy, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await service.linkedDeviceQr(req.integrationOfficeId));
}));
router.post('/whatsapp/linked-device/check', policy, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await service.checkLinkedDevice(req.integrationOfficeId));
}));
router.delete('/whatsapp/linked-device', policy, wrap(async (req, res) => {
    await service.disconnectLinkedDevice(req.integrationOfficeId); res.json({ ok: true });
}));
router.post('/whatsapp/contacts/permission', policy, wrap(async (req, res) => {
    res.json(await service.setWhatsappContactPermission(req.integrationOfficeId, req.body, req.user.UserId));
}));
router.post('/whatsapp/groups/recheck', policy, wrap(async (req, res) => res.json(await service.reviewWhatsappGroups(req.integrationOfficeId))));
router.post('/whatsapp/signup', wrap(async (req, res) => res.json(await service.startSignup(req.integrationOfficeId, req.user.UserId))));
router.post('/whatsapp/signup/complete', wrap(async (req, res) => { await service.completeSignup(req.integrationOfficeId, req.user.UserId, req.body); res.json({ ok: true }); }));
router.post('/whatsapp/check', wrap(async (req, res) => res.json(await service.checkWhatsapp(req.integrationOfficeId))));
router.post('/whatsapp/safety/pause', policy, wrap(async (req, res) => { await service.pauseWhatsapp(req.integrationOfficeId); res.json({ ok: true }); }));
router.post('/whatsapp/safety/resume', policy, wrap(async (req, res) => { await service.resumeWhatsapp(req.integrationOfficeId, req.body); res.json({ ok: true }); }));
router.delete('/whatsapp', wrap(async (req, res) => { await service.disconnectWhatsapp(req.integrationOfficeId); res.json({ ok: true }); }));
router.post('/whatsapp/demo/:caseId', policy, wrap(async (req, res) => {
    await service.previewGroup(req.integrationOfficeId, req.params.caseId);
    await worker.processOffice(req.integrationOfficeId, { demoOnly: true, caseId: positiveId(req.params.caseId) }); res.json({ ok: true });
}));
module.exports = router;
