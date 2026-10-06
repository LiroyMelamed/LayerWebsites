const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../controllers/signingFileController.js'), 'utf8');
const start = source.indexOf('async function getDeliverableSignedPdf(');
const end = source.indexOf('\nlet _schemaSupportCache', start);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('immutable synthetic PDF bytes');
function harness(row) {
 let generated = 0;
 let queries = 0;
 let waits = 0;
 const fn = vm.runInNewContext(source.slice(start, end) + '\ngetDeliverableSignedPdf', {
  pool: { query: async () => ({ rows: [typeof row === 'function' ? row(++queries) : row] }) }, sha256Hex: hash,
  setTimeout: (resolve) => { waits++; resolve(); },
  getR2ObjectBuffer: async () => ({ buffer: bytes }),
  ensureSignedPdfKey: async () => { generated++; return 'new.pdf'; },
 });
 return { run: (options={}) => fn({signingFileId:1,lawyerId:2,pdfKey:'source.pdf',...options}), generated: () => generated, waits: () => waits };
}
test('finalized document returns the existing bytes without invoking the renderer', async () => {
 const h=harness({status:'signed',immutableatutc:new Date(),signedstoragekey:'final.pdf',signedpdfsha256:hash(bytes)});
 const r=await h.run();assert.equal(r.key,'final.pdf');assert.equal(r.buffer,bytes);assert.equal(h.generated(),0);
});
test('a finalized PDF with a mismatching hash is rejected without regeneration', async () => {
 const h=harness({status:'signed',immutableatutc:new Date(),signedstoragekey:'final.pdf',signedpdfsha256:'bad'});
 await assert.rejects(h.run(),/integrity/);assert.equal(h.generated(),0);
});
test('a pending partial preview cannot be mistaken for the finalized artifact', async () => {
 const h=harness({status:'pending',immutableatutc:null,signedstoragekey:'partial.pdf'});
 const r=await h.run();assert.equal(r.key,'new.pdf');assert.equal(h.generated(),1);
});
test('legacy signed documents are preserved when immutable metadata is absent', async () => {
 const h=harness({status:'signed',immutableatutc:null,signedfilekey:'legacy.pdf',signedpdfsha256:null});
 const r=await h.run();assert.equal(r.key,'legacy.pdf');assert.equal(r.buffer,bytes);assert.equal(h.generated(),0);
});
test('reading a signed document with no stored artifact fails without rebuilding it', async () => {
 const h=harness({status:'signed',immutableatutc:null,signedfilekey:null});
 await assert.rejects(h.run(),/missing/);assert.equal(h.generated(),0);
});
test('only initial finalization may create a signed document artifact', async () => {
 const h=harness({status:'signed',immutableatutc:null,signedfilekey:null});
 const r=await h.run({finalize:true});assert.equal(r.key,'new.pdf');assert.equal(h.generated(),1);
});
test('even finalization cannot recreate a missing immutable artifact', async () => {
 const h=harness({status:'signed',immutableatutc:new Date(),signedfilekey:null});
 await assert.rejects(h.run({finalize:true}),/missing/);assert.equal(h.generated(),0);
});
test('an immediate read waits for the initial finalizer without generating another PDF', async () => {
 const pending={status:'signed',signedat:new Date(),immutableatutc:null};
 const h=harness(n=>n<3?pending:{...pending,signedstoragekey:'complete.pdf',signedpdfsha256:hash(bytes)});
 const r=await h.run();assert.equal(r.key,'complete.pdf');assert.equal(h.generated(),0);assert.equal(h.waits(),2);
});
test('a stalled initial finalizer has a bounded wait and cannot fall back to unsigned bytes', async () => {
 const h=harness({status:'signed',signedat:new Date(),immutableatutc:null});
 await assert.rejects(h.run(),/missing/);assert.equal(h.generated(),0);assert.equal(h.waits(),40);
});
test('a historical missing artifact fails immediately without polling or regenerating', async () => {
 const h=harness({status:'signed',signedat:new Date('2020-01-01'),immutableatutc:null});
 await assert.rejects(h.run(),/missing/);assert.equal(h.generated(),0);assert.equal(h.waits(),0);
});
