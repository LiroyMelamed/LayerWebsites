const ExcelJS = require('exceljs');
const { guardArchive } = require('../signingRecipientsWorkbook');
const { expect } = require('./errors');
const limits = require('./limits');
const { recipientRoles } = require('./recipientLayout');

const SHEET = 'recipients';
const LABELS = {
    he: { key: 'מזהה שורה', name: 'שם', email: 'אימייל', phone: 'טלפון', channel: 'ערוץ (email / sms / both)' },
    ar: { key: 'معرّف الصف', name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الهاتف', channel: 'القناة (email / sms / both)' },
    en: { key: 'Row ID', name: 'Name', email: 'Email', phone: 'Phone', channel: 'Channel (email / sms / both)' },
};
const FIELDS = ['name', 'email', 'phone', 'channel'];
const LEGACY_LOCALE = { he: 'שפה (he / ar / en)', ar: 'اللغة (he / ar / en)', en: 'Language (he / ar / en)' };

function columns(definition, locale, includeLocale = false) {
    const labels = LABELS[locale] || LABELS.he;
    const fields = includeLocale ? [...FIELDS, 'locale'] : FIELDS;
    return [{ key: 'key', header: labels.key }, ...definition.roles.filter(role => role.audience !== 'shared').flatMap(role =>
        fields.map(field => ({
            key: `${role.key}.${field}`,
            header: `${role.label} — ${field === 'locale' ? (LEGACY_LOCALE[locale] || LEGACY_LOCALE.he) : labels[field]}`,
        })))];
}

async function makeWorkbook(definition, locale, layout = {}) {
    expect(layout && typeof layout === 'object' && !Array.isArray(layout), 'INVALID_RECIPIENT_LAYOUT');
    definition = { ...definition, roles: recipientRoles(definition, layout.roleAudience, layout.omittedRoles) };
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(SHEET, { views: [{ rightToLeft: locale !== 'en', state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns(definition, locale).map(column => ({ ...column, width: column.key.endsWith('.email') ? 32 : 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).height = 28;
    // Text cells keep leading zeros in phone numbers and identifiers.
    for (let row = 2; row <= limits.packages + 1; row += 1) for (let column = 1; column <= sheet.columnCount; column += 1) sheet.getCell(row, column).numFmt = '@';
    return Buffer.from(await book.xlsx.writeBuffer());
}

async function loadWorkbook(buffer) {
    try { guardArchive(buffer); } catch { expect(false, 'INVALID_WORKBOOK'); }
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(buffer); } catch { expect(false, 'INVALID_WORKBOOK'); }
    expect(book.worksheets.length <= 10 && book.worksheets.every(sheet => sheet.rowCount <= 5000 && sheet.columnCount <= 128), 'WORKBOOK_TOO_COMPLEX');
    return book;
}

const plainCell = value => value == null || ['string', 'number'].includes(typeof value);
const textCell = value => plainCell(value) ? String(value ?? '').trim() : '';

async function inspectWorkbook(buffer, definition, layout = {}) {
    expect(layout && typeof layout === 'object' && !Array.isArray(layout), 'INVALID_RECIPIENT_LAYOUT');
    const roles = recipientRoles(definition, layout.roleAudience, layout.omittedRoles);
    const book = await loadWorkbook(buffer);
    const known = Object.keys(LABELS).flatMap(locale => columns({ ...definition, roles }, locale));
    const sheets = book.worksheets.filter(sheet => sheet.state === 'visible' && sheet.actualRowCount > 0).map(sheet => ({
        id: sheet.id, name: sheet.name,
        columns: Array.from({ length: sheet.actualColumnCount }, (_, position) => {
            const index = position + 1, header = textCell(sheet.getRow(1).getCell(index).value);
            const matches = [...new Set(known.filter(column => column.header === header).map(column => column.key))];
            return { index, header, samples: [2, 3, 4].map(row => textCell(sheet.getRow(row).getCell(index).value).slice(0, 150)),
                suggestedKey: matches.length === 1 ? matches[0] : null };
        }),
    }));
    expect(sheets.length, 'EMPTY_WORKBOOK');
    return { sheets };
}

function mappedColumns(sheet, definition, mapping) {
    const targets = columns(definition, 'en');
    const entries = Object.entries(mapping.columns || {});
    expect(entries.length && entries.every(([key, value]) => targets.some(column => column.key === key)
        && Number.isInteger(value) && value > 0 && value <= sheet.actualColumnCount), 'INVALID_COLUMN_MAPPING');
    expect(new Set(entries.map(([, column]) => column)).size === entries.length, 'INVALID_COLUMN_MAPPING');
    for (const role of definition.roles.filter(role => role.audience !== 'shared')) {
        expect(mapping.columns[`${role.key}.name`] && (mapping.columns[`${role.key}.email`] || mapping.columns[`${role.key}.phone`]), 'INCOMPLETE_COLUMN_MAPPING');
    }
    return entries.map(([key, position]) => ({ key, position }));
}

async function parseWorkbook(buffer, definition, layout = {}) {
    expect(layout && typeof layout === 'object' && !Array.isArray(layout), 'INVALID_RECIPIENT_LAYOUT');
    definition = { ...definition, roles: recipientRoles(definition, layout.roleAudience, layout.omittedRoles) };
    const book = await loadWorkbook(buffer);
    const mapping = layout.mapping;
    if (mapping) expect(typeof mapping === 'object' && !Array.isArray(mapping) && Number.isInteger(mapping.sheetId) && mapping.columns && typeof mapping.columns === 'object' && !Array.isArray(mapping.columns), 'INVALID_COLUMN_MAPPING');
    const sheet = mapping ? book.worksheets.find(item => item.id === mapping.sheetId && item.state === 'visible') : book.getWorksheet(SHEET);
    expect(sheet, 'WORKBOOK_HEADERS_CHANGED');
    let expected;
    if (mapping) expected = mappedColumns(sheet, definition, mapping);
    else {
        const header = index => textCell(sheet.getRow(1).getCell(index + 1).value);
        const matched = Object.keys(LABELS).flatMap(locale => [false, true].map(includeLocale => columns(definition, locale, includeLocale)))
            .find(candidate => sheet.actualColumnCount <= candidate.length && candidate.every((column, index) => header(index) === column.header));
        expect(matched, 'WORKBOOK_HEADERS_CHANGED');
        expected = matched.map((column, index) => ({ ...column, position: index + 1 }));
    }
    const rows = [], errors = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        if (!row.hasValues) continue;
        const values = {};
        let unsupported = false;
        expected.forEach(column => {
            const value = row.getCell(column.position).value;
            if (value != null && !['string', 'number'].includes(typeof value)) unsupported = true;
            values[column.key] = value == null ? '' : String(value).trim();
        });
        if (!unsupported && !Object.values(values).some(Boolean)) continue;
        expect(rows.length + errors.length < limits.packages, 'CAPACITY_BUDGET_EXCEEDED');
        if (unsupported) { errors.push({ row: index, code: 'UNSUPPORTED_CELL' }); continue; }
        const recipients = {};
        for (const role of definition.roles.filter(item => item.audience !== 'shared')) {
            const person = Object.fromEntries(FIELDS.map(field => [field, values[`${role.key}.${field}`] || '']));
            // Spreadsheets drop the leading zero of a numeric Israeli mobile number.
            if (/^5\d{8}$/.test(person.phone)) person.phone = `0${person.phone}`;
            recipients[role.key] = { name: person.name, email: person.email, phone: person.phone,
                ...(person.channel ? { channel: person.channel.toLowerCase() } : {}) };
        }
        rows.push({ sourceRow: index, ...(values.key ? { key: values.key } : {}), recipients });
    }
    expect(rows.length || errors.length, 'EMPTY_WORKBOOK');
    return { rows, errors };
}

module.exports = { makeWorkbook, parseWorkbook, inspectWorkbook, columns };
