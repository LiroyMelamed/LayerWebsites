'use strict';

// Document values are not signing roles or authority. Never read environment,
// SMTP settings or customer records while building this public metadata catalog.
const field = (key, label, resolver = 'manual', requiresRecord = null, type = 'text') => Object.freeze({
    key, label, type, phase: 'storedData', resolver, requiresRecord, available: true,
    source: resolver === 'manual' ? 'manual' : 'record',
});
const DATA_FIELDS = Object.freeze([
    field('client.fullName', 'שם מלא', 'client', 'client'),
    field('client.firstName', 'שם פרטי — להזנה במסמך בלבד'),
    field('client.lastName', 'שם משפחה — להזנה במסמך בלבד'),
    field('client.companyName', 'שם חברה', 'client', 'client'),
    field('client.identityNumber', 'מספר זהות', 'client', 'client'),
    field('client.identityType', 'סוג מסמך זהות (קוד שמור; ניתן לדרוס במסמך)', 'client', 'client', 'code'),
    field('client.identityCountry', 'מדינת מסמך זהות', 'client', 'client'),
    field('client.companyNumber', 'מספר רישום ארגון', 'client', 'client'),
    field('client.companyRegistrationType', 'סוג רישום ארגון (קוד שמור; ניתן לדרוס במסמך)', 'client', 'client', 'code'),
    field('client.companyRegistrationCountry', 'מדינת רישום ארגון', 'client', 'client'),
    field('client.partyType', 'אדם או ארגון (קוד שמור; ניתן לדרוס במסמך)', 'client', 'client', 'code'),
    field('client.birthDate', 'תאריך לידה', 'client', 'client', 'date'),
    field('client.address', 'כתובת מלאה', 'client', 'client'),
    ...[['line1', 'שורת כתובת ראשונה'], ['line2', 'שורת כתובת שנייה'], ['city', 'עיר'],
        ['postalCode', 'מיקוד'], ['country', 'מדינה']].map(([key, label]) => field(`client.address.${key}`, label, 'client', 'client')),
    field('client.email', 'דואר אלקטרוני', 'client', 'client', 'email'),
    field('client.phone', 'טלפון', 'client', 'client', 'phone'),
    field('case.reference', 'מזהה תיק פנימי', 'case', 'case'),
    field('case.courtNumber', 'מספר תיק בית משפט', 'case', 'case'),
    field('case.title', 'שם התיק', 'case', 'case'),
    field('case.address', 'כתובת הנכס — להזנה במסמך בלבד'),
    field('case.amount', 'סכום — להזנה במסמך בלבד'),
    field('case.date', 'תאריך — להזנה במסמך בלבד', 'manual', null, 'date'),
    ...[['name', 'שם משרד'], ['address', 'כתובת משרד'], ['email', 'דואר אלקטרוני של המשרד'], ['phone', 'טלפון משרד']]
        .map(([key, label]) => field(`office.${key}`, `${label} — להזנה במסמך בלבד`)),
]);
const ROLE_FIELDS = Object.freeze([
    { property: 'fullName', label: 'שם מלא', resolver: 'role' },
    { property: 'companyName', label: 'שם חברה', resolver: 'role' },
    { property: 'identityNumber', label: 'מספר זהות', resolver: 'role' },
    { property: 'companyNumber', label: 'מספר רישום ארגון', resolver: 'role' },
    { property: 'capacity', label: 'מעמד — להזנה במסמך בלבד', resolver: 'manual' },
    { property: 'authority', label: 'סמכות — להזנה במסמך בלבד', resolver: 'manual' },
].map(value => Object.freeze({ ...value, type: 'text', phase: 'storedData', requiresRecord: value.resolver === 'role' ? 'role' : null,
    source: value.resolver === 'manual' ? 'manual' : 'record', available: true })));
function catalog(roles = []) {
    return { schemaVersion: 1, fields: DATA_FIELDS.map(value => ({ ...value })), roleFields: ROLE_FIELDS.map(value => ({ ...value })),
        roles: roles.map(value => ({ key: value.key, label: value.label })),
        signingPhases: [
            { phase: 'recipientInput', available: false, reason: 'FINAL_PDF_SIGNING_EDITOR' },
            { phase: 'signature', available: false, reason: 'FINAL_PDF_SIGNING_EDITOR' },
        ], firstLastNamePolicy: 'MANUAL_DOCUMENT_ONLY_NO_NAME_SPLIT', officePolicy: 'MANUAL_ONLY_NO_ENVIRONMENT_RESOLVER' };
}
module.exports = { DATA_FIELDS, ROLE_FIELDS, catalog };
