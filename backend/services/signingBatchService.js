const crypto = require('node:crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { createAppError } = require('../utils/appError');
const { getSetting } = require('./settingsService');
const { checkFirmLimitsOrNull } = require('../lib/limits/enforceFirmLimits');
const { invalidateOperationalDashboardCaches } = require('../utils/operationalDashboardCache');
const { validatePackages } = require('../lib/signingBatchRecipients');
const { UUID, requestHash, invalid } = require('../lib/signingTemplateDefinition');
const templates = require('./signingTemplateService');
const { formatPhoneNumber } = require('../utils/phoneUtils');
const { hasAreaAction } = require('../lib/firmRolePermissions');

const bool = v => v === true || v === 1 || v === '1' || v === 'true';
function canDeliver(req, batch) {
    if (req.firmPermissionMode === 'platform_admin') return true;
    if (req.firmPermissionMode === 'role') return hasAreaAction(req.firmPermissions, 'signing', 'manage')
        || (Number(batch.owner_userid) === Number(req.user.UserId) && hasAreaAction(req.firmPermissions, 'signing', 'upload'));
    return ['Admin', 'Lawyer'].includes(req.user?.Role);
}
async function loadBatch(req, id, { db = pool, lock = false } = {}) {
    if (!UUID.test(String(id))) invalid('מזהה השליחה אינו תקין');
    const scope = await templates.actorScope(req, db);const filter = templates.scopeClause(scope, 'b');
    const { rows } = await db.query(`SELECT b.* FROM signing_batches b WHERE ${filter.sql} AND b.id=$4::uuid ${lock ? 'FOR UPDATE' : ''}`, [...filter.params, id]);
    if (!rows[0]) throw createAppError('NOT_FOUND', 404, 'השליחה אינה זמינה');
    return { batch: rows[0], scope };
}
async function resolveContact(db, contact, scope, role) {
    const params = [scope.tenantId];
    const filters = [];
    if (contact.userId) { params.push(contact.userId);filters.push(`userid=$${params.length}`); }
    else {
        if (contact.email) { params.push(contact.email);filters.push(`lower(email)=$${params.length}`); }
        if (contact.phone) {
            params.push([contact.phone, contact.phone.replace('+', ''), `0${contact.phone.slice(4)}`]);
            filters.push(`regexp_replace(phonenumber,'[^0-9+]','','g')=ANY($${params.length}::text[])`);
        }
    }
    const found = await db.query(`SELECT userid,name,email,phonenumber,role FROM users WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid AND (${filters.join(' OR ')}) ORDER BY userid LIMIT 2`, params);
    if (found.rows.length > 1) invalid('האימייל והטלפון מפנים למשתמשים שונים. יש לתקן את הנמען');
    let user = found.rows[0];
    if (contact.userId && !user) throw createAppError('FORBIDDEN', 403);
    if (user) {
        if ((contact.email && contact.email !== String(user.email || '').trim().toLowerCase()) || (contact.phone && contact.phone !== formatPhoneNumber(user.phonenumber))) invalid('פרטי הקשר שונים מכרטיס הלקוח. יש לתקן את הנמען או את כרטיס הלקוח');
    } else {
        if (role.kind === 'lawyer') invalid('לתפקיד עורך הדין יש לבחור משתמש משרד קיים');
        // Serialize identity creation in this batch transaction. Never alter an existing identity.
        const created = await db.query(`INSERT INTO users(name,email,phonenumber,role,law_firm_tenant_id)
            VALUES($1,$2,$3,$4,$5) RETURNING userid,name,email,phonenumber,role`, [contact.name, contact.email || null, contact.phone || null, contact.phone ? 'User' : 'ExternalSigner', scope.tenantId]);
        user = created.rows[0];
    }
    if (role.kind === 'lawyer' && !['Admin', 'Lawyer'].includes(user.role)) invalid('לתפקיד עורך הדין יש לבחור עורך דין או מנהל משרד');
    const result = { userId: user.userid, name: user.name, email: user.email || '', phone: user.phonenumber || '', deliveryMethod: contact.deliveryMethod };
    if ((['email', 'both'].includes(result.deliveryMethod) && !result.email) || (['phone', 'both'].includes(result.deliveryMethod) && !formatPhoneNumber(result.phone))) invalid('לנמען חסרים פרטי קשר עבור ערוץ השליחה שנבחר');
    return result;
}

async function createBatch(req) {
    const input = req.body || {};
    if (!UUID.test(String(input.idempotencyKey))) invalid('יש לספק מזהה ייחודי לשליחה');
    const retryScope = await templates.actorScope(req);
    const retry = await pool.query('SELECT * FROM signing_batches WHERE owner_userid=$1 AND idempotency_key=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid', [retryScope.userId, input.idempotencyKey, retryScope.tenantId]);
    if (retry.rows[0]) {
        const previous = retry.rows[0];const definition = previous.snapshot.definition;
        const fingerprint = requestHash({ templateId: input.templateId, templateVersion: input.templateVersion,
            packages: validatePackages(input, definition), name: String(input.name || definition.name).trim().slice(0, 120) });
        if (fingerprint !== previous.request_hash) throw createAppError('CONFLICT', 409, 'מזהה השליחה כבר שימש לתוכן שונה');
        return { batch: previous, reused: true };
    }
    const { template, scope } = await templates.loadTemplate(req, input.templateId);
    if (input.templateVersion !== template.version) throw createAppError('CONFLICT', 409, 'התבנית השתנתה. יש לבדוק את הגרסה החדשה');
    const packages = validatePackages(input, template.definition);
    const name = String(input.name || template.name).trim().slice(0, 120);
    const fingerprint = requestHash({ templateId: template.id, templateVersion: template.version, packages, name });
    const db = await pool.connect();const createdKeys = [];let committed = false;
    try {
        await db.query('BEGIN');
        // All bulk creation for one office is serialized, including limits and contact resolution.
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`signing-batches:${scope.tenantId || 'dedicated'}`]);
        const previous = await db.query('SELECT * FROM signing_batches WHERE owner_userid=$1 AND idempotency_key=$2', [scope.userId, input.idempotencyKey]);
        if (previous.rows[0]) {
            if (previous.rows[0].request_hash !== fingerprint) throw createAppError('CONFLICT', 409, 'מזהה השליחה כבר שימש לתוכן שונה');
            await db.query('COMMIT');committed = true;return { batch: previous.rows[0], reused: true };
        }
        const files = [];
        for (const document of template.definition.documents) {
            const file = await templates.readPdf(document.fileKey);
            if (file.sha256 !== document.sha256) throw createAppError('CONFLICT', 409, 'קובץ התבנית השתנה');
            files.push(file);
        }
        const check = await checkFirmLimitsOrNull({ action: 'upload_signing_file', increments: { documentsCreatedThisMonth: packages.length * files.length, storageBytesTotal: packages.length * files.reduce((sum, file) => sum + file.bytes.length, 0) } });
        if (check?.enforcementMode === 'block' && check.blocks?.length) throw createAppError('LIMIT_EXCEEDED', 402);
        const otpEnabled = bool(await getSetting('signing', 'SIGNING_OTP_ENABLED', 'true'));
        const requireOtp = otpEnabled && template.definition.requireOtp;
        if (otpEnabled && !requireOtp && !template.definition.otpWaiverAcknowledged) invalid('ויתור על אימות דורש אישור מפורש');
        const batchId = crypto.randomUUID();const recipientMap = new Map();const resolvedPackages = [];
        for (const row of packages) {
            if (row.caseId) {
                const c = await db.query("SELECT caseid FROM cases WHERE caseid=$1 AND (to_jsonb(cases)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text", [row.caseId, scope.tenantId]);
                if (!c.rows.length) throw createAppError('FORBIDDEN', 403);
            }
            const signers = {};
            for (const role of template.definition.roles) {
                const signer = await resolveContact(db, row.signers[role.id], scope, role);
                signers[role.id] = signer;
                const existing = recipientMap.get(signer.userId);
                if (existing && existing.deliveryMethod !== signer.deliveryMethod) invalid('יש לבחור אותו ערוץ שליחה לנמען שמופיע בכמה חבילות');
                recipientMap.set(signer.userId, signer);
            }
            resolvedPackages.push({ ...row, signers });
            if (new Set(Object.values(signers).map(s => s.userId)).size !== Object.keys(signers).length) invalid('יש לבחור אדם שונה לכל תפקיד בתוך אותה חבילה');
        }
        const snapshot = { definition: template.definition, packages: resolvedPackages, requireOtp };
        const inserted = await db.query(`INSERT INTO signing_batches(id,law_firm_tenant_id,owner_userid,template_id,template_version,name,snapshot,request_hash,idempotency_key,status)
            VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'draft') RETURNING *`, [batchId, scope.tenantId, scope.userId, template.id, template.version, name, JSON.stringify(snapshot), fingerprint, input.idempotencyKey]);
        for (let packageIndex = 0; packageIndex < resolvedPackages.length; packageIndex++) {
            const row = resolvedPackages[packageIndex];
            for (let documentIndex = 0; documentIndex < files.length; documentIndex++) {
                const document = template.definition.documents[documentIndex];const file = files[documentIndex];
                const key = `users/${scope.userId}/signing-batches/${batchId}/${crypto.randomUUID()}.pdf`;
                createdKeys.push(key);
                await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: file.bytes, ContentType: 'application/pdf' }));
                const roleIds = template.definition.roles.filter(role => document.fields.some(field => field.roleId === role.id)).map(role => role.id);
                const primary = row.signers[roleIds[0]];
                const created = await db.query(`INSERT INTO signingfiles(caseid,lawyerid,clientid,filename,filekey,originalfilekey,status,requireotp,signingpolicyversion,
                    policyselectedbyuserid,policyselectedatutc,otpwaiveracknowledged,otpwaiveracknowledgedatutc,otpwaiveracknowledgedbyuserid,
                    signingorder,completionemail,unsignedpdfbytes,originalpdfsha256,presentedpdfsha256,originalstoragebucket,originalstoragekey)
                    VALUES($1,$2,$3,$4,$5,$5,'draft',$6,'2026-01-11',$2,now(),$7,CASE WHEN $7 THEN now() END,CASE WHEN $7 THEN $2::integer END,$8,$9,$10,$11,$11,$12,$5)
                    RETURNING signingfileid`, [row.caseId, scope.userId, primary.userId, `${row.label} — ${document.name}`, key, requireOtp, !requireOtp,
                    template.definition.signingOrder, template.definition.completionMode === 'package' ? null : (template.definition.completionEmail || null), file.bytes.length, file.sha256, BUCKET]);
                const fileId = created.rows[0].signingfileid;
                for (const roleId of roleIds) {
                    const signer = row.signers[roleId];
                    await db.query('INSERT INTO signing_signer_delivery(signing_file_id,signer_user_id,delivery_method) VALUES($1,$2,$3)', [fileId, signer.userId, signer.deliveryMethod]);
                }
                for (const field of document.fields) {
                    const signer = row.signers[field.roleId];
                    await db.query(`INSERT INTO signaturespots(signingfileid,pagenumber,x,y,width,height,signername,isrequired,signeruserid,fieldtype,signerindex,fieldlabel)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [fileId, field.pageNum, field.x, field.y, field.width, field.height, signer.name, field.isRequired, signer.userId, field.fieldType, roleIds.indexOf(field.roleId), field.fieldLabel || null]);
                }
                await db.query('INSERT INTO signing_batch_files(batch_id,package_index,document_index,signingfileid) VALUES($1,$2,$3,$4)', [batchId, packageIndex, documentIndex, fileId]);
                await require('../controllers/signingFileController').insertAuditEvent({ req, db, eventType: 'SIGNING_POLICY_SELECTED', signingFileId: fileId,
                    actorUserId: scope.userId, actorType: 'lawyer', metadata: { templateId: template.id, templateVersion: template.version, batchId, requireOtp, otpWaiverAcknowledged: !requireOtp, originalPdfSha256: file.sha256 } });
            }
        }
        for (const signer of recipientMap.values()) await db.query(`INSERT INTO signing_batch_recipients(id,batch_id,user_id,delivery_method) VALUES($1,$2,$3,$4)`, [crypto.randomUUID(), batchId, signer.userId, signer.deliveryMethod]);
        await db.query('COMMIT');committed = true;invalidateOperationalDashboardCaches();
        return { batch: inserted.rows[0], reused: false };
    } catch (error) { if (!committed) await db.query('ROLLBACK');throw error; }
    finally { db.release();if (!committed) await templates.removeOwnedObjects(createdKeys); }
}

async function batchDetails(req, id) {
    const { batch } = await loadBatch(req, id);
    const files = await pool.query(`SELECT bf.package_index,bf.document_index,sf.signingfileid,sf.filename,sf.status,
        (SELECT count(*)::integer FROM signaturespots s WHERE s.signingfileid=sf.signingfileid AND s.isrequired) AS required_count,
        (SELECT count(*)::integer FROM signaturespots s WHERE s.signingfileid=sf.signingfileid AND s.isrequired AND s.issigned) AS signed_count
        FROM signing_batch_files bf JOIN signingfiles sf USING(signingfileid) WHERE batch_id=$1 ORDER BY package_index,document_index`, [id]);
    const recipients = await pool.query(`SELECT r.id,r.user_id,u.name,r.delivery_method,r.status,r.error_code,r.sent_at FROM signing_batch_recipients r JOIN users u ON u.userid=r.user_id WHERE r.batch_id=$1 ORDER BY u.name`, [id]);
    const completion = await pool.query('SELECT package_index,recipient_email,status,sent_at FROM signing_package_completions WHERE batch_id=$1 ORDER BY package_index,recipient_email', [id]);
    return { batch, files: files.rows, recipients: recipients.rows, completion: completion.rows, canDeliver: canDeliver(req, batch) };
}
module.exports = { createBatch, loadBatch, batchDetails, resolveContact, canDeliver };
