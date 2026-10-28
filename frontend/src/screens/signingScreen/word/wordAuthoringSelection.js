/* global globalThis */
// The PDF layout is evidence for selecting a server anchor, never source authority.
const HASH = /^[a-f0-9]{64}$/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = () => { throw new Error('WORD_AUTHORING_UNVERIFIED'); };
export const itemTuple = item => [item.str ?? item.text, item.dir, item.transform, item.width, item.height, item.hasEOL === true];

export async function sha256Bytes(bytes) {
    if (!globalThis.crypto?.subtle) fail();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyPdfBlob(blob, expectedHash) {
    if (!(blob instanceof Blob) || blob.size < 5 || blob.size > 20 * 1024 * 1024 ||
        (blob.type && blob.type !== 'application/pdf') || !HASH.test(expectedHash || '')) fail();
    const bytes = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(blob);
    });
    if (await sha256Bytes(bytes) !== expectedHash.toLowerCase()) fail();
    return blob;
}

export function validateAuthoring(authoring, source) {
    if (!source || authoring?.schemaVersion !== 2 || authoring.mapVersion !== 1 || authoring.offsetUnit !== 'utf16' ||
        authoring.sourceId !== source.id || authoring.sourceVersion !== source.version || authoring.sourceHash !== source.sourceHash ||
        authoring.bindingsHash !== source.bindingsHash || !HASH.test(source.sourceHash || '') || !HASH.test(source.bindingsHash || '') ||
        !Number.isInteger(authoring.renderSourceVersion) || authoring.renderSourceVersion < 1 || authoring.renderSourceVersion > source.version ||
        !HASH.test(authoring.pdfHash || '') || !HASH.test(authoring.mapHash || '') ||
        typeof authoring.renderId !== 'string' || !authoring.renderId || authoring.renderId.length > 128 ||
        authoring.textContentOptions?.disableNormalization !== false || authoring.textContentOptions?.includeMarkedContent !== false ||
        !finite(authoring.geometryTolerance) || authoring.geometryTolerance < 0 || authoring.geometryTolerance > 0.01 ||
        !Array.isArray(authoring.pages) || !authoring.pages.length || authoring.pages.length > 1000) fail();
    const ids = new Set();
    authoring.pages.forEach((page, index) => {
        if (page.pageNum !== index + 1 || !finite(page.width) || page.width <= 0 || !finite(page.height) || page.height <= 0 ||
            ![0, 90, 180, 270].includes(page.rotation) || !finite(page.userUnit) || page.userUnit <= 0 ||
            !Array.isArray(page.viewBox) || page.viewBox.length !== 4 || !page.viewBox.every(finite) ||
            !Array.isArray(page.viewportTransform) || page.viewportTransform.length !== 6 || !page.viewportTransform.every(finite) ||
            !HASH.test(page.textContentHash || '') || !Array.isArray(page.items) || page.items.length > 100000) fail();
        for (const item of page.items) {
            if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.text !== 'string' ||
                !['ltr', 'rtl', 'ttb'].includes(item.dir) || !Array.isArray(item.transform) || item.transform.length !== 6 ||
                !item.transform.every(finite) || !finite(item.width) || !finite(item.height) || !Array.isArray(item.segments)) fail();
            ids.add(item.id);
            for (const segment of item.segments) if (!Number.isInteger(segment.itemStart) || !Number.isInteger(segment.itemEnd) ||
                segment.itemStart < 0 || segment.itemEnd <= segment.itemStart || segment.itemEnd > item.text.length ||
                typeof segment.part !== 'string' || typeof segment.paragraphId !== 'string' ||
                !Number.isInteger(segment.sourceStart) || !Number.isInteger(segment.sourceEnd) || segment.sourceStart < 0 ||
                segment.sourceEnd <= segment.sourceStart || !HASH.test(segment.paragraphHash || '')) fail();
        }
    });
    return authoring;
}

export function verifyPageItems(page, content, tolerance = 0) {
    const actual = content?.items?.filter(item => typeof item.str === 'string');
    if (!actual || actual.length !== page.items.length || !finite(tolerance) || tolerance < 0 || tolerance > 0.01) fail();
    const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;
    actual.forEach((item, index) => {
        const expected = page.items[index];
        if (item.str !== expected.text || item.dir !== expected.dir || (item.hasEOL === true) !== (expected.hasEOL === true) ||
            !Array.isArray(item.transform) || item.transform.length !== 6 ||
            !item.transform.every((value, n) => close(value, expected.transform[n])) ||
            !close(item.width, expected.width) || !close(item.height, expected.height)) fail();
    });
    return actual;
}

export function verifyPageGeometry(page, proxy, tolerance = 0) {
    const viewport = proxy.getViewport({ scale: 1 });
    const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;
    if (proxy.rotate !== page.rotation || !close(proxy.userUnit, page.userUnit) ||
        !close(viewport.width, page.width) || !close(viewport.height, page.height) ||
        !Array.isArray(proxy.view) || proxy.view.length !== 4 || !proxy.view.every((value, n) => close(value, page.viewBox[n])) ||
        !viewport.transform?.every((value, n) => close(value, page.viewportTransform[n]))) fail();
}

export function tagVerifiedTextLayer(host, page) {
    const layer = host?.querySelector('.textLayer');
    if (!layer) fail();
    const spans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
    const visibleItems = page.items.filter(item => item.text !== '');
    if (spans.length !== visibleItems.length || spans.some((span, index) => span.textContent !== visibleItems[index].text)) fail();
    spans.forEach((span, index) => {
        const item = visibleItems[index];
        if (item.segments.length && !item.readOnlyReason) span.dataset.wordItem = item.id;
        else { delete span.dataset.wordItem; span.dataset.wordReadonly = 'true'; }
    });
    layer.dataset.wordVerified = 'true';
    return layer;
}

const safeBoundary = (text, offset) => Number.isInteger(offset) && offset >= 0 && offset <= text.length &&
    !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
function mappedCaretAffinity(item, offset, affinity) {
    if (!item?.text || !item.segments.length || item.readOnlyReason) fail();
    const adjacent = side => item.segments.filter(segment => side === 'before'
        ? segment.itemStart < offset && offset <= segment.itemEnd
        : segment.itemStart <= offset && offset < segment.itemEnd);
    const requested = adjacent(affinity);
    if (requested.length === 1) return affinity;
    if (requested.length) fail();
    const inside = affinity === 'before' ? 'after' : 'before';
    const available = adjacent(inside);
    const edge = item.segments.reduce((current, segment) => affinity === 'before'
        ? Math.min(current, segment.itemStart) : Math.max(current, segment.itemEnd), affinity === 'before' ? Infinity : -Infinity);
    // Only the outside of a uniquely mapped text extent has an implicit inside.
    // Gaps and ambiguous/atomic mappings must still reach no guessed anchor.
    if (offset !== edge || available.length !== 1 ||
        available[0].itemEnd - available[0].itemStart !== available[0].sourceEnd - available[0].sourceStart) fail();
    return inside;
}
export function selectorForTextItem(authoring, itemId, start, end, kind = 'range', affinity = 'after') {
    const item = authoring.pages.flatMap(page => page.items).find(item => item.id === itemId);
    if (!item || !item.segments.length || item.readOnlyReason || !safeBoundary(item.text, start) || !safeBoundary(item.text, end) ||
        end < start || !['range', 'insert'].includes(kind) || !['before', 'after'].includes(affinity)) fail();
    if (kind === 'insert') return { kind, start: { itemId, offset: affinity === 'before' ? start : end },
        affinity: start === end ? mappedCaretAffinity(item, start, affinity) : affinity === 'before' ? 'after' : 'before' };
    if (start === end) fail();
    return { kind, start: { itemId, offset: start }, end: { itemId, offset: end } };
}
function endpoint(container, node, offset) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const span = element?.closest('[data-word-item]');
    if (!span || !container.contains(span) || span.closest('[data-word-verified]')?.dataset.wordVerified !== 'true') fail();
    const prefix = document.createRange(); prefix.selectNodeContents(span); prefix.setEnd(node, offset);
    return { itemId: span.dataset.wordItem, offset: prefix.toString().length, span };
}

export function selectorFromDom(container, selection, authoring, kind = 'range', affinity = 'after') {
    if (!selection || selection.rangeCount !== 1 || !['range', 'insert'].includes(kind) || !['before', 'after'].includes(affinity)) fail();
    const range = selection.getRangeAt(0);
    if (kind === 'range' && range.collapsed) fail();
    const start = endpoint(container, range.startContainer, range.startOffset);
    const end = endpoint(container, range.endContainer, range.endOffset);
    const items = authoring.pages.flatMap(page => page.items);
    for (const value of [start, end]) {
        const item = items.find(item => item.id === value.itemId);
        if (!item || item.text !== value.span.textContent || !safeBoundary(item.text, value.offset)) fail();
    }
    const point = value => ({ itemId: value.itemId, offset: value.offset });
    // Browser Range is document ordered even when the user drags backwards in RTL.
    // UI before/after selects the edge of a range. Canonical affinity selects
    // the adjacent Word run, which is inside that selected range at either edge.
    // A collapsed caret preserves canonical affinity except at an unambiguous
    // outer mapped edge, where only the adjacent inside Word run is available.
    if (kind === 'insert') return { kind, start: point(affinity === 'before' ? start : end),
        affinity: range.collapsed ? mappedCaretAffinity(items.find(item => item.id === start.itemId), start.offset, affinity)
            : affinity === 'before' ? 'after' : 'before' };
    const from = items.findIndex(item => item.id === start.itemId); const to = items.findIndex(item => item.id === end.itemId);
    if (from < 0 || to < from || items.slice(from, to + 1).some(item => item.text && (!item.segments.length || item.readOnlyReason))) fail();
    return { kind, start: point(start), end: point(end) };
}

export function selectorForAnchor(authoring, anchor) {
    // Used only to retain an existing canonical binding when upgrading a legacy save.
    // A unique one-to-one segment is required; atomic/ambiguous mappings stay read-only.
    const point = (position, end) => {
        const candidates = authoring.pages.flatMap(page => page.items).flatMap(item => item.segments.filter(segment =>
            segment.part === anchor.part && segment.paragraphId === anchor.paragraphId &&
            segment.itemEnd - segment.itemStart === segment.sourceEnd - segment.sourceStart &&
            (end ? position > segment.sourceStart && position <= segment.sourceEnd : position >= segment.sourceStart && position < segment.sourceEnd))
            .map(segment => ({ itemId: item.id, offset: segment.itemStart + position - segment.sourceStart })));
        if (candidates.length !== 1) fail();
        return candidates[0];
    };
    if (anchor.kind === 'insert') return { kind: 'insert', start: point(anchor.start, anchor.affinity === 'before'), affinity: anchor.affinity || 'after' };
    return { kind: 'range', start: point(anchor.start, false), end: point(anchor.end, true) };
}
