const { LIMITS, EMAIL, invalid } = require('./signingTemplateDefinition');
const { formatPhoneNumber } = require('../utils/phoneUtils');

function normalizeContact(input, label) {
    if (!input || typeof input !== 'object') invalid(`חסרים פרטי ${label}`);
    const userId = input.userId == null || input.userId === '' ? null : Number(input.userId);
    if (userId !== null && (!Number.isSafeInteger(userId) || userId <= 0)) invalid(`מזהה ${label} אינו תקין`);
    const name = String(input.name || '').trim();const email = String(input.email || '').trim().toLowerCase();
    const phoneRaw = String(input.phone || '').trim();const phone = phoneRaw ? formatPhoneNumber(phoneRaw) : '';
    if ((!userId && !name) || name.length > 120) invalid(`יש להזין שם תקין עבור ${label}`);
    if (email.length > 254 || (email && !EMAIL.test(email))) invalid(`כתובת האימייל של ${label} אינה תקינה`);
    if (phoneRaw && !phone) invalid(`מספר הטלפון של ${label} אינו תקין`);
    if (!userId && !email && !phone) invalid(`יש להזין אימייל או טלפון עבור ${label}`);
    const deliveryMethod = input.deliveryMethod || (email ? 'email' : 'phone');
    if (!['email', 'phone', 'both'].includes(deliveryMethod)) invalid('ערוץ השליחה אינו תקין');
    if (!userId && ((['email', 'both'].includes(deliveryMethod) && !email) || (['phone', 'both'].includes(deliveryMethod) && !phone))) invalid(`חסרים פרטי קשר לערוץ שנבחר עבור ${label}`);
    return { userId, name, email, phone: phone || '', deliveryMethod };
}
function validatePackages(input, definition) {
    if (!Array.isArray(input.packages) || !input.packages.length || input.packages.length > LIMITS.packages || input.packages.length * definition.documents.length > LIMITS.totalFiles) invalid('כמות החבילות או המסמכים חורגת מהמותר');
    const shared = {};
    for (const role of definition.roles.filter(r => r.shared)) shared[role.id] = normalizeContact(input.sharedSigners?.[role.id], role.name);
    return input.packages.map((row, index) => {
        const signers = {};
        for (const role of definition.roles) signers[role.id] = role.shared ? shared[role.id] : normalizeContact(row?.signers?.[role.id], `${role.name}, שורה ${index + 1}`);
        const caseId = row.caseId == null || row.caseId === '' ? null : Number(row.caseId);
        if (caseId !== null && (!Number.isSafeInteger(caseId) || caseId <= 0)) invalid(`מספר תיק לא תקין בשורה ${index + 1}`);
        return { label: String(row.label || `חבילה ${index + 1}`).trim().slice(0, 120), caseId, signers };
    });
}
module.exports = { normalizeContact, validatePackages };
