const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { makeWorkbook, parseWorkbook, guardArchive } = require('../lib/signingRecipientsWorkbook');
const { normalizeContact, validatePackages } = require('../lib/signingBatchRecipients');
const definition = { roles: [{ id:'first',name:'חותם ראשון',shared:false },{ id:'shared',name:'חותם משותף',shared:true }],documents:[{}] };
test('workbook round-trip previews normalized recipients and does not import shared identities per row', async () => {
    const book = new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook(definition));
    book.getWorksheet('נמענים').getRow(2).values = ['חבילה לבדיקה','Synthetic','person@example.invalid',501234567,'email'];
    const result = await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),definition);
    assert.equal(result.valid,true);assert.equal(result.rows.length,1);assert.equal(result.rows[0].signers.first.phone,'+972501234567');
    assert.equal(result.rows[0].signers.shared,undefined);
});
test('Excel formulas and incorrect column headers fail preview with actionable row errors',async()=>{
    const book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook(definition));
    const sheet=book.getWorksheet('נמענים');sheet.getRow(2).values=['Test',{formula:'1+1',result:2},'x@example.invalid','','email'];
    const result=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),definition);
    assert.equal(result.valid,false);assert.equal(result.errors[0].row,2);
    sheet.getCell('A1').value='Wrong';await assert.rejects(async()=>parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),definition));
});
test('invalid archive, phone, channel and missing shared signer cannot become a dispatch',()=>{
    assert.throws(()=>guardArchive(Buffer.from('not an xlsx')));
    assert.throws(()=>normalizeContact({name:'Test',phone:'bad'},'test'));
    assert.throws(()=>normalizeContact({name:'Test',email:'a@example.invalid',deliveryMethod:'both'},'test'));
    assert.throws(()=>validatePackages({packages:[{signers:{first:{name:'Test',email:'a@example.invalid'}}}]},definition));
});
test('archive expansion is bounded even when the central directory lies about output size', () => {
    const body = require('node:zlib').deflateRawSync(Buffer.alloc(21 * 1024 * 1024));
    const local = Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8, 8);
    const directory = Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(body.length, 20);directory.writeUInt32LE(1, 24);
    const end = Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1, 10);end.writeUInt32LE(46, 12);end.writeUInt32LE(local.length + body.length, 16);
    assert.throws(() => guardArchive(Buffer.concat([local, body, directory, end])));
});
