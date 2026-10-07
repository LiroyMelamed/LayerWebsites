const ExcelJS = require('exceljs');
const { guardArchive } = require('../signingRecipientsWorkbook');
const { expect } = require('./errors');
const limits = require('./limits');

const SHEET = 'recipients';
const LABELS = {
    he: { key: 'מזהה שורה', name: 'שם', email: 'אימייל', phone: 'טלפון', channel: 'ערוץ (email / sms / both)', locale: 'שפה (he / ar / en)' },
    ar: { key: 'معرّف الصف', name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الهاتف', channel: 'القناة (email / sms / both)', locale: 'اللغة (he / ar / en)' },
    en: { key: 'Row ID', name: 'Name', email: 'Email', phone: 'Phone', channel: 'Channel (email / sms / both)', locale: 'Language (he / ar / en)' },
};
const FIELDS = ['name', 'email', 'phone', 'channel', 'locale'];

function columns(definition, locale) {
    const labels = LABELS[locale] || LABELS.he;
    return [{ key: 'key', header: labels.key }, ...definition.roles.filter(role => role.audience !== 'shared').flatMap(role =>
        FIELDS.map(field => ({ key: `${role.key}.${field}`, header: `${role.label} — ${labels[field]}` })))];
}

async function makeWorkbook(definition, locale) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(SHEET, { views: [{ rightToLeft: locale !== 'en', state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns(definition, locale).map(column => ({ ...column, width: column.key.endsWith('.email') ? 32 : 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).height = 28;
    // Text cells keep leading zeros in phone numbers and identifiers.
    for (let row = 2; row <= limits.packages + 1; row += 1) for (let column = 1; column <= sheet.columnCount; column += 1) sheet.getCell(row, column).numFmt = '@';
    return Buffer.from(await book.xlsx.writeBuffer());
}

async function parseWorkbook(buffer, definition) {
    try { guardArchive(buffer); } catch { expect(false, 'INVALID_WORKBOOK'); }
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(buffer); } catch { expect(false, 'INVALID_WORKBOOK'); }
    const sheet = book.getWorksheet(SHEET);
    expect(sheet, 'WORKBOOK_HEADERS_CHANGED');
    const header = index => String(sheet.getRow(1).getCell(index + 1).value ?? '').trim();
    const expected = Object.keys(LABELS).map(locale => columns(definition, locale))
        .find(candidate => sheet.actualColumnCount <= candidate.length && candidate.every((column, index) => header(index) === column.header));
    expect(expected, 'WORKBOOK_HEADERS_CHANGED');
    expect(sheet.rowCount <= limits.packages + 1, 'CAPACITY_BUDGET_EXCEEDED');
    const rows = [], errors = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        if (!row.hasValues) continue;
        const values = {};
        let unsupported = false;
        expected.forEach((column, position) => {
            const value = row.getCell(position + 1).value;
            if (value != null && !['string', 'number'].includes(typeof value)) unsupported = true;
            values[column.key] = value == null ? '' : String(value).trim();
        });
        if (unsupported) { errors.push({ row: index, code: 'UNSUPPORTED_CELL' }); continue; }
        const recipients = {};
        for (const role of definition.roles.filter(item => item.audience !== 'shared')) {
            const person = Object.fromEntries(FIELDS.map(field => [field, values[`${role.key}.${field}`]]));
            // Spreadsheets drop the leading zero of a numeric Israeli mobile number.
            if (/^5\d{8}$/.test(person.phone)) person.phone = `0${person.phone}`;
            recipients[role.key] = { name: person.name, email: person.email, phone: person.phone,
                ...(person.channel ? { channel: person.channel.toLowerCase() } : {}), ...(person.locale ? { locale: person.locale.toLowerCase() } : {}) };
        }
        rows.push({ sourceRow: index, ...(values.key ? { key: values.key } : {}), recipients });
    }
    expect(rows.length || errors.length, 'EMPTY_WORKBOOK');
    return { rows, errors };
}

module.exports = { makeWorkbook, parseWorkbook, columns };
