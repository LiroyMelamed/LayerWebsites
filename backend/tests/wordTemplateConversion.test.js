'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const { convertDocxToPdf, LIMITS } = require('../lib/wordTemplates/converter');

const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const expectedError = expected => caught => {
    assert.equal(caught.code, expected);
    assert.equal(caught.message, expected);
    assert.deepEqual(caught.details, {});
    assert.ok(!caught.stack.split('\n')[0].includes('/tmp/'));
    return true;
};
function docx(extra = {}) {
    const zip = new AdmZip();
    for (const [name, value] of Object.entries({
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic rental agreement</w:t></w:r></w:p><w:p><w:r><w:t>Tenant signature: ________</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
        ...extra,
    })) zip.addFile(name, Buffer.from(value));
    return zip.toBuffer();
}
async function pdf(pages = 1) {
    const document = await PDFDocument.create();
    for (let i = 0; i < pages; i += 1) document.addPage([612, 792]);
    return Buffer.from(await document.save({ useObjectStreams: false }));
}
async function harness(t, body, output) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'legal-conversion-test-'));
    t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
    const tempRoot = path.join(root, 'jobs');
    await fs.mkdir(tempRoot, { mode: 0o700 });
    const tracePath = path.join(root, 'trace.json');
    const executablePath = path.join(root, 'managed-soffice');
    const script = `#!${process.execPath}\n'use strict';\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\nconst outputPath = path.join(args[args.indexOf('--outdir') + 1], 'source.pdf');\nconst tracePath = ${JSON.stringify(tracePath)};\nconst pdfBytes = Buffer.from(${JSON.stringify((output || await pdf()).toString('base64'))}, 'base64');\n${body}\n`;
    await fs.writeFile(executablePath, script, { mode: 0o700 });
    return { executablePath, tempRoot, tracePath, root,
        clean: async () => assert.deepEqual(await fs.readdir(tempRoot), []) };
}
const writePdf = 'fs.writeFileSync(outputPath, pdfBytes);';

test('configuration is explicit, bounded and sanitized; no implicit desktop discovery', async () => {
    const before = process.env.WORD_TEMPLATE_SOFFICE_PATH;
    delete process.env.WORD_TEMPLATE_SOFFICE_PATH;
    try {
        await assert.rejects(convertDocxToPdf(docx()), expectedError('WORD_CONVERSION_NOT_CONFIGURED'));
        for (const executablePath of ['soffice', 'https://example.invalid/soffice', '/missing-managed-converter']) {
            await assert.rejects(convertDocxToPdf(docx(), { executablePath }), expectedError(executablePath.startsWith('/missing')
                ? 'WORD_CONVERSION_EXECUTABLE_UNAVAILABLE' : 'WORD_CONVERSION_INVALID_CONFIG'));
        }
        for (const options of [{ timeoutMs: 0 }, { timeoutMs: LIMITS.timeoutMs + 1 }, { maxPages: 0 },
            { maxPages: LIMITS.maxPages + 1 }, { maxOutputBytes: LIMITS.maxOutputBytes + 1 }, { signal: {} }]) {
            await assert.rejects(convertDocxToPdf(docx(), { executablePath: process.execPath, ...options }), expectedError('WORD_CONVERSION_INVALID_CONFIG'));
        }
    } finally { if (before === undefined) delete process.env.WORD_TEMPLATE_SOFFICE_PATH; else process.env.WORD_TEMPLATE_SOFFICE_PATH = before; }
});

test('invalid or externally active DOCX is rejected before executing converter', async t => {
    const job = await harness(t, `fs.writeFileSync(tracePath, 'executed'); ${writePdf}`);
    for (const input of [Buffer.from('not docx'), 'string', Buffer.alloc(20 * 1024 * 1024 + 1),
        docx({ 'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="external" Type="hyperlink" Target="https://example.invalid/private" TargetMode="External"/></Relationships>' })]) {
        await assert.rejects(convertDocxToPdf(input, job), expectedError('WORD_CONVERSION_INVALID_DOCX'));
    }
    await assert.rejects(fs.stat(job.tracePath), { code: 'ENOENT' });
    await job.clean();
});

test('conversion snapshots input, uses isolated profile/permissions/environment and private immutable output bytes', async t => {
    const job = await harness(t, `
        const source = args[args.length - 1];
        const directory = process.cwd();
        fs.writeFileSync(tracePath, JSON.stringify({ args, directory, env: process.env,
            sourceHash: require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
            dirMode: fs.statSync(directory).mode & 511, sourceMode: fs.statSync(source).mode & 511 }));
        ${writePdf}`);
    const source = docx();
    const sourceHash = digest(source);
    const oldSecret = process.env.WORD_CONVERSION_PRIVATE_TEST_SECRET;
    process.env.WORD_CONVERSION_PRIVATE_TEST_SECRET = 'must-not-inherit';
    let pending;
    try { pending = convertDocxToPdf(source, job); source.fill(0); }
    finally { if (oldSecret === undefined) delete process.env.WORD_CONVERSION_PRIVATE_TEST_SECRET; else process.env.WORD_CONVERSION_PRIVATE_TEST_SECRET = oldSecret; }
    const result = await pending;
    const trace = JSON.parse(await fs.readFile(job.tracePath, 'utf8'));
    assert.equal(result.sourceHash, sourceHash);
    assert.equal(trace.sourceHash, sourceHash);
    assert.equal(result.outputHash, digest(result.buffer));
    assert.equal(result.pageCount, 1);
    assert.equal(result.requiresFreshSigningGeometry, true);
    assert.equal(result.format, 'pdf');
    assert.equal(Object.isFrozen(result), true);
    result.buffer.fill(0);
    assert.equal(result.outputHash, digest(result.buffer));
    assert.equal(trace.dirMode, 0o700);
    assert.equal(trace.sourceMode, 0o600);
    assert.equal(trace.env.WORD_CONVERSION_PRIVATE_TEST_SECRET, undefined);
    assert.equal(trace.env.HOME, path.join(trace.directory, 'home'));
    assert.ok(trace.args.some(arg => arg === `-env:UserInstallation=${require('node:url').pathToFileURL(path.join(trace.directory, 'profile')).href}`));
    assert.ok(trace.args.includes('--headless'));
    assert.equal(JSON.stringify(result).includes(job.root), false);
    await job.clean();
});

test('nonzero converter exit leaks no output and cleans all private files', async t => {
    const job = await harness(t, "console.error('private customer payload /private/file'); process.exit(42);");
    await assert.rejects(convertDocxToPdf(docx(), job), expectedError('WORD_CONVERSION_FAILED'));
    await job.clean();
});

test('a signal crash is a conversion failure and cleans all private files', async t => {
    const job = await harness(t, "process.kill(process.pid, 'SIGKILL');");
    await assert.rejects(convertDocxToPdf(docx(), job), expectedError('WORD_CONVERSION_FAILED'));
    await job.clean();
});

test('timeout kills the owned process group including TERM-resistant descendant', async t => {
    const job = await harness(t, `
        process.on('SIGTERM', () => {});
        const child = require('node:child_process').spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { stdio: 'ignore' });
        fs.writeFileSync(tracePath, JSON.stringify({ pid: process.pid, childPid: child.pid }));
        setInterval(() => {}, 1000);`);
    const started = Date.now();
    await assert.rejects(convertDocxToPdf(docx(), { ...job, timeoutMs: 2500 }), expectedError('WORD_CONVERSION_TIMEOUT'));
    assert.ok(Date.now() - started < 6000);
    const { pid, childPid } = JSON.parse(await fs.readFile(job.tracePath, 'utf8'));
    for (const id of [pid, childPid]) {
        // An orphan killed by group SIGKILL may briefly await its OS reaper.
        let alive = true;
        for (let retry = 0; retry < 20; retry += 1) {
            try { process.kill(id, 0); } catch (caught) { if (caught.code === 'ESRCH') { alive = false; break; } throw caught; }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.equal(alive, false, `owned process ${id} exited`);
    }
    await job.clean();
});

test('successful wrapper cannot leave a background converter descendant running', async t => {
    const job = await harness(t, `
        const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
        fs.writeFileSync(tracePath, JSON.stringify({ childPid: child.pid }));
        ${writePdf}
        child.unref();`);
    assert.equal((await convertDocxToPdf(docx(), job)).pageCount, 1);
    const { childPid } = JSON.parse(await fs.readFile(job.tracePath));
    let alive = true;
    for (let retry = 0; retry < 20; retry += 1) {
        try { process.kill(childPid, 0); } catch (caught) { if (caught.code === 'ESRCH') { alive = false; break; } throw caught; }
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(alive, false);
    await job.clean();
});

test('pre-aborted and running cancellation clean private state', async t => {
    const job = await harness(t, `fs.writeFileSync(tracePath, 'started'); setInterval(() => {}, 1000);`);
    const already = new AbortController(); already.abort();
    await assert.rejects(convertDocxToPdf(docx(), { ...job, signal: already.signal }), expectedError('WORD_CONVERSION_ABORTED'));
    await assert.rejects(fs.stat(job.tracePath), { code: 'ENOENT' });
    const controller = new AbortController();
    const pending = convertDocxToPdf(docx(), { ...job, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(pending, expectedError('WORD_CONVERSION_ABORTED'));
    await job.clean();
});

test('missing or non-PDF output fails truthfully without partial artifact', async t => {
    for (const body of ['', "fs.writeFileSync(outputPath, 'customer text is not a PDF document');",
        "fs.writeFileSync(outputPath, '%PDF-1.7\\ninvalid structure\\n%%EOF\\n');"]) {
        const job = await harness(t, body);
        await assert.rejects(convertDocxToPdf(docx(), job), expectedError(body ? 'WORD_CONVERSION_INVALID_PDF' : 'WORD_CONVERSION_INVALID_OUTPUT'));
        await job.clean();
    }
});

test('symlink output is rejected and cannot delete or read an external target', async t => {
    const job = await harness(t, "const outside = path.join(path.dirname(tracePath), 'outside.pdf'); fs.writeFileSync(outside, pdfBytes); fs.symlinkSync(outside, outputPath);");
    await assert.rejects(convertDocxToPdf(docx(), job), expectedError('WORD_CONVERSION_INVALID_OUTPUT'));
    assert.ok((await fs.stat(path.join(job.root, 'outside.pdf'))).size > 16);
    await job.clean();
});

test('output-byte limit applies both after exit and during a long-running process', async t => {
    for (const suffix of ['', 'setInterval(() => {}, 1000);']) {
        const job = await harness(t, `fs.writeFileSync(outputPath, Buffer.alloc(8192)); ${suffix}`);
        await assert.rejects(convertDocxToPdf(docx(), { ...job, maxOutputBytes: 1024 }), expectedError('WORD_CONVERSION_OUTPUT_LIMIT'));
        await job.clean();
    }
});

test('page count limit and invalid page bounds reject parsed PDFs', async t => {
    const tooMany = await harness(t, writePdf, await pdf(2));
    await assert.rejects(convertDocxToPdf(docx(), { ...tooMany, maxPages: 1 }), expectedError('WORD_CONVERSION_PAGE_LIMIT'));
    await tooMany.clean();
    const document = await PDFDocument.create(); document.addPage([15000, 792]);
    const invalid = await harness(t, writePdf, Buffer.from(await document.save()));
    await assert.rejects(convertDocxToPdf(docx(), invalid), expectedError('WORD_CONVERSION_INVALID_PDF'));
    await invalid.clean();
});

test('concurrent jobs have separate profiles and bounded worker occupancy', async t => {
    const a = await harness(t, `fs.writeFileSync(tracePath, JSON.stringify({ directory: process.cwd() })); setTimeout(() => { ${writePdf} }, 400);`);
    const b = await harness(t, `fs.writeFileSync(tracePath, JSON.stringify({ directory: process.cwd() })); setTimeout(() => { ${writePdf} }, 400);`);
    const first = convertDocxToPdf(docx(), a);
    const second = convertDocxToPdf(docx(), b);
    for (let retry = 0; retry < 50; retry += 1) {
        if ((await fs.readdir(a.tempRoot)).length && (await fs.readdir(b.tempRoot)).length) break;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    await assert.rejects(convertDocxToPdf(docx(), a), expectedError('WORD_CONVERSION_BUSY'));
    const [resultA, resultB] = await Promise.all([first, second]);
    assert.equal(resultA.pageCount, 1); assert.equal(resultB.pageCount, 1);
    assert.notEqual(JSON.parse(await fs.readFile(a.tracePath)).directory, JSON.parse(await fs.readFile(b.tracePath)).directory);
    await a.clean(); await b.clean();
});

test('worker capacity is released after failure and explicit configured environment is accepted', async t => {
    const failed = await harness(t, 'process.exit(2);');
    await assert.rejects(convertDocxToPdf(docx(), failed), expectedError('WORD_CONVERSION_FAILED'));
    const success = await harness(t, writePdf);
    const before = process.env.WORD_TEMPLATE_SOFFICE_PATH;
    process.env.WORD_TEMPLATE_SOFFICE_PATH = success.executablePath;
    try { assert.equal((await convertDocxToPdf(docx(), { tempRoot: success.tempRoot })).pageCount, 1); }
    finally { if (before === undefined) delete process.env.WORD_TEMPLATE_SOFFICE_PATH; else process.env.WORD_TEMPLATE_SOFFICE_PATH = before; }
    await failed.clean(); await success.clean();
});

test('actual explicitly configured bundled converter handles one new synthetic DOCX', {
    skip: !process.env.WORD_CONVERSION_INTEGRATION_EXECUTABLE,
}, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'legal-conversion-integration-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const source = docx();
    const result = await convertDocxToPdf(source, { executablePath: process.env.WORD_CONVERSION_INTEGRATION_EXECUTABLE,
        tempRoot: root, timeoutMs: 30000, maxPages: 3 });
    assert.equal(result.pageCount, 1);
    assert.equal(result.sourceHash, digest(source));
    assert.equal(result.outputHash, digest(result.buffer));
    assert.equal(result.requiresFreshSigningGeometry, true);
    await fs.writeFile(path.join(process.env.WORD_CONVERSION_INTEGRATION_EVIDENCE || root, 'synthetic-adapter-output.pdf'), result.buffer);
    assert.deepEqual(await fs.readdir(root), process.env.WORD_CONVERSION_INTEGRATION_EVIDENCE ? [] : ['synthetic-adapter-output.pdf']);
});
