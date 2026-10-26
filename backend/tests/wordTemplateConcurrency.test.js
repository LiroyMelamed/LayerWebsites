'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const { convertDocxToPdf, LIMITS } = require('../lib/wordTemplates/converter');

function policy(t, value) {
    const before = process.env.WORD_TEMPLATE_MAX_CONCURRENT;
    if (value === undefined) delete process.env.WORD_TEMPLATE_MAX_CONCURRENT;
    else process.env.WORD_TEMPLATE_MAX_CONCURRENT = value;
    t.after(() => {
        if (before === undefined) delete process.env.WORD_TEMPLATE_MAX_CONCURRENT;
        else process.env.WORD_TEMPLATE_MAX_CONCURRENT = before;
    });
}

function source() {
    const zip = new AdmZip();
    const parts = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Owned synthetic admission fixture</w:t></w:r></w:p></w:body></w:document>',
    };
    for (const [name, text] of Object.entries(parts)) zip.addFile(name, Buffer.from(text));
    return zip.toBuffer();
}

async function fixture(t, { fail = false, immediate = false } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'legal-word-admission-'));
    const tempRoot = path.join(root, 'jobs');
    await fs.mkdir(tempRoot, { mode: 0o700 });
    const executablePath = path.join(root, 'owned-converter');
    const release = path.join(root, 'release');
    const trace = path.join(root, 'trace.jsonl');
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792]);
    const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
    const script = `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const output = path.join(args[args.indexOf('--outdir') + 1], 'source.pdf');
fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ directory: process.cwd(), args,
    capInherited: process.env.WORD_TEMPLATE_MAX_CONCURRENT ?? null }) + '\\n');
if (${JSON.stringify(fail)}) process.exit(42);
const write = () => fs.writeFileSync(output, Buffer.from(${JSON.stringify(bytes.toString('base64'))}, 'base64'));
if (${JSON.stringify(immediate)}) write();
else { const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); write(); } }, 10); }
`;
    await fs.writeFile(executablePath, script, { mode: 0o700 });
    const pending = [];
    const records = async () => {
        try { return (await fs.readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    };
    const releaseJobs = () => fs.writeFile(release, 'owned release');
    t.after(async () => {
        await releaseJobs();
        await Promise.allSettled(pending);
        await fs.rm(root, { recursive: true, force: true });
    });
    return { executablePath, tempRoot, records, releaseJobs,
        start() { const operation = convertDocxToPdf(source(), { executablePath, tempRoot, timeoutMs: 5000 }); pending.push(operation); return operation; },
        async started(count) {
            const deadline = Date.now() + 3000;
            while ((await records()).length < count) {
                if (Date.now() >= deadline) throw new Error('Owned fake converter did not start');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        },
        async clean() { assert.deepEqual(await fs.readdir(tempRoot), []); },
    };
}

test('configured one admits one job, rejects a second and releases the slot after success', async t => {
    policy(t, '1');
    const f = await fixture(t);
    const first = f.start(); await f.started(1);
    await assert.rejects(f.start(), { code: 'WORD_CONVERSION_BUSY' });
    assert.equal((await f.records()).length, 1);
    assert.equal((await fs.readdir(f.tempRoot)).length, 1);
    await f.releaseJobs(); await first;
    const next = await f.start(); assert.equal(next.pageCount, 1);
    await f.clean();
});

test('unset policy preserves default two jobs with distinct profiles and rejects a third', async t => {
    policy(t, undefined);
    assert.equal(LIMITS.concurrent, 2);
    const f = await fixture(t);
    const first = f.start(), second = f.start(); await f.started(2);
    await assert.rejects(f.start(), { code: 'WORD_CONVERSION_BUSY' });
    const records = await f.records();
    assert.equal(new Set(records.map(row => row.directory)).size, 2);
    await f.releaseJobs(); await Promise.all([first, second]);
    await f.clean();
});

test('explicit two is accepted without altering the fixed argv or child environment', async t => {
    policy(t, '2');
    const f = await fixture(t, { immediate: true });
    const result = await f.start(); assert.equal(result.requiresFreshSigningGeometry, true);
    const [record] = await f.records();
    assert.equal(record.capInherited, null);
    assert.equal(record.args.length, 12);
    assert.ok(record.args.includes('--headless'));
    assert.ok(record.args.includes('pdf:writer_pdf_Export'));
    assert.equal(record.args.some(value => value.includes('MAX_CONCURRENT')), false);
    await f.clean();
});

test('every unsupported exact-string policy fails before child start and cannot leak capacity', async t => {
    policy(t, '1');
    const f = await fixture(t, { immediate: true });
    for (const value of ['', '0', '3', '-1', '1.0', '01', '1 ', ' 1', '2\n', 'NaN', 'Infinity', 'true']) {
        process.env.WORD_TEMPLATE_MAX_CONCURRENT = value;
        await assert.rejects(f.start(), { code: 'WORD_CONVERSION_INVALID_CONFIG' });
    }
    assert.equal((await f.records()).length, 0);
    await f.clean();
    process.env.WORD_TEMPLATE_MAX_CONCURRENT = '1';
    assert.equal((await f.start()).pageCount, 1);
    await f.clean();
});

test('configured one releases capacity after conversion failure without changing cleanup', async t => {
    policy(t, '1');
    const failed = await fixture(t, { fail: true });
    await assert.rejects(failed.start(), { code: 'WORD_CONVERSION_FAILED' });
    await failed.clean();
    const success = await fixture(t);
    const first = success.start(); await success.started(1);
    await assert.rejects(success.start(), { code: 'WORD_CONVERSION_BUSY' });
    await success.releaseJobs(); await first;
    await success.clean();
});
