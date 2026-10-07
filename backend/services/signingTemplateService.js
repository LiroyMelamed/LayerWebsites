const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { createAppError } = require('../utils/appError');
const { getCurrentTenantId, isMultiTenantMode } = require('../lib/tenant/tenantContext');
const { getSigningDataScope } = require('../lib/firmRolePermissions');
const { pageGeometryFromPdfLibPage } = require('../lib/signingGeometry');
const { validateDefinition, validatePageBounds, UUID, invalid } = require('../lib/signingTemplateDefinition');

const MAX_BYTES = Math.min(30 * 1024 * 1024, Number(process.env.MAX_SIGNING_PDF_BYTES) || 20 * 1024 * 1024);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function actorScope(req, db = pool) {
    const userId = Number(req.user?.UserId);
    if (!Number.isSafeInteger(userId) || userId < 1) throw createAppError('UNAUTHORIZED', 401);
    const { rows } = await db.query('SELECT userid, name, role, law_firm_tenant_id FROM users WHERE userid=$1', [userId]);
    const actor = rows[0];
    if (!actor) throw createAppError('FORBIDDEN', 403);
    const current = getCurrentTenantId();
    if (isMultiTenantMode() && (!current || String(current) !== String(actor.law_firm_tenant_id || ''))) throw createAppError('FORBIDDEN', 403);
    if (req.firmPermissionMode === 'role' && (!req.firmPermissionContextValidated || String(req.firmTenantId || '') !== String(actor.law_firm_tenant_id || ''))) throw createAppError('FORBIDDEN', 403);
    const all = req.firmPermissionMode === 'platform_admin' || (req.firmPermissionMode === 'role'
        ? getSigningDataScope(req.firmPermissions) === 'all_firm' : actor.role === 'Admin');
    return { userId, tenantId: actor.law_firm_tenant_id || null, all, name: actor.name };
}

function scopeClause(scope, alias = 't') {
    return { sql: `${alias}.law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid AND ($2::boolean OR ${alias}.owner_userid=$3)`, params: [scope.tenantId, scope.all, scope.userId] };
}
async function loadTemplate(req, id, { db = pool, lock = false, includeArchived = false } = {}) {
    if (!UUID.test(String(id))) invalid('מזהה התבנית אינו תקין');
    const scope = await actorScope(req, db);const filter = scopeClause(scope);
    const { rows } = await db.query(`SELECT t.* FROM signing_templates t WHERE ${filter.sql} AND COALESCE(t.definition->>'schemaVersion','1')='1' AND t.id=$4::uuid ${includeArchived ? '' : 'AND NOT t.archived'} ${lock ? 'FOR UPDATE' : ''}`, [...filter.params, id]);
    if (!rows[0]) throw createAppError('NOT_FOUND', 404, 'התבנית אינה זמינה');
    return { template: rows[0], scope };
}
async function readPdf(key, { maxBytes = MAX_BYTES } = {}) {
    const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!Number.isFinite(Number(head.ContentLength)) || Number(head.ContentLength) < 5 || Number(head.ContentLength) > maxBytes) invalid('גודל קובץ ה־PDF אינו נתמך');
    const response = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];let length = 0;
    for await (const chunk of response.Body) { length += chunk.length;if (length > maxBytes) invalid('קובץ ה־PDF גדול מדי');chunks.push(Buffer.from(chunk)); }
    const bytes = Buffer.concat(chunks);
    let pdf;
    try { pdf = await PDFDocument.load(bytes); } catch { invalid('יש לבחור קובץ PDF תקין שאינו מוצפן'); }
    if (!pdf.getPageCount() || pdf.getPageCount() > 500) invalid('מספר עמודי המסמך אינו נתמך');
    const geometries = pdf.getPages().map(page => {
        const geometry = pageGeometryFromPdfLibPage(page);
        return { width: geometry.visualWidth, height: geometry.visualHeight };
    });
    return { bytes, sha256: hash(bytes), geometries };
}
async function removeOwnedObjects(keys) {
    for (const key of keys) {
        try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); }
        catch (error) { console.error('[signingTemplates] staged object cleanup failed', error?.name || 'storage'); }
    }
}

async function saveTemplate(req, id = null) {
    const definition = validateDefinition(req.body);
    if (!definition.requireOtp && !definition.otpWaiverAcknowledged) invalid('ויתור על אימות דורש אישור מפורש');
    const scope = await actorScope(req);
    const previous = id ? (await loadTemplate(req, id)).template : null;
    if (previous && (!Number.isInteger(req.body.expectedVersion) || req.body.expectedVersion !== previous.version)) throw createAppError('CONFLICT', 409, 'התבנית השתנתה. יש לטעון אותה מחדש');
    const templateId = id || crypto.randomUUID();const version = (previous?.version || 0) + 1;
    const previousKeys = new Set(previous?.definition?.documents?.map(d => d.fileKey) || []);
    const createdKeys = [];
    try {
        for (const document of definition.documents) {
            if (!document.fileKey.startsWith(`users/${scope.userId}/`) && !previousKeys.has(document.fileKey)) throw createAppError('FORBIDDEN', 403);
            const file = await readPdf(document.fileKey);
            validatePageBounds(document, file.geometries);
            const previousDocument = previous?.definition.documents.find(doc => doc.fileKey === document.fileKey);
            if (previousDocument && previousDocument.sha256 !== file.sha256) throw createAppError('CONFLICT', 409, 'קובץ התבנית השתנה');
            const key = previousDocument ? document.fileKey : `signing-templates/${scope.userId}/${templateId}/${crypto.randomUUID()}.pdf`;
            if (!previousDocument) {
                createdKeys.push(key);
                await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: file.bytes, ContentType: 'application/pdf' }));
            }
            document.fileKey = key;document.sha256 = file.sha256;document.bytes = file.bytes.length;document.pages = file.geometries;
        }
        let result;
        if (previous) {
            result = await pool.query(`UPDATE signing_templates SET name=$1, definition=$2::jsonb, version=version+1, updated_at=now()
                WHERE id=$3 AND version=$4 AND NOT archived RETURNING *`, [definition.name, JSON.stringify(definition), id, previous.version]);
            if (!result.rows.length) throw createAppError('CONFLICT', 409, 'התבנית השתנתה. יש לטעון אותה מחדש');
        } else {
            result = await pool.query(`INSERT INTO signing_templates(id,law_firm_tenant_id,owner_userid,name,definition)
                VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *`, [templateId, scope.tenantId, scope.userId, definition.name, JSON.stringify(definition)]);
        }
        return result.rows[0];
    } catch (error) { await removeOwnedObjects(createdKeys);throw error; }
}
async function listTemplates(req) {
    const filter = scopeClause(await actorScope(req));
    const { rows } = await pool.query(`SELECT id,name,version,created_at,updated_at,
        jsonb_array_length(definition->'documents') AS document_count, definition->'roles' AS roles
        FROM signing_templates t WHERE ${filter.sql} AND COALESCE(t.definition->>'schemaVersion','1')='1' AND NOT archived ORDER BY updated_at DESC LIMIT 200`, filter.params);
    return rows;
}
async function archiveTemplate(req, id) {
    const { template } = await loadTemplate(req, id);
    if (req.body.expectedVersion !== template.version) throw createAppError('CONFLICT', 409, 'התבנית השתנתה. יש לטעון אותה מחדש');
    const result = await pool.query('UPDATE signing_templates SET archived=true,updated_at=now() WHERE id=$1 AND version=$2 AND NOT archived RETURNING id', [id, template.version]);
    if (!result.rows.length) throw createAppError('CONFLICT', 409, 'התבנית השתנתה');
}
module.exports = { actorScope, scopeClause, loadTemplate, readPdf, removeOwnedObjects, saveTemplate, listTemplates, archiveTemplate, hash, MAX_BYTES };
