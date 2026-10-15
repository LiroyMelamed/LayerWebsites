const crypto = require('node:crypto');
const { createAppError } = require('../utils/appError');

const LIMITS = Object.freeze({ documents: 10, roles: 8, fieldsPerDocument: 150, packages: 50, totalFiles: 200 });
const FIELD_TYPES = new Set(['signature', 'initials', 'text', 'date', 'checkbox', 'number']);
const ROLE_KINDS = new Set(['first', 'second', 'shared', 'lawyer', 'custom']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(message) { throw createAppError('VALIDATION_ERROR', 422, message); }
function text(value, max, label, required = true) {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) invalid(label);
    return value.trim();
}
function list(value, max, label) {
    if (!Array.isArray(value) || !value.length || value.length > max) invalid(label);
    return value;
}
function finite(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(label);
    return value;
}
function validateDefinition(input) {
    if (!input || typeof input !== 'object') invalid('פרטי התבנית חסרים');
    const name = text(input.name, 120, 'יש להזין שם תבנית עד 120 תווים');
    const roleIds = new Set();
    const roles = list(input.roles, LIMITS.roles, 'יש להגדיר בין תפקיד חותם אחד לשמונה').map(role => {
        const id = text(role?.id, 40, 'מזהה תפקיד חותם אינו תקין');
        if (!/^[a-zA-Z0-9_-]+$/.test(id) || roleIds.has(id)) invalid('מזהי תפקידי החותמים חייבים להיות ייחודיים');
        roleIds.add(id);
        const kind = role.kind || 'custom';
        if (!ROLE_KINDS.has(kind)) invalid('סוג תפקיד החותם אינו תקין');
        return { id, name: text(role.name, 80, 'יש להזין שם לתפקיד החותם'), kind, shared: kind === 'shared' || kind === 'lawyer' };
    });
    const docIds = new Set();
    const usedRoles = new Set();
    const documents = list(input.documents, LIMITS.documents, 'יש להוסיף בין מסמך אחד לעשרה').map(doc => {
        const id = text(doc?.id, 40, 'מזהה מסמך אינו תקין');
        if (!UUID.test(id) || docIds.has(id)) invalid('מזהי המסמכים חייבים להיות ייחודיים');
        docIds.add(id);
        const fileKey = text(doc.fileKey, 600, 'חסר קובץ PDF למסמך');
        if (fileKey.includes('..') || fileKey.startsWith('/') || fileKey.includes('\\')) invalid('מפתח הקובץ אינו תקין');
        const fields = list(doc.fields, LIMITS.fieldsPerDocument, 'יש להגדיר שדות למסמך').map(field => {
            if (!field || !roleIds.has(field.roleId)) invalid('כל שדה חייב להיות משויך לתפקיד חותם');
            if (!FIELD_TYPES.has(field.fieldType)) invalid('סוג השדה אינו נתמך בתבנית');
            if (!Number.isInteger(field.pageNum) || field.pageNum < 1 || field.pageNum > 500) invalid('מספר עמוד אינו תקין');
            const x = finite(field.x, 0, 800, 'מיקום השדה אינו תקין');
            const y = finite(field.y, 0, 20000, 'מיקום השדה אינו תקין');
            const width = finite(field.width, 8, 800, 'רוחב השדה אינו תקין');
            const height = finite(field.height, 8, 20000, 'גובה השדה אינו תקין');
            if (x + width > 800.01) invalid('השדה חורג מרוחב המסמך');
            usedRoles.add(field.roleId);
            return { pageNum: field.pageNum, x, y, width, height, roleId: field.roleId,
                fieldType: field.fieldType, isRequired: field.isRequired !== false,
                fieldLabel: text(field.fieldLabel || '', 120, 'תווית השדה ארוכה מדי', false) };
        });
        if (!fields.some(field => field.isRequired)) invalid('יש להגדיר לפחות שדה חובה אחד בכל מסמך');
        if (fields.some(field => !fields.some(other => other.roleId === field.roleId && other.isRequired))) invalid('יש להגדיר שדה חובה לכל חותם שמופיע במסמך');
        return { id, name: text(doc.name, 160, 'יש להזין שם למסמך'), fileKey, fields };
    });
    if (roles.some(role => !usedRoles.has(role.id))) invalid('יש לשייך לפחות שדה אחד לכל תפקיד חותם');
    const completionEmail = text(input.completionEmail || '', 254, 'כתובת האימייל לסיום אינה תקינה', false).toLowerCase();
    if (completionEmail && !EMAIL.test(completionEmail)) invalid('כתובת האימייל לסיום אינה תקינה');
    if (input.signingOrder && !['parallel', 'sequential'].includes(input.signingOrder)) invalid('סדר החתימות אינו תקין');
    const completionMode = input.completionMode || 'document';
    if (!['document', 'package'].includes(completionMode)) invalid('אופן השליחה בסיום אינו תקין');
    return { schemaVersion: 1, name, roles, documents, completionEmail, completionMode,
        signingOrder: input.signingOrder || 'parallel', requireOtp: input.requireOtp !== false,
        otpWaiverAcknowledged: input.otpWaiverAcknowledged === true };
}

function validatePageBounds(document, geometries) {
    for (const field of document.fields) {
        const page = geometries[field.pageNum - 1];
        if (!page || !Number.isFinite(page.width) || !Number.isFinite(page.height) || field.x + field.width > page.width + 0.01 || field.y + field.height > page.height + 0.01) {
            invalid(`שדה במסמך ״${document.name}״ חורג מגבולות עמוד ${field.pageNum}`);
        }
    }
}
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
function requestHash(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }

module.exports = { LIMITS, UUID, EMAIL, invalid, validateDefinition, validatePageBounds, requestHash };
