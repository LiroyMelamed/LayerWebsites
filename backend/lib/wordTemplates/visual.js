'use strict';

const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createBinding } = require('./index');
const { reject } = require('./errors');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const LIMITS = Object.freeze({ pages: 200, characters: 500000, paragraphs: 10000, items: 50000, mapBytes: 8 * 1024 * 1024 });
// Fixed per-process admission, independent of LibreOffice's separate lifetime.
// A completed conversion must not let arbitrarily many mapping workers overlap.
let activePdfWorkers = 0;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const whitespace = value => /^[\s\u00a0]$/u.test(value);
const signature = text => {
    let value = ''; const offsets = [];
    for (let i = 0; i < text.length; i += 1) if (!whitespace(text[i])) { value += text[i]; offsets.push(i); }
    return { value, offsets };
};
function occurrences(text, value) {
    const found = []; let cursor = 0;
    if (!value) return found;
    while ((cursor = text.indexOf(value, cursor)) !== -1) { found.push(cursor); cursor += 1; if (found.length > LIMITS.paragraphs) break; }
    return found;
}
function itemDigest(items) {
    return hash(JSON.stringify(items.map(item => [item.text, item.dir, item.transform, item.width, item.height, item.hasEOL])));
}
async function extractPdfPages(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > 20 * 1024 * 1024) reject('WORD_AUTHORING_PDF_LIMIT');
    const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const loading = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, stopAtErrors: true,
        disableFontFace: true, useSystemFonts: false, enableXfa: false });
    let document; let characters = 0; let count = 0;
    try {
        document = await loading.promise;
        if (!document.numPages || document.numPages > LIMITS.pages) reject('WORD_AUTHORING_PDF_LIMIT');
        const pages = [];
        for (let number = 1; number <= document.numPages; number += 1) {
            const page = await document.getPage(number);
            if (page.rotate % 90) reject('WORD_AUTHORING_UNSUPPORTED_ROTATION');
            const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
            const content = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
            const items = content.items.filter(item => typeof item.str === 'string').map((item, index) => {
                characters += item.str.length; count += 1;
                if (characters > LIMITS.characters || count > LIMITS.items) reject('WORD_AUTHORING_TEXT_LIMIT');
                if (!Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite)
                    || ![item.width, item.height].every(value => Number.isFinite(value) && value >= 0)) reject('WORD_AUTHORING_INVALID_LAYOUT');
                return { id: `p${number}_i${index}`, text: item.str, dir: item.dir, transform: item.transform,
                    width: item.width, height: item.height, hasEOL: item.hasEOL === true };
            });
            pages.push({ pageNum: number, width: viewport.width, height: viewport.height, rotation: page.rotate,
                userUnit: page.userUnit, viewBox: page.view, viewportTransform: viewport.transform,
                textContentHash: itemDigest(items), items });
            page.cleanup();
        }
        return pages;
    } finally { if (document) await document.destroy(); else await loading.destroy(); }
}
async function runPdfWorker(buffer, model) {
    if (!Buffer.isBuffer(buffer) || buffer.length > 20 * 1024 * 1024) reject('WORD_AUTHORING_PDF_LIMIT');
    if (activePdfWorkers >= 1) reject('WORD_AUTHORING_BUSY');
    activePdfWorkers += 1;
    let worker;
    try {
        worker = new Worker(path.join(__dirname, 'pdfWorker.cjs'), { workerData: { pdf: new Uint8Array(buffer), model },
            env: process.env.NODE_PATH ? { NODE_PATH: process.env.NODE_PATH } : {},
            resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
        return await new Promise((resolve, fail) => {
            const timer = setTimeout(() => fail(Object.assign(new Error('WORD_AUTHORING_EXTRACTION_TIMEOUT'), { code: 'WORD_AUTHORING_EXTRACTION_TIMEOUT' })), 30000);
            const finish = action => value => { clearTimeout(timer); action(value); };
            worker.once('message', finish(message => message.ok ? resolve(message.value)
                : fail(Object.assign(new Error(message.code), { code: message.code }))));
            worker.once('error', finish(fail));
            worker.once('exit', code => { if (code !== 0) finish(fail)(Object.assign(new Error('WORD_AUTHORING_EXTRACTION_FAILED'), { code: 'WORD_AUTHORING_EXTRACTION_FAILED' })); });
        });
    } catch (error) { reject(/^WORD_AUTHORING_[A-Z_]+$/u.test(error.code || '') ? error.code : 'WORD_AUTHORING_EXTRACTION_FAILED'); }
    finally {
        // Keep admission occupied until owned thread cleanup completes. A failed
        // termination remains fail-closed rather than admitting another worker.
        if (worker) await worker.terminate();
        activePdfWorkers -= 1;
    }
}
const extractPdfPagesBounded = buffer => runPdfWorker(buffer);
const buildAuthoringMapBounded = (model, buffer) => runPdfWorker(buffer, model);

function buildAuthoringMap(model, inputPages) {
    if (model?.version !== 1 || model.offsetUnit !== 'utf16' || !Array.isArray(inputPages)
        || inputPages.length > LIMITS.pages) reject('WORD_AUTHORING_INVALID_MODEL');
    const paragraphs = model.parts.flatMap(part => part.paragraphs.map(p => ({ ...p, part: part.name, sig: signature(p.text) })));
    if (paragraphs.length > LIMITS.paragraphs || paragraphs.reduce((n, p) => n + p.text.length, 0) > LIMITS.characters) reject('WORD_AUTHORING_TEXT_LIMIT');
    const pages = inputPages.map(page => ({ ...page, items: page.items.map(item => ({ ...item, segments: [] })) }));
    const refs = []; let compact = ''; let order = 0;
    const itemRefCounts = new Map();
    for (const page of pages) for (const item of page.items) {
        item.order = order++;
        if (item.text.length + refs.length > LIMITS.characters) reject('WORD_AUTHORING_TEXT_LIMIT');
        for (let offset = 0; offset < item.text.length; offset += 1) {
            const ref = { page, item, offset, text: item.text[offset] };
            if (!whitespace(ref.text)) { compact += ref.text; refs.push(ref); itemRefCounts.set(item, (itemRefCounts.get(item) || 0) + 1); }
        }
    }
    const body = paragraphs.filter(p => p.part === 'word/document.xml');
    const byParagraph = new Map(paragraphs.map(p => [`${p.part}:${p.id}`, p]));
    const ignored = new Set();
    // A known header/footer string absent from every body paragraph can be
    // omitted from flowing body alignment. It never creates a selectable anchor.
    for (const p of paragraphs.filter(p => p.part !== 'word/document.xml' && p.sig.value.length >= 4)) {
        if (body.some(b => b.sig.value.includes(p.sig.value))) continue;
        for (const start of occurrences(compact, p.sig.value)) for (let i = start; i < start + p.sig.value.length; i += 1) ignored.add(refs[i]);
    }
    const bodyRefs = refs.filter(ref => !ignored.has(ref));
    const bodyText = bodyRefs.map(ref => ref.text).join('');
    const sourceCounts = new Map();
    for (const p of paragraphs) sourceCounts.set(p.sig.value, (sourceCounts.get(p.sig.value) || 0) + 1);
    const assignments = new Map(); const diagnostics = []; const invalid = new Set();
    const paragraphKey = p => `${p.part}:${p.id}`;
    for (const p of paragraphs) {
        const key = paragraphKey(p);
        let reason;
        if (!p.editable) reason = 'WORD_AUTHORING_UNSUPPORTED_PARAGRAPH';
        else if (!p.sig.value) reason = 'WORD_AUTHORING_EMPTY_PARAGRAPH_UNSUPPORTED';
        else if (sourceCounts.get(p.sig.value) !== 1) reason = 'WORD_AUTHORING_AMBIGUOUS_TEXT';
        const candidates = p.part === 'word/document.xml' ? bodyRefs : refs;
        const text = p.part === 'word/document.xml' ? bodyText : compact;
        const matches = reason ? [] : occurrences(text, p.sig.value);
        if (!reason && matches.length !== 1) reason = matches.length ? 'WORD_AUTHORING_AMBIGUOUS_TEXT' : 'WORD_AUTHORING_UNMAPPED_TEXT';
        if (reason) { diagnostics.push({ part: p.part, paragraphId: p.id, reason }); continue; }
        for (let i = 0; i < p.sig.value.length; i += 1) {
            const ref = candidates[matches[0] + i];
            if (ref.item.dir === 'ttb') { invalid.add(key); continue; }
            const link = { part: p.part, paragraphId: p.id, paragraphHash: p.textHash, sourceStart: p.sig.offsets[i], sourceEnd: p.sig.offsets[i] + 1 };
            const existing = assignments.get(ref);
            if (existing && (existing.part !== link.part || existing.paragraphId !== link.paragraphId || existing.sourceStart !== link.sourceStart)) {
                invalid.add(key); invalid.add(`${existing.part}:${existing.paragraphId}`);
            } else assignments.set(ref, link);
        }
    }
    for (const [ref, link] of assignments) if (invalid.has(`${link.part}:${link.paragraphId}`)) assignments.delete(ref);
    for (const key of invalid) { const p = paragraphs.find(p => paragraphKey(p) === key); diagnostics.push({ part: p.part, paragraphId: p.id, reason: 'WORD_AUTHORING_AMBIGUOUS_LAYOUT' }); }
    const byItem = new Map();
    for (const page of pages) for (const item of page.items) byItem.set(item.id, new Array(item.text.length).fill(null));
    for (const [ref, link] of assignments) byItem.get(ref.item.id)[ref.offset] = link;
    // Literal PDF whitespace is selectable only when its neighboring source
    // offsets prove a one-to-one whitespace correspondence. Layout-only spaces
    // remain non-addressable; selecting across them is validated by endpoints.
    const all = pages.flatMap(page => page.items.flatMap(item => [...Array(item.text.length)].map((_, offset) => ({ item, offset, text: item.text[offset] }))));
    for (let i = 0; i < all.length;) {
        if (!whitespace(all[i].text)) { i += 1; continue; }
        const start = i; while (i < all.length && whitespace(all[i].text)) i += 1;
        const left = start ? byItem.get(all[start - 1].item.id)[all[start - 1].offset] : null;
        const right = i < all.length ? byItem.get(all[i].item.id)[all[i].offset] : null;
        if (!left || !right || left.part !== right.part || left.paragraphId !== right.paragraphId || right.sourceStart - left.sourceEnd !== i - start) continue;
        const p = byParagraph.get(`${left.part}:${left.paragraphId}`);
        if (![...p.text.slice(left.sourceEnd, right.sourceStart)].every(whitespace)) continue;
        for (let n = start; n < i; n += 1) byItem.get(all[n].item.id)[all[n].offset] = { ...left, sourceStart: left.sourceEnd + n - start, sourceEnd: left.sourceEnd + n - start + 1 };
    }
    const ignoredCounts = new Map();
    for (const ref of ignored) ignoredCounts.set(ref.item, (ignoredCounts.get(ref.item) || 0) + 1);
    for (const page of pages) for (const item of page.items) {
        const links = byItem.get(item.id);
        for (let i = 0; i < links.length; i += 1) {
            const link = links[i]; if (!link) continue;
            const previous = item.segments[item.segments.length - 1];
            if (previous && previous.itemEnd === i && previous.part === link.part && previous.paragraphId === link.paragraphId && previous.sourceEnd === link.sourceStart) {
                previous.itemEnd += 1; previous.sourceEnd = link.sourceEnd;
            } else item.segments.push({ itemStart: i, itemEnd: i + 1, ...link });
        }
        if (!item.segments.length) item.readOnlyReason = 'WORD_AUTHORING_UNMAPPED_TEXT';
        item.transparentStory = ignoredCounts.has(item) && ignoredCounts.get(item) === itemRefCounts.get(item);
    }
    const result = { schemaVersion: 2, mapVersion: 1, offsetUnit: 'utf16', sourceHash: model.sourceHash,
        textContentOptions: { disableNormalization: false, includeMarkedContent: false }, geometryTolerance: 0.01,
        coordinateSystem: 'PDFJS_SCALE1_TOP_LEFT_VIEWPORT', pages, diagnostics,
        paragraphs: paragraphs.map(({ sig, ...p }) => p),
        supported: { nonemptyTextRanges: true, mappedTextCaretInsertion: true, arbitraryBlankPdfLocations: false, emptyParagraphInsertion: false } };
    if (Buffer.byteLength(JSON.stringify(result)) > LIMITS.mapBytes) reject('WORD_AUTHORING_MAP_LIMIT');
    return result;
}

function resolveSelection(map, selector) {
    if (map?.schemaVersion !== 2 || map.mapVersion !== 1 || !selector || !['range', 'insert'].includes(selector.kind)) reject('WORD_AUTHORING_INVALID_SELECTION');
    const items = map.pages.flatMap(page => page.items);
    function point(value, side) {
        const item = items.find(item => item.id === value?.itemId);
        if (!item || !Number.isInteger(value.offset) || value.offset < 0 || value.offset > item.text.length) reject('WORD_AUTHORING_INVALID_SELECTION');
        const segment = item.segments.find(s => side === 'start'
            ? s.itemStart <= value.offset && value.offset < s.itemEnd
            : s.itemStart < value.offset && value.offset <= s.itemEnd);
        if (!segment) reject('WORD_AUTHORING_UNMAPPED_SELECTION');
        return { item, part: segment.part, paragraphId: segment.paragraphId, offset: segment.sourceStart + value.offset - segment.itemStart };
    }
    const insert = selector.kind === 'insert';
    if (insert && !['before', 'after'].includes(selector.affinity)) reject('INVALID_INSERTION_ANCHOR');
    let startSelector = selector.start; let endSelector = selector.end;
    if (!insert) {
        const a = items.find(item => item.id === startSelector?.itemId), b = items.find(item => item.id === endSelector?.itemId);
        if (!a || !b) reject('WORD_AUTHORING_INVALID_SELECTION');
        if (a.order > b.order || (a.order === b.order && startSelector.offset > endSelector.offset)) [startSelector, endSelector] = [endSelector, startSelector];
    } else if (endSelector && (endSelector.itemId !== startSelector?.itemId || endSelector.offset !== startSelector?.offset)) reject('INVALID_INSERTION_ANCHOR');
    const start = point(startSelector, insert && selector.affinity === 'before' ? 'end' : 'start');
    const end = insert ? start : point(endSelector, 'end');
    if (start.part !== end.part || start.paragraphId !== end.paragraphId) reject('WORD_AUTHORING_CROSS_PARAGRAPH_SELECTION');
    if (!insert && start.offset >= end.offset) reject('WORD_AUTHORING_NONCONTIGUOUS_SELECTION');
    const paragraph = map.paragraphs.find(p => p.part === start.part && p.id === start.paragraphId);
    if (!paragraph) reject('WORD_AUTHORING_INVALID_SELECTION');
    if (!insert) {
        const from = Math.min(start.item.order, end.item.order), to = Math.max(start.item.order, end.item.order);
        const covered = new Set();
        for (const item of items.filter(item => item.order >= from && item.order <= to)) {
            const a = item.id === startSelector.itemId ? startSelector.offset : 0;
            const b = item.id === endSelector.itemId ? endSelector.offset : item.text.length;
            for (let i = Math.min(a, b); i < Math.max(a, b); i += 1) {
                if (whitespace(item.text[i]) || item.transparentStory) continue;
                const segment = item.segments.find(s => s.itemStart <= i && i < s.itemEnd);
                if (!segment || segment.part !== start.part || segment.paragraphId !== start.paragraphId) reject('WORD_AUTHORING_UNMAPPED_SELECTION');
                covered.add(segment.sourceStart + i - segment.itemStart);
            }
        }
        for (let i = start.offset; i < end.offset; i += 1) if (!whitespace(paragraph.text[i]) && !covered.has(i)) reject('WORD_AUTHORING_NONCONTIGUOUS_SELECTION');
    }
    const model = { version: 1, sourceHash: map.sourceHash, parts: [{ name: start.part, paragraphs: [paragraph] }] };
    const binding = createBinding(model, { id: '_selection', field: 'client.fullName', part: start.part, paragraphId: paragraph.id,
        start: start.offset, end: end.offset, ...(insert ? { kind: 'insert', affinity: selector.affinity } : {}) });
    const { id, field, ...anchor } = binding;
    return { kind: selector.kind, anchor, selector: { ...selector, start: startSelector, ...(insert ? {} : { end: endSelector }) }, selectedText: paragraph.text.slice(start.offset, end.offset) };
}
module.exports = { LIMITS, itemDigest, extractPdfPages, extractPdfPagesBounded, buildAuthoringMapBounded, buildAuthoringMap, resolveSelection };
