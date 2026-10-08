const ExcelJS = require('exceljs');
const { inflateRawSync } = require('node:zlib');
const { normalizeContact } = require('./signingBatchRecipients');
const { LIMITS, invalid } = require('./signingTemplateDefinition');

function columns(definition) {
    return [{ header: 'שם החבילה', key: 'label' }, ...definition.roles.filter(r => !r.shared).flatMap(role => [
        { header: `${role.name} — שם`, key: `${role.id}.name` },
        { header: `${role.name} — אימייל`, key: `${role.id}.email` },
        { header: `${role.name} — טלפון`, key: `${role.id}.phone` },
        { header: `${role.name} — ערוץ (email/phone/both)`, key: `${role.id}.deliveryMethod` },
    ])];
}
async function makeWorkbook(definition) {
    const book = new ExcelJS.Workbook();const sheet = book.addWorksheet('נמענים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns(definition).map(c => ({ ...c, width: c.key.endsWith('.email') ? 32 : 25 }));
    sheet.getRow(1).font = { bold: true };sheet.getRow(1).height = 28;
    for (let i = 2; i <= LIMITS.packages + 1; i++) for (let j = 1; j <= sheet.columnCount; j++) sheet.getCell(i, j).numFmt = '@';
    return book.xlsx.writeBuffer();
}
function guardArchive(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > 2 * 1024 * 1024) invalid('יש לבחור קובץ Excel עד 2MB');
    // Check the central directory before inflating any XML (including hidden sheets).
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i;break; }
    if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) invalid('קובץ Excel אינו תקין');
    const entries = buffer.readUInt16LE(end + 10);let cursor = buffer.readUInt32LE(end + 16);let total = 0;
    if (!entries || entries > 500) invalid('קובץ Excel מורכב מדי');
    for (let i = 0; i < entries; i++) {
        if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) invalid('קובץ Excel אינו תקין');
        const declared = buffer.readUInt32LE(cursor + 24);
        const compressed = buffer.readUInt32LE(cursor + 20);
        const local = buffer.readUInt32LE(cursor + 42);
        const method = buffer.readUInt16LE(cursor + 10);
        if (local + 30 > end || buffer.readUInt32LE(local) !== 0x04034b50 || ![0, 8].includes(method)) invalid('קובץ Excel אינו תקין');
        const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        if (start + compressed > end) invalid('קובץ Excel אינו תקין');
        let actual;
        try { actual = method === 0 ? compressed : inflateRawSync(buffer.subarray(start, start + compressed), { maxOutputLength: 20 * 1024 * 1024 - total }).length; }
        catch { invalid('תוכן קובץ Excel גדול מדי או פגום'); }
        if (actual !== declared) invalid('גודל תוכן קובץ Excel אינו תקין');
        total += actual;
        if (total > 20 * 1024 * 1024) invalid('תוכן קובץ Excel גדול מדי');
        cursor += 46 + buffer.readUInt16LE(cursor + 28) + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
    }
    if (cursor > end) invalid('קובץ Excel אינו תקין');
}
async function parseWorkbook(buffer, definition) {
    guardArchive(buffer);const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(buffer); } catch { invalid('לא ניתן לקרוא את קובץ ה־Excel'); }
    const sheet = book.getWorksheet('נמענים');const expected = columns(definition);
    if (!sheet || sheet.actualColumnCount > expected.length || expected.some((c, index) => sheet.getRow(1).getCell(index + 1).value !== c.header)) invalid('כותרות הקובץ אינן תואמות לתבנית. יש להוריד את קובץ הנמענים העדכני');
    if (sheet.rowCount > LIMITS.packages + 1) invalid(`ניתן לייבא עד ${LIMITS.packages} שורות`);
    const rows = [];const errors = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);if (!row.hasValues) continue;
        const data = {};let bad = false;
        expected.forEach((col, j) => {
            const value = row.getCell(j + 1).value;
            if (value != null && !['string', 'number'].includes(typeof value)) bad = true;
            data[col.key] = value == null ? '' : String(value).trim();
        });
        if (bad) { errors.push({ row: i, message: 'יש להזין ערכים רגילים, ללא נוסחאות או קישורים' });continue; }
        try {
            const signers = {};
            for (const role of definition.roles.filter(r => !r.shared)) {
                const contact = Object.fromEntries(['name', 'email', 'phone', 'deliveryMethod'].map(key => [key, data[`${role.id}.${key}`]]));
                // Excel may drop a leading zero from a numeric Israeli phone cell.
                if (/^[5][0-9]{8}$/.test(contact.phone)) contact.phone = `0${contact.phone}`;
                signers[role.id] = normalizeContact(contact, role.name);
            }
            rows.push({ label: data.label || `חבילה ${rows.length + 1}`, signers });
        } catch (error) { errors.push({ row: i, message: error.message }); }
    }
    if (!rows.length && !errors.length) invalid('הקובץ אינו מכיל נמענים');
    return { rows, errors, valid: errors.length === 0 };
}
module.exports = { columns, makeWorkbook, parseWorkbook, guardArchive };
