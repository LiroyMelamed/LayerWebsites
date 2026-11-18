'use strict';
const { createHash } = require('node:crypto');
const { createBinding } = require('./index');
const { reject } = require('./errors');
const hash = text => createHash('sha256').update(text).digest('hex');
const find = (model, anchor) => model.parts.find(p => p.name === anchor.part)?.paragraphs.find(p => p.id === anchor.paragraphId);

// Move a source anchor through known text replacements, never by its former PDF
// page number. Intersecting/changed text is ambiguous and must be re-anchored.
function remapAnchor(original, filled, anchor, bindings, values) {
    if (anchor.sourceHash !== original.sourceHash) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
    const checked = createBinding(original, { ...anchor, id: 'anchor', field: 'manual.anchor', fieldLabel: 'Anchor' });
    for (const name of ['paragraphHash', 'selectedTextHash']) if (anchor[name] !== checked[name]) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
    let shift = 0;
    for (const binding of bindings) {
        if (binding.part !== anchor.part || binding.paragraphId !== anchor.paragraphId) continue;
        if (binding.kind === 'insert'
            ? binding.start >= anchor.start && binding.start <= anchor.end
            : binding.start < anchor.end && binding.end > anchor.start) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
        if (binding.end <= anchor.start) shift += String(values[binding.field] ?? '').length - (binding.end - binding.start);
    }
    const paragraph = find(filled, anchor);
    const start = anchor.start + shift, end = anchor.end + shift;
    if (!paragraph || hash(paragraph.text.slice(start, end)) !== anchor.selectedTextHash) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
    return { ...anchor, sourceHash: filled.sourceHash, paragraphHash: paragraph.textHash, start, end };
}

// Anchor to the verified PDF text-run boundary, not an estimated per-character
// width. Offsets are measured from that run in the same 800-unit canvas used by
// the existing signing editor. Unsupported transforms/ambiguity fail closed.
function locateAnchor(map, anchor, placement) {
    if (map.sourceHash !== anchor.sourceHash) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
    const paragraph = map.paragraphs.find(p => p.part === anchor.part && p.id === anchor.paragraphId);
    if (!paragraph || hash(paragraph.text) !== anchor.paragraphHash || hash(paragraph.text.slice(anchor.start, anchor.end)) !== anchor.selectedTextHash) reject('WORD_SIGNATURE_ANCHOR_CHANGED');
    const matches = [];
    for (const page of map.pages) for (const item of page.items) {
        if (item.readOnlyReason) continue;
        const spans = item.segments.filter(s => s.part === anchor.part && s.paragraphId === anchor.paragraphId
            && s.sourceStart < anchor.end && s.sourceEnd > anchor.start);
        if (spans.length) matches.push({ page, item, spans });
    }
    const pages = new Set(matches.map(m => m.page.pageNum));
    if (pages.size !== 1) reject('WORD_SIGNATURE_ANCHOR_UNRESOLVED');
    const covered = new Map();
    for (const { spans } of matches) for (const span of spans) {
        for (let offset = Math.max(anchor.start,span.sourceStart); offset < Math.min(anchor.end,span.sourceEnd); offset += 1) {
            covered.set(offset, (covered.get(offset) || 0) + 1);
        }
    }
    for (let offset = anchor.start; offset < anchor.end; offset += 1) {
        if (!/\s/u.test(paragraph.text[offset]) && covered.get(offset) !== 1) reject('WORD_SIGNATURE_ANCHOR_UNRESOLVED');
    }
    const first = matches.find(({ spans }) => spans.some(s => s.sourceStart <= anchor.start && s.sourceEnd > anchor.start));
    if (!first) reject('WORD_SIGNATURE_ANCHOR_UNRESOLVED');
    const { page, item } = first, matrix = page.viewportTransform;
    if (page.rotation !== 0 || !Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)
        || !Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite)
        || item.transform[1] !== 0 || item.transform[2] !== 0 || item.transform[0] <= 0 || item.transform[3] <= 0) reject('WORD_SIGNATURE_ANCHOR_UNRESOLVED');
    const [a,b,c,d,e,f] = matrix;
    const px = item.transform[4], py = item.transform[5] + item.height;
    const scale = 800 / page.width;
    const result = { pageNum: page.pageNum, x: (a*px + c*py + e)*scale + placement.offsetX,
        y: (b*px + d*py + f)*scale + placement.offsetY, width: placement.width, height: placement.height };
    if (![result.x,result.y,result.width,result.height].every(Number.isFinite) || result.x < 0 || result.y < 0
        || result.width <= 0 || result.height <= 0 || result.x + result.width > 800 || result.y + result.height > page.height*scale) reject('WORD_SIGNATURE_ANCHOR_OUTSIDE_PAGE');
    return result;
}
module.exports = { remapAnchor, locateAnchor };
