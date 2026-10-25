'use strict';

// An authenticated owner uploads an official export. This is not a portal
// connection, an API grant, or an unattended synchronization transport.
const crypto = require('node:crypto');
const { PDFDocument, PDFDict, PDFName, PDFArray } = require('pdf-lib');
const { fail, courtNumber, positiveId } = require('./validation');
const { normalizeRolePermissions, hasAreaAction, getCasesDataScope } = require('../../lib/firmRolePermissions');
const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OFFICE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function enabled(env = process.env) {
    return env.COURT_OWNER_IMPORT_ENABLED === 'true' &&
        String(env.RUNTIME_TENANT || '').trim().toLowerCase() === 'melamedia';
}
function qaTenant(env = process.env) {
    return String(env.RUNTIME_TENANT || '').trim().toLowerCase() === 'melamedia';
}
function office(value) {
    if (value !== null && !OFFICE.test(String(value))) fail('INVALID_OFFICE', 'משרד לא תקין');
    return value;
}
function filename(value) {
    const name = String(value || '').normalize('NFC').split(/[\\/]/).pop()
        .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    return name && name.length <= 120 && /\.pdf$/i.test(name) ? name : 'court-decision.pdf';
}
function fields(input) {
    if (!input || Object.keys(input).some(key => !['caseId','courtNumber','issuedOn','title','actionId','sourceConfirmed'].includes(key)))
        fail('COURT_IMPORT_INVALID', 'פרטי היבוא אינם תקינים');
    if (input.sourceConfirmed !== 'true') fail('COURT_IMPORT_SOURCE_CONFIRMATION_REQUIRED', 'יש לאשר שהקובץ הורד מנט המשפט');
    const title = String(input.title || '').trim();
    if (!title || title.length > 160 || /[\u0000-\u001f\u007f]/.test(title)) fail('COURT_IMPORT_INVALID', 'יש להזין כותרת באורך של עד 160 תווים');
    const issuedOn = String(input.issuedOn || '');
    const parsed = new Date(issuedOn + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== issuedOn)
        fail('COURT_IMPORT_INVALID', 'תאריך ההחלטה אינו תקין');
    if (!UUID.test(String(input.actionId || ''))) fail('COURT_IMPORT_INVALID', 'יש להתחיל שוב את היבוא');
    return { caseId:positiveId(input.caseId), courtNumber:courtNumber(input.courtNumber), issuedOn, title, actionId:input.actionId.toLowerCase() };
}
async function inspectPdf(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) fail('COURT_IMPORT_PDF_REQUIRED', 'יש לבחור קובץ PDF');
    if (buffer.length > MAX_BYTES) fail('COURT_IMPORT_TOO_LARGE', 'גודל הקובץ המרבי הוא 5MB', 413);
    if (buffer.subarray(0,5).toString() !== '%PDF-' || !buffer.subarray(-2048).includes(Buffer.from('%%EOF')))
        fail('COURT_IMPORT_PDF_INVALID', 'יש לבחור קובץ PDF תקין שאינו מוצפן');
    let pdf;
    try { pdf = await PDFDocument.load(buffer, {ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true}); }
    catch (_) { fail('COURT_IMPORT_PDF_INVALID', 'יש לבחור קובץ PDF תקין שאינו מוצפן'); }
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 50)
        fail('COURT_IMPORT_PDF_INVALID', 'אפשר לייבא עד 50 עמודים בקובץ שאינו מוצפן');
    // Files are stored/downloaded as bytes, never executed. Active actions and
    // embedded attachments are not required for an ordinary court decision.
    const visited=new Set();
    function inspectObject(object,depth=0) {
        if (!object || visited.has(object)) return;
        visited.add(object);
        if (depth>64 || visited.size>50000) fail('COURT_IMPORT_PDF_INVALID','מבנה הקובץ אינו נתמך');
        if (object instanceof PDFDict) {
            for (const key of ['JS','JavaScript','EmbeddedFiles','Launch','RichMedia','AA']) {
                if (object.has(PDFName.of(key))) fail('COURT_IMPORT_PDF_INVALID','הקובץ מכיל פעולות או קבצים מצורפים שאינם נתמכים');
            }
            const action=object.get(PDFName.of('S'));
            if (action instanceof PDFName && ['JavaScript','Launch','RichMedia'].includes(action.decodeText()))
                fail('COURT_IMPORT_PDF_INVALID','הקובץ מכיל פעולה שאינה נתמכת');
            for(const [,value] of object.entries())inspectObject(value,depth+1);
        } else if(object instanceof PDFArray) {
            for(const value of object.asArray())inspectObject(value,depth+1);
        } else if(object.dict instanceof PDFDict)inspectObject(object.dict,depth+1);
    }
    for (const [,object] of pdf.context.enumerateIndirectObjects())inspectObject(object);
    return { sha256:digest(buffer), pageCount:pdf.getPageCount() };
}

function createCourtOwnerImport({pool,env=process.env,inspect=inspectPdf,randomUUID=crypto.randomUUID} = {}) {
    if (!pool) throw new Error('COURT_IMPORT_DATABASE_REQUIRED');
    async function actor(db, officeId, actorUserId) {
        office(officeId);
        const row = officeId ? (await db.query(`SELECT u.userid,u.firm_staff_role_id FROM users u
            JOIN law_firm_tenants t ON t.id=u.law_firm_tenant_id AND t.owner_user_id=u.userid
            WHERE u.userid=$1 AND u.role='Admin' AND t.id=$2 AND t.is_active FOR SHARE OF u,t`,
        [positiveId(actorUserId),officeId])).rows[0] : (await db.query(`SELECT u.userid,u.firm_staff_role_id FROM users u
            JOIN platform_admins p ON p.user_id=u.userid AND p.is_active
            WHERE u.userid=$1 AND u.role='Admin' AND u.law_firm_tenant_id IS NULL FOR SHARE OF u,p`,
        [positiveId(actorUserId)])).rows[0];
        if (!row) fail('FORBIDDEN', 'רק בעל המשרד או מנהל הפלטפורמה רשאי לייבא קובץ', 403);
        return row;
    }
    async function currentCaseScope(db, officeId, currentActor) {
        // A shared-office owner can have a custom staff role. Reconstruct its
        // CURRENT grant after PDF inspection; neither owner identity nor the
        // request's earlier permission snapshot bypasses that role. Dedicated
        // platform admins retain the incumbent global permission policy.
        if (!officeId || !currentActor.firm_staff_role_id) return { assignedOnly:false };
        const role = (await db.query(`SELECT permissions,is_active,law_firm_tenant_id FROM firm_staff_roles
            WHERE id=$1 FOR SHARE`,[currentActor.firm_staff_role_id])).rows[0];
        const permissions = normalizeRolePermissions(role?.permissions);
        if (!role?.is_active || role.law_firm_tenant_id !== officeId || !hasAreaAction(permissions,'cases','edit'))
            fail('FORBIDDEN','אין הרשאה לעריכת התיק',403);
        return { assignedOnly:getCasesDataScope(permissions)!=='all_firm' };
    }
    async function capability({officeId=null,caseId,actorUserId,policyAllowed=false} = {}) {
        const gate = enabled(env);
        const link = (await pool.query(`SELECT court_number FROM court_case_links WHERE case_id=$1
            AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND is_primary`,[positiveId(caseId),office(officeId)])).rows[0];
        let allowed = false;
        if (gate && policyAllowed) {
            try { await actor(pool,officeId,actorUserId); allowed = true; }
            catch (error) { if (error.errorCode !== 'FORBIDDEN') throw error; }
        }
        return {enabled:gate,canImport:allowed && Boolean(link),mode:'owner_file',automaticConnected:false,maxBytes:MAX_BYTES,courtNumber:link?.court_number || null};
    }
    async function importFile({officeId=null,actorUserId,input,file} = {}) {
        if (!enabled(env)) fail('COURT_OWNER_IMPORT_DISABLED', 'יבוא הקובץ זמין כעת בסביבת QA בלבד; סנכרון אוטומטי אינו מחובר', 503);
        const value = fields(input);
        const bytes = file?.buffer;
        const inspected = await inspect(bytes);
        const safeName = filename(file?.originalname);
        const requestHash = digest(JSON.stringify({...value,filename:safeName,sha256:inspected.sha256}));
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            const currentActor = await actor(db,officeId,actorUserId);
            const caseScope = await currentCaseScope(db,officeId,currentActor);
            await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['court-owner-file:'+String(officeId)+':'+value.actionId]);
            const target = (await db.query(`SELECT caseid,casemanagerid FROM cases WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid FOR UPDATE`,[value.caseId,office(officeId)])).rows[0];
            if (!target) fail('CASE_NOT_FOUND', 'התיק לא נמצא', 404);
            if (caseScope.assignedOnly && target.casemanagerid!==currentActor.userid) {
                const membership = (await db.query(`SELECT userid FROM case_users WHERE caseid=$1 AND userid=$2 FOR SHARE`,
                    [value.caseId,currentActor.userid])).rows[0];
                if (!membership) fail('FORBIDDEN','אין הרשאה לתיק',403);
            }
            const mapping = (await db.query(`SELECT court_number FROM court_case_links WHERE case_id=$1
                AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND is_primary FOR UPDATE`,[value.caseId,officeId])).rows[0];
            if (mapping?.court_number !== value.courtNumber) fail('COURT_REFERENCE_CHANGED', 'מספר תיק בית המשפט השתנה. יש לרענן את התיק לפני היבוא', 409);
            const previous = (await db.query(`SELECT a.request_hash,d.id,d.update_id,d.sha256,u.case_id AS bound_case_id FROM court_import_actions a
                JOIN court_import_documents d ON d.id=a.document_id
                LEFT JOIN court_updates u ON u.id=d.update_id AND u.document_id=d.id
                    AND u.law_firm_tenant_id IS NOT DISTINCT FROM d.law_firm_tenant_id AND u.court_number=d.court_number
                WHERE a.action_id=$1 AND a.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid`,[value.actionId,officeId])).rows[0];
            let document, imported=false,replayed=false;
            if (previous) {
                if (previous.request_hash !== requestHash) fail('COURT_IMPORT_ACTION_CONFLICT', 'פרטי בקשת יבוא קודמת השתנו. יש להתחיל בקשה חדשה', 409);
                if (previous.bound_case_id!==value.caseId) fail('COURT_IMPORT_ACTION_STALE', 'השיוך לתיק השתנה מאז היבוא. יש לאשר מחדש ולהתחיל בקשת יבוא חדשה', 409);
                document=previous; replayed=true;
            } else {
                document=(await db.query(`SELECT *,issued_on::text AS issued_on FROM court_import_documents WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid
                    AND original_case_id=$2 AND court_number=$3 AND sha256=$4`,[officeId,value.caseId,value.courtNumber,inspected.sha256])).rows[0];
                if (document && (document.title!==value.title || String(document.issued_on).slice(0,10)!==value.issuedOn))
                    fail('COURT_IMPORT_DOCUMENT_CONFLICT', 'הקובץ כבר יובא עם פרטי החלטה אחרים. המקור הקיים נשמר', 409);
                if (!document) {
                    const id=randomUUID(),updateId=randomUUID();
                    document=(await db.query(`INSERT INTO court_import_documents
                        (id,law_firm_tenant_id,case_id,original_case_id,court_number,title,issued_on,filename,sha256,page_count,pdf_bytes,imported_by,update_id)
                        VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *,issued_on::text AS issued_on`,
                    [id,officeId,value.caseId,value.courtNumber,value.title,value.issuedOn,safeName,inspected.sha256,inspected.pageCount,bytes,actorUserId,updateId])).rows[0];
                    await db.query(`INSERT INTO court_updates(id,law_firm_tenant_id,source_id,court_number,case_id,title,body,occurred_at,is_demo,source_kind,document_id)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,'owner_file',$9)`,
                    [updateId,officeId,'owner-file:'+id,value.courtNumber,value.caseId,value.title,
                        'מסמך שיובא ידנית מקובץ בידי מנהל. היבוא אינו חיבור או סנכרון אוטומטי לנט המשפט.',value.issuedOn+'T12:00:00Z',id]);
                    imported=true;
                } else {
                    // Restoring the same court reference alone never auto-attaches a
                    // real record. A fresh explicit import can restore this binding.
                    await db.query('UPDATE court_updates SET case_id=$2 WHERE id=$1 AND case_id IS NULL',[document.update_id,value.caseId]);
                }
                await db.query(`INSERT INTO court_import_actions(action_id,law_firm_tenant_id,document_id,request_hash,actor_user_id)
                    VALUES($1,$2,$3,$4,$5)`,[value.actionId,officeId,document.id,requestHash,actorUserId]);
            }
            await db.query('COMMIT');
            return {ok:true,imported,replayed,deduplicated:!imported,documentId:document.id,updateId:document.update_id,sha256:document.sha256,
                caseId:value.caseId,courtNumber:value.courtNumber,sourceKind:'owner_file',automaticConnected:false};
        } catch (error) { await db.query('ROLLBACK'); throw error; }
        finally { db.release(); }
    }
    async function document({officeId=null,caseId,documentId}={}) {
        if (!qaTenant(env)) fail('COURT_OWNER_IMPORT_DISABLED', 'האפשרות אינה זמינה בסביבה זו', 503);
        if (!OFFICE.test(String(documentId || ''))) fail('COURT_DOCUMENT_NOT_FOUND', 'המסמך לא נמצא', 404);
        const found=(await pool.query(`SELECT d.filename,d.pdf_bytes,d.sha256 FROM court_import_documents d
            JOIN court_updates u ON u.document_id=d.id AND u.case_id=d.case_id
            JOIN court_case_links l ON l.case_id=d.case_id AND l.is_primary AND l.court_number=d.court_number
                AND l.law_firm_tenant_id IS NOT DISTINCT FROM d.law_firm_tenant_id
            JOIN cases c ON c.caseid=d.case_id AND c.law_firm_tenant_id IS NOT DISTINCT FROM d.law_firm_tenant_id
            WHERE d.id=$1 AND d.case_id=$2 AND d.law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid`,
        [documentId,positiveId(caseId),office(officeId)])).rows[0];
        if (!found) fail('COURT_DOCUMENT_NOT_FOUND', 'המסמך לא נמצא או שהשיוך לתיק השתנה', 404);
        const bytes=Buffer.from(found.pdf_bytes);
        if (digest(bytes)!==found.sha256) fail('COURT_DOCUMENT_INTEGRITY_FAILED','המסמך דורש בדיקה לפני הורדה',503);
        return {buffer:bytes,filename:found.filename,sha256:found.sha256};
    }
    return {capability,importFile,document};
}
module.exports={createCourtOwnerImport,enabled,qaTenant,MAX_BYTES,inspectPdf};
