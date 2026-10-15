const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rgb, LineCapStyle } = require('pdf-lib');
const { pageGeometryFromPdfLibPage, visualDrawingFrame } = require('../signingGeometry');
const { bytesHash } = require('./canonical');
const { expect, fail } = require('./errors');

const TEXT_TYPES = new Set(['text', 'date']);
const IMAGE_TYPES = new Set(['signature', 'initials']);
const SIGNATURE_MAX_BYTES = 300 * 1024;
const SIGNATURE_MAX_SIDE = 2400;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function signatureImage(bytes) {
    expect(Buffer.isBuffer(bytes) && bytes.length > 33 && bytes.length <= SIGNATURE_MAX_BYTES, 'INVALID_SIGNATURE');
    expect(bytes.subarray(0, 8).equals(PNG_MAGIC) && bytes.toString('latin1', 12, 16) === 'IHDR', 'INVALID_SIGNATURE');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    expect(width >= 20 && height >= 10 && width <= SIGNATURE_MAX_SIDE && height <= SIGNATURE_MAX_SIDE, 'INVALID_SIGNATURE');
    return { width, height };
}

const fontSizeFor = field => Math.max(8, Math.min(14, field.height * 0.6));

async function renderText(renderer, { bytes, hash, fields, locale }) {
    const sizes = new Map(fields.map(field => [field.id, field.fontSize]));
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await renderer.render({ sourceBytes: bytes, expectedSourceHash: hash, locale,
                fields: fields.map(field => ({ ...field, fontSize: sizes.get(field.id) })) });
        } catch (error) {
            const paths = (error.extras?.fieldErrors || []).map(item => item.path).filter(id => sizes.has(id));
            if (error.errorCode !== 'TEXT_OVERFLOW' || !paths.length || attempt >= 4) throw error;
            // The signer already approved this value; only the type size may change to fit the box.
            for (const id of paths) sizes.set(id, Math.max(5, sizes.get(id) * 0.8));
        }
    }
}

function drawCheck(page, frame) {
    const { width, height } = frame;
    const thickness = Math.max(0.8, Math.min(width, height) * 0.12);
    const points = [[0.2, 0.52], [0.42, 0.28], [0.8, 0.76]].map(([x, y]) => ({ x: x * width, y: y * height }));
    for (let index = 1; index < points.length; index += 1) {
        page.drawLine({ start: points[index - 1], end: points[index], thickness, color: rgb(0, 0, 0), lineCap: LineCapStyle.Round });
    }
}

// Places every accepted value on its field. `marks` are { fieldId, type, value }:
// text/date carry a string, checkbox a boolean, signature/initials an artifact id resolved through `images`.
async function stampDocument({ renderer, baseBytes, baseHash, bindings, marks, images, locale }) {
    expect(Buffer.isBuffer(baseBytes) && bytesHash(baseBytes) === baseHash, 'ARTIFACT_HASH_MISMATCH');
    if (!marks.length) return { bytes: Buffer.from(baseBytes), contentHash: baseHash };
    const fields = new Map(bindings.map(field => [field.id, field]));
    for (const mark of marks) expect(fields.get(mark.fieldId)?.type === mark.type, 'PREFLIGHT_MISMATCH', mark.fieldId);
    let bytes = baseBytes, hash = baseHash;
    const text = marks.filter(mark => TEXT_TYPES.has(mark.type) && mark.value).map(mark => {
        const field = fields.get(mark.fieldId);
        return { id: field.id, type: 'data', value: mark.value, pageNum: field.pageNum, x: field.x, y: field.y,
            width: field.width, height: field.height, fontSize: fontSizeFor(field), overflow: 'block', align: 'start' };
    });
    if (text.length) ({ bytes, contentHash: hash } = await renderText(renderer, { bytes, hash, fields: text, locale }));
    const drawn = marks.filter(mark => IMAGE_TYPES.has(mark.type) || (mark.type === 'checkbox' && mark.value === true));
    if (!drawn.length) return { bytes, contentHash: hash };
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = pdf.getPages();
    const embedded = new Map();
    for (const mark of drawn) {
        const field = fields.get(mark.fieldId);
        const page = pages[field.pageNum - 1];
        if (!page) fail('INVALID_GEOMETRY', 422, [{ path: field.id, code: 'INVALID_GEOMETRY' }]);
        const frame = visualDrawingFrame(pageGeometryFromPdfLibPage(page), { x: field.x, y: field.y, width: field.width, height: field.height });
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...frame.transform));
        if (IMAGE_TYPES.has(mark.type)) {
            const source = images.get(mark.value);
            expect(source, 'ARTIFACT_NOT_READY', field.id);
            if (!embedded.has(mark.value)) embedded.set(mark.value, await pdf.embedPng(source));
            const image = embedded.get(mark.value);
            const scale = Math.min(frame.width / image.width, frame.height / image.height);
            const width = image.width * scale, height = image.height * scale;
            page.drawImage(image, { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height });
        } else {
            drawCheck(page, frame);
        }
        page.pushOperators(popGraphicsState());
    }
    const out = Buffer.from(await pdf.save({ useObjectStreams: true }));
    return { bytes: out, contentHash: bytesHash(out) };
}

module.exports = { stampDocument, signatureImage, TEXT_TYPES, IMAGE_TYPES, SIGNATURE_MAX_BYTES };
