const jwt = require('jsonwebtoken');
const archiver = require('archiver');
const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { WEBSITE_DOMAIN } = require('../utils/sendMessage');
const { notifyRecipient } = require('./notifications/notificationOrchestrator');
const { readPdf } = require('./signingTemplateService');
const { resolveFirmSigningPolicy } = require('../lib/firm/resolveFirmSigningPolicy');
const { consume } = require('../utils/rateLimiter');
const { UUID } = require('../lib/signingTemplateDefinition');
const { isMultiTenantMode, getCurrentTenantId } = require('../lib/tenant/tenantContext');

async function packageContext(fileId) {
    return (await pool.query(`SELECT bf.batch_id,bf.package_index,b.snapshot,b.owner_userid,b.name,u.name AS owner_name,u.email AS owner_email
        FROM signing_batch_files bf JOIN signing_batches b ON b.id=bf.batch_id JOIN users u ON u.userid=b.owner_userid
        WHERE bf.signingfileid=$1 AND b.status<>'cancelled'`, [fileId])).rows[0] || null;
}
function packageUrl(context) {
    const token = jwt.sign({ typ: 'signing_package_view', batchId: context.batch_id, packageIndex: context.package_index }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    const domain = /^https?:\/\//i.test(WEBSITE_DOMAIN) ? WEBSITE_DOMAIN : `https://${WEBSITE_DOMAIN}`;
    return `${domain.replace(/\/+$/, '')}/api/signing-batches/completed/${encodeURIComponent(token)}`;
}
async function packageFiles(context) {
    return (await pool.query(`SELECT sf.* FROM signing_batch_files bf JOIN signingfiles sf USING(signingfileid)
        WHERE bf.batch_id=$1 AND bf.package_index=$2 ORDER BY bf.document_index`, [context.batch_id, context.package_index])).rows;
}
async function completePackage(context, req) {
    if (!context || context.snapshot.definition.completionMode !== 'package') return;
    const files = await packageFiles(context);
    if (files.length !== context.snapshot.definition.documents.length || files.some(file => file.status !== 'signed')) return;
    const controller = require('../controllers/signingFileController');
    // Recover only missing final artifacts. The existing renderer preserves immutable originals.
    for (const file of files) if (!file.signedfilekey) await controller.getDeliverableSignedPdf({ signingFileId: file.signingfileid, lawyerId: file.lawyerid, pdfKey: file.originalfilekey || file.filekey, persist: true, finalize: true });
    const emailTargets = [...new Set([context.owner_email, context.snapshot.definition.completionEmail].filter(Boolean).map(v => v.trim().toLowerCase()))];
    const url = packageUrl(context);const label = context.snapshot.packages[context.package_index]?.label || context.name;
    for (const email of emailTargets) {
        const claim = await pool.query(`INSERT INTO signing_package_completions(batch_id,package_index,recipient_email,status)
            VALUES($1,$2,$3,'sending') ON CONFLICT DO NOTHING RETURNING batch_id`, [context.batch_id, context.package_index, email]);
        if (!claim.rowCount) continue;
        let success = false;
        try {
            const result = await notifyRecipient({ recipientEmail: email, notificationType: 'DOC_SIGNED', skipAdminCc: true,
                email: { campaignKey: 'DOC_SIGNED', contactFields: { recipient_name: context.owner_name, document_name: label,
                    lawyer_name: context.owner_name, signed_document_url: url, evidence_certificate_url: url } } });
            success = result?.outcomes?.email?.ok === true;
        } catch { /* An unknown transport outcome must not trigger duplicate delivery. */ }
        await pool.query("UPDATE signing_package_completions SET status=$4,sent_at=CASE WHEN $4='sent' THEN now() END WHERE batch_id=$1 AND package_index=$2 AND recipient_email=$3", [context.batch_id, context.package_index, email, success ? 'sent' : 'uncertain']);
        await controller.insertAuditEvent({ req, eventType: 'SIGNING_PACKAGE_COMPLETED', actorUserId: context.owner_userid, actorType: 'system', success,
            metadata: { batchId: context.batch_id, packageIndex: context.package_index, fileIds: files.map(f => f.signingfileid) } });
    }
}
async function downloadPackage(req, res) {
    let claims;
    try { claims = jwt.verify(req.params.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw createAppError('INVALID_TOKEN', 401); }
    if (claims.typ !== 'signing_package_view' || !UUID.test(String(claims.batchId)) || !Number.isSafeInteger(claims.packageIndex) || claims.packageIndex < 0) throw createAppError('INVALID_TOKEN', 401);
    if (!consume({ key: `package-download:${claims.batchId}:${req.ip}`, windowMs: 60000, max: 10 }).allowed) throw createAppError('RATE_LIMITED', 429);
    if (!(await resolveFirmSigningPolicy()).signingEnabled) throw createAppError('FORBIDDEN', 403);
    const batch = (await pool.query("SELECT * FROM signing_batches WHERE id=$1 AND status<>'cancelled' AND ($2::boolean=false OR law_firm_tenant_id=$3::uuid)", [claims.batchId, isMultiTenantMode(), getCurrentTenantId()])).rows[0];
    if (!batch) throw createAppError('NOT_FOUND', 404);
    return sendPackageArchive(batch, claims.packageIndex, req, res);
}
async function sendPackageArchive(batch, packageIndex, req, res) {
    if (!Number.isSafeInteger(packageIndex) || packageIndex < 0 || packageIndex >= batch.snapshot.packages.length) throw createAppError('NOT_FOUND', 404);
    const files = await packageFiles({ batch_id: batch.id, package_index: packageIndex });
    if (files.length !== batch.snapshot.definition.documents.length || files.some(file => file.status !== 'signed' || !file.signedfilekey)) throw createAppError('CONFLICT', 409, 'החבילה עדיין בהכנה');
    // Verify all hashes before starting the archive response; never serve a changed signed artifact.
    const documents = [];
    for (const file of files) {
        const pdf = await readPdf(file.signedfilekey, { maxBytes: 50 * 1024 * 1024 });
        if (pdf.sha256 !== file.signedpdfsha256) throw createAppError('CONFLICT', 409, 'אימות המסמך נכשל');
        const evidence = await require('../controllers/signingFileController').generateEvidenceCertificateBuffer(file.signingfileid);
        documents.push({ file, pdf, evidence });
    }
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.on('error', error => res.destroy(error));res.on('close', () => { if (!res.writableEnded) zip.abort(); });
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="signed-package.zip"', 'Cache-Control': 'private, no-store' });zip.pipe(res);
    for (const [index, doc] of documents.entries()) {
        const name = String(doc.file.filename || 'document').replace(/[\\/\r\n\t]/g, '_').slice(0, 150);
        zip.append(doc.pdf.bytes, { name: `${index + 1}-${name.replace(/\.pdf$/i, '')}-signed.pdf` });
        zip.append(doc.evidence.pdfBuffer, { name: `${index + 1}-evidence.pdf` });
    }
    await zip.finalize();
}
module.exports = { packageContext, completePackage, downloadPackage, packageUrl, sendPackageArchive };
