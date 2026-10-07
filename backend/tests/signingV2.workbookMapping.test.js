const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { makeWorkbook, inspectWorkbook, parseWorkbook } = require('../lib/signingV2/workbook');
const { recipientRoles } = require('../lib/signingV2/recipientLayout');

const definition = { roles: [{ key: 'buyer', label: 'Buyer', audience: 'each' }, { key: 'seller', label: 'Seller', audience: 'shared' }] };
const bytes = async book => Buffer.from(await book.xlsx.writeBuffer());
const matches = code => error => error.errorCode === code;
async function custom(rows) {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Office clients');
    sheet.addRows([['Contact', 'Full name', 'Record'], ...rows]);
    return { book, sheet };
}
const mapping = { sheetId: 1, columns: { 'buyer.name': 2, 'buyer.email': 1, key: 3 } };

test('layout overrides are explicit, validated, and do not mutate the published roles', () => {
    const before = JSON.stringify(definition);
    assert.deepEqual(recipientRoles(definition, { buyer: 'shared', seller: 'each' }).map(role => role.audience), ['shared', 'each']);
    assert.equal(JSON.stringify(definition), before);
    for (const value of [{ unknown: 'each' }, { buyer: 'manager' }, [], null]) assert.throws(() => recipientRoles(definition, value), matches('INVALID_RECIPIENT_LAYOUT'));
    assert.throws(() => recipientRoles(definition, {}, ['missing']), matches('INVALID_RECIPIENT_LAYOUT'));
});

for (const locale of ['he', 'ar', 'en']) test(`generated ${locale} workbook uses this send's audience, preserving numeric phones`, async () => {
    const layout = { roleAudience: { buyer: 'shared', seller: 'each' } };
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await makeWorkbook(definition, locale, layout));
    book.getWorksheet('recipients').getRow(2).values = ['case-1', 'Synthetic seller', '', 501234567, 'sms'];
    const input = await bytes(book), inspected = await inspectWorkbook(input, definition, layout);
    assert.equal(inspected.sheets[0].columns[1].suggestedKey, 'seller.name');
    const result = await parseWorkbook(input, definition, layout);
    assert.deepEqual(result.rows[0].recipients, { seller: { name: 'Synthetic seller', email: '', phone: '0501234567', channel: 'sms' } });
});

test('existing files accept explicit reordered column mappings and preserve source rows and identifiers', async () => {
    const { book } = await custom([['one@example.invalid', 'Synthetic One', '001'], ['', '', ''], ['two@example.invalid', 'Synthetic Two', '002']]);
    const data = await bytes(book), inspection = await inspectWorkbook(data, definition);
    assert.equal(inspection.sheets[0].columns[0].suggestedKey, null, 'ambiguous generic headings never pick a role');
    const result = await parseWorkbook(data, definition, { mapping });
    assert.deepEqual(result.rows.map(row => [row.sourceRow, row.key, row.recipients.buyer.name]), [[2, '001', 'Synthetic One'], [4, '002', 'Synthetic Two']]);
});

test('duplicate columns, omitted names, unknown roles and hidden sheets are rejected', async () => {
    const { book, sheet } = await custom([['one@example.invalid', 'Synthetic One', '001']]);
    const data = await bytes(book);
    for (const columns of [{ 'buyer.name': 1, 'buyer.email': 1 }, { 'other.name': 2 }, { 'buyer.name': 200, 'buyer.email': 1 }]) {
        await assert.rejects(parseWorkbook(data, definition, { mapping: { sheetId: 1, columns } }), matches('INVALID_COLUMN_MAPPING'));
    }
    await assert.rejects(parseWorkbook(data, definition, { mapping: { sheetId: 1, columns: { 'buyer.email': 1 } } }), matches('INCOMPLETE_COLUMN_MAPPING'));
    sheet.state = 'hidden';
    await assert.rejects(parseWorkbook(await bytes(book), definition, { mapping }), matches('WORKBOOK_HEADERS_CHANGED'));
});

test('formula and hyperlink cells are skipped with source row errors and never evaluated', async () => {
    const { book } = await custom([['one@example.invalid', { formula: 'WEBSERVICE("https://example.invalid")', result: 'Invisible formula' }, '001'],
        ['two@example.invalid', { text: 'Synthetic link', hyperlink: 'https://example.invalid' }, '002'], ['three@example.invalid', 'Synthetic three', '003']]);
    const result = await parseWorkbook(await bytes(book), definition, { mapping });
    assert.deepEqual(result.errors, [{ row: 2, code: 'UNSUPPORTED_CELL' }, { row: 3, code: 'UNSUPPORTED_CELL' }]);
    assert.equal(result.rows[0].sourceRow, 4);
});

test('200 rows with several mapped signers are accepted, 201 rows are blocked without partial import', async () => {
    const { book, sheet } = await custom(Array.from({ length: 200 }, (_, index) => [`${index}@example.invalid`, `Synthetic ${index}`, String(index)]));
    sheet.getRow(1).getCell(4).value = 'Counterparty'; sheet.getRow(1).getCell(5).value = 'Contact';
    for (let row = 2; row <= 201; row++) { sheet.getRow(row).getCell(4).value = `Seller ${row}`; sheet.getRow(row).getCell(5).value = `seller-${row}@example.invalid`; }
    const layout = { roleAudience: { seller: 'each' }, mapping: { sheetId: 1, columns: { ...mapping.columns, 'seller.name': 4, 'seller.email': 5 } } };
    assert.equal((await parseWorkbook(await bytes(book), definition, layout)).rows.length, 200);
    sheet.addRow(['extra@example.invalid', 'Extra', 'extra', 'Seller', 'seller@example.invalid']);
    await assert.rejects(parseWorkbook(await bytes(book), definition, layout), matches('CAPACITY_BUDGET_EXCEEDED'));
});
