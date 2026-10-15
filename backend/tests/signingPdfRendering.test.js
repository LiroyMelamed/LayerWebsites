'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const pdfLib = require('pdf-lib');
const geometry = require('../lib/signingGeometry');

// Execute the actual private renderer with only storage substituted. No app,
// database, environment file or provider is loaded by these rendering tests.
function loadRenderer(objects, withFontkit = false) {
    const filename = path.resolve(__dirname, '../controllers/signingFileController.js');
    const source = fs.readFileSync(filename, 'utf8');
    const start = source.indexOf('async function generateSignedPdfBuffer(');
    const end = source.indexOf('\nasync function ensureSignedPdfKey', start);
    assert.ok(start >= 0 && end > start);
    const bindings = {
        ...pdfLib, ...geometry, fs, path, Buffer, console,
        __dirname: path.dirname(filename), require: createRequire(filename), fontkit: withFontkit ? require('@pdf-lib/fontkit') : null,
        getR2ObjectBuffer: async key => {
            assert.ok(objects.has(key), 'Only fixture storage keys may be read');
            return objects.get(key);
        },
    };
    // pdf-lib validates line coordinates with instanceof Object: keep the real realm.
    return vm.compileFunction(`${source.slice(start, end)}\nreturn generateSignedPdfBuffer;`, Object.keys(bindings))(...Object.values(bindings));
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAAFUlEQVR4AWO8IyLy32IVAwND2AkGAB39BAVZdWr/AAAAAElFTkSuQmCC', 'base64');
for (const crop of [false, true]) for (const rotation of [0, 90, 180, 270]) {
    test(`burned signature orientation, contain fit and graphics isolation: rotation=${rotation}, crop=${crop}`, async () => {
        const doc = await pdfLib.PDFDocument.create();
        const page = doc.addPage([600, 800]);
        page.setRotation(pdfLib.degrees(rotation));
        if (crop) page.setCropBox(40, 60, 520, 680);
        const source = Buffer.from(await doc.save());
        const render = loadRenderer(new Map([
            ['source', { buffer: source, contentType: 'application/pdf' }],
            ['mark.png', { buffer: png, contentType: 'image/png' }],
        ]));
        const spots = [
            { X: 100, Y: 90, Width: 240, Height: 80, FieldType: 'signature' },
            { X: 450, Y: 90, Width: 160, Height: 120, FieldType: 'initials' },
            { X: 100, Y: 300, Width: 150, Height: 50, FieldType: 'clientstamp' },
        ].map(s => ({ ...s, PageNumber: 1, SignatureData: 'mark.png' }));
        const bytes = await render({ pdfKey: 'source', spots });
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const parsed = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
        try {
            const renderedPage = await parsed.getPage(1);
            const viewport = renderedPage.getViewport({ scale: 800 / renderedPage.getViewport({ scale: 1 }).width });
            const ops = await renderedPage.getOperatorList();
            let matrix = [1, 0, 0, 1, 0, 0];
            const stack = [], images = [];
            for (let i = 0; i < ops.fnArray.length; i++) {
                const op = ops.fnArray[i], args = ops.argsArray[i];
                if (op === pdfjs.OPS.save) stack.push(matrix.slice());
                if (op === pdfjs.OPS.restore) matrix = stack.pop();
                if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
                if (op === pdfjs.OPS.paintImageXObject) images.push(pdfjs.Util.transform(viewport.transform, matrix));
            }
            assert.equal(images.length, spots.length);
            assert.equal(stack.length, 0, 'Graphics state must be balanced across fields');
            images.forEach((m, i) => {
                const s = spots[i], h = s.Width / 3;
                const expected = [[s.X, s.Y + (s.Height - h) / 2], [s.X + s.Width, s.Y + (s.Height - h) / 2], [s.X, s.Y + (s.Height + h) / 2]];
                [[0, 1], [1, 1], [0, 0]].forEach((point, corner) => {
                    const actual = pdfjs.Util.applyTransform(point, m);
                    actual.forEach((v, axis) => assert.ok(Math.abs(v - expected[corner][axis]) < 0.001,
                        `Image ${i}, corner ${corner}, axis ${axis}: ${v} vs ${expected[corner][axis]}`));
                });
            });
        } finally { await parsed.destroy(); }
    });
}

for (const crop of [false, true]) for (const rotation of [0, 90, 180, 270]) {
    test(`text, date and checkbox stay upright inside the field: rotation=${rotation}, crop=${crop}`, async () => {
        const doc = await pdfLib.PDFDocument.create();
        const page = doc.addPage([600, 800]);
        page.setRotation(pdfLib.degrees(rotation));
        if (crop) page.setCropBox(40, 60, 520, 680);
        const render = loadRenderer(new Map([['source', { buffer: Buffer.from(await doc.save()), contentType: 'application/pdf' }]]), true);
        const spots = [
            { PageNumber: 1, X: 100, Y: 100, Width: 180, Height: 40, FieldType: 'text', FieldValue: 'QA text' },
            { PageNumber: 1, X: 100, Y: 200, Width: 180, Height: 40, FieldType: 'date', FieldValue: '2026-10-05' },
            { PageNumber: 1, X: 100, Y: 300, Width: 180, Height: 40, FieldType: 'text', FieldValue: 'בדיקה' },
            { PageNumber: 1, X: 350, Y: 100, Width: 40, Height: 40, FieldType: 'checkbox', FieldValue: 'true' },
            { PageNumber: 1, X: 450, Y: 100, Width: 40, Height: 40, FieldType: 'checkbox', FieldValue: 'false' },
        ];
        const bytes = await render({ pdfKey: 'source', spots });
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const parsed = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
        try {
            const p = await parsed.getPage(1);
            const viewport = p.getViewport({ scale: 800 / p.getViewport({ scale: 1 }).width });
            const text = (await p.getTextContent()).items.filter(item => item.str.trim());
            assert.deepEqual(text.map(item => item.str), ['QA text', '05/10/2026', 'בדיקה']);
            text.forEach((item, index) => {
                const m = pdfjs.Util.transform(viewport.transform, item.transform), s = spots[index];
                assert.ok(m[0] > 0 && m[3] < 0 && Math.abs(m[1]) < 0.001 && Math.abs(m[2]) < 0.001, 'Text must read upright in visual coordinates');
                assert.ok(m[4] >= s.X && m[4] < s.X + s.Width && m[5] > s.Y && m[5] < s.Y + s.Height, 'Text baseline must stay inside its field');
            });
            const ops = await p.getOperatorList();
            let matrix = [1, 0, 0, 1, 0, 0], strokes = 0; const stack = [];
            for (let i = 0; i < ops.fnArray.length; i++) {
                const op = ops.fnArray[i], args = ops.argsArray[i];
                if (op === pdfjs.OPS.save) stack.push(matrix.slice());
                if (op === pdfjs.OPS.restore) matrix = stack.pop();
                if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
                if (op === pdfjs.OPS.stroke) {
                    const m = pdfjs.Util.transform(viewport.transform, matrix);
                    assert.ok(m[0] > 0 && m[3] < 0 && Math.abs(m[1]) < 0.001 && Math.abs(m[2]) < 0.001, 'Checkbox strokes must remain upright');
                    strokes++;
                }
            }
            assert.equal(strokes, 2, 'Checked field draws two strokes; unchecked field draws none');
            assert.equal(stack.length, 0);
        } finally { await parsed.destroy(); }
    });
}
