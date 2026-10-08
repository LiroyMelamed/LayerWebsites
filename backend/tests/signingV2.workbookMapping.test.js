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

const dataDefinition = { ...definition, dataKeys: [
    { key: 'id', label: 'Identity number', type: 'identifier', required: true },
    { key: 'amount', label: 'Amount', type: 'decimal' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'confirmed', label: 'Confirmed', type: 'boolean', defaultValue: false },
] };
for (const locale of ['he', 'ar', 'en']) test(`document values in ${locale} workbook preserve exact strings, false and their import source`, async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await makeWorkbook(dataDefinition, locale));
    const sheet = book.getWorksheet('recipients');
    sheet.getRow(2).values = ['one', 'Synthetic', 'one@example.invalid', '', '', '0000123', '9007199254740993.120000', '2028-02-29', false];
    const buffer = await bytes(book), result = await parseWorkbook(buffer, dataDefinition);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.rows[0].data, { id: '0000123', amount: '9007199254740993.120000', date: '2028-02-29', confirmed: false });
    assert.equal(result.rows[0].dataSources.id, 'import');
    const inspection = await inspectWorkbook(buffer, dataDefinition);
    assert.equal(inspection.sheets[0].columns[5].suggestedKey, 'data:id');
});

test('mapped document values require required columns and reject numeric IDs, rounded amounts, Excel dates and formulas', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await makeWorkbook(dataDefinition, 'en'));
    const sheet = book.getWorksheet('recipients');
    sheet.getRow(2).values = ['id', 'Synthetic', 'one@example.invalid', '', '', 123, '', '', 'false'];
    sheet.getRow(3).values = ['amount', 'Synthetic', 'two@example.invalid', '', '', '00002', 12.34, '', 'false'];
    sheet.getRow(4).values = ['date', 'Synthetic', 'three@example.invalid', '', '', '00003', '', new Date('2026-10-08T00:00:00Z'), 'false'];
    sheet.getRow(5).values = ['formula', 'Synthetic', 'four@example.invalid', '', '', { formula: '1+1', result: '00004' }];
    sheet.getRow(6).values = ['leap', 'Synthetic', 'five@example.invalid', '', '', '00005', '', '2026-02-29'];
    const result = await parseWorkbook(await bytes(book), dataDefinition);
    assert.equal(result.rows.length, 0);
    assert.deepEqual(result.errors.map(error => [error.row, error.code]), [[2, 'UNSAFE_DATA_CELL'], [3, 'UNSAFE_DATA_CELL'], [4, 'UNSAFE_DATA_CELL'], [5, 'UNSAFE_DATA_CELL'], [6, 'INVALID_DATA']]);
    await assert.rejects(parseWorkbook(await bytes(book), dataDefinition, { mapping: { sheetId: 1, columns: { 'buyer.name': 2, 'buyer.email': 3 } } }), matches('INCOMPLETE_COLUMN_MAPPING'));
    const mapped = await parseWorkbook(await bytes(book), dataDefinition, { mapping: { sheetId: 1, columns: { 'buyer.name': 2, 'buyer.email': 3, 'data:id': 6 } } });
    assert.equal(mapped.rows[0].data.id, '00002');
});

test('a signer role named data cannot collide with business data columns', async () => {
    const value = { roles: [{ key: 'data', label: 'Data signer', audience: 'each' }], dataKeys: [{ key: 'name', label: 'Property', type: 'text', required: true }] };
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await makeWorkbook(value, 'en'));
    book.getWorksheet('recipients').getRow(2).values = ['one', 'Signer', 'signer@example.invalid', '', '', 'Property one'];
    const result = await parseWorkbook(await bytes(book), value);
    assert.deepEqual(result.errors, []); assert.equal(result.rows[0].recipients.data.name, 'Signer'); assert.equal(result.rows[0].data.name, 'Property one');
});

test('conditional roles may have unmapped columns while unconditional roles still require identity/contact mapping', async () => {
    const conditional={...definition,roles:[definition.roles[0],{...definition.roles[1],audience:'each',when:{key:'flag',operator:'equals',value:true}}],dataKeys:[{key:'flag',type:'boolean',defaultValue:false}]};
    const {book}=await custom([['one@example.invalid','Synthetic One','001']]);
    const parsed=await parseWorkbook(await bytes(book),conditional,{mapping});
    assert.equal(parsed.rows.length,1);assert.deepEqual(parsed.errors,[]);
    assert.deepEqual(parsed.rows[0].recipients.seller,{name:'',email:'',phone:''});
    assert.equal(parsed.rows[0].recipients.buyer.name,'Synthetic One');
    await assert.rejects(parseWorkbook(await bytes(book),conditional,{mapping:{sheetId:1,columns:{key:3}}}),matches('INCOMPLETE_COLUMN_MAPPING'));
});
